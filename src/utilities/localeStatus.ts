import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import type { PageTreeSourceDoc } from '../types.js'

import { getPageTreeDisplayStatus } from './status.js'

function readLocaleStatus(value: unknown, locale: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const status = (value as Record<string, unknown>)[locale]
  return typeof status === 'string' ? status : undefined
}

export async function withPageTreeLocaleStatuses({
  collectionSlug,
  docs,
  locales,
  payload,
  req,
}: {
  collectionSlug: CollectionSlug
  docs: PageTreeSourceDoc[]
  locales: string[]
  payload: Payload
  req: PayloadRequest
}): Promise<PageTreeSourceDoc[]> {
  const ids = docs
    .map(({ id }) => id)
    .filter((id): id is number | string => typeof id === 'number' || typeof id === 'string')

  if (!ids.length || !locales.length) {
    return docs
  }

  const [draftResult, currentResult] = await Promise.all(
    [true, false].map((draft) =>
      payload.find({
        collection: collectionSlug,
        depth: 0,
        draft,
        fallbackLocale: false,
        locale: 'all',
        overrideAccess: false,
        pagination: false,
        // Payload mutates the request locale for Local API calls.
        req: { ...req, query: { ...req.query } },
        select: { id: true, _status: true },
        where: { id: { in: ids } },
      }),
    ),
  )
  const draftByID = new Map(draftResult.docs.map((doc) => [String(doc.id), doc._status]))
  const currentByID = new Map(currentResult.docs.map((doc) => [String(doc.id), doc._status]))

  return docs.map((doc) => ({
    ...doc,
    __pageTreeLocaleStatuses: locales.map((locale) => {
      const draft = readLocaleStatus(draftByID.get(String(doc.id)), locale)
      const current = readLocaleStatus(currentByID.get(String(doc.id)), locale)
      return {
        locale,
        status: getPageTreeDisplayStatus({
          _displayStatus: draft === 'draft' && current === 'published' ? 'changed' : undefined,
          _status: draft,
        }),
      }
    }),
  }))
}
