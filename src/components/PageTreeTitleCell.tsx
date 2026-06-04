'use client'

import { useDraggable } from '@dnd-kit/core'
import { ChevronIcon, DragHandleIcon, useListQuery } from '@payloadcms/ui'
import React from 'react'

import type { PageTreeDoc } from '../utilities/pageTree.js'

import { usePageTree, usePageTreeRowDnd } from './PageTreeContext.js'

const HOME_PAGE_SLUG = 'home'

function isHomePageDoc(doc: PageTreeDoc): boolean {
  return doc.__pageTreeParentID === null && doc.slug?.trim() === HOME_PAGE_SLUG
}

function normalizeSort(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function ParentMoveHandleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="icon icon--drag-handle"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="stroke"
        d="M13.75 4.25L6.25 15.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
      />
    </svg>
  )
}

function HomeIndicatorIcon() {
  return (
    <svg
      aria-hidden="true"
      className="pages-hierarchy-cell__home-icon"
      fill="none"
      height="14"
      viewBox="0 0 14 14"
      width="14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 7L7 3L11.5 7V13.5H2.5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PageTreeTitleCell({
  children,
  doc,
  homeIndicatorEnabled,
}: {
  children: React.ReactNode
  doc: PageTreeDoc
  homeIndicatorEnabled: boolean
}) {
  const {
    activeDragRowID,
    canMoveDocs,
    collapsedIDs,
    parentMoveEnabled,
    pendingMoveRowID,
    toggleRow,
  } = usePageTree()
  const rowDnd = usePageTreeRowDnd()
  const { orderableFieldName, query = {} } = useListQuery()
  const depth = doc.__pageTreeDepth
  const hasChildren = doc.__pageTreeHasChildren
  const shadeLevel = Math.min(doc.__pageTreeShadeLevel, 6)
  const rowID = doc.__pageTreeID
  const isCollapsed = hasChildren && collapsedIDs.has(rowID)
  const dragIsDisabled = !canMoveDocs || !rowID || pendingMoveRowID !== null
  const showHomeIcon = homeIndicatorEnabled && isHomePageDoc(doc)
  const parentMoveDrag = useDraggable({
    id: `page-drag:${rowID}`,
    data: {
      dragType: 'move',
      rowID,
    },
    disabled: dragIsDisabled,
  })
  const querySort = normalizeSort(query.sort)
  const showOrderableHandle =
    canMoveDocs &&
    Boolean(orderableFieldName) &&
    (querySort === orderableFieldName || querySort === `-${orderableFieldName}`)
  const isActiveDragRow = activeDragRowID === rowID
  const isDragging = parentMoveDrag.isDragging || rowDnd?.isOrderDragging || isActiveDragRow

  return (
    <div
      className="pages-hierarchy-cell"
      data-row-dragging={isDragging ? 'true' : 'false'}
      data-tree-depth={depth}
      data-tree-has-children={hasChildren ? 'true' : 'false'}
      data-tree-home={showHomeIcon ? 'true' : undefined}
      data-tree-shade-level={shadeLevel}
      style={{ '--pages-tree-depth': String(depth) } as React.CSSProperties}
    >
      {hasChildren ? (
        <button
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand nested items' : 'Collapse nested items'}
          className="pages-hierarchy-cell__toggle"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            toggleRow(rowID)
          }}
          type="button"
        >
          <ChevronIcon
            className={[
              'pages-hierarchy-cell__chevron',
              isCollapsed ? 'pages-hierarchy-cell__chevron--collapsed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        </button>
      ) : (
        <span className="pages-hierarchy-cell__spacer" />
      )}
      {showOrderableHandle ? (
        <button
          {...(rowDnd?.orderHandleAttributes ?? {})}
          {...(rowDnd?.orderHandleListeners ?? {})}
          aria-label="Reorder document within this parent"
          className={[
            'pages-hierarchy-cell__drag-handle',
            'pages-hierarchy-cell__drag-handle--orderable',
            rowDnd?.isOrderDragging || isActiveDragRow
              ? 'pages-hierarchy-cell__drag-handle--active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={dragIsDisabled || !rowDnd}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          ref={rowDnd?.orderHandleRef}
          type="button"
        >
          <DragHandleIcon />
        </button>
      ) : null}
      {canMoveDocs && parentMoveEnabled ? (
        <button
          {...parentMoveDrag.attributes}
          {...parentMoveDrag.listeners}
          aria-label="Move document under another page"
          className={[
            'pages-hierarchy-cell__drag-handle',
            'pages-hierarchy-cell__drag-handle--parent',
            parentMoveDrag.isDragging || isActiveDragRow
              ? 'pages-hierarchy-cell__drag-handle--active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={dragIsDisabled}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          ref={parentMoveDrag.setNodeRef}
          type="button"
        >
          <ParentMoveHandleIcon />
        </button>
      ) : null}
      <span className="pages-hierarchy-cell__content">
        {showHomeIcon ? <HomeIndicatorIcon /> : null}
        {children}
      </span>
    </div>
  )
}
