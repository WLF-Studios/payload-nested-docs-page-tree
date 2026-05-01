import type {
  CollectionAfterChangeHook,
  CollectionConfig,
  Config,
} from 'payload'

import { createMovePageEndpoint } from './endpoints/createMovePageEndpoint.js'
import type {
  NestedDocsPageTreePluginCollectionCustom,
  NestedDocsPageTreePluginConfig,
} from './types.js'
import { nestedDocsPageTreePluginCustomKey, pageTreeMoveContextKey } from './types.js'
import { normalizeNestedDocsPageTreePluginBadgeConfig } from './utilities/badgeConfig.js'
import {
  DIAGNOSTICS_FLOW_CONTEXT_KEY,
  type Diagnostics,
  createFlowID,
  projectField,
  resolveDiagnostics,
} from './utilities/diagnostics.js'

const DEFAULT_BREADCRUMBS_FIELD_SLUG = 'breadcrumbs'
const DEFAULT_LIMIT = 100
const DEFAULT_PARENT_FIELD_SLUG = 'parent'
const PAGE_TREE_LIST_VIEW_PATH =
  'payload-nested-docs-page-tree/rsc#NestedDocsPageTreeListView'
type CollectionEndpoint = NonNullable<Exclude<CollectionConfig['endpoints'], false>>[number]

/**
 * When diagnostics are enabled this hook emits a structured event for each
 * page-tree-tagged create/update, including a small before/after diff of the
 * fields most relevant to tree publish/draft regressions.
 */
function createDiagnosticsAfterChangeHook(args: {
  collectionSlug: string
  diagnostics: Diagnostics
  orderableFieldName: null | string
  parentFieldSlug: string
}): CollectionAfterChangeHook {
  const { collectionSlug, diagnostics, orderableFieldName, parentFieldSlug } = args
  const snapshotFields: string[] = ['_status', parentFieldSlug]

  if (orderableFieldName) {
    snapshotFields.push(orderableFieldName)
  }

  return async ({ doc, operation, previousDoc, req }) => {
    if (!diagnostics.enabled) {
      return doc
    }

    if (operation !== 'update' && operation !== 'create') {
      return doc
    }

    if (!req.context?.[pageTreeMoveContextKey]) {
      return doc
    }

    const docID = (doc as Record<string, unknown>)?.id

    if (typeof docID !== 'string' && typeof docID !== 'number') {
      return doc
    }

    const flow =
      (req.context?.[DIAGNOSTICS_FLOW_CONTEXT_KEY] as string | undefined) ??
      createFlowID('page-tree-change')
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    const changed: string[] = []

    for (const field of snapshotFields) {
      const beforeValue = projectField((previousDoc as Record<string, unknown> | undefined)?.[field])
      const afterValue = projectField((doc as Record<string, unknown>)?.[field])

      before[field] = beforeValue
      after[field] = afterValue

      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changed.push(field)
      }
    }

    diagnostics.log({
      collection: collectionSlug,
      data: {
        after,
        before,
        changed,
        docID: String(docID),
        operation,
      },
      flow,
      level: 'info',
      message: `${operation} on ${collectionSlug}#${String(docID)}`,
      source: 'page-tree-change:after',
    })

    const beforeStatus = (previousDoc as Record<string, unknown> | undefined)?._status
    const afterStatus = (doc as Record<string, unknown>)?._status

    if (beforeStatus === 'published' && afterStatus !== 'published') {
      diagnostics.log({
        collection: collectionSlug,
        data: {
          afterStatus,
          beforeStatus,
          docID: String(docID),
        },
        flow,
        level: 'warn',
        message: `Published doc was demoted to "${String(afterStatus ?? 'missing')}" by a page-tree operation. Inspect the move-endpoint:enter/ok snapshots in flow ${flow} to confirm whether the main row was touched.`,
        source: 'page-tree-change:status-flip',
      })
    }

    return doc
  }
}

