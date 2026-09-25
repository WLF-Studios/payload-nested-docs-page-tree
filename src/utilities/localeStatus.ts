import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import type {
  PageTreeLocaleBadgeStatus,
  PageTreeLocaleBadgeVisibility,
  PageTreeSourceDoc,
} from '../types.js'

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
  fastMode,
  localeBadgeStatus,
  localeBadgeVisibility,
  locales,
  payload,
  req,
}: {
  collectionSlug: CollectionSlug
  docs: PageTreeSourceDoc[]
  fastMode?: boolean
  localeBadgeStatus?: PageTreeLocaleBadgeStatus
  localeBadgeVisibility?: PageTreeLocaleBadgeVisibility
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
        select: fastMode ? { id: true, _status: true } : undefined,
        where: { id: { in: ids } },
      }),
    ),
  )
  const draftByID = new Map(draftResult.docs.map((doc) => [String(doc.id), doc]))
  const currentByID = new Map(currentResult.docs.map((doc) => [String(doc.id), doc]))

  return docs.map((doc) => ({
    ...doc,
    __pageTreeLocaleStatuses: locales.map((locale) => {
      const draftDoc = draftByID.get(String(doc.id))
      const draft = readLocaleStatus(draftDoc?._status, locale)
      const publishedDoc = currentByID.get(String(doc.id))
      const current = readLocaleStatus(publishedDoc?._status, locale)
      const status = getPageTreeDisplayStatus({
        _displayStatus: draft === 'draft' && current === 'published' ? 'changed' : undefined,
        _status: draft,
      })
      const displayStatus =
        localeBadgeStatus && draftDoc
          ? localeBadgeStatus({ doc: draftDoc, locale, publishedDoc, req, status })
          : status
      return {
        locale,
        ...(localeBadgeVisibility
          ? {
              visible: Boolean(
                draftDoc && localeBadgeVisibility({ doc: draftDoc, locale, publishedDoc, req }),
              ),
            }
          : {}),
        status: typeof displayStatus === 'string' ? displayStatus : displayStatus.status,
        ...(typeof displayStatus === 'object' && displayStatus.label
          ? { label: displayStatus.label }
          : {}),
      }
    }),
  }))
}
