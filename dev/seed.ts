import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

type PageSeedCollection = 'page-orderable' | 'page-tree' | 'page-tree-orderable' | 'pages'
type SeedCollection = 'categories' | PageSeedCollection
type NestedSeedCollection = 'categories' | 'page-tree' | 'page-tree-orderable'
type SeedPageStatus = 'draft' | 'published'
type SeedDefinition = {
  parentSlug?: string
  slug: string
  status?: SeedPageStatus
  title: string
}

function buildSeedPublishedAt(index: number): string {
  const publishedAt = new Date('2025-01-15T09:00:00.000Z')
  publishedAt.setUTCDate(publishedAt.getUTCDate() + index * 3)
  return publishedAt.toISOString()
}

const pageSeedDefinitions: SeedDefinition[] = [
  { slug: 'home', title: 'Home' },
  { slug: 'about', title: 'About' },
  { parentSlug: 'about', slug: 'team', title: 'Team' },
  { parentSlug: 'team', slug: 'leadership', title: 'Leadership' },
  { parentSlug: 'about', slug: 'careers', title: 'Careers' },
  { slug: 'services', title: 'Services' },
  { parentSlug: 'services', slug: 'strategy', title: 'Strategy' },
  { parentSlug: 'services', slug: 'design', title: 'Design' },
  { slug: 'blog', title: 'Blog' },
  { parentSlug: 'blog', slug: 'company-news', status: 'draft', title: 'Company News' },
  { parentSlug: 'blog', slug: 'engineering-notes', title: 'Engineering Notes' },
  { slug: 'contact', title: 'Contact' },
  { slug: 'pricing', title: 'Pricing' },
  { slug: 'legal', title: 'Legal' },
]

const categorySeedDefinitions: SeedDefinition[] = [
  { slug: 'documentation', title: 'Documentation' },
  { parentSlug: 'documentation', slug: 'getting-started', title: 'Getting Started' },
  { parentSlug: 'documentation', slug: 'how-to-guides', title: 'How-To Guides' },
  { slug: 'product', title: 'Product' },
  { parentSlug: 'product', slug: 'features', title: 'Features' },
  { parentSlug: 'features', slug: 'automation', title: 'Automation' },
  { parentSlug: 'features', slug: 'localization', title: 'Localization' },
  { slug: 'engineering', title: 'Engineering' },
  { parentSlug: 'engineering', slug: 'architecture', title: 'Architecture' },
  { parentSlug: 'engineering', slug: 'integrations', title: 'Integrations' },
  { parentSlug: 'integrations', slug: 'cms', title: 'CMS' },
  { parentSlug: 'integrations', slug: 'search', title: 'Search' },
]

function isPageSeedCollection(collection: SeedCollection): collection is PageSeedCollection {
  return (
    collection === 'page-orderable' ||
    collection === 'page-tree' ||
    collection === 'page-tree-orderable' ||
    collection === 'pages'
  )
}

async function upsertPublishedDocument(args: {
  collection: SeedCollection
  data: Record<string, unknown>
  locale?: string
  payload: Payload
  slug: string
  status?: SeedPageStatus
}) {
  const { collection, data, locale, payload, slug, status = 'published' } = args
  const statusAwareData =
    isPageSeedCollection(collection)
      ? {
          ...data,
          _status: status,
        }
      : data
  const shouldSaveAsDraft = isPageSeedCollection(collection) && status === 'draft'
  const { docs } = await payload.find({
    collection,
    depth: 0,
    draft: true,
    limit: 1,
    locale,
    overrideAccess: true,
    pagination: false,
    where: {
      slug: {
        equals: slug,
      },
    },
  } as never)
  const existingDoc = docs[0] as { id: number | string } | undefined
  const currentPublishedDoc =
    isPageSeedCollection(collection) && status === 'draft'
      ? ((await payload.find({
          collection,
          depth: 0,
          draft: false,
          limit: 1,
          locale,
          overrideAccess: true,
          pagination: false,
          where: {
            slug: {
              equals: slug,
            },
          },
        } as never)).docs[0] as { id: number | string } | undefined)
      : undefined

  if (currentPublishedDoc) {
    await payload.delete({
      collection,
      id: currentPublishedDoc.id,
      overrideAccess: true,
    } as never)

    return payload.create({
      collection,
      data: statusAwareData,
      draft: true,
      locale,
      overrideAccess: true,
    } as never)
  }

  if (existingDoc) {
    return payload.update({
      collection,
      data: statusAwareData,
      draft: shouldSaveAsDraft,
      id: existingDoc.id,
      locale,
      overrideAccess: true,
    } as never)
  }

  return payload.create({
    collection,
    data: statusAwareData,
    draft: shouldSaveAsDraft,
    locale,
    overrideAccess: true,
  } as never)
}

