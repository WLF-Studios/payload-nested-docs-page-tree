'use client'

import type { Column, ListQuery, ListViewClientProps, PaginatedDocs } from 'payload'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  DefaultListView,
  ListQueryProvider,
  SelectAll,
  SelectRow,
  toast,
  useConfig,
  useLocale,
  useTranslation,
} from '@payloadcms/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'

import styles from './PageTreeListView.module.css'
import { PageTreeProvider } from './PageTreeContext.js'
import { PageTreeTitleCell } from './PageTreeTitleCell.js'
import { CANCEL_DRAG_MESSAGE, getDropValidation, type PageTreeDropValidation } from '../utilities/moveValidation.js'
import {
  buildInsertDropTargets,
  getDropTargetParentDoc,
  type PageTreeDropTarget,
} from '../utilities/dropTargets.js'
import {
  buildDocSlugPath,
  buildPageTreeDocs,
  buildProspectiveDocSlugPath,
  getDocDisplayLabel,
  getVisibleTreeDocs,
  type PageTreeDoc,
} from '../utilities/pageTree.js'
import { pageTreeCollisionDetectionStrategy } from '../utilities/pageTreeCollision.js'
import {
  getPageTreeBadgeColor,
  getPageTreeBadgeLabel,
  getPageTreeDisplayStatus,
  type PageTreeDisplayStatus,
} from '../utilities/status.js'
import type {
  NestedDocsPageTreePluginResolvedBadgeConfig,
  PageTreeSourceDoc,
} from '../types.js'

type PageTreeListViewClientProps = Omit<ListViewClientProps, 'Table' | 'columnState'> & {
  allDocs: PageTreeDoc[]
  badgeConfig: NestedDocsPageTreePluginResolvedBadgeConfig
  canMoveDocs: boolean
  columnState: Column[]
  homeIndicatorEnabled: boolean
  parentFieldSlug: string
  query: ListQuery
  sourceDocs: PageTreeSourceDoc[]
  useAsTitle: string
}

type SelectableRowData = React.ComponentProps<typeof SelectRow>['rowData']

const SILENT_MOVE_MESSAGES = new Set([CANCEL_DRAG_MESSAGE])
const ALREADY_ROOT_MESSAGE = 'This page is already in root level.'

function getRowDropID(rowID: string): string {
  return `page-drop:${rowID}`
}

function buildPaginatedData(
  docs: PageTreeDoc[],
  limit: number,
  requestedPage: number,
): PaginatedDocs {
  const totalDocs = docs.length
  const totalPages = totalDocs > 0 ? Math.max(1, Math.ceil(totalDocs / limit)) : 1
  const page = Math.min(Math.max(requestedPage, 1), totalPages)
  const startIndex = (page - 1) * limit
  const pageDocs = docs.slice(startIndex, startIndex + limit)

  return {
    docs: pageDocs,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    limit,
    nextPage: page < totalPages ? page + 1 : null,
    page,
    pagingCounter: totalDocs === 0 ? 0 : startIndex + 1,
    prevPage: page > 1 ? page - 1 : null,
    totalDocs,
    totalPages,
  }
}

function normalizeSort(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const sortValues = value.filter((entry) => typeof entry === 'string' && entry.length > 0)
    return sortValues.length > 0 ? sortValues.join(',') : undefined
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizePositiveInt(value: null | string, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback
  }

  const parsedValue = Number.parseInt(value, 10)
  return Number.isNaN(parsedValue) || parsedValue <= 0 ? fallback : parsedValue
}

function ensureUseAsTitleColumn(columnState: Column[], useAsTitle: string): Column[] {
  return columnState.map((column) =>
    column.accessor === useAsTitle
      ? {
          ...column,
          active: true,
        }
      : column,
  )
}

function sliceColumnState(
  columnState: Column[],
  docs: PageTreeDoc[],
  renderedCellIndexByDocID: ReadonlyMap<string, number>,
): Column[] {
  return columnState.map((column) => ({
    ...column,
    renderedCells: docs.map((doc) => {
      const renderedCellIndex =
        renderedCellIndexByDocID.get(doc.__pageTreeID) ?? doc.__pageTreeOrderIndex

      return column.renderedCells?.[renderedCellIndex] ?? null
    }),
  }))
}

