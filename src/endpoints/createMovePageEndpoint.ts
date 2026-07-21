import type { Endpoint, PayloadRequest } from 'payload'

import {
  DIAGNOSTICS_FLOW_CONTEXT_KEY,
  type Diagnostics,
  createFlowID,
  readMainRowSnapshot,
} from '../utilities/diagnostics.js'
import { CANCEL_DRAG_MESSAGE } from '../utilities/moveValidation.js'
import {
  buildChildrenByParentID,
  collectDescendantIDs,
  getDocParentID,
  stringifyDocID,
} from '../utilities/pageTree.js'
import { pageTreeMoveContextKey, type PageTreeSourceDoc } from '../types.js'
import {
  assertUpdateAccess,
  collectionHasAutosaveDrafts,
  collectionHasDrafts,
  getRequestedLocale,
  normalizeID,
  respond,
  toCollectionID,
} from './shared.js'

const SNAPSHOT_FIELDS = ['_status'] as const

type MoveDocumentRequestBody = {
  parentID: null | string
}

function hasOwnProperty(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeMoveDocumentBody(value: unknown): MoveDocumentRequestBody | null {
  const incomingData =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown
          } catch {
            return null
          }
        })()
      : value

  if (!incomingData || typeof incomingData !== 'object' || Array.isArray(incomingData)) {
    return null
  }

  if (!hasOwnProperty(incomingData, 'parentID')) {
    return null
  }

  const parentID = normalizeID((incomingData as { parentID?: unknown }).parentID)

  if (
    (incomingData as { parentID?: unknown }).parentID !== null &&
    (incomingData as { parentID?: unknown }).parentID !== undefined &&
    parentID === null
  ) {
    return null
  }

  return {
    parentID,
  }
}

type RawBodyAttempt = {
  raw: unknown
  source: 'req.data' | 'req.json' | 'req.text'
}

async function readBodyFromRequest(
  req: PayloadRequest,
): Promise<{ body: MoveDocumentRequestBody | null; lastAttempt: null | RawBodyAttempt }> {
  let lastAttempt: null | RawBodyAttempt = null

  if (req.data !== undefined && req.data !== null) {
    lastAttempt = { raw: req.data, source: 'req.data' }
    const directBody = normalizeMoveDocumentBody(req.data)

    if (directBody) {
      return { body: directBody, lastAttempt }
    }
  }

  if (typeof req.json === 'function') {
    try {
      const raw = await req.json()
      lastAttempt = { raw, source: 'req.json' }
      const jsonBody = normalizeMoveDocumentBody(raw)

      if (jsonBody) {
        return { body: jsonBody, lastAttempt }
      }
    } catch {
      // Fall through to the text-based fallback when the runtime does not hydrate req.data.
    }
  }

  if (typeof req.text === 'function') {
    try {
      const raw = await req.text()
      lastAttempt = { raw, source: 'req.text' }
      const textBody = normalizeMoveDocumentBody(raw)

      if (textBody) {
        return { body: textBody, lastAttempt }
      }
    } catch {
      return { body: null, lastAttempt }
    }
  }

  return { body: null, lastAttempt }
}

