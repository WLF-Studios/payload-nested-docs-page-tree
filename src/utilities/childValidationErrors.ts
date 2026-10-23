import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

import { APIError, ValidationError } from 'payload'

const nestedDocsError = 'Could not publish or save changes: One or more children are invalid.'
const scopedRequests = new WeakSet<PayloadRequest>()
const childErrors = new WeakMap<ValidationError, string>()

/**
 * Nested Docs catches child validation failures and replaces their details with
 * a generic APIError. Observe only this hook's Local API calls, leaving the
 * shared Payload instance and the original transaction-bearing request intact.
 */
export function withChildValidationErrors(
  hook: CollectionAfterChangeHook,
  collectionSlug: string,
  titleField: string,
): CollectionAfterChangeHook {
  return async (args) => {
    let childError: undefined | ValidationError
    const nested = scopedRequests.has(args.req)
    const update = (async (options: Parameters<Payload['update']>[0]) => {
      try {
        return await args.req.payload.update(options)
      } catch (error) {
        if (
          error instanceof ValidationError &&
          error.data.errors.length &&
          options.collection === collectionSlug &&
          options.id != null &&
          String(options.id) !== String(args.doc.id)
        ) {
          childError = error
          if (!childErrors.has(error)) {
            // Older Nested Docs versions pass populateBreadcrumbs' promise.
            const data = await Promise.resolve(options.data)
            const title = data?.[titleField]
            const name = typeof title === 'string' && title.trim() ? ` "${title}"` : ''
            const locale = options.locale ?? args.req.locale
            const fields = error.data.errors
              .map(
                (field) =>
                  `${typeof field.label === 'string' ? field.label : field.path}: ${field.message}`,
              )
              .join('\n')
            childErrors.set(
              error,
              `Could not publish or save changes: child page${name} (ID: ${String(options.id)}${locale ? `, locale: ${locale}` : ''}) is invalid.\n${fields}`,
            )
          }
        }
        throw error
      }
    }) as Payload['update']
    const payload = new Proxy(args.req.payload, {
      get(target, property, receiver) {
        return property === 'update' ? update : Reflect.get(target, property, receiver)
      },
    })
    const req = new Proxy(args.req, {
      get(target, property, receiver) {
        return property === 'payload' ? payload : Reflect.get(target, property, receiver)
      },
    })
    scopedRequests.add(req)
    try {
      return await hook({ ...args, req })
    } catch (error) {
      if (!nested && error instanceof ValidationError) {
        const message = childErrors.get(error)
        if (message) {
          throw new APIError(message, 400)
        }
      }
      if (childError && error instanceof Error && error.message === nestedDocsError) {
        // Ancestor Nested Docs hooks only propagate ValidationErrors. Convert
        // at the outermost hook so child paths never mark the parent's fields.
        if (nested) {
          throw childError
        }
        throw new APIError(childErrors.get(childError)!, 400)
      }
      throw error
    } finally {
      scopedRequests.delete(req)
    }
  }
}