function getSelectableRowData(doc: PageTreeDoc): SelectableRowData {
  const record = doc as Record<string, unknown>

  return {
    _isLocked: Boolean(record._isLocked),
    _userEditing: record._userEditing as SelectableRowData['_userEditing'],
    id: String(doc.id ?? doc.__pageTreeID),
  }
}

function shouldSilenceMoveMessage(message?: string): boolean {
  return typeof message === 'string' && SILENT_MOVE_MESSAGES.has(message)
}

function getDropTargetValidation(args: {
  activeDoc: PageTreeDoc
  docsByID: ReadonlyMap<string, PageTreeDoc>
  dropTarget: PageTreeDropTarget
}): PageTreeDropValidation {
  const { activeDoc, docsByID, dropTarget } = args

  if (dropTarget.dropType === 'row') {
    return getDropValidation({
      activeDoc,
      targetDoc: docsByID.get(dropTarget.rowID) ?? undefined,
    })
  }

  if (dropTarget.parentID === null) {
    if (activeDoc.__pageTreeParentID === null) {
      return {
        isValid: false,
        message: ALREADY_ROOT_MESSAGE,
        parentID: null,
      }
    }

    return {
      isValid: true,
      parentID: null,
    }
  }

  const targetDoc = docsByID.get(dropTarget.parentID)

  if (!targetDoc) {
    return {
      isValid: false,
      message: 'Could not resolve drop target.',
      parentID: dropTarget.parentID,
    }
  }

  if (targetDoc.__pageTreeID === activeDoc.__pageTreeID) {
    return {
      isValid: false,
      message: CANCEL_DRAG_MESSAGE,
      parentID: targetDoc.__pageTreeID,
    }
  }

  if (targetDoc.__pageTreeAncestorIDs.includes(activeDoc.__pageTreeID)) {
    return {
      isValid: false,
      message: 'A document cannot be moved under one of its descendants.',
      parentID: targetDoc.__pageTreeID,
    }
  }

  return {
    isValid: true,
    parentID: targetDoc.__pageTreeID,
  }
}

function getStatusClassName(
  status: PageTreeDisplayStatus,
): 'changed' | 'draft' | 'published' | 'unknown' {
  if (status === 'changed' || status === 'draft' || status === 'published') {
    return status
  }

  return 'unknown'
}

function renderStatusBadge(args: {
  badgeConfig: NestedDocsPageTreePluginResolvedBadgeConfig
  doc: PageTreeDoc
  index: number
  t: (key: 'general:noValue' | 'version:changed' | 'version:draft' | 'version:published') => string
}): React.ReactNode {
  const { badgeConfig, doc, index, t } = args
  const status = getPageTreeDisplayStatus(doc)
  const customColor = getPageTreeBadgeColor({
    badgeColors: badgeConfig.colors,
    status,
  })
  const statusClass = getStatusClassName(status)
  const style = customColor
    ? ({ '--page-tree-badge-base': customColor } as React.CSSProperties)
    : undefined

  return (
    <span
      className={[
        'pages-hierarchy-status-badge',
        `pages-hierarchy-status-badge--${statusClass}`,
      ].join(' ')}
      data-custom-color={customColor ? 'true' : undefined}
      key={doc.__pageTreeID ?? index}
      style={style}
    >
      {getPageTreeBadgeLabel({
        badgeLabels: badgeConfig.labels,
        status,
        t,
      })}
    </span>
  )
}

