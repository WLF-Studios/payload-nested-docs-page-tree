import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { NestedDocsPageTreePluginDiagnosticEvent } from '../types.js'

import { resolveDiagnostics } from '../utilities/diagnostics.js'
import { pageTreeMoveContextKey, pageTreeWriteContextKey } from '../types.js'
import { createMovePageEndpoint } from './createMovePageEndpoint.js'

type CollectionConfig = {
  access?: { update?: unknown }
  versions?: { drafts?: boolean | { autosave?: unknown } }
}

function makeReq(args?: {
  body?: Record<string, unknown>
  collectionConfig?: CollectionConfig
  defaultIDType?: 'number' | 'text'
  movedDocStatus?: 'draft' | 'published'
  updateShouldThrow?: boolean
}): { calls: Record<string, unknown>[]; req: PayloadRequest } {
  const calls: Record<string, unknown>[] = []
  const body = args?.body ?? { parentID: 'parent-id' }
  const movedDocStatus = args?.movedDocStatus ?? 'published'
  const collection = {
    config: args?.collectionConfig ?? { versions: undefined },
    customIDType: undefined,
  }
  const fakeRequest = new Request('http://localhost:3000/api/pages/abc/move', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const req = {
    context: {} as Record<string, unknown>,
    data: body,
    headers: fakeRequest.headers,
    i18n: { t: (key: string) => key } as PayloadRequest['i18n'],
    json: () => fakeRequest.clone().json(),
    payload: {
      collections: { pages: collection },
      db: { defaultIDType: args?.defaultIDType ?? 'text' },
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      find: vi.fn(async () => ({
        docs: [
          { _status: movedDocStatus, id: 'abc', parent: null },
          { _status: 'published', id: 'parent-id', parent: null },
        ],
      })),
      findByID: vi.fn(async () => ({ _status: 'published', id: 'abc', parent: null })),
      update: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input)

        if (args?.updateShouldThrow) {
          throw new Error('update failed')
        }

        return { _status: 'draft', id: 'abc' }
      }),
    },
    routeParams: { id: 'abc' },
    text: () => fakeRequest.clone().text(),
    user: { id: 'tester' },
  } as unknown as PayloadRequest

  return { calls, req }
}

describe('createMovePageEndpoint diagnostics', () => {
  it('keeps diagnostics disabled without extra snapshot reads', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
    })
    const { calls, req } = makeReq()

    const response = await endpoint.handler(req)

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].context).toMatchObject({ [pageTreeMoveContextKey]: true })
    expect(req.payload.findByID).not.toHaveBeenCalled()
  })

  it('omits draft and autosave for collections without drafts', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: undefined },
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBeUndefined()
    expect(calls[0].autosave).toBeUndefined()
  })

  it('sets draft but not autosave for collections with drafts only', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: { drafts: true } },
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBe(true)
    expect(calls[0].autosave).toBeUndefined()
  })

  it('sets draft and autosave for collections with autosave drafts', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: { drafts: { autosave: { interval: 100 } } } },
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBe(true)
    expect(calls[0].autosave).toBe(true)
  })

  it('emits enter and ok events with one shared flow when enabled', async () => {
    const events: NestedDocsPageTreePluginDiagnosticEvent[] = []
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics({
        enabled: true,
        logger: (event) => events.push(event),
      }),
      parentFieldSlug: 'parent',
    })
    const { req } = makeReq({
      collectionConfig: { versions: { drafts: true } },
    })

    const response = await endpoint.handler(req)

    expect(response.status).toBe(200)

    const enterEvent = events.find((event) => event.source === 'move-endpoint:enter')
    const okEvent = events.find((event) => event.source === 'move-endpoint:ok')

    expect(enterEvent).toBeDefined()
    expect(okEvent).toBeDefined()
    expect(enterEvent?.flow).toBe(okEvent?.flow)
    expect(enterEvent?.flow.startsWith('move-endpoint-')).toBe(true)
    expect(enterEvent?.data.publishedMainRowBefore).toMatchObject({
      id: 'abc',
      parent: null,
      _status: 'published',
    })
    expect(okEvent?.data.publishedMainRowAfter).toMatchObject({
      id: 'abc',
      parent: null,
      _status: 'published',
    })
    expect(req.payload.findByID).toHaveBeenCalledTimes(2)
  })

  it('emits a body-rejected event on malformed request bodies', async () => {
    const events: NestedDocsPageTreePluginDiagnosticEvent[] = []
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics({
        enabled: true,
        logger: (event) => events.push(event),
      }),
      parentFieldSlug: 'parent',
    })
    const { req } = makeReq({
      body: { wrong: 'shape' },
    })

    const response = await endpoint.handler(req)

    expect(response.status).toBe(400)

    const rejectEvent = events.find((event) => event.source === 'move-endpoint:body-rejected')

    expect(rejectEvent).toBeDefined()
    expect(rejectEvent?.level).toBe('warn')
    expect(
      rejectEvent?.data.rawBody === '{"wrong":"shape"}'
        ? JSON.parse(rejectEvent.data.rawBody)
        : rejectEvent?.data.rawBody,
    ).toEqual({ wrong: 'shape' })
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('emits an error event before rethrowing update failures', async () => {
    const events: NestedDocsPageTreePluginDiagnosticEvent[] = []
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics({
        enabled: true,
        logger: (event) => events.push(event),
      }),
      parentFieldSlug: 'parent',
    })
    const { req } = makeReq({ updateShouldThrow: true })

    await expect(endpoint.handler(req)).rejects.toThrow('update failed')

    const errorEvent = events.find((event) => event.source === 'move-endpoint:error')

    expect(errorEvent).toBeDefined()
    expect(errorEvent?.level).toBe('error')
    expect(errorEvent?.data.message).toBe('update failed')
  })
})

