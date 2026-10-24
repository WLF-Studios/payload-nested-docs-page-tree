import { DndContext } from '@dnd-kit/core'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import PageTreeListViewClient from './PageTreeListView.client.js'

vi.mock('@payloadcms/ui', () => ({
  DefaultListView: ({ Table }: { Table: React.ReactNode }) => Table,
  ListQueryProvider: ({ children }: { children: React.ReactNode }) => children,
  SortHeader: () => null,
  useAuth: () => ({ user: null }),
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useListQuery: () => ({ orderableFieldName: '_order', query: { sort: '_order' } }),
  useLocale: () => ({ code: 'en' }),
  usePreferences: () => ({ getPreference: vi.fn(), setPreference: vi.fn() }),
  useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@payloadcms/ui/icons/Eye', () => ({ EyeIcon: () => null }))

const sourceDocs = [{ id: 'home', parent: null, title: 'Home' }]
const props: React.ComponentProps<typeof PageTreeListViewClient> = {
  badgeConfig: { colors: {}, labels: {} },
  canMoveDocs: true,
  collectionSlug: 'pages',
  columnState: [{
    accessor: 'title',
    active: true,
    field: { name: 'title', type: 'text' },
    Heading: 'Title',
    renderedCells: ['Home'],
  }],
  enableRowSelections: false,
  hasCreatePermission: true,
  homeIndicatorEnabled: false,
  newDocumentURL: '/admin/collections/pages/create',
  orderableFieldName: '_order',
  parentFieldSlug: 'parent',
  query: { sort: '_order' },
  renderedRowIDs: ['home'],
  sourceDocs,
  useAsTitle: 'title',
  viewType: 'list',
}

function getDescriptionIDs(html: string): string[] {
  return Array.from(html.matchAll(/aria-describedby="([^"]+)"/g), (match) => match[1])
}

describe('PageTreeListViewClient accessibility IDs', () => {
  it('keeps drag handle descriptions stable across unrelated context renders', () => {
    const tree = React.createElement(PageTreeListViewClient, props)
    const before = getDescriptionIDs(renderToString(tree))

    renderToString(React.createElement(DndContext))
    renderToString(React.createElement(DndContext))

    const after = getDescriptionIDs(renderToString(tree))
    expect(before).toHaveLength(1)
    expect(after).toEqual(before)
  })

  it('gives separate trees distinct drag handle descriptions', () => {
    const html = renderToString(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(PageTreeListViewClient, props),
        React.createElement(PageTreeListViewClient, props),
      ),
    )
    const ids = getDescriptionIDs(html)

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
