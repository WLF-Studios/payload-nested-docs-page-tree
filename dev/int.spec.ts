import type { Payload, PayloadRequest } from 'payload'

import config from '@payload-config'
import { createPayloadRequest, getPayload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { devUser } from './helpers/credentials.js'
import { revalidatePublishedChange } from './lib/rebuild.js'
import { getRelationshipID } from '../src/utilities/pageTree.js'

let payload: Payload
const originalDeployHookURL = process.env.CLOUDFLARE_DEPLOY_HOOK_URL

afterAll(async () => {
  await payload.destroy()
})

beforeEach(() => {
  delete process.env.CLOUDFLARE_DEPLOY_HOOK_URL
  vi.unstubAllGlobals()
})

beforeAll(async () => {
  payload = await getPayload({ config })
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

async function getPagesMoveEndpoint() {
  const moveEndpoint = payload.collections.pages.config.endpoints?.find(
    (endpoint) => endpoint.path === '/:id/move' && endpoint.method === 'post',
  )

  if (!moveEndpoint) {
    throw new Error('Could not resolve the pages move endpoint')
  }

  return moveEndpoint
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
  locale?: string
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

async function createPublishedPage(args: {
  parent?: null | string
  slug: string
  title: string
}) {
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

async function readPage(id: number | string, locale: string) {
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
  locale?: string
  movedID: number | string
  parentID: null | string
  user?: Record<string, unknown>
}) {
  const { locale, movedID, parentID, user } = args
  const moveEndpoint = await getPagesMoveEndpoint()
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
  const payloadRequest = (await createPayloadRequest({
    config,
    request,
  })) as PayloadRequest & {
    routeParams?: Record<string, string>
  }

  payloadRequest.routeParams = { id: String(movedID) }

  if (user) {
    payloadRequest.user = user as never
  }

  return moveEndpoint.handler(payloadRequest)
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
      payload.config.endpoints?.some(
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
      pagesCollection.endpoints?.some(
        (endpoint) => endpoint.method === 'post' && endpoint.path === '/:id/move',
      ),
    ).toBe(true)

    const breadcrumbsField = pagesCollection.fields.find(
      (field) => 'name' in field && field.name === 'breadcrumbs',
    )

    expect(
      breadcrumbsField && 'admin' in breadcrumbsField ? breadcrumbsField.admin?.hidden : undefined,
    ).toBe(true)
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

    await hook({
      doc: { _status: 'published' },
      previousDoc: { _status: 'draft' },
      req: {
        context: {},
        payload: {
          logger: {
            error: vi.fn(),
          },
        },
        url: 'http://localhost:3000/api/pages/example?autosave=true',
      },
    } as never)

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
    expect(teamEn.breadcrumbs?.map((crumb) => crumb.label)).toEqual(['Contact Locale', 'Team Locale'])
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
