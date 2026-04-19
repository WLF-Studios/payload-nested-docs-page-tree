'use client'

import React from 'react'

type PageTreeContextValue = {
  activeDragRowID: null | string
  canMoveDocs: boolean
  collapsedIDs: ReadonlySet<string>
  pendingMoveRowID: null | string
  toggleRow: (rowID: string) => void
}

const PageTreeContext = React.createContext<null | PageTreeContextValue>(null)

export function PageTreeProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: PageTreeContextValue
}) {
  return <PageTreeContext.Provider value={value}>{children}</PageTreeContext.Provider>
}

export function usePageTree(): PageTreeContextValue {
  const context = React.useContext(PageTreeContext)

  if (!context) {
    return {
      activeDragRowID: null,
      canMoveDocs: false,
      collapsedIDs: new Set<string>(),
      pendingMoveRowID: null,
      toggleRow: () => {},
    }
  }

  return context
}
