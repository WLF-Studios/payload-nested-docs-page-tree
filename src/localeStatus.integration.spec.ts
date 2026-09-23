import type { Payload } from 'payload'

import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { buildConfig, createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withPageTreeLocaleStatuses } from './utilities/localeStatus.js'

let memoryDB: MongoMemoryReplSet | undefined
let payload: Payload

describe('localized publication status integration', () => {
  beforeAll(async () => {
    memoryDB = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    const config = await buildConfig({
      collections: [
        {
          slug: 'pages',
          access: { read: () => true },
          fields: [{ name: 'title', type: 'text', localized: true }],
          versions: { drafts: { localizeStatus: true } },
        },
      ],
      db: mongooseAdapter({ url: memoryDB.getUri() }),
      experimental: { localizeStatus: true },
      localization: { defaultLocale: 'en', fallback: false, locales: ['en', 'fr', 'lt', 'pl'] },
      secret: 'locale-status-test',
    })
    payload = await getPayload({ config })
    await Promise.all(
      [...Object.values(payload.db.collections), ...Object.values(payload.db.versions)].map(
        (model) => model.init(),
      ),
    )
  }, 120_000)

  afterAll(async () => {
    await payload?.destroy()
    await memoryDB?.stop()
  })

  it('keeps English published when French has draft changes, then updates only French on publish', async () => {
    const doc = await payload.create({
      collection: 'pages',
      data: { title: 'English', _status: 'draft' },
      draft: true,
      locale: 'en',
    })
    for (const locale of ['en', 'fr']) {
      await payload.update({
        collection: 'pages',
        id: doc.id,
        data: { title: locale === 'en' ? 'English' : 'French', _status: 'published' },
        locale,
        publishSpecificLocale: locale,
      })
    }
    await payload.update({
      collection: 'pages',
      id: doc.id,
      data: { title: 'French draft' },
      draft: true,
      locale: 'fr',
    })

    const req = await createLocalReq({ locale: 'fr', fallbackLocale: false }, payload)
    const readStatuses = () =>
      withPageTreeLocaleStatuses({
        collectionSlug: 'pages',
        docs: [{ id: doc.id, title: 'French draft' }],
        locales: ['en', 'fr', 'lt', 'pl'],
        payload,
        req,
      })
    const [row] = await readStatuses()
    expect(row.__pageTreeLocaleStatuses?.slice(0, 2)).toEqual([
      { locale: 'en', status: 'published' },
      { locale: 'fr', status: 'changed' },
    ])
    expect(req.locale).toBe('fr')
    expect(req.fallbackLocale).toBe(false)

    await payload.update({
      collection: 'pages',
      id: doc.id,
      data: { _status: 'published' },
      locale: 'fr',
      publishSpecificLocale: 'fr',
    })
    const [published] = await readStatuses()
    expect(published.__pageTreeLocaleStatuses?.slice(0, 2)).toEqual([
      { locale: 'en', status: 'published' },
      { locale: 'fr', status: 'published' },
    ])

    await payload.update({
      collection: 'pages',
      id: doc.id,
      data: { _status: 'draft' },
      locale: 'fr',
    })
    const [unpublished] = await readStatuses()
    expect(unpublished.__pageTreeLocaleStatuses?.slice(0, 2)).toEqual([
      { locale: 'en', status: 'published' },
      { locale: 'fr', status: 'draft' },
    ])
  })
})
