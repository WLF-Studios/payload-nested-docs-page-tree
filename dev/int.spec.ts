import type { Payload, PayloadRequest } from 'payload'

import config from '@payload-config'
import { createPayloadRequest, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { devUser } from './helpers/credentials.js'
import { getRelationshipID } from '../src/utilities/pageTree.js'

let payload: Payload

afterAll(async () => {
  await payload.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

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
    const categoriesCollection = payload.collections.categories.config

    expect(pagesCollection.admin.components?.views?.list?.Component).toBe(
      'plugin-nested-docs-page-tree/rsc#NestedDocsPageTreeListView',
    )
    expect(categoriesCollection.admin.components?.views?.list?.Component).toBe(
      'plugin-nested-docs-page-tree/rsc#NestedDocsPageTreeListView',
    )
    expect(pagesCollection.custom?.nestedDocsPageTreePlugin).toMatchObject({
      badges: {
        colors: {},
        labels: {},
      },
      breadcrumbsFieldSlug: 'breadcrumbs',
      defaultLimit: 100,
      hideBreadcrumbs: true,
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