function getTopLevelField(
  collection: Pick<CollectionConfig, 'fields'>,
  fieldName: string,
) {
  return collection.fields.find((field) => 'name' in field && field.name === fieldName)
}

function getCollectionEndpoints(collection: CollectionConfig): CollectionEndpoint[] {
  return Array.isArray(collection.endpoints) ? [...collection.endpoints] : []
}

function patchBreadcrumbField<TField extends CollectionConfig['fields'][number]>(args: {
  breadcrumbsFieldSlug: string
  field: TField
  hideBreadcrumbs: boolean
}): TField {
  const { breadcrumbsFieldSlug, field, hideBreadcrumbs } = args

  if (!('name' in field) || field.name !== breadcrumbsFieldSlug) {
    return field
  }

  return {
    ...field,
    admin: {
      ...(field.admin ?? {}),
      hidden: hideBreadcrumbs,
    },
  } as TField
}

function validateTargetCollection(args: {
  breadcrumbsFieldSlug: string
  collection: CollectionConfig
  parentFieldSlug: string
}) {
  const { breadcrumbsFieldSlug, collection, parentFieldSlug } = args

  if (typeof collection.admin?.useAsTitle !== 'string' || collection.admin.useAsTitle.includes('.')) {
    throw new Error(
      `payload-nested-docs-page-tree requires "${collection.slug}" to define a top-level admin.useAsTitle field.`,
    )
  }

  if (!getTopLevelField(collection, collection.admin.useAsTitle)) {
    throw new Error(
      `payload-nested-docs-page-tree could not find the useAsTitle field "${collection.admin.useAsTitle}" on "${collection.slug}".`,
    )
  }

  if (!getTopLevelField(collection, parentFieldSlug)) {
    throw new Error(
      `payload-nested-docs-page-tree requires "${collection.slug}" to already define the nested docs parent field "${parentFieldSlug}". Register @payloadcms/plugin-nested-docs before payload-nested-docs-page-tree.`,
    )
  }

  if (!getTopLevelField(collection, breadcrumbsFieldSlug)) {
    throw new Error(
      `payload-nested-docs-page-tree requires "${collection.slug}" to already define the nested docs breadcrumbs field "${breadcrumbsFieldSlug}". Register @payloadcms/plugin-nested-docs before payload-nested-docs-page-tree.`,
    )
  }

  const existingListView = collection.admin?.components?.views?.list?.Component

  if (existingListView && existingListView !== PAGE_TREE_LIST_VIEW_PATH) {
    throw new Error(
      `payload-nested-docs-page-tree cannot own the "${collection.slug}" list view because the collection already defines a custom admin.components.views.list.Component.`,
    )
  }

  const existingMoveEndpoint = getCollectionEndpoints(collection).find(
    (endpoint) => endpoint.path === '/:id/move',
  )

  if (existingMoveEndpoint) {
    throw new Error(
      `payload-nested-docs-page-tree cannot add the move endpoint to "${collection.slug}" because the collection already defines POST /:id/move.`,
    )
  }
}

function buildCollectionCustom(args: {
  badges: NestedDocsPageTreePluginCollectionCustom['badges']
  breadcrumbsFieldSlug: string
  defaultLimit: number
  hideBreadcrumbs: boolean
  parentFieldSlug: string
}): NestedDocsPageTreePluginCollectionCustom {
  const { badges, breadcrumbsFieldSlug, defaultLimit, hideBreadcrumbs, parentFieldSlug } = args

  return {
    badges,
    breadcrumbsFieldSlug,
    defaultLimit,
    hideBreadcrumbs,
    parentFieldSlug,
  }
}

export type {
  NestedDocsPageTreePluginBadgeConfig,
  NestedDocsPageTreePluginBadgeMap,
  NestedDocsPageTreePluginBadgeStatus,
  NestedDocsPageTreePluginConfig,
  PageTreeMoveContext,
} from './types.js'

export { pageTreeMoveContextKey } from './types.js'