function buildTableColumns(args: {
  badgeConfig: NestedDocsPageTreePluginResolvedBadgeConfig
  columnState: Column[]
  docs: PageTreeDoc[]
  enableRowSelections?: boolean
  homeIndicatorEnabled: boolean
  parentFieldSlug: string
  t: (key: 'general:noValue' | 'version:changed' | 'version:draft' | 'version:published') => string
  useAsTitle: string
}): Column[] {
  const {
    badgeConfig,
    columnState,
    docs,
    enableRowSelections,
    homeIndicatorEnabled,
    parentFieldSlug,
    t,
    useAsTitle,
  } = args
  const columnsToUse = columnState.map((column) => {
    if (column.accessor === useAsTitle) {
      return {
        ...column,
        active: true,
        renderedCells: docs.map((doc, index) => (
          <PageTreeTitleCell
            doc={doc}
            homeIndicatorEnabled={homeIndicatorEnabled}
            key={doc.__pageTreeID ?? index}
          >
            {column.renderedCells?.[index] ?? getDocDisplayLabel(doc)}
          </PageTreeTitleCell>
        )),
      }
    }

    if (column.accessor === '_status') {
      return {
        ...column,
        renderedCells: docs.map((doc, index) =>
          renderStatusBadge({
            badgeConfig,
            doc,
            index,
            t,
          }),
        ),
      }
    }

    if (column.accessor === parentFieldSlug) {
      return {
        ...column,
        renderedCells: docs.map((doc, index) =>
          doc.__pageTreeParentID !== null ? (
            column.renderedCells?.[index] ?? null
          ) : (
            <span className="pages-hierarchy-empty-cell" key={doc.__pageTreeID ?? index}>
              -
            </span>
          ),
        ),
      }
    }

    return column
  })

  if (enableRowSelections) {
    columnsToUse.unshift({
      accessor: '_select',
      active: true,
      field: { hidden: true } as Column['field'],
      Heading: <SelectAll />,
      renderedCells: docs.map((doc, index) => (
        <SelectRow key={doc.__pageTreeID ?? index} rowData={getSelectableRowData(doc)} />
      )),
    })
  }

  return columnsToUse
}

function HierarchyInsertRow({
  activeColumnsCount,
  activeDragRowID,
  activeDropTargetID,
  dropTarget,
  dropValidation,
  isMovePending,
}: {
  activeColumnsCount: number
  activeDragRowID: null | string
  activeDropTargetID: null | string
  dropTarget: Extract<PageTreeDropTarget, { dropType: 'insert' }>
  dropValidation?: PageTreeDropValidation
  isMovePending: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    data: dropTarget,
    disabled: isMovePending,
    id: dropTarget.dropID,
  })
  const hasActiveDrag = Boolean(activeDragRowID)
  const showInsertLine = isOver && activeDropTargetID === dropTarget.dropID

  return (
    <tr
      className="pages-hierarchy-insert-row"
      data-drag-over={showInsertLine ? 'true' : 'false'}
      data-drop-valid={hasActiveDrag ? (dropValidation?.isValid ? 'true' : 'false') : undefined}
      data-page-tree-insert="true"
    >
      <td colSpan={activeColumnsCount}>
        <div
          className="pages-hierarchy-insert-row__target"
          data-insert-depth={dropTarget.depth}
          ref={setNodeRef}
        />
      </td>
    </tr>
  )
}

function HierarchyTableRow({
  activeColumns,
  activeDragRowID,
  doc,
  dropValidation,
  insertAfterDropID,
  insertBeforeDropID,
  isMovePending,
  rowIndex,
}: {
  activeColumns: Column[]
  activeDragRowID: null | string
  doc: PageTreeDoc
  dropValidation?: PageTreeDropValidation
  insertAfterDropID: null | string
  insertBeforeDropID: null | string
  isMovePending: boolean
  rowIndex: number
}) {
  const { isOver, setNodeRef } = useDroppable({
    data: {
      dropType: 'row',
      insertAfterDropID,
      insertBeforeDropID,
      rowID: doc.__pageTreeID,
    } satisfies Extract<PageTreeDropTarget, { dropType: 'row' }>,
    disabled: isMovePending,
    id: getRowDropID(doc.__pageTreeID),
  })
  const hasActiveDrag = Boolean(activeDragRowID)
  const isActiveDragRow = activeDragRowID === doc.__pageTreeID

  return (
    <tr
      className={`row-${rowIndex + 1}`}
      data-drag-over={isOver ? 'true' : 'false'}
      data-drop-valid={hasActiveDrag ? (dropValidation?.isValid ? 'true' : 'false') : undefined}
      data-id={doc.id}
      data-is-drag-source={isActiveDragRow ? 'true' : 'false'}
      data-page-tree-row="true"
      ref={setNodeRef}
    >
      {activeColumns.map((column, columnIndex) => {
        const { accessor } = column

        return (
          <td className={`cell-${accessor.replace(/\./g, '__')}`} key={columnIndex}>
            {column.renderedCells?.[rowIndex] ?? null}
          </td>
        )
      })}
    </tr>
  )
}

