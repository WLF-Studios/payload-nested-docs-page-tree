'use client'

import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronIcon, DragHandleIcon, useListQuery } from '@payloadcms/ui'

import { usePageTree } from './PageTreeContext.js'
import type { PageTreeDoc } from '../utilities/pageTree.js'

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
      <circle className="fill" cx="10.6667" cy="5.33332" r="0.66667" />
      <circle className="fill" cx="14.6667" cy="5.33332" r="0.66667" />
      <circle className="fill" cx="7.99999" cy="9.99999" r="0.66667" />
      <circle className="fill" cx="12" cy="9.99999" r="0.66667" />
      <circle className="fill" cx="5.33332" cy="14.6667" r="0.66667" />
      <circle className="fill" cx="9.33332" cy="14.6667" r="0.66667" />
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
  const { orderableFieldName, query = {} } = useListQuery()
  const depth = doc.__pageTreeDepth
  const hasChildren = doc.__pageTreeHasChildren
  const shadeLevel = Math.min(doc.__pageTreeShadeLevel, 6)
  const rowID = doc.__pageTreeID
  const isCollapsed = hasChildren && collapsedIDs.has(rowID)
  const dragIsDisabled = !canMoveDocs || !rowID || pendingMoveRowID !== null
  const showHomeIcon = homeIndicatorEnabled && isHomePageDoc(doc)
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    data: {
      dragType: 'move',
      rowID,
    },
    disabled: dragIsDisabled,
    id: `page-drag:${rowID}`,
  })
  const isActiveDragRow = activeDragRowID === rowID
  const querySort = normalizeSort(query.sort)
  const showOrderableHandle =
    canMoveDocs &&
    Boolean(orderableFieldName) &&
    (querySort === orderableFieldName || querySort === `-${orderableFieldName}`)

  return (
    <div
      className="pages-hierarchy-cell"
      data-row-dragging={isDragging || isActiveDragRow ? 'true' : 'false'}
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
        <span
          aria-hidden="true"
          className="pages-hierarchy-cell__drag-handle pages-hierarchy-cell__drag-handle--orderable"
        >
          <DragHandleIcon />
        </span>
      ) : null}
      {canMoveDocs && parentMoveEnabled ? (
        <button
          {...attributes}
          {...listeners}
          aria-label="Move document under another page"
          className={[
            'pages-hierarchy-cell__drag-handle',
            'pages-hierarchy-cell__drag-handle--parent',
            isDragging || isActiveDragRow ? 'pages-hierarchy-cell__drag-handle--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={dragIsDisabled}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          ref={setNodeRef}
          type="button"
        >
          <ParentMoveHandleIcon />
        </button>
      ) : null}
      <span className="pages-hierarchy-cell__content">{children}</span>
    </div>
  )
}
