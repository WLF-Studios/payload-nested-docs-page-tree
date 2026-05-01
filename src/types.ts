import type { CollectionSlug } from 'payload'

import type { NestedDocsPageTreePluginDiagnosticsConfig } from './utilities/diagnostics.js'

export type {
  NestedDocsPageTreePluginDiagnosticEvent,
  NestedDocsPageTreePluginDiagnosticsConfig,
} from './utilities/diagnostics.js'

export const nestedDocsPageTreePluginBadgeStatuses = ['published', 'changed', 'draft'] as const

export type NestedDocsPageTreePluginBadgeStatus =
  (typeof nestedDocsPageTreePluginBadgeStatuses)[number]

export type NestedDocsPageTreePluginBadgeMap = Partial<
  Record<NestedDocsPageTreePluginBadgeStatus, string>
>

export type NestedDocsPageTreePluginBadgeConfig = {
  colors?: NestedDocsPageTreePluginBadgeMap
  labels?: NestedDocsPageTreePluginBadgeMap
}

export type NestedDocsPageTreePluginResolvedBadgeConfig = {
  colors: NestedDocsPageTreePluginBadgeMap
  labels: NestedDocsPageTreePluginBadgeMap
}

export type NestedDocsPageTreePluginConfig = {
  badges?: NestedDocsPageTreePluginBadgeConfig
  breadcrumbsFieldSlug?: string
  collections: CollectionSlug[]
  defaultLimit?: number
  /**
   * When set, the plugin emits structured diagnostic events for page-tree
   * triggered moves, including before/after snapshots of the published main row.
   * Disabled by default. Pass `true` to log to `console`, or pass an object
   * with a custom `logger` to route events elsewhere.
   */
  diagnostics?: NestedDocsPageTreePluginDiagnosticsConfig
  disabled?: boolean
  hideBreadcrumbs?: boolean
  parentFieldSlug?: string
}

export type NestedDocsPageTreePluginCollectionCustom = {
  badges: NestedDocsPageTreePluginResolvedBadgeConfig
  breadcrumbsFieldSlug: string
  defaultLimit: number
  hideBreadcrumbs: boolean
  parentFieldSlug: string
}

export type PageTreeSourceDoc = Record<string, unknown> & {
  _displayStatus?: null | string
  _status?: null | string
  id?: number | string
  slug?: null | string
}

export const nestedDocsPageTreePluginCustomKey = 'nestedDocsPageTreePlugin'

export const pageTreeMoveContextKey = 'pageTreeMove'

export type PageTreeMoveContext = {
  [pageTreeMoveContextKey]?: boolean
}
