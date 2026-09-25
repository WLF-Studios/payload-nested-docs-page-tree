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
          fastMode,
          breadcrumbsFieldSlug: 'breadcrumbs',
          defaultLimit: 100,
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
            title: true,
            parent: true,
            breadcrumbs: true,
            publishedAt: true,
            meta: { title: true, rank: true },
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
          fastMode,
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
    expect(result.props.allDocs[0].__pageTreeStatusLinks).toEqual(
      result.props.sourceDocs[0].__pageTreeStatusLinks,
    )
    expect(find).toHaveBeenCalledTimes(2)
    expect(payloadMocks.extractJWT).toHaveBeenCalledTimes(1)
    expect(result.props.badgesLinks).toEqual(callback ? {} : { liveURL: 'https://example.com' })
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
      fastMode?: boolean
      callback?: boolean
      allowed?: string[]
      empty?: boolean
      enabled?: boolean
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
