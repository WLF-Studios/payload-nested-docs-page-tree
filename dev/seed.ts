import type { Payload, PayloadRequest } from 'payload'

import { devUser } from './helpers/credentials.js'

type SeedCollection = 'pages' | 'tabbed-pages'
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

    const document = (await payload.create({
      collection,
      data: {
        _status: definition.status ?? 'published',
        parent: parentID,
        publishedAt: definition.status === 'draft' ? null : buildSeedPublishedAt(index),
        slug: definition.slug,
        title: definition.title,
      },
      locale: locale ?? 'en',
      draft: definition.status === 'draft',
      overrideAccess: true,
    } as never)) as { id: number | string }

    seededIDsBySlug.set(definition.slug, document.id)
  }

  return seededIDsBySlug
}

async function publishLocalizedPageTitles(args: {
  collection: SeedCollection
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

async function seedLocalizedPages(payload: Payload) {
  const statusExamples: Record<string, Record<'en' | 'fr' | 'de', 'published' | 'draft' | 'changed'>> = {
    careers: { en: 'published', fr: 'draft', de: 'changed' },
    'ux-audits': { en: 'draft', fr: 'changed', de: 'published' },
    'request-a-quote': { en: 'changed', fr: 'published', de: 'draft' },
  }
  const idsBySlug = new Map<string, number | string>()
  for (const definition of pageSeedDefinitions) {
    const statuses = statusExamples[definition.slug] ?? {
      en: definition.status ?? 'published',
      fr: definition.status ?? 'published',
      de: definition.status ?? 'published',
    }
    const parent = definition.parentSlug ? idsBySlug.get(definition.parentSlug) : null
    if (definition.parentSlug && !parent) throw new Error('Missing seed parent: ' + definition.parentSlug)
    const doc: { id: number | string } = await payload.create({
      collection: 'localized-pages',
      data: {
        title: definition.title,
        slug: definition.slug,
        parent,
        _status: 'draft',
      },
      draft: true,
      locale: 'en',
      overrideAccess: true,
    } as never)

    for (const locale of ['fr', 'de'] as const) {
      await payload.update({
        collection: 'localized-pages',
        id: doc.id,
        data: { title: definition.title, _status: 'draft' },
        draft: true,
        locale,
        overrideAccess: true,
      } as never)
    }

    for (const locale of ['en', 'fr', 'de'] as const) {
      if (statuses[locale] === 'draft') continue
      await payload.update({
        collection: 'localized-pages',
        id: doc.id,
        data: { _status: 'published' },
        locale,
        publishSpecificLocale: locale,
        overrideAccess: true,
      } as never)
    }

    for (const locale of ['en', 'fr', 'de'] as const) {
      if (statuses[locale] !== 'changed') continue
      await payload.update({
        collection: 'localized-pages',
        id: doc.id,
        data: { title: definition.title, _status: 'draft' },
        draft: true,
        locale,
        overrideAccess: true,
      } as never)
    }

    idsBySlug.set(definition.slug, doc.id)
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

  // All three collections are disposable playground fixtures, including versions.
  for (const collection of ['pages', 'tabbed-pages', 'localized-pages'] as const) {
    await payload.delete({
      collection,
      overrideAccess: true,
      where: { id: { exists: true } },
    } as never)
  }

  for (const collection of ['pages', 'tabbed-pages'] as const) {
    const pagesBySlug = await seedTree({ collection, definitions: pageSeedDefinitions, payload })
    for (const locale of ['fr', 'de'] as const) {
      await publishLocalizedPageTitles({
        collection,
        definitions: pageSeedDefinitions,
        locale,
        pagesBySlug,
        payload,
      })
    }
  }
  await seedLocalizedPages(payload)
}

export const seedWithRequest = async ({
  payload,
}: {
  payload: Payload
  req?: PayloadRequest
}) => {
  await seed(payload)
}
