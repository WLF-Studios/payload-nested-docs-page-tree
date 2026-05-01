import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

import { pageTreeMoveContextKey } from '../../src/index.js'

const deployHookContextKey = '__cloudflareDeployHookTriggered'

function markDeployHookTriggered(req: PayloadRequest, source: string): boolean {
  if (!req.context) {
    req.context = {}
  }

  const context = req.context as Record<string, unknown>
  const triggered = (context[deployHookContextKey] ?? {}) as Record<string, true>

  if (triggered[source]) {
    return false
  }

  context[deployHookContextKey] = {
    ...triggered,
    [source]: true,
  }

  return true
}

const postDeployHook = async (source: string, req: PayloadRequest): Promise<void> => {
  const url = process.env.CLOUDFLARE_DEPLOY_HOOK_URL

  if (!url) {
    return
  }

  try {
    await fetch(url, {
      body: JSON.stringify({ source }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  } catch (error) {
    req.payload.logger.error(error)
  }
}

export const revalidatePublishedChange =
  (source: string): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, req }) => {
    if (req.context?.[pageTreeMoveContextKey]) return
    if (req.url?.includes('autosave=true')) return

    if (doc._status === 'published' || previousDoc?._status === 'published') {
      if (!markDeployHookTriggered(req, source)) return

      await postDeployHook(source, req)
    }
  }

export const revalidateOnDelete =
  (source: string): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    if (doc?._status !== 'published') return
    if (!markDeployHookTriggered(req, source)) return

    await postDeployHook(source, req)
  }
