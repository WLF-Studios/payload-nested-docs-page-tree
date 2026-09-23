import type { Endpoint, Payload, PayloadRequest } from 'payload'

import config from '@payload-config'
import { createLocalReq, createPayloadRequest, getPayload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { createMovePageEndpoint } from '../src/endpoints/createMovePageEndpoint.js'
import { withPageTreeLocaleStatuses } from '../src/utilities/localeStatus.js'
import { resolveDiagnostics } from '../src/utilities/diagnostics.js'
import { getRelationshipID } from '../src/utilities/pageTree.js'
import { devUser } from './helpers/credentials.js'
import { revalidatePublishedChange } from './lib/rebuild.js'
import { seedWithRequest } from './seed.js'

let payload: Payload
const originalDeployHookURL = process.env.CLOUDFLARE_DEPLOY_HOOK_URL

type DevLocale = 'de' | 'en'
type TestRequestUser = NonNullable<PayloadRequest['user']>

afterAll(async () => {
  await payload.destroy()
})

beforeEach(() => {
  delete process.env.CLOUDFLARE_DEPLOY_HOOK_URL
  vi.unstubAllGlobals()
})

beforeAll(async () => {
  payload = await getPayload({ config })

  // Finish collection and version index creation before starting test transactions.
  await Promise.all(
    [...Object.values(payload.db.collections), ...Object.values(payload.db.versions)].map((model) =>
      model.init(),
    ),
  )
})

afterEach(() => {
  if (originalDeployHookURL === undefined) {
    delete process.env.CLOUDFLARE_DEPLOY_HOOK_URL
  } else {
    process.env.CLOUDFLARE_DEPLOY_HOOK_URL = originalDeployHookURL
  }

  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mockDeployHookFetch() {
  process.env.CLOUDFLARE_DEPLOY_HOOK_URL = 'https://example.com/deploy'

  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

function hasEndpoint(
  endpoints: false | Endpoint[] | undefined,
  predicate: (endpoint: Endpoint) => boolean,
): boolean {
  return Array.isArray(endpoints) && endpoints.some(predicate)
}

function getFieldHiddenValue(field: unknown): boolean | undefined {
  if (!field || typeof field !== 'object' || !('admin' in field)) {
    return undefined
  }

  return (field as { admin?: { hidden?: boolean } }).admin?.hidden
}

async function getPagesMoveEndpoint() {
  const endpoints = payload.collections.pages.config.endpoints
  const moveEndpoint = Array.isArray(endpoints)
    ? endpoints.find((endpoint) => endpoint.path === '/:id/move' && endpoint.method === 'post')
    : undefined

  if (!moveEndpoint) {
    throw new Error('Could not resolve the pages move endpoint')
  }

  return moveEndpoint
}

async function getPagesReorderEndpoint() {
  const endpoints = payload.collections.pages.config.endpoints
  const reorderEndpoint = Array.isArray(endpoints)
    ? endpoints.find((endpoint) => endpoint.path === '/:id/reorder' && endpoint.method === 'post')
    : undefined

  if (!reorderEndpoint) {
    throw new Error('Could not resolve the pages reorder endpoint')
  }

  return reorderEndpoint
}

async function getSeedUser() {
  const { docs } = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      email: {
        equals: devUser.email,
      },
    },
  })

  if (!docs[0]) {
    throw new Error('Could not resolve the seeded dev user')
  }

  return docs[0]
}

async function createPage(args: {
  locale?: DevLocale
  parent?: null | string
  slug: string
  title: string
}) {
  const { locale, parent = null, slug, title } = args

  return payload.create({
    collection: 'pages',
    data: {
      parent,
      slug,
      title,
    },
    draft: true,
    locale,
    overrideAccess: true,
  })
}

async function createPublishedPage(args: { parent?: null | string; slug: string; title: string }) {
  const { parent = null, slug, title } = args

  return payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      parent,
      publishedAt: new Date().toISOString(),
      slug,
      title,
    },
    draft: false,
    overrideAccess: true,
  })
}

async function readPage(id: number | string, locale: DevLocale) {
  return payload.findByID({
    collection: 'pages',
    depth: 0,
    draft: true,
    id,
    locale,
    overrideAccess: true,
  })
}

