import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { PageTreeSourceDoc } from '../types.js'

import { NestedDocsPageTreeListView } from './PageTreeListView.server.js'

const uiMocks = vi.hoisted(() => ({
  getColumns: vi.fn(() => []),
  renderTable: vi.fn(() => ({ columnState: [], Table: null })),
}))

const configMocks = vi.hoisted(() => ({
  getClientConfig: vi.fn(),
}))

const payloadMocks = vi.hoisted(() => ({
  extractJWT: vi.fn(() => null),
}))

vi.mock('@payloadcms/ui/rsc', () => uiMocks)

vi.mock('@payloadcms/ui/utilities/getClientConfig', () => configMocks)

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  extractJWT: payloadMocks.extractJWT,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ cookie: 'payload-tenant=tenant-1' }))),
}))

vi.mock('./PageTreeListView.client.js', () => ({
  default: vi.fn(),
}))

describe('NestedDocsPageTreeListView', () => {
  function nativeListFixture() {
    const docs = [
      { id: 2, slug: 'child', _order: 'a', _status: 'draft', breadcrumbs: [], createdAt: '2026-01-02', parent: 1, title: 'Child' },
      { id: 1, slug: 'parent', _order: 'b', _status: 'published', breadcrumbs: [], createdAt: '2026-01-01', parent: null, title: 'Parent' },
    ]
    const collectionConfig = {
      slug: 'pages', admin: { useAsTitle: 'title' }, custom: { nestedDocsPageTreePlugin: {
        badges: { colors: {}, labels: {} }, breadcrumbsFieldSlug: 'breadcrumbs',
        defaultLimit: 200, fastMode: true, hideBreadcrumbs: true,
        homeIndicator: { enabled: false }, parentFieldSlug: 'parent',
      } },
      defaultSort: '_order',
      orderable: true,
    }
    const columnState = ['title', 'createdAt', '_status'].map(accessor => ({
      accessor, active: true, field: { name: accessor, type: 'text' },
      Heading: accessor, renderedCells: docs.map(doc => `${accessor}:${doc.id}`),
    }))
    configMocks.getClientConfig.mockReturnValue({ collections: [collectionConfig] })
    uiMocks.getColumns.mockClear()
    uiMocks.renderTable.mockClear()
    const find = vi.fn((_args: any) => Promise.resolve({ docs }))
    const props = {
      collectionConfig, collectionSlug: 'pages', columnState,
      data: { docs, hasNextPage: false, hasPrevPage: false, page: 1, totalDocs: 2, totalPages: 1 },
      i18n: { t: (key: string) => key }, payload: { config: {}, find },
      viewType: 'list',
    }
    return { docs, find, props }
  }

  it('reuses a complete native list and its cells by ID without reading or rendering it again', async () => {
    const { find, props } = nativeListFixture()
    props.columnState[0].field.type = 'json'
    const result = await NestedDocsPageTreeListView(props)
    expect(find).not.toHaveBeenCalled()
    expect(uiMocks.renderTable).not.toHaveBeenCalled()
    expect(result.props.sourceDocs.map((doc: PageTreeSourceDoc) => doc.id)).toEqual([2, 1])
    expect(result.props.renderedRowIDs).toEqual(['2', '1'])
    expect(result.props.columnState.find((col: any) => col.accessor === 'title').renderedCells)
      .toBe(props.columnState[0].renderedCells)
    expect(result.props.columnState.find((col: any) => col.accessor === '_status').renderedCells)
      .toEqual([])
  })

  it('sends data instead of rendered cells for ordinary columns, including partial lists', async () => {
    const { docs, props } = nativeListFixture()
    Object.assign(props.data, { docs: [docs[0]], hasNextPage: true, totalPages: 2 })
    props.columnState.forEach(col => { col.renderedCells = col.renderedCells.slice(0, 1) })
    const result = await NestedDocsPageTreeListView(props)
    expect(result.props.renderDefaultCells).toBe(true)
    expect(result.props.columnState.every((col: any) => col.renderedCells.length === 0)).toBe(true)
    expect(uiMocks.renderTable).not.toHaveBeenCalled()
  })

  it('fetches only missing tree metadata and preserves nested selected values', async () => {
    const { find, props } = nativeListFixture()
    props.columnState.push({ accessor: 'meta.title', active: true, field: { name: 'meta.title', type: 'text' }, Heading: 'Meta', renderedCells: ['Child SEO', 'Parent SEO'] })
    const nativeDocs = props.data.docs.map(({ _order: _order, parent: _parent, ...doc }) => ({ ...doc, meta: { title: `${doc.title} SEO` } }))
    Object.assign(props.data, { docs: nativeDocs })
    Object.assign(props, { searchParams: { sort: 'meta.rank' } })
    find.mockResolvedValue({ docs: [
      { id: 1, _order: 'b', meta: { rank: 1 }, parent: null },
      { id: 2, _order: 'a', meta: { rank: 2 }, parent: 1 },
    ] } as any)
    const result = await NestedDocsPageTreeListView(props)
    expect(find).toHaveBeenCalledTimes(1)
    expect(find.mock.calls[0][0]).toMatchObject({
      depth: 0, draft: undefined, overrideAccess: false, pagination: false,
      select: { _order: true, meta: { rank: true }, parent: true },
      where: { id: { in: [2, 1] } },
    })
    expect(find.mock.calls[0][0].includeLockStatus).not.toBe(true)
    expect(result.props.sourceDocs[0]).toMatchObject({ id: 2, meta: { rank: 2, title: 'Child SEO' }, parent: 1 })
    expect(nativeDocs[0].meta).toEqual({ title: 'Child SEO' })
  })

  it('removes cells for documents excluded by the supplementary read', async () => {
    const { docs, find, props } = nativeListFixture()
    props.columnState[0].field.type = 'json'
    Object.assign(props.data, { docs: docs.map(({ parent: _parent, ...doc }) => doc) })
    find.mockResolvedValue({ docs: [docs[1]] })
    const result = await NestedDocsPageTreeListView(props)
    expect(result.props.sourceDocs.map((doc: PageTreeSourceDoc) => doc.id)).toEqual([1])
    expect(result.props.renderedRowIDs).toEqual(['1'])
    expect(result.props.columnState[0].renderedCells).toEqual(['title:1'])
    expect(uiMocks.renderTable).not.toHaveBeenCalled()
  })

  it('reuses only matching native rows and renders missing tree rows for a partial list', async () => {
    const { docs, find, props } = nativeListFixture()
    props.columnState[0].field.type = 'json'
    Object.assign(props.data, { docs: [docs[0]], hasNextPage: true, totalPages: 2 })
    props.columnState.forEach(col => { col.renderedCells = col.renderedCells.slice(0, 1) })
    props.columnState.push({ accessor: 'slug', active: false, field: { name: 'slug', type: 'text' }, Heading: 'Slug', renderedCells: [] })
    uiMocks.renderTable.mockImplementationOnce(((args: any) => ({
      columnState: props.columnState.map(col => ({ ...col,
        renderedCells: args.data.docs.map((doc: any) => `${col.accessor}:${doc.id}`),
      })), Table: null,
    })) as any)
    const result = await NestedDocsPageTreeListView(props)
    expect(find).toHaveBeenCalledTimes(1)
    expect(uiMocks.renderTable).toHaveBeenCalledTimes(1)
    expect((uiMocks.renderTable.mock.calls[0] as any)[0].data.docs.map((doc: any) => doc.id)).toEqual([1])
    expect(result.props.renderedRowIDs).toEqual(['2', '1'])
    expect(result.props.columnState[0].renderedCells).toEqual(['title:2', 'title:1'])
    expect(result.props.columnState[1].renderedCells).toEqual(['createdAt:2', 'createdAt:1'])
    expect(result.props.columnState.find((col: any) => col.accessor === 'slug').renderedCells).toEqual([])
  })

  it.each(['baseFilter', 'groupBy', 'trash', 'fastMode', 'badgesLinks'])('keeps the full query when native semantics may differ: %s', async (condition) => {
    const { find, props } = nativeListFixture()
    if (condition === 'baseFilter') {Object.assign(props.collectionConfig.admin, { baseFilter: () => ({}) })}
    if (condition === 'groupBy') {Object.assign(props, { searchParams: { groupBy: 'parent' } })}
    if (condition === 'trash') {props.viewType = 'trash'}
    if (condition === 'fastMode') {props.collectionConfig.custom.nestedDocsPageTreePlugin.fastMode = false}
    if (condition === 'badgesLinks') {Object.assign(props.collectionConfig.custom.nestedDocsPageTreePlugin, { badgesLinks: { liveURL: 'https://example.com' } })}
    await NestedDocsPageTreeListView(props)
    expect(find.mock.calls[0][0]).toMatchObject({ includeLockStatus: true, pagination: false })
  })

  it.each(['hidden-title', 'custom-cell', 'custom-link', 'rich-text'])('renders enriched tree rows for %s', async (condition) => {
    const { docs, props } = nativeListFixture()
    if (condition === 'hidden-title') {props.columnState[0].active = false}
    if (condition === 'custom-cell') {Object.assign(props.collectionConfig, {
      fields: [{ name: 'createdAt', type: 'date', admin: { components: { Cell: '/CustomCell' } } }],
    })}
    if (condition === 'custom-link') {Object.assign(props.collectionConfig.admin, { formatDocURL: () => '/custom' })}
    if (condition === 'rich-text') {Object.assign(props.collectionConfig, {
      fields: [{ name: 'createdAt', type: 'richText', editor: { CellComponent: '/EditorCell' } }],
    })}
    await NestedDocsPageTreeListView(props)
    expect(uiMocks.renderTable).toHaveBeenCalledTimes(1)
    expect((uiMocks.renderTable.mock.calls[0] as any)[0].data.docs.map((doc: any) => doc.id)).toEqual([1, 2])
    expect((uiMocks.renderTable.mock.calls[0] as any)[0].data.docs[1]).toMatchObject({ ...docs[0], __pageTreeDepth: 1 })
  })

  it.each([undefined, false, true])('selects tree fields only with fastMode=%s', async (fastMode) => {
    let cookie: null | string = null
    const baseFilter = ({ req }: { req: PayloadRequest }) => {
      cookie = req.headers.get('cookie')

      return {}
    }
    const collectionConfig = {
      slug: 'pages',
      admin: {
        baseFilter,
        enableListViewSelectAPI: true,
        useAsTitle: 'title',
      },
      custom: {
        nestedDocsPageTreePlugin: {
          badges: {
            colors: {},
            labels: {},
          },
          breadcrumbsFieldSlug: 'breadcrumbs',
          defaultLimit: 100,
          fastMode,
          hideBreadcrumbs: true,
          homeIndicator: {
            enabled: false,
          },
          parentFieldSlug: 'parent',
        },
      },
    }
    configMocks.getClientConfig.mockReturnValue({ collections: [collectionConfig] })

    const find = vi.fn((_args: { select?: unknown }) => Promise.resolve({ docs: [] }))
    await NestedDocsPageTreeListView({
      collectionConfig,
      collectionSlug: 'pages',
      columnState: [
        { accessor: 'meta.title', active: true },
        { accessor: 'layout', active: false },
      ],
      data: {
        page: 1,
      },
      i18n: { t: (key: string) => key },
      listPreferences: { sort: ['-publishedAt', 'meta.rank', 'title'] },
      payload: {
        config: {
          i18n: { fallbackLanguage: 'en' },
        },
        find,
      },
      user: null,
    })

    expect(cookie).toBe('payload-tenant=tenant-1')
    expect(find.mock.calls[0][0].select).toEqual(
      fastMode
        ? {
            id: true,
            slug: true,
            _status: true,
            breadcrumbs: true,
            meta: { rank: true, title: true },
            parent: true,
            publishedAt: true,
            title: true,
          }
        : undefined,
    )
  })

  it.each([
    { callback: false, fastMode: undefined },
    { callback: false, fastMode: false },
    { callback: false, fastMode: true },
    { callback: true, fastMode: false },
    { callback: true, fastMode: true },
  ])('preserves badge URLs and controls status selection with %j', async ({ callback, fastMode }) => {
    payloadMocks.extractJWT.mockClear()
    const currentDoc = {
      id: 1,
      slug: 'old',
      _status: 'published',
      breadcrumbs: [{ url: '/parent/old' }],
      tenant: 'tenant-1',
    }
    const draftDoc = {
      id: 1,
      slug: 'new',
      _status: 'draft',
      breadcrumbs: [{ url: '/new-parent/new' }],
    }
    const secondCurrentDoc = {
      ...currentDoc,
      id: 2,
      slug: 'second-old',
      breadcrumbs: [{ url: '/second-old' }],
    }
    const secondDraftDoc = {
      ...draftDoc,
      id: 2,
      slug: 'second-new',
      breadcrumbs: [{ url: '/second-new' }],
    }
    const find = vi.fn(({ depth, draft, fallbackLocale, locale, overrideAccess, select }) => {
      expect(overrideAccess).toBe(false)
      expect(locale).toBe('en')
      expect(fallbackLocale).toBe(false)
      expect(depth).toBe(0)
      if (draft) { expect(select).toBeUndefined() }
      if (!draft) {
        expect(select).toEqual(fastMode && !callback
          ? { id: true, _status: true, breadcrumbs: true }
          : undefined)
      }
      return Promise.resolve({
        docs: draft ? [draftDoc, secondDraftDoc] : [currentDoc, secondCurrentDoc],
      })
    })
    const collectionConfig = {
      slug: 'pages',
      admin: {
        enableListViewSelectAPI: true,
        preview: (doc: typeof draftDoc, { req }: { req: PayloadRequest }) =>
          `${req.protocol}//${req.host}/preview${doc.breadcrumbs[0].url}`,
        useAsTitle: 'title',
      },
      custom: {
        nestedDocsPageTreePlugin: {
          badges: { colors: {}, labels: {} },
          badgesLinks: {
            liveURL: callback
              ? ({ doc, locale, path, req }: {
                  doc: PageTreeSourceDoc; locale?: null | string; path?: string; req: PayloadRequest
                }) => {
                  expect(req.headers.get('cookie')).toBe('payload-tenant=tenant-1')
                  return Promise.resolve(`https://${String(doc.tenant)}.example.com/${locale}${path}`)
                }
              : 'https://example.com',
          },
          breadcrumbsFieldSlug: 'breadcrumbs',
          defaultLimit: 100,
          fastMode,
          hideBreadcrumbs: true,
          homeIndicator: { enabled: false },
          parentFieldSlug: 'parent',
        },
      },
      versions: { drafts: true },
    }
    configMocks.getClientConfig.mockReturnValue({ collections: [collectionConfig] })
    const result = await NestedDocsPageTreeListView({
      collectionConfig,
      collectionSlug: 'pages',
      columnState: [],
      data: { page: 1 },
      i18n: { t: (key: string) => key },
      locale: { code: 'en' },
      payload: {
        config: {
          auth: { jwtOrder: ['cookie'] },
          cookiePrefix: 'payload',
          csrf: [],
          serverURL: 'https://cms.example.com',
        },
        find,
        logger: { error: vi.fn() },
      },
    })
    expect(result.props.sourceDocs[0]).toMatchObject({
      slug: 'new',
      __pageTreeStatusLinks: {
        previewURL: 'https://cms.example.com/preview/new-parent/new',
        publicURL: callback
          ? 'https://tenant-1.example.com/en/parent/old'
          : 'https://example.com/parent/old',
      },
      _displayStatus: 'changed',
    })
    expect([...result.props.renderedRowIDs].sort()).toEqual(
      result.props.sourceDocs.map((doc: { id: number | string }) => String(doc.id)).sort(),
    )
    expect(find).toHaveBeenCalledTimes(2)
    expect(payloadMocks.extractJWT).toHaveBeenCalledTimes(1)
    expect(result.props.badgesLinks).toEqual(callback ? {} : { liveURL: 'https://example.com' })
  })

  it.each([
    {
      name: 'saved preferences',
      columns: ['title', 'slug', '-id'],
      listPreferences: {
        columns: [
          { accessor: 'title', active: true },
          { accessor: 'slug', active: false },
        ],
      },
    },
    {
      name: 'URL columns',
      columns: ['title', 'slug', '-id'],
      searchParams: { columns: '["slug"]' },
    },
    { name: 'no saved or URL columns', columns: undefined },
  ])('passes the rendered columns to the client query in URL form from $name', async ({
    columns,
    listPreferences,
    searchParams,
  }) => {
    const collectionConfig = {
      slug: 'pages',
      admin: { useAsTitle: 'title' },
      custom: {
        nestedDocsPageTreePlugin: {
          badges: { colors: {}, labels: {} },
          breadcrumbsFieldSlug: 'breadcrumbs',
          defaultLimit: 100,
          hideBreadcrumbs: true,
          homeIndicator: { enabled: false },
          parentFieldSlug: 'parent',
        },
      },
    }
    configMocks.getClientConfig.mockReturnValue({ collections: [collectionConfig] })

    // ListQueryProvider syncs `query` back to the URL, so preference objects
    // here would overwrite a column change the user has just made.
    const result = await NestedDocsPageTreeListView({
      collectionConfig,
      collectionSlug: 'pages',
      columnState: [
        { accessor: 'title', active: false },
        { accessor: 'slug', active: true },
        { accessor: 'id', active: false },
      ],
      data: { page: 1 },
      i18n: { t: (key: string) => key },
      listPreferences,
      payload: { config: {}, find: vi.fn(() => Promise.resolve({ docs: [] })) },
      searchParams,
      user: null,
    })

    // The title column is always shown; the rest follow the rendered state.
    // Without a column source, the URL and preferences keep following defaults.
    expect(result.props.query.columns).toEqual(columns)
  })
})

