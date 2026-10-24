import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'

import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { APIError, ValidationError } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { nestedDocsPageTreePlugin } from '../index.js'
import { withChildValidationErrors } from './childValidationErrors.js'

const genericMessage = 'Could not publish or save changes: One or more children are invalid.'

const configBase = {
  db: mongooseAdapter({ url: 'mongodb://127.0.0.1/page-tree-plugin-tests' }),
  secret: 'page-tree-plugin-test-secret',
}

async function setup() {
  const config = nestedDocsPageTreePlugin({ collections: ['pages'] })(
    await nestedDocsPlugin({ collections: ['pages'] })({
      ...configBase,
      collections: [
        {
          slug: 'pages',
          admin: { useAsTitle: 'name' },
          fields: [{ name: 'name', type: 'text' }],
          versions: { drafts: true },
        },
      ],
    }),
  )
  const collection = config.collections![0]
  const parent = { id: 39, name: 'Plan Your Visit', _status: 'published' }
  const child = { id: 94, name: 'Accessibility', _status: 'published', parent: 39 }
  const validation = new ValidationError({
    id: 94,
    collection: 'pages',
    errors: [
      {
        label: 'Layout > Block 4 > YouTube URL',
        message: 'Add a video or use an Image block.',
        path: 'layout.3.youtubeUrl',
      },
      { message: 'Use an Internal Link.', path: 'layout.7.items.12.content' },
    ],
  })
  const update = vi.fn().mockRejectedValue(validation)
  const req = {
    context: {},
    locale: 'base',
    payload: {
      find: vi.fn().mockResolvedValue({ docs: [child] }),
      findByID: vi.fn().mockResolvedValue(parent),
      logger: { error: vi.fn() },
      update,
    },
  } as unknown as PayloadRequest
  const hook = collection.hooks!.afterChange![0]
  const run = (doc = parent, request = req) =>
    hook({
      collection,
      context: request.context,
      doc,
      operation: 'update',
      previousDoc: doc,
      req: request,
    } as Parameters<CollectionAfterChangeHook>[0])
  return { child, hook, parent, req, run, update, validation }
}

describe('nested child validation errors', () => {
  it('shows the child title, ID, locale and each invalid field through the real nested-docs hook', async () => {
    const { req, run, update } = await setup()
    const error = (await run().catch((error: unknown) => error)) as APIError
    expect(error).toBeInstanceOf(APIError)
    expect(error.status).toBe(400)
    expect(error.message).toContain('Accessibility')
    expect(error.message).toContain('94')
    expect(error.message).toContain('base')
    expect(error.message).toContain(
      'Layout > Block 4 > YouTube URL: Add a video or use an Image block.',
    )
    expect(error.message).toContain('layout.7.items.12.content: Use an Internal Link.')
    expect(error.data?.errors).toBeUndefined()
    expect(req.payload.update).toBe(update)
  })

  it('preserves the deepest invalid descendant through multiple resave levels', async () => {
    const { child, req, run, update, validation } = await setup()
    const grandchild = { id: 95, name: 'Drone Policy', _status: 'published', parent: 94 }
    vi.mocked(req.payload.find).mockImplementation((args) =>
      Promise.resolve({
        docs: [(args.where?.parent as { equals: number }).equals === 39 ? child : grandchild],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 1,
        page: 1,
        pagingCounter: 1,
        totalDocs: 1,
        totalPages: 1,
      }),
    )
    update.mockImplementation(async (args: { id: number; req: PayloadRequest }) => {
      if (args.id === 95) {
        throw validation
      }
      await run(child, args.req)
      return child
    })
    const error = (await run().catch((error: unknown) => error)) as APIError
    expect(error.message).toContain('Drone Policy')
    expect(error.message).toContain('95')
    expect(error.message).not.toContain('"Accessibility"')
    expect(error.message).not.toBe(genericMessage)
  })

  it('keeps descendant field paths out of the parent form when a custom hook updates another page', async () => {
    const { parent, req, run, update, validation } = await setup()
    update.mockImplementation(async (options: { id: number; req: PayloadRequest }) => {
      if (options.id === 94) {
        throw validation
      }
      await run(parent, options.req)
      return parent
    })
    const hook = withChildValidationErrors(
      async ({ req }) =>
        req.payload.update({ id: 39, collection: 'pages', data: { name: 'Plan Your Visit' }, req }),
      'pages',
      'name',
    )
    const error = (await hook({
      doc: { id: 1 },
      req,
    } as Parameters<CollectionAfterChangeHook>[0]).catch((error: unknown) => error)) as APIError
    expect(error.message).toContain('Accessibility')
    expect(error.data?.errors).toBeUndefined()
  })

  it('does not alter successful saves or the original request', async () => {
    const { child, req, run, update } = await setup()
    update.mockImplementation((args: { id: number; req: PayloadRequest }) => {
      args.req.transactionID = 'shared-transaction'
      return Promise.resolve(child)
    })
    await expect(run()).resolves.toBeUndefined()
    expect(req.transactionID).toBe('shared-transaction')
    expect(req.payload.update).toBe(update)
  })

  it('keeps the generic error when no child validation detail was captured', async () => {
    const { hook } = await setup()
    // A direct upstream error has no recoverable field detail.
    expect(hook).toBeTypeOf('function')
    const original = new APIError(genericMessage, 400)
    const config = nestedDocsPageTreePlugin({ collections: ['pages'] })({
      ...configBase,
      collections: [
        {
          slug: 'pages',
          admin: { useAsTitle: 'title' },
          fields: [
            { name: 'title', type: 'text' },
            { name: 'parent', type: 'relationship', relationTo: 'pages' },
            { name: 'breadcrumbs', type: 'array', fields: [] },
          ],
          hooks: {
            afterChange: [
              () => {
                throw original
              },
            ],
          },
        },
      ],
    })
    await expect(
      config.collections![0].hooks!.afterChange![0]({
        doc: { id: 1 },
        req: { payload: {} },
      } as Parameters<CollectionAfterChangeHook>[0]),
    ).rejects.toBe(original)
  })
})