function HierarchyTable({
  activeDragRowID,
  activeDropTarget,
  allDocsByID,
  columns,
  data,
  isMovePending,
}: {
  activeDragRowID: null | string
  activeDropTarget: null | PageTreeDropTarget
  allDocsByID: ReadonlyMap<string, PageTreeDoc>
  columns: Column[]
  data: PageTreeDoc[]
  isMovePending: boolean
}) {
  const activeColumns = React.useMemo(
    () => columns.filter((column) => column?.active),
    [columns],
  )
  const insertDropTargets = React.useMemo(() => buildInsertDropTargets(data), [data])
  const insertDropTargetsByReferenceRowID = React.useMemo(
    () => new Map(insertDropTargets.map((dropTarget) => [dropTarget.referenceRowID, dropTarget])),
    [insertDropTargets],
  )
  const activeDropTargetID =
    activeDropTarget?.dropType === 'insert' ? activeDropTarget.dropID : null
  const activeDoc = activeDragRowID ? allDocsByID.get(activeDragRowID) ?? null : null
  const rowDropValidationByID = React.useMemo(() => {
    if (!activeDoc) {
      return new Map<string, PageTreeDropValidation>()
    }

    return new Map(
      data.map((doc) => [
        doc.__pageTreeID,
        getDropTargetValidation({
          activeDoc,
          docsByID: allDocsByID,
          dropTarget: {
            dropType: 'row',
            insertAfterDropID: null,
            insertBeforeDropID: null,
            rowID: doc.__pageTreeID,
          },
        }),
      ]),
    )
  }, [activeDoc, allDocsByID, data])
  const insertDropValidationByID = React.useMemo(() => {
    if (!activeDoc) {
      return new Map<string, PageTreeDropValidation>()
    }

    return new Map(
      insertDropTargets.map((dropTarget) => [
        dropTarget.dropID,
        getDropTargetValidation({
          activeDoc,
          docsByID: allDocsByID,
          dropTarget,
        }),
      ]),
    )
  }, [activeDoc, allDocsByID, insertDropTargets])

  if (activeColumns.length === 0) {
    return <div>No columns selected</div>
  }

  return (
    <div
      className={[
        'table-wrap pages-hierarchy-table',
        activeDoc ? 'pages-hierarchy-table--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="table table--appearance-default">
        <table cellPadding="0" cellSpacing="0">
          <thead>
            <tr>
              {activeColumns.map((column, index) => (
                <th id={`heading-${column.accessor.replace(/\./g, '__')}`} key={index}>
                  {column.Heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((doc, rowIndex) => {
              const rootInsertBeforeDropTarget =
                doc.__pageTreeParentID === null
                  ? insertDropTargetsByReferenceRowID.get(doc.__pageTreeID)
                  : undefined
              const rootInsertTargetIndex =
                rootInsertBeforeDropTarget !== undefined
                  ? insertDropTargets.indexOf(rootInsertBeforeDropTarget)
                  : -1
              const rootInsertAfterDropTarget =
                rootInsertTargetIndex >= 0
                  ? insertDropTargets[rootInsertTargetIndex + 1]
                  : undefined
              const isTrailingRootInsert =
                rootInsertAfterDropTarget === insertDropTargets[insertDropTargets.length - 1]
              const nextVisibleDoc = data[rowIndex + 1]
              const hasVisibleDescendantAfter =
                nextVisibleDoc?.__pageTreeAncestorIDs.includes(doc.__pageTreeID) ?? false

              return (
                <React.Fragment key={doc.__pageTreeID}>
                  {rootInsertBeforeDropTarget ? (
                    <HierarchyInsertRow
                      activeColumnsCount={activeColumns.length}
                      activeDragRowID={activeDragRowID}
                      activeDropTargetID={activeDropTargetID}
                      dropTarget={rootInsertBeforeDropTarget}
                      dropValidation={insertDropValidationByID.get(
                        rootInsertBeforeDropTarget.dropID,
                      )}
                      isMovePending={isMovePending}
                      key={rootInsertBeforeDropTarget.dropID}
                    />
                  ) : null}
                  <HierarchyTableRow
                    activeColumns={activeColumns}
                    activeDragRowID={activeDragRowID}
                    doc={doc}
                    dropValidation={rowDropValidationByID.get(doc.__pageTreeID)}
                    insertAfterDropID={
                      hasVisibleDescendantAfter || isTrailingRootInsert
                        ? null
                        : rootInsertAfterDropTarget?.dropID ?? null
                    }
                    insertBeforeDropID={rootInsertBeforeDropTarget?.dropID ?? null}
                    isMovePending={isMovePending}
                    rowIndex={rowIndex}
                  />
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PageTreeListViewClient({
  allDocs,
  badgeConfig,
  canMoveDocs,
  columnState,
  homeIndicatorEnabled,
  parentFieldSlug,
  query,
  sourceDocs,
  useAsTitle,
  ...props
}: PageTreeListViewClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { config } = useConfig()
  const locale = useLocale()
  const { i18n } = useTranslation()
  const [activeDragRowID, setActiveDragRowID] = React.useState<null | string>(null)
  const [activeDropTarget, setActiveDropTarget] = React.useState<null | PageTreeDropTarget>(null)
  const [collapsedIDs, setCollapsedIDs] = React.useState<Set<string>>(() => new Set())
  const [pendingMoveRowID, setPendingMoveRowID] = React.useState<null | string>(null)

  const toggleRow = React.useCallback((rowID: string) => {
    setCollapsedIDs((currentState) => {
      const nextState = new Set(currentState)

      if (nextState.has(rowID)) {
        nextState.delete(rowID)
      } else {
        nextState.add(rowID)
      }

      return nextState
    })
  }, [])
  const currentSort = React.useMemo(() => {
    const searchParamSort = searchParams.getAll('sort')

    if (searchParamSort.length > 0) {
      return normalizeSort(searchParamSort)
    }

    return normalizeSort(query.sort as string | string[] | undefined)
  }, [query.sort, searchParams])
  const currentLimit = React.useMemo(
    () =>
      normalizePositiveInt(
        searchParams.get('limit'),
        typeof query.limit === 'number' && query.limit > 0 ? query.limit : 10,
      ),
    [query.limit, searchParams],
  )
  const currentRequestedPage = React.useMemo(
    () =>
      normalizePositiveInt(
        searchParams.get('page'),
        typeof query.page === 'number' && query.page > 0 ? query.page : 1,
      ),
    [query.page, searchParams],
  )
  const liveAllDocs = React.useMemo(
    () =>
      buildPageTreeDocs(sourceDocs, {
        parentFieldSlug,
        sort: currentSort,
      }),
    [currentSort, parentFieldSlug, sourceDocs],
  )
  const collapseResetKey = React.useMemo(
    () => JSON.stringify([props.collectionSlug, props.viewType, searchParams.toString()]),
    [props.collectionSlug, props.viewType, searchParams],
  )
  const hierarchyValue = React.useMemo(
    () => ({
      activeDragRowID,
      canMoveDocs,
      collapsedIDs,
      pendingMoveRowID,
      toggleRow,
    }),
    [activeDragRowID, canMoveDocs, collapsedIDs, pendingMoveRowID, toggleRow],
  )

  React.useEffect(() => {
    setActiveDragRowID(null)
    setActiveDropTarget(null)
    setCollapsedIDs(new Set())
  }, [collapseResetKey])

  const visibleDocs = React.useMemo(
    () => getVisibleTreeDocs(liveAllDocs, collapsedIDs),
    [liveAllDocs, collapsedIDs],
  )
  const paginatedData = React.useMemo(
    () => buildPaginatedData(visibleDocs, currentLimit, currentRequestedPage),
    [currentLimit, currentRequestedPage, visibleDocs],
  )
  const paginatedDocs = paginatedData.docs as PageTreeDoc[]
  const allDocsByID = React.useMemo(
    () => new Map(liveAllDocs.map((doc) => [doc.__pageTreeID, doc])),
    [liveAllDocs],
  )
  const paginatedDocsByID = React.useMemo(
    () => new Map(paginatedDocs.map((doc) => [doc.__pageTreeID, doc])),
    [paginatedDocs],
  )
  const renderedCellIndexByDocID = React.useMemo(
    () => new Map(allDocs.map((doc, index) => [doc.__pageTreeID, index])),
    [allDocs],
  )
  const normalizedColumnState = React.useMemo(
    () => ensureUseAsTitleColumn(columnState, useAsTitle),
    [columnState, useAsTitle],
  )
  const paginatedColumnState = React.useMemo(
    () => sliceColumnState(normalizedColumnState, paginatedDocs, renderedCellIndexByDocID),
    [normalizedColumnState, paginatedDocs, renderedCellIndexByDocID],
  )
  const tableColumns = React.useMemo(
    () =>
      buildTableColumns({
        badgeConfig,
        columnState: paginatedColumnState,
        docs: paginatedDocs,
        enableRowSelections: props.enableRowSelections,
        homeIndicatorEnabled,
        parentFieldSlug,
        t: i18n.t,
        useAsTitle,
      }),
    [
      paginatedColumnState,
      paginatedDocs,
      badgeConfig,
      homeIndicatorEnabled,
      parentFieldSlug,
      props.enableRowSelections,
      i18n.t,
      useAsTitle,
    ],
  )
  const activeDragDoc = activeDragRowID ? paginatedDocsByID.get(activeDragRowID) ?? null : null
  const activeDragPreviewPath = React.useMemo(() => {
    if (!activeDragDoc) {
      return null
    }

    if (!activeDropTarget) {
      return buildDocSlugPath({
        doc: activeDragDoc,
        docsByID: allDocsByID,
      })
    }

    const targetDoc = getDropTargetParentDoc({
      docsByID: allDocsByID,
      dropTarget: activeDropTarget,
    })
    const dropValidation = getDropTargetValidation({
      activeDoc: activeDragDoc,
      docsByID: allDocsByID,
      dropTarget: activeDropTarget,
    })

    if (!dropValidation.isValid) {
      return buildDocSlugPath({
        doc: activeDragDoc,
        docsByID: allDocsByID,
      })
    }

    return buildProspectiveDocSlugPath({
      activeDoc: activeDragDoc,
      docsByID: allDocsByID,
      targetDoc: targetDoc ?? undefined,
    })
  }, [activeDragDoc, activeDropTarget, allDocsByID])
  const isMovePending = pendingMoveRowID !== null
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  )
  const handleDragCancel = React.useCallback(() => {
    setActiveDragRowID(null)
    setActiveDropTarget(null)
  }, [])
  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      if (!canMoveDocs || isMovePending) {
        return
      }

      const rowID = event.active.data.current?.rowID

      if (typeof rowID === 'string' && paginatedDocsByID.has(rowID)) {
        setActiveDragRowID(rowID)
        setActiveDropTarget(null)
      }
    },
    [canMoveDocs, isMovePending, paginatedDocsByID],
  )
  const handleDragOver = React.useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current as PageTreeDropTarget | undefined

    if (!overData) {
      setActiveDropTarget(null)
      return
    }

    if (overData.dropType === 'insert') {
      setActiveDropTarget(overData)
      return
    }

    if (overData.dropType === 'row') {
      setActiveDropTarget(overData)
      return
    }

    setActiveDropTarget(null)
  }, [])
  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const rowID = event.active.data.current?.rowID
      const activeDoc = typeof rowID === 'string' ? paginatedDocsByID.get(rowID) ?? null : null
      const overData = event.over?.data.current as PageTreeDropTarget | undefined

      setActiveDragRowID(null)
      setActiveDropTarget(null)

      if (typeof rowID !== 'string' || !activeDoc || !overData) {
        return
      }

      const dropValidation = getDropTargetValidation({
        activeDoc,
        docsByID: allDocsByID,
        dropTarget: overData,
      })

      if (!dropValidation.isValid) {
        if (!shouldSilenceMoveMessage(dropValidation.message)) {
          toast.error(dropValidation.message ?? 'Could not move document.')
        }

        return
      }

      if (overData.dropType === 'insert' && activeDoc.__pageTreeParentID === dropValidation.parentID) {
        return
      }

      const apiRoute = config.routes.api
      const params = new URLSearchParams()

      if (locale?.code) {
        params.set('locale', locale.code)
      }

      setPendingMoveRowID(rowID)

      try {
        const response = await fetch(
          `${apiRoute}/${props.collectionSlug}/${encodeURIComponent(rowID)}/move${
            params.size > 0 ? `?${params.toString()}` : ''
          }`,
          {
            body: JSON.stringify({
              parentID: dropValidation.parentID,
            }),
            credentials: 'include',
            headers: {
              'Accept-Language': i18n.language,
              'Content-Type': 'application/json',
            },
            method: 'POST',
          },
        )
        const result = (await response.json().catch(() => null)) as
          | null
          | {
              message?: string
            }

        if (!response.ok) {
          if (shouldSilenceMoveMessage(result?.message)) {
            return
          }

          toast.error(result?.message ?? 'Could not move document.')
          return
        }

        toast.success(`Moved "${getDocDisplayLabel(activeDoc)}".`)
        React.startTransition(() => {
          router.refresh()
        })
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : 'Could not move document.'

        toast.error(message)
      } finally {
        setPendingMoveRowID(null)
      }
    },
    [
      allDocsByID,
      config.routes.api,
      i18n.language,
      locale?.code,
      paginatedDocsByID,
      props.collectionSlug,
      router,
    ],
  )
  const handleDragEndSync = React.useCallback(
    (event: DragEndEvent) => {
      void handleDragEnd(event)
    },
    [handleDragEnd],
  )

  const tableNode = React.useMemo(
    () => (
      <DndContext
        collisionDetection={pageTreeCollisionDetectionStrategy}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEndSync}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <HierarchyTable
          activeDragRowID={activeDragRowID}
          activeDropTarget={activeDropTarget}
          allDocsByID={allDocsByID}
          columns={tableColumns}
          data={paginatedDocs}
          isMovePending={isMovePending}
        />
        <DragOverlay dropAnimation={null} style={{ cursor: 'grabbing' }}>
          {activeDragPreviewPath ? (
            <div className="pages-hierarchy-drag-overlay">{activeDragPreviewPath}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    ),
    [
      activeDragPreviewPath,
      activeDragRowID,
      activeDropTarget,
      allDocsByID,
      handleDragCancel,
      handleDragEndSync,
      handleDragOver,
      handleDragStart,
      isMovePending,
      paginatedDocs,
      sensors,
      tableColumns,
    ],
  )

  return (
    <div className={styles.root}>
      <PageTreeProvider value={hierarchyValue}>
        <ListQueryProvider
          collectionSlug={props.collectionSlug}
          data={paginatedData}
          modifySearchParams
          query={{
            ...query,
            limit: currentLimit,
            page: paginatedData.page,
            sort: currentSort,
          }}
        >
          <DefaultListView {...props} Table={tableNode} columnState={paginatedColumnState} />
        </ListQueryProvider>
      </PageTreeProvider>
    </div>
  )
}