describe('createMovePageEndpoint publishOnMove', () => {
  const dataOf = (call: Record<string, unknown>): Record<string, unknown> =>
    call.data as Record<string, unknown>
  const contextOf = (call: Record<string, unknown>): Record<string, unknown> =>
    call.context as Record<string, unknown>

  it('stages the move as a draft by default (publishOnMove off)', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: { drafts: true } },
      movedDocStatus: 'published',
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBe(true)
    expect(dataOf(calls[0])._status).toBeUndefined()
    expect(contextOf(calls[0])[pageTreeMoveContextKey]).toBe(true)
    expect(contextOf(calls[0])[pageTreeWriteContextKey]).toBe(true)
  })

  it('publishes the move when publishOnMove is on and the doc was cleanly published', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
      publishOnMove: true,
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: { drafts: { autosave: { interval: 100 } } } },
      movedDocStatus: 'published',
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBeUndefined()
    expect(calls[0].autosave).toBeUndefined()
    expect(dataOf(calls[0])._status).toBe('published')
    // The live site changed, so the deploy opt-out flag is withheld and a
    // consumer rebuild hook fires. Diagnostics still sees the write flag.
    expect(contextOf(calls[0])[pageTreeMoveContextKey]).toBeUndefined()
    expect(contextOf(calls[0])[pageTreeWriteContextKey]).toBe(true)
  })

  it('keeps the move staged when publishOnMove is on but the doc has pending draft changes', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
      publishOnMove: true,
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: { drafts: { autosave: { interval: 100 } } } },
      movedDocStatus: 'draft',
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBe(true)
    expect(calls[0].autosave).toBe(true)
    expect(dataOf(calls[0])._status).toBeUndefined()
  })

  it('ignores publishOnMove for collections without drafts', async () => {
    const endpoint = createMovePageEndpoint({
      collectionSlug: 'pages',
      diagnostics: resolveDiagnostics(false),
      parentFieldSlug: 'parent',
      publishOnMove: true,
    })
    const { calls, req } = makeReq({
      collectionConfig: { versions: undefined },
      movedDocStatus: 'published',
    })

    await endpoint.handler(req)

    expect(calls[0].draft).toBeUndefined()
    expect(calls[0].autosave).toBeUndefined()
    expect(dataOf(calls[0])._status).toBeUndefined()
  })
})