async function invokeMove(args: {
  endpoint?: Endpoint
  locale?: DevLocale
  movedID: number | string
  parentID: null | string
  user?: TestRequestUser
}) {
  const { endpoint, locale, movedID, parentID, user } = args
  const moveEndpoint = endpoint ?? (await getPagesMoveEndpoint())
  const request = new Request(
    `http://localhost:3000/api/pages/${movedID}/move${locale ? `?locale=${locale}` : ''}`,
    {
      body: JSON.stringify({ parentID }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
  const payloadRequest = await createPayloadRequest({
    config,
    request,
  })

  payloadRequest.routeParams = { id: String(movedID) }

  if (user) {
    payloadRequest.user = user
  }

  return moveEndpoint.handler(payloadRequest)
}

async function invokeReorder(args: {
  locale?: DevLocale
  movedID: number | string
  newKeyWillBe: 'greater' | 'less'
  targetID: number | string
  targetKey: null | string
  user?: TestRequestUser
}) {
  const { locale, movedID, newKeyWillBe, targetID, targetKey, user } = args
  const reorderEndpoint = await getPagesReorderEndpoint()
  const request = new Request(
    `http://localhost:3000/api/pages/${movedID}/reorder${locale ? `?locale=${locale}` : ''}`,
    {
      body: JSON.stringify({
        docsToMove: [String(movedID)],
        newKeyWillBe,
        orderableFieldName: '_order',
        target: {
          id: String(targetID),
          key: targetKey,
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
  const payloadRequest = await createPayloadRequest({
    config,
    request,
  })

  payloadRequest.routeParams = { id: String(movedID) }

  if (user) {
    payloadRequest.user = user
  }

  return reorderEndpoint.handler(payloadRequest)
}

async function countPageVersions(id: number | string) {
  const versions = await payload.findVersions({
    collection: 'pages',
    limit: 0,
    overrideAccess: true,
    where: {
      parent: {
        equals: id,
      },
    },
  })

  return versions.totalDocs
}

describe('nestedDocsPageTreePlugin integration', () => {
  test('patches each targeted collection with the tree list view and move endpoint', async () => {
    const pagesCollection = payload.collections.pages.config

    expect(pagesCollection.admin.components?.views?.list?.Component).toBe(
      'payload-nested-docs-page-tree/rsc#NestedDocsPageTreeListView',
    )
    expect(payload.config.admin.components?.actions).toContain(
      'payload-cloudflare-build-status/client#CloudflareBuildStatus',
    )
    expect(
      hasEndpoint(
        payload.config.endpoints,
        (endpoint) => endpoint.method === 'get' && endpoint.path === '/cloudflare-build-status',
      ),
    ).toBe(true)
    expect(pagesCollection.orderable).toBe(true)
    expect(pagesCollection.custom?.nestedDocsPageTreePlugin).toMatchObject({
      badges: {
        colors: {},
        labels: {},
      },
      breadcrumbsFieldSlug: 'breadcrumbs',
      defaultLimit: 100,
      hideBreadcrumbs: true,
      homeIndicator: {
        enabled: true,
      },
      parentFieldSlug: 'parent',
    })
    expect(
      hasEndpoint(
        pagesCollection.endpoints,
        (endpoint) => endpoint.method === 'post' && endpoint.path === '/:id/move',
      ),
    ).toBe(true)
    expect(
      hasEndpoint(
        pagesCollection.endpoints,
        (endpoint) => endpoint.method === 'post' && endpoint.path === '/:id/reorder',
      ),
    ).toBe(true)

    const breadcrumbsField = pagesCollection.fields.find(
      (field) => 'name' in field && field.name === 'breadcrumbs',
    )

    expect(getFieldHiddenValue(breadcrumbsField)).toBe(true)
  })

  test('triggers the Cloudflare deploy hook for published create and update', async () => {
    const fetchMock = mockDeployHookFetch()

    const page = await createPublishedPage({
      slug: 'deploy-create',
      title: 'Deploy Create',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com/deploy',
      expect.objectContaining({
        body: JSON.stringify({ source: 'pages' }),
        method: 'POST',
      }),
    )

    await payload.update({
      collection: 'pages',
      data: {
        _status: 'published',
        title: 'Deploy Update',
      },
      draft: false,
      id: page.id,
      overrideAccess: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('does not trigger the Cloudflare deploy hook for draft-only or autosave changes', async () => {
    const fetchMock = mockDeployHookFetch()

    await createPage({
      slug: 'draft-no-deploy',
      title: 'Draft No Deploy',
    })

    const hook = revalidatePublishedChange('pages')
    const payloadRequest = await createPayloadRequest({
      config,
      request: new Request('http://localhost:3000/api/pages/example?autosave=true'),
    })

    await hook({
      collection: payload.collections.pages.config,
      context: payloadRequest.context,
      data: {},
      doc: { id: 'example', _status: 'published' },
      operation: 'update',
      previousDoc: { id: 'example', _status: 'draft' },
      req: payloadRequest,
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('does not trigger the Cloudflare deploy hook for page-tree parent moves', async () => {
    const user = await getSeedUser()
    const root = await createPublishedPage({
      slug: 'deploy-move-root',
      title: 'Deploy Move Root',
    })
    const child = await createPublishedPage({
      parent: String(root.id),
      slug: 'deploy-move-child',
      title: 'Deploy Move Child',
    })
    const otherRoot = await createPublishedPage({
      slug: 'deploy-move-other',
      title: 'Deploy Move Other',
    })
    const fetchMock = mockDeployHookFetch()

    const response = await invokeMove({
      locale: 'en',
      movedID: child.id,
      parentID: String(otherRoot.id),
      user,
    })

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('triggers the Cloudflare deploy hook exactly once when publishOnMove publishes a move', async () => {
    const user = await getSeedUser()
    const root = await createPublishedPage({
      slug: 'deploy-publish-move-root',
      title: 'Deploy Publish Move Root',
    })
    const parent = await createPublishedPage({
      slug: 'deploy-publish-move-parent',
      title: 'Deploy Publish Move Parent',
    })
    const child = await createPublishedPage({
      parent: String(parent.id),
      slug: 'deploy-publish-move-child',
      title: 'Deploy Publish Move Child',
    })
    const fetchMock = mockDeployHookFetch()

    // The dev config leaves publishOnMove off, so build a publishing endpoint
    // against the same live payload instance.
    const response = await invokeMove({
      endpoint: createMovePageEndpoint({
        collectionSlug: 'pages',
        diagnostics: resolveDiagnostics(false),
        parentFieldSlug: 'parent',
        publishOnMove: true,
      }),
      locale: 'en',
      movedID: parent.id,
      parentID: String(root.id),
      user,
    })

    expect(response.status).toBe(200)

    // The move went live: the published rows, not just the drafts, moved.
    const publishedParent = await payload.findByID({
      collection: 'pages',
      depth: 0,
      draft: false,
      id: parent.id,
      overrideAccess: true,
    })
    const publishedChild = await payload.findByID({
      collection: 'pages',
      depth: 0,
      draft: false,
      id: child.id,
      overrideAccess: true,
    })

    expect(publishedParent._status).toBe('published')
    expect(String(getRelationshipID(publishedParent.parent))).toBe(String(root.id))
    expect(publishedChild.breadcrumbs?.at(-1)?.url).toBe(
      '/deploy-publish-move-root/deploy-publish-move-parent/deploy-publish-move-child',
    )

    // One rebuild for the whole cascade, not one per descendant.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('reorders published pages silently without changing status or version history', async () => {
    const user = await getSeedUser()
    const first = await createPublishedPage({
      slug: 'reorder-published-first',
      title: 'Reorder Published First',
    })
    const second = await createPublishedPage({
      slug: 'reorder-published-second',
      title: 'Reorder Published Second',
    })
    const firstVersionCount = await countPageVersions(first.id)
    const fetchMock = mockDeployHookFetch()

    const response = await invokeReorder({
      locale: 'en',
      movedID: first.id,
      newKeyWillBe: 'greater',
      targetID: second.id,
      targetKey: typeof second._order === 'string' ? second._order : null,
      user,
    })

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await countPageVersions(first.id)).toBe(firstVersionCount)

    const firstAfter = await payload.findByID({
      collection: 'pages',
      depth: 0,
      draft: false,
      id: first.id,
      overrideAccess: true,
    })
    const secondAfter = await payload.findByID({
      collection: 'pages',
      depth: 0,
      draft: false,
      id: second.id,
      overrideAccess: true,
    })

    expect(firstAfter._status).toBe('published')
    expect(secondAfter._status).toBe('published')
    expect(String(firstAfter._order) > String(secondAfter._order)).toBe(true)
  })

  test('reorders changed pages without dropping their changed draft state', async () => {
    const user = await getSeedUser()
    const changed = await createPublishedPage({
      slug: 'reorder-changed-page',
      title: 'Reorder Changed Page',
    })
    const target = await createPublishedPage({
      slug: 'reorder-changed-target',
      title: 'Reorder Changed Target',
    })

    await payload.update({
      collection: 'pages',
      data: {
        title: 'Reorder Changed Page Draft',
      },
      draft: true,
      id: changed.id,
      overrideAccess: true,
    })

    const changedDraftBefore = await readPage(changed.id, 'en')
    const changedVersionCount = await countPageVersions(changed.id)

    const response = await invokeReorder({
      locale: 'en',
      movedID: changed.id,
      newKeyWillBe: 'greater',
      targetID: target.id,
      targetKey: typeof target._order === 'string' ? target._order : null,
      user,
    })

    expect(response.status).toBe(200)
    expect(await countPageVersions(changed.id)).toBe(changedVersionCount)

    const changedCurrent = await payload.findByID({
      collection: 'pages',
      depth: 0,
      draft: false,
      id: changed.id,
      overrideAccess: true,
    })
    const changedDraft = await readPage(changed.id, 'en')
    const targetDraft = await readPage(target.id, 'en')

    expect(changedCurrent._status).toBe('published')
    expect(changedCurrent.title).toBe('Reorder Changed Page')
    expect(changedDraft._status).toBe('draft')
    expect(changedDraft.title).toBe('Reorder Changed Page Draft')
    expect(changedDraftBefore._order).not.toBe(changedDraft._order)
    expect(String(changedDraft._order) > String(targetDraft._order)).toBe(true)
  })

  test('triggers the Cloudflare deploy hook when a published page is deleted', async () => {
    const page = await createPublishedPage({
      slug: 'deploy-delete',
      title: 'Deploy Delete',
    })
    const fetchMock = mockDeployHookFetch()

    await payload.delete({
      collection: 'pages',
      id: page.id,
      overrideAccess: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/deploy',
      expect.objectContaining({
        body: JSON.stringify({ source: 'pages' }),
        method: 'POST',
      }),
    )
  })

  test('rejects moves when the request does not have update access', async () => {
    const root = await createPage({
      slug: 'access-root',
      title: 'Access Root',
    })
    const child = await createPage({
      parent: String(root.id),
      slug: 'access-child',
      title: 'Access Child',
    })
    const otherRoot = await createPage({
      slug: 'access-other',
      title: 'Access Other',
    })
    const response = await invokeMove({
      locale: 'en',
      movedID: child.id,
      parentID: String(otherRoot.id),
    })

    expect(response.status).toBe(403)
  })

  test('moves only the active locale draft state and does not fan out localized breadcrumbs', async () => {
    const user = await getSeedUser()
    const about = await createPage({
      slug: 'locale-about',
      title: 'About Locale',
    })
    const contact = await createPage({
      slug: 'locale-contact',
      title: 'Contact Locale',
    })
    const team = await createPage({
      parent: String(about.id),
      slug: 'locale-team',
      title: 'Team Locale',
    })

    await payload.update({
      collection: 'pages',
      data: {
        title: 'Ueber Lokal',
      },
      draft: true,
      id: about.id,
      locale: 'de',
      overrideAccess: true,
    })
    await payload.update({
      collection: 'pages',
      data: {
        title: 'Team Lokal',
      },
      draft: true,
      id: team.id,
      locale: 'de',
      overrideAccess: true,
    })

    const teamDeBeforeMove = await readPage(team.id, 'de')
    const teamDeBeforeBreadcrumbLabels = teamDeBeforeMove.breadcrumbs?.map((crumb) => crumb.label)

    const response = await invokeMove({
      locale: 'en',
      movedID: team.id,
      parentID: String(contact.id),
      user,
    })

    expect(response.status).toBe(200)

    const teamEn = await readPage(team.id, 'en')
    const teamDe = await readPage(team.id, 'de')

    expect(getRelationshipID(teamEn.parent)).toBe(String(contact.id))
    expect(getRelationshipID(teamDe.parent)).toBe(String(contact.id))
    expect(teamEn.breadcrumbs?.map((crumb) => crumb.label)).toEqual([
      'Contact Locale',
      'Team Locale',
    ])
    expect(teamDe.breadcrumbs?.map((crumb) => crumb.label)).toEqual(teamDeBeforeBreadcrumbLabels)
  })

  test('rejects self, descendant, missing-parent, and no-op moves', async () => {
    const user = await getSeedUser()
    const root = await createPage({
      slug: 'rule-root',
      title: 'Rule Root',
    })
    const child = await createPage({
      parent: String(root.id),
      slug: 'rule-child',
      title: 'Rule Child',
    })
    const grandchild = await createPage({
      parent: String(child.id),
      slug: 'rule-grandchild',
      title: 'Rule Grandchild',
    })

    const selfResponse = await invokeMove({
      locale: 'en',
      movedID: child.id,
      parentID: String(child.id),
      user,
    })
    expect(selfResponse.status).toBe(400)

    const descendantResponse = await invokeMove({
      locale: 'en',
      movedID: child.id,
      parentID: String(grandchild.id),
      user,
    })
    expect(descendantResponse.status).toBe(400)

    const missingParentResponse = await invokeMove({
      locale: 'en',
      movedID: child.id,
      parentID: 'missing-parent',
      user,
    })
    expect(missingParentResponse.status).toBe(400)

    const noopResponse = await invokeMove({
      locale: 'en',
      movedID: child.id,
      parentID: String(root.id),
      user,
    })
    expect(noopResponse.status).toBe(400)
  })
})

test('seeding rebuilds the same complete tree in every collection and locale', async () => {
  expect(payload.collections.pages.config.versions?.drafts).toMatchObject({ localizeStatus: false })
  expect(payload.collections['tabbed-pages'].config.versions?.drafts).toMatchObject({ localizeStatus: false })
  expect(payload.collections['localized-pages'].config.versions?.drafts).toMatchObject({ localizeStatus: true })

  for (let pass = 0; pass < 2; pass++) {
    await seedWithRequest({ payload })
    let baseline: unknown
    for (const collection of ['pages', 'tabbed-pages', 'localized-pages'] as const) {
      for (const locale of ['en', 'fr', 'de'] as const) {
        const { docs } = await payload.find({
          collection, locale, fallbackLocale: false, depth: 0, draft: true,
          pagination: false, sort: '_order',
        })
        expect(docs).toHaveLength(30)
        const slugByID = new Map(docs.map((doc) => [String(doc.id), doc.slug]))
        const tree = docs.map((doc) => ({
          title: doc.title,
          slug: doc.slug,
          parent: doc.parent ? slugByID.get(getRelationshipID(doc.parent)!) : null,
          breadcrumbs: doc.breadcrumbs?.map(({ url, label }) => ({ url, label })),
        }))
        expect(tree.every((doc) => typeof doc.title === 'string' && doc.title.trim())).toBe(true)
        expect(tree.find((doc) => doc.slug === 'home')?.parent).toBe(null)
        expect(tree.find((doc) => doc.slug === 'about')?.parent).toBe(null)
        expect(tree.find((doc) => doc.slug === 'leadership')?.parent).toBe('team')
        if (!baseline) baseline = tree
        expect(tree, collection + '/' + locale).toEqual(baseline)

        if (collection === 'localized-pages' && locale === 'en') {
          const req = await createLocalReq({ locale }, payload)
          const rows = await withPageTreeLocaleStatuses({
            collectionSlug: collection, docs: docs.map((doc) => ({ ...doc })),
            locales: ['en', 'fr', 'de'], payload, req,
          })
          expect(Object.fromEntries(rows.filter((row) =>
            ['home', 'careers', 'ux-audits', 'request-a-quote', 'company-news'].includes(String(row.slug)),
          ).map((row) => [row.slug, row.__pageTreeLocaleStatuses?.map(({ status }) => status)]))).toEqual({
            home: ['published', 'published', 'published'],
            careers: ['published', 'draft', 'changed'],
            'ux-audits': ['draft', 'changed', 'published'],
            'request-a-quote': ['changed', 'published', 'draft'],
            'company-news': ['draft', 'draft', 'draft'],
          })
        }
      }
      if (collection !== 'localized-pages') {
        const normal = await payload.find({ collection, locale: 'all', limit: 1, draft: true })
        expect(typeof normal.docs[0]._status).toBe('string')
      }
      if (pass === 0) {
        const { docs } = await payload.find({ collection, locale: 'en', pagination: false })
        const home = docs.find((doc) => doc.slug === 'home')!
        const services = docs.find((doc) => doc.slug === 'services')!
        await payload.update({ collection, id: home.id, data: { parent: services.id }, draft: true })
        // Reproduce stale records with missing localized titles from older seeds.
        await payload.create({ collection, data: { slug: 'stale-page' }, draft: true, locale: 'en' })
      }
    }
  }
}, 90_000)
