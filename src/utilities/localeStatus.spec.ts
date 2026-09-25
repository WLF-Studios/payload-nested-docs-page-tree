import type { Payload, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { withPageTreeLocaleStatuses } from './localeStatus.js'

describe('locale badge visibility', () => {
  const draftDoc = {
    id: 1,
    _status: { en: 'draft', fr: 'draft' },
    enabled: { en: true, fr: false },
  }
  const req = { locale: 'en', query: {}, user: { id: 9 } } as unknown as PayloadRequest
  const setup = () => {
    const find = vi.fn(({ draft }: { draft?: boolean; select?: unknown }) =>
      Promise.resolve({
        docs: draft ? [draftDoc] : [{ id: 1, _status: { en: 'published', fr: 'draft' } }],
      }),
    )
    return {
      args: {
        collectionSlug: 'pages',
        docs: [{ id: 1 }],
        locales: ['en', 'fr'],
        payload: { find } as unknown as Payload,
        req,
      },
      find,
    }
  }

  it.each([undefined, false, true])('controls locale query selection with fastMode=%s', async (fastMode) => {
    const { args, find } = setup()
    const result = await withPageTreeLocaleStatuses({
      ...args,
      fastMode,
      localeBadgeVisibility: ({ doc, locale }) =>
        (doc.enabled as Record<string, boolean>)[locale] === true,
    })
    expect(find).toHaveBeenCalledTimes(2)
    for (const [query] of find.mock.calls) {
      expect(query).toMatchObject({
        select: fastMode ? { id: true, _status: true } : undefined,
        locale: 'all', overrideAccess: false, fallbackLocale: false,
      })
    }
    expect(result[0].__pageTreeLocaleStatuses).toEqual([
      { locale: 'en', status: 'changed', visible: true },
      { locale: 'fr', status: 'draft', visible: false },
    ])
  })

  it('passes all-locale draft data to the rule and preserves status and locale order', async () => {
    const { args, find } = setup()
    const visibility = vi.fn(
      ({ doc, locale }: { doc: Record<string, unknown>; locale: string }) =>
        (doc.enabled as Record<string, boolean>)[locale] === true,
    )
    const result = await withPageTreeLocaleStatuses({ ...args, localeBadgeVisibility: visibility })
    expect(result[0].__pageTreeLocaleStatuses).toEqual([
      { locale: 'en', status: 'changed', visible: true },
      { locale: 'fr', status: 'draft', visible: false },
    ])
    expect(visibility).toHaveBeenCalledWith({
      doc: draftDoc,
      locale: 'fr',
      publishedDoc: { id: 1, _status: { en: 'published', fr: 'draft' } },
      req,
    })
    expect(find).toHaveBeenCalledTimes(2)
    expect(find.mock.calls[0][0]).toMatchObject({
      depth: 0,
      locale: 'all',
      overrideAccess: false,
      select: undefined,
    })
    expect(find.mock.calls[1][0]).toMatchObject({
      select: undefined,
      draft: false,
      locale: 'all',
      fallbackLocale: false,
      overrideAccess: false,
      depth: 0,
    })
    expect(result[0]).not.toHaveProperty('enabled')
  })

  it('lets visibility use current content independently of draft edits', async () => {
    const { args, find } = setup()
    const currentDoc = { ...draftDoc, enabled: { en: false, fr: true } }
    find.mockImplementation(({ draft }) =>
      Promise.resolve({ docs: [draft ? draftDoc : currentDoc] }),
    )
    const before = JSON.stringify([draftDoc, currentDoc])
    const result = await withPageTreeLocaleStatuses({
      ...args,
      localeBadgeVisibility: ({ publishedDoc, locale }) =>
        (publishedDoc?.enabled as Record<string, boolean> | undefined)?.[locale] === true,
    })
    expect(
      result[0].__pageTreeLocaleStatuses?.map(({ locale, visible }) => ({ locale, visible })),
    ).toEqual([
      { locale: 'en', visible: false },
      { locale: 'fr', visible: true },
    ])
    expect(find).toHaveBeenCalledTimes(2)
    expect(JSON.stringify([draftDoc, currentDoc])).toBe(before)
    expect(result[0]).not.toHaveProperty('enabled')
  })

  it('passes undefined when the current document is unavailable', async () => {
    const { args, find } = setup()
    find.mockImplementation(({ draft }) => Promise.resolve({ docs: draft ? [draftDoc] : [] }))
    const visibility = vi.fn(() => true)
    const result = await withPageTreeLocaleStatuses({ ...args, localeBadgeVisibility: visibility })
    expect(visibility).toHaveBeenCalledWith({
      doc: draftDoc,
      locale: 'en',
      publishedDoc: undefined,
      req,
    })
    expect(result[0].__pageTreeLocaleStatuses?.every(({ visible }) => visible)).toBe(true)
  })

  it('accepts a display label without replacing the publication status', async () => {
    const { args } = setup()
    const result = await withPageTreeLocaleStatuses({
      ...args,
      localeBadgeStatus: ({ locale, status }) =>
        locale === 'en' ? { status, label: 'Custom label' } : status,
    })
    expect(result[0].__pageTreeLocaleStatuses).toEqual([
      { locale: 'en', status: 'changed', label: 'Custom label' },
      { locale: 'fr', status: 'draft' },
    ])
  })

  it('preserves default visibility and narrow queries without a callback', async () => {
    const { args, find } = setup()
    const result = await withPageTreeLocaleStatuses({ ...args, fastMode: true })
    expect(result[0].__pageTreeLocaleStatuses).toEqual([
      { locale: 'en', status: 'changed' },
      { locale: 'fr', status: 'draft' },
    ])
    expect(find.mock.calls.every(([query]) => query.select !== undefined)).toBe(true)
  })

  it('applies an opt-in status override with both documents without changing visibility or stored data', async () => {
    const { args, find } = setup()
    const localeBadgeStatus = vi.fn<
      NonNullable<Parameters<typeof withPageTreeLocaleStatuses>[0]['localeBadgeStatus']>
    >(({ locale, status }) => (locale === 'en' ? 'draft' : status))
    const before = JSON.stringify(draftDoc)
    const result = await withPageTreeLocaleStatuses({
      ...args,
      localeBadgeStatus,
      localeBadgeVisibility: ({ locale }) => locale === 'en',
    })
    expect(result[0].__pageTreeLocaleStatuses).toEqual([
      { locale: 'en', status: 'draft', visible: true },
      { locale: 'fr', status: 'draft', visible: false },
    ])
    expect(localeBadgeStatus).toHaveBeenCalledWith({
      doc: draftDoc,
      locale: 'en',
      publishedDoc: { id: 1, _status: { en: 'published', fr: 'draft' } },
      req,
      status: 'changed',
    })
    expect(find).toHaveBeenCalledTimes(2)
    expect(find.mock.calls.every(([query]) => query.select === undefined)).toBe(true)
    expect(JSON.stringify(draftDoc)).toBe(before)
    expect(result[0]).not.toHaveProperty('enabled')
  })

  it('hides unavailable drafts without passing missing documents to the callback', async () => {
    const { args, find } = setup()
    find.mockResolvedValue({ docs: [] })
    const visibility = vi.fn(() => true)
    const result = await withPageTreeLocaleStatuses({ ...args, localeBadgeVisibility: visibility })
    expect(result[0].__pageTreeLocaleStatuses?.every(({ visible }) => visible === false)).toBe(true)
    expect(visibility).not.toHaveBeenCalled()
  })
})