async function seedTree(args: {
  collection: NestedSeedCollection
  definitions: SeedDefinition[]
  locale?: string
  payload: Payload
}) {
  const { collection, definitions, locale, payload } = args
  const seededIDsBySlug = new Map<string, number | string>()

  for (const [index, definition] of definitions.entries()) {
    const parentID =
      definition.parentSlug === undefined ? null : seededIDsBySlug.get(definition.parentSlug) ?? null

    if (definition.parentSlug && parentID === null) {
      throw new Error(
        `Could not seed "${definition.slug}" because parent "${definition.parentSlug}" was not created first.`,
      )
    }

    const document = (await upsertPublishedDocument({
      collection,
      data: {
        parent: parentID,
        ...(isPageSeedCollection(collection)
          ? {
              publishedAt:
                definition.status === 'draft' ? null : buildSeedPublishedAt(index),
            }
          : {}),
        slug: definition.slug,
        title: definition.title,
      },
      locale,
      payload,
      slug: definition.slug,
      status: definition.status,
    })) as { id: number | string }

    seededIDsBySlug.set(definition.slug, document.id)
  }

  return seededIDsBySlug
}

async function seedFlatCollection(args: {
  collection: Exclude<SeedCollection, NestedSeedCollection>
  definitions: SeedDefinition[]
  locale?: string
  payload: Payload
}) {
  const { collection, definitions, locale, payload } = args
  const seededIDsBySlug = new Map<string, number | string>()

  for (const definition of definitions) {
    const document = (await upsertPublishedDocument({
      collection,
      data: {
        ...(isPageSeedCollection(collection)
          ? {
              publishedAt:
                definition.status === 'draft' ? null : buildSeedPublishedAt(seededIDsBySlug.size),
            }
          : {}),
        slug: definition.slug,
        title: definition.title,
      },
      locale,
      payload,
      slug: definition.slug,
      status: definition.status,
    })) as { id: number | string }

    seededIDsBySlug.set(definition.slug, document.id)
  }

  return seededIDsBySlug
}

async function publishLocalizedPageTitles(args: {
  collection: PageSeedCollection
  definitions: SeedDefinition[]
  locale: string
  pagesBySlug: Map<string, number | string>
  payload: Payload
}) {
  const { collection, definitions, locale, pagesBySlug, payload } = args

  const localizedDefinitions = definitions.map((definition, index) => [index, definition] as const)

  for (const [index, definition] of localizedDefinitions.reverse()) {
    const pageID = pagesBySlug.get(definition.slug)

    if (pageID === undefined) {
      throw new Error(`Could not resolve seeded page "${definition.slug}" for locale "${locale}".`)
    }

    await payload.update({
      collection,
      data: {
        _status: definition.status ?? 'published',
        publishedAt: definition.status === 'draft' ? null : buildSeedPublishedAt(index),
        title: definition.title,
      },
      draft: definition.status === 'draft',
      id: pageID,
      locale,
      overrideAccess: true,
    } as never)
  }
}

export const seed = async (payload: Payload) => {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: {
      email: {
        equals: devUser.email,
      },
    },
  } as never)

  if (!totalDocs) {
    await payload.create({
      collection: 'users',
      data: devUser,
      overrideAccess: true,
    } as never)
  }

  const pageTreeOrderableBySlug = await seedTree({
    collection: 'page-tree-orderable',
    definitions: pageSeedDefinitions,
    payload,
  })

  await publishLocalizedPageTitles({
    collection: 'page-tree-orderable',
    definitions: pageSeedDefinitions,
    locale: 'de',
    pagesBySlug: pageTreeOrderableBySlug,
    payload,
  })

  const pageTreeBySlug = await seedTree({
    collection: 'page-tree',
    definitions: pageSeedDefinitions,
    payload,
  })

  await publishLocalizedPageTitles({
    collection: 'page-tree',
    definitions: pageSeedDefinitions,
    locale: 'de',
    pagesBySlug: pageTreeBySlug,
    payload,
  })

  const pageOrderableBySlug = await seedFlatCollection({
    collection: 'page-orderable',
    definitions: pageSeedDefinitions,
    payload,
  })

  await publishLocalizedPageTitles({
    collection: 'page-orderable',
    definitions: pageSeedDefinitions,
    locale: 'de',
    pagesBySlug: pageOrderableBySlug,
    payload,
  })

  const pagesBySlug = await seedFlatCollection({
    collection: 'pages',
    definitions: pageSeedDefinitions,
    payload,
  })

  await publishLocalizedPageTitles({
    collection: 'pages',
    definitions: pageSeedDefinitions,
    locale: 'de',
    pagesBySlug,
    payload,
  })

  await seedTree({
    collection: 'categories',
    definitions: categorySeedDefinitions,
    payload,
  })
}