export const nestedDocsPageTreePlugin =
  (pluginOptions: NestedDocsPageTreePluginConfig) =>
  (config: Config): Config => {
    if (!pluginOptions.collections?.length) {
      throw new Error('payload-nested-docs-page-tree requires at least one collection slug.')
    }

    if (pluginOptions.disabled) {
      return config
    }

    const breadcrumbsFieldSlug =
      pluginOptions.breadcrumbsFieldSlug ?? DEFAULT_BREADCRUMBS_FIELD_SLUG
    const defaultLimit = pluginOptions.defaultLimit ?? DEFAULT_LIMIT
    const hideBreadcrumbs = pluginOptions.hideBreadcrumbs ?? true
    const parentFieldSlug = pluginOptions.parentFieldSlug ?? DEFAULT_PARENT_FIELD_SLUG
    const badges = normalizeNestedDocsPageTreePluginBadgeConfig(pluginOptions.badges)
    const diagnostics = resolveDiagnostics(pluginOptions.diagnostics)
    const targetedCollectionSlugs = new Set<string>(pluginOptions.collections)

    if (!config.collections?.length) {
      throw new Error('payload-nested-docs-page-tree could not find any collections to patch.')
    }

    const foundCollectionSlugs = new Set<string>()
    const nextCollections = config.collections.map((collection) => {
      if (!targetedCollectionSlugs.has(collection.slug)) {
        return collection
      }

      foundCollectionSlugs.add(collection.slug)
      validateTargetCollection({
        breadcrumbsFieldSlug,
        collection,
        parentFieldSlug,
      })
      const orderableFieldName =
        typeof collection.orderable === 'string'
          ? collection.orderable
          : collection.orderable
            ? '_order'
            : null
      const diagnosticsAfterChangeHook = diagnostics.enabled
        ? createDiagnosticsAfterChangeHook({
            collectionSlug: collection.slug,
            diagnostics,
            orderableFieldName,
            parentFieldSlug,
          })
        : null

      return {
        ...collection,
        admin: {
          ...(collection.admin ?? {}),
          components: {
            ...(collection.admin?.components ?? {}),
            views: {
              ...(collection.admin?.components?.views ?? {}),
              list: {
                ...(collection.admin?.components?.views?.list ?? {}),
                Component: PAGE_TREE_LIST_VIEW_PATH,
              },
            },
          },
          pagination: {
            ...(collection.admin?.pagination ?? {}),
            defaultLimit:
              collection.admin?.pagination?.defaultLimit === undefined
                ? defaultLimit
                : collection.admin.pagination.defaultLimit,
          },
        },
        custom: {
          ...(collection.custom ?? {}),
          [nestedDocsPageTreePluginCustomKey]: buildCollectionCustom({
            badges,
            breadcrumbsFieldSlug,
            defaultLimit,
            hideBreadcrumbs,
            parentFieldSlug,
          }),
        },
        endpoints: [
          ...getCollectionEndpoints(collection),
          createMovePageEndpoint({
            collectionSlug: collection.slug,
            diagnostics,
            parentFieldSlug,
          }),
        ],
        fields: collection.fields.map((field) =>
          patchBreadcrumbField({
            breadcrumbsFieldSlug,
            field,
            hideBreadcrumbs,
          }),
        ),
        hooks: {
          ...(collection.hooks ?? {}),
          ...(diagnosticsAfterChangeHook
            ? {
                afterChange: [
                  ...(collection.hooks?.afterChange ?? []),
                  diagnosticsAfterChangeHook,
                ],
              }
            : {}),
        },
      }
    })

    const missingCollections = pluginOptions.collections.filter(
      (collectionSlug) => !foundCollectionSlugs.has(collectionSlug),
    )

    if (missingCollections.length > 0) {
      throw new Error(
        `payload-nested-docs-page-tree could not find the following collections: ${missingCollections.join(', ')}`,
      )
    }

    return {
      ...config,
      collections: nextCollections as CollectionConfig[],
    }
  }