describe('locale status badges', () => {
  const locales = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'French' },
    { code: 'lt', label: 'Lithuanian' },
    { code: 'pl', label: 'Polish' },
  ]

  async function renderLocaleList(
    options: {
      allowed?: string[]
      callback?: boolean
      empty?: boolean
      enabled?: boolean
      fastMode?: boolean
      localized?: boolean
    } = {},
  ) {
    const collectionConfig = {
      slug: 'pages',
      admin: { useAsTitle: 'title' },
      custom: {
        nestedDocsPageTreePlugin: {
          badges: { colors: {}, labels: {}, locales: options.enabled ?? true },
          fastMode: options.fastMode,
          ...(options.callback ? {
            localeBadgeVisibility: () => true,
          } : {}),
          breadcrumbsFieldSlug: 'breadcrumbs',
          defaultLimit: 100,
          hideBreadcrumbs: true,
          homeIndicator: { enabled: false },
          parentFieldSlug: 'parent',
        },
      },
      versions: { drafts: { localizeStatus: options.localized ?? true } },
    }
    const localization = {
      defaultLocale: 'en',
      localeCodes: locales.map(({ code }) => code),
      locales,
      ...(options.allowed
        ? {
            filterAvailableLocales: ({ locales: available }: { locales: typeof locales }) =>
              available.filter(({ code }) => options.allowed!.includes(code)),
          }
        : {}),
    }
    configMocks.getClientConfig.mockReturnValue({
      collections: [collectionConfig],
      localization: { ...localization },
    })
    const find = vi.fn(({ draft, locale }: { draft?: boolean; locale?: string; req?: PayloadRequest; select?: unknown }) => {
      if (options.empty) { return Promise.resolve({ docs: [] }) }
      if (locale === 'all') {
        return Promise.resolve({
          docs: [
            {
              id: 1,
              _status: draft
                ? { en: 'published', fr: 'draft', lt: 'draft' }
                : { en: 'published', fr: 'published', lt: 'draft' },
            },
            // A second row proves status data is matched by ID, not array position.
            { id: 2, _status: { en: 'draft', fr: 'draft' } },
          ],
        })
      }
      return Promise.resolve({
        docs: draft
          ? [
              { id: 2, _status: 'draft', title: 'Second' },
              { id: 1, _status: 'draft', title: 'First' },
            ]
          : [
              { id: 1, _status: 'published' },
              { id: 2, _status: 'draft' },
            ],
      })
    })
    const result = await NestedDocsPageTreeListView({
      collectionConfig,
      collectionSlug: 'pages',
      columnState: [],
      data: { page: 1 },
      i18n: { t: (key: string) => key },
      locale: { code: 'fr' },
      payload: { config: { localization }, find },
    })
    return { find, rows: result.props.sourceDocs as PageTreeSourceDoc[] }
  }

  it('loads independent locale statuses in permission-aware batches without changing row content', async () => {
    const { find, rows } = await renderLocaleList({ fastMode: true })
    expect(rows.find(({ id }) => id === 1)).toMatchObject({
      __pageTreeLocaleStatuses: [
        { locale: 'en', status: 'published' },
        { locale: 'fr', status: 'changed' },
        { locale: 'lt', status: 'draft' },
        { locale: 'pl', status: 'unknown' },
      ],
      _status: 'draft',
      title: 'First',
    })
    expect(rows.find(({ id }) => id === 2)?.__pageTreeLocaleStatuses?.[1].status).toBe('draft')
    const batches = find.mock.calls.map(([args]) => args).filter(({ locale }) => locale === 'all')
    expect(batches).toHaveLength(2)
    for (const batch of batches) {
      expect(batch).toMatchObject({
        depth: 0,
        fallbackLocale: false,
        overrideAccess: false,
        pagination: false,
        select: { id: true, _status: true },
        where: { id: { in: [2, 1] } },
      })
      expect(batch.req).toBeDefined()
    }
  })

  it.each([undefined, false, true])('controls locale reads with and without callbacks using fastMode=%s', async (fastMode) => {
    for (const callback of [false, true]) {
      const { find } = await renderLocaleList({ callback, fastMode })
      const batches = find.mock.calls.map(([args]) => args).filter(({ locale }) => locale === 'all')
      expect(batches).toHaveLength(2)
      for (const query of batches) {
        expect(query.select).toEqual(fastMode ? { id: true, _status: true } : undefined)
      }
    }
  })

  it('does not serialize locales excluded by Payload locale filtering', async () => {
    const { rows } = await renderLocaleList({ allowed: ['en', 'lt'] })
    expect(rows[0].__pageTreeLocaleStatuses?.map(({ locale }) => locale)).toEqual(
      ['en', 'lt'],
    )
  })

  it.each([{ enabled: false }, { localized: false }, { empty: true }, { allowed: [] }])(
    'skips locale reads when unavailable: %j',
    async (options) => {
      const { find, rows } = await renderLocaleList(options)
      expect(find.mock.calls.some(([args]) => args.locale === 'all')).toBe(false)
      expect(
        rows.every((doc) => doc.__pageTreeLocaleStatuses === undefined),
      ).toBe(true)
    },
  )
})
