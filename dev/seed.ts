import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

type SeedCollection = 'categories' | 'pages'
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
  { parentSlug: 'about', slug: 'culture', title: 'Culture' },
  { slug: 'services', title: 'Services' },
  { parentSlug: 'services', slug: 'strategy', title: 'Strategy' },
  { parentSlug: 'strategy', slug: 'brand-strategy', title: 'Brand Strategy' },
  { parentSlug: 'strategy', slug: 'product-strategy', title: 'Product Strategy' },
  { parentSlug: 'services', slug: 'design', title: 'Design' },
  { parentSlug: 'design', slug: 'web-design', title: 'Web Design' },
  { parentSlug: 'design', slug: 'ux-audits', status: 'draft', title: 'UX Audits' },
  { parentSlug: 'services', slug: 'development', title: 'Development' },
  {
    parentSlug: 'development',
    slug: 'frontend-engineering',
    title: 'Frontend Engineering',
  },
  {
    parentSlug: 'development',
    slug: 'cms-integrations',
    title: 'CMS Integrations',
  },
  { parentSlug: 'development', slug: 'ecommerce', title: 'Ecommerce' },
  { slug: 'solutions', title: 'Solutions' },
  { parentSlug: 'solutions', slug: 'startups', title: 'For Startups' },
  { parentSlug: 'solutions', slug: 'enterprise', title: 'For Enterprise' },
  { parentSlug: 'solutions', slug: 'healthcare', title: 'Healthcare' },
  { slug: 'case-studies', title: 'Case Studies' },
  {
    parentSlug: 'case-studies',
    slug: 'fintech-platform',
    title: 'Fintech Platform',
  },
  {
    parentSlug: 'case-studies',
    slug: 'b2b-commerce',
    title: 'B2B Commerce',
  },
  {
    parentSlug: 'case-studies',
    slug: 'patient-portal',
    title: 'Patient Portal',
  },
  { slug: 'blog', title: 'Blog' },
  { parentSlug: 'blog', slug: 'company-news', status: 'draft', title: 'Company News' },
  { parentSlug: 'blog', slug: 'engineering-notes', title: 'Engineering Notes' },
  { slug: 'contact', title: 'Contact' },
  {
    parentSlug: 'contact',
    slug: 'request-a-quote',
    status: 'draft',
    title: 'Request a Quote',
  },
]

const categorySeedDefinitions: SeedDefinition[] = [
  { slug: 'news', title: 'News' },
  { parentSlug: 'news', slug: 'updates', title: 'Updates' },
]

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
    collection === 'pages'
      ? {
          ...data,
          _status: status,
        }
      : data
  const shouldSaveAsDraft = collection === 'pages' && status === 'draft'
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
    collection === 'pages' && status === 'draft'
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
  collection: SeedCollection
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
        ...(collection === 'pages'
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

async function publishLocalizedPageTitles(args: {
  definitions: SeedDefinition[]
  locale: string
  pagesBySlug: Map<string, number | string>
  payload: Payload
}) {
  const { definitions, locale, pagesBySlug, payload } = args

  const localizedDefinitions = definitions.map((definition, index) => [index, definition] as const)

  for (const [index, definition] of localizedDefinitions.reverse()) {
    const pageID = pagesBySlug.get(definition.slug)

    if (pageID === undefined) {
      throw new Error(`Could not resolve seeded page "${definition.slug}" for locale "${locale}".`)
    }

    await payload.update({
      collection: 'pages',
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

  const pagesBySlug = await seedTree({
    collection: 'pages',
    definitions: pageSeedDefinitions,
    payload,
  })

  await publishLocalizedPageTitles({
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
