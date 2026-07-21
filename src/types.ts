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

export type NestedDocsPageTreePluginHomeIndicatorConfig =
  | false
  | {
      collections?: CollectionSlug[]
    }

export type NestedDocsPageTreePluginResolvedHomeIndicatorConfig = {
  enabled: boolean
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
  homeIndicator?: NestedDocsPageTreePluginHomeIndicatorConfig
  parentFieldSlug?: string
  /**
   * Publish a hierarchy move immediately instead of staging it as a draft — but
   * ONLY when the moved document had no unpublished changes before the move (its
   * latest version is already published). A document with pending draft edits (a
   * "changed" or draft-only doc) always stays staged, so in-progress edits are
   * never published as a side effect of a move. Only affects collections with
   * drafts enabled; collections without drafts move live regardless.
   *
   * Disabled by default: every move is staged as a draft and the live URL/path
   * changes only when the document is next published.
   *
   * @default false
   */
  publishOnMove?: boolean
}

export type NestedDocsPageTreePluginCollectionCustom = {
  badges: NestedDocsPageTreePluginResolvedBadgeConfig
  breadcrumbsFieldSlug: string
  defaultLimit: number
  hideBreadcrumbs: boolean
  homeIndicator: NestedDocsPageTreePluginResolvedHomeIndicatorConfig
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
