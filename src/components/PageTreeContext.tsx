'use client'

import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'

import React from 'react'

type PageTreeContextValue = {
  activeDragRowID: null | string
  canMoveDocs: boolean
  collapsedIDs: ReadonlySet<string>
  parentMoveEnabled: boolean
  pendingMoveRowID: null | string
  toggleRow: (rowID: string) => void
}

type PageTreeRowDndContextValue = {
  isOrderDragging: boolean
  orderHandleAttributes: DraggableAttributes
  orderHandleListeners: DraggableSyntheticListeners
  orderHandleRef: (element: HTMLElement | null) => void
}

const PageTreeContext = React.createContext<null | PageTreeContextValue>(null)
const PageTreeRowDndContext = React.createContext<null | PageTreeRowDndContextValue>(null)

export function PageTreeProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: PageTreeContextValue
}) {
  return <PageTreeContext.Provider value={value}>{children}</PageTreeContext.Provider>
}

export function PageTreeRowDndProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: PageTreeRowDndContextValue
}) {
  return <PageTreeRowDndContext.Provider value={value}>{children}</PageTreeRowDndContext.Provider>
}

export function usePageTree(): PageTreeContextValue {
  const context = React.useContext(PageTreeContext)

  if (!context) {
    return {
      activeDragRowID: null,
      canMoveDocs: false,
      collapsedIDs: new Set<string>(),
      parentMoveEnabled: false,
      pendingMoveRowID: null,
      toggleRow: () => {},
    }
  }

  return context
}

export function usePageTreeRowDnd(): null | PageTreeRowDndContextValue {
  return React.useContext(PageTreeRowDndContext)
}