export function createMovePageEndpoint(args: {
  collectionSlug: string
  diagnostics: Diagnostics
  parentFieldSlug: string
  publishOnMove?: boolean
}): Endpoint {
  const { collectionSlug, diagnostics, parentFieldSlug, publishOnMove = false } = args
  const snapshotFields = [...SNAPSHOT_FIELDS, parentFieldSlug]

  return {
    handler: async (req) => {
      const movedIDFromRoute = normalizeID(req.routeParams?.id)

      if (!movedIDFromRoute) {
        return respond(400, {
          message: 'Document ID was not specified.',
        })
      }

      const { body, lastAttempt } = await readBodyFromRequest(req)

      if (!body) {
        if (diagnostics.enabled) {
          diagnostics.log({
            collection: collectionSlug,
            data: {
              movedID: movedIDFromRoute,
              rawBody: lastAttempt?.raw ?? null,
              rawBodySource: lastAttempt?.source ?? null,
            },
            flow: createFlowID('move-endpoint'),
            level: 'warn',
            message: 'move endpoint rejected request body: parentID was missing or malformed',
            source: 'move-endpoint:body-rejected',
          })
        }

        return respond(400, {
          message: 'A valid parentID is required.',
        })
      }

      const movedID = toCollectionID({
        collectionSlug,
        id: movedIDFromRoute,
        req,
      })
      const nextParentID =
        body.parentID === null
          ? null
          : toCollectionID({
              collectionSlug,
              id: body.parentID,
              req,
            })
      const accessError = await assertUpdateAccess({
        collectionSlug,
        data: { [parentFieldSlug]: nextParentID },
        id: movedID,
        req,
      })

      if (accessError) {
        return accessError
      }

      const docsResult = await req.payload.find({
        collection: collectionSlug as never,
        depth: 0,
        draft: collectionHasDrafts({ collectionSlug, req }) ? true : undefined,
        fallbackLocale: false as never,
        limit: 0,
        locale: getRequestedLocale(req) as never,
        overrideAccess: true,
        req,
      } as never)
      const docs = docsResult.docs as unknown as PageTreeSourceDoc[]
      const docsByID = new Map(docs.map((doc) => [stringifyDocID(doc.id), doc]))
      const movedDoc = docsByID.get(movedIDFromRoute)

      if (!movedDoc) {
        return respond(404, {
          message: 'Document not found.',
        })
      }

      if (body.parentID !== null && !docsByID.has(body.parentID)) {
        return respond(400, {
          message: 'Parent document not found.',
        })
      }

      const currentParentID = getDocParentID(movedDoc, parentFieldSlug)

      if (currentParentID === body.parentID) {
        return respond(400, {
          message: 'Document already has that parent.',
        })
      }

      if (body.parentID === movedIDFromRoute) {
        return respond(400, {
          message: CANCEL_DRAG_MESSAGE,
        })
      }

      const childrenByParentID = buildChildrenByParentID({
        docs,
        parentFieldSlug,
      })
      const descendantIDs = collectDescendantIDs(movedIDFromRoute, childrenByParentID)

      if (body.parentID !== null && descendantIDs.includes(body.parentID)) {
        return respond(400, {
          message: 'A document cannot be moved under one of its descendants.',
        })
      }

      const flow = createFlowID('move-endpoint')
      const moveStart = Date.now()
      const hasDrafts = collectionHasDrafts({ collectionSlug, req })
      const hasAutosave = hasDrafts && collectionHasAutosaveDrafts({ collectionSlug, req })
      // With `publishOnMove`, publish the reparent right away instead of staging
      // it — but ONLY when the moved doc had nothing staged before the move (its
      // latest version, read above with `draft: true`, is already published). A
      // doc with pending draft edits stays staged, so those in-progress edits are
      // never published as a side effect of the move.
      const publishMove = publishOnMove && hasDrafts && movedDoc._status === 'published'
      const updateData = {
        [parentFieldSlug]:
          body.parentID === null
            ? null
            : toCollectionID({
                collectionSlug,
                id: body.parentID,
                req,
              }),
        ...(publishMove ? { _status: 'published' } : {}),
      }
      const updateArgs = {
        collection: collectionSlug as never,
        context: {
          [pageTreeMoveContextKey]: true,
        } as Record<string, unknown>,
        autosave: hasAutosave && !publishMove ? true : undefined,
        data: updateData as never,
        depth: 0,
        draft: hasDrafts && !publishMove ? true : undefined,
        id: movedID as never,
        locale: getRequestedLocale(req) as never,
        overrideAccess: true,
        req,
      }

      if (diagnostics.enabled) {
        if (!req.context) {
          req.context = {}
        }

        ;(req.context as Record<string, unknown>)[DIAGNOSTICS_FLOW_CONTEXT_KEY] = flow

        const beforeSnapshot = await readMainRowSnapshot({
          collectionSlug,
          fields: snapshotFields,
          id: movedID,
          req,
        })

        diagnostics.log({
          collection: collectionSlug,
          data: {
            autosave: updateArgs.autosave ?? null,
            currentParentID,
            draft: updateArgs.draft,
            hasTransaction: Boolean((req as { transactionID?: unknown }).transactionID),
            locale: updateArgs.locale ?? null,
            movedDocStatus: movedDoc._status ?? null,
            movedID: String(movedID),
            nextParentID: body.parentID,
            publishedMainRowBefore: beforeSnapshot,
            publishMove,
            updateData,
          },
          flow,
          level: 'info',
          message: 'move endpoint entering: parent move only',
          source: 'move-endpoint:enter',
        })
      }

      try {
        const result = (await req.payload.update(updateArgs as never)) as
          | (Record<string, unknown> & { _status?: string })
          | undefined

        if (diagnostics.enabled) {
          const afterSnapshot = await readMainRowSnapshot({
            collectionSlug,
            fields: snapshotFields,
            id: movedID,
            req,
          })

          diagnostics.log({
            collection: collectionSlug,
            data: {
              durMs: Date.now() - moveStart,
              movedID: String(movedID),
              publishedMainRowAfter: afterSnapshot,
              resultStatus: result?._status ?? null,
            },
            flow,
            level: 'info',
            message: 'move endpoint payload.update succeeded',
            source: 'move-endpoint:ok',
          })
        }
      } catch (err) {
        const error = err as { data?: unknown; message?: string; name?: string } & Error

        diagnostics.log({
          collection: collectionSlug,
          data: {
            data: error?.data ?? null,
            durMs: Date.now() - moveStart,
            message: error?.message,
            movedID: String(movedID),
            name: error?.name,
          },
          flow,
          level: 'error',
          message: `move endpoint payload.update failed: ${error?.message ?? 'unknown error'}`,
          source: 'move-endpoint:error',
        })

        throw err
      }

      return respond(200, {
        movedID: movedIDFromRoute,
        ok: true,
        parentID: body.parentID,
      })
    },
    method: 'post',
    path: '/:id/move',
  }
}
