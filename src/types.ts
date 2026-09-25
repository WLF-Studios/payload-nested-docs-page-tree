import type { CollectionSlug, PayloadRequest } from 'payload'

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
  /** Show locale badges when the collection enables localized draft status. */
  locales?: boolean
}

export type NestedDocsPageTreePluginResolvedBadgeConfig = {
  colors: NestedDocsPageTreePluginBadgeMap
  labels: NestedDocsPageTreePluginBadgeMap
  locales?: boolean
}

export type NestedDocsPageTreePluginHomeIndicatorConfig =
  | {
      collections?: CollectionSlug[]
    }
  | false

export type NestedDocsPageTreePluginResolvedHomeIndicatorConfig = {
  enabled: boolean
}

export type PageTreeLocaleBadgeVisibility = (args: {
  /** Latest draft document with all locales, read with the current user's access. */
  doc: Record<string, unknown>
  locale: string
  req: PayloadRequest
}) => boolean

export type PageTreeLocaleBadgeStatus = (args: {
  /** Latest draft document with all locales, read with the current user's access. */
  doc: Record<string, unknown>
  locale: string
  /** Current document, if readable. Check its locale status before treating it as published. */
  publishedDoc?: Record<string, unknown>
  req: PayloadRequest
  status: PageTreeLocaleStatus['status']
}) => PageTreeLocaleStatus['status']

export type NestedDocsPageTreePluginConfig = {
  badges?: NestedDocsPageTreePluginBadgeConfig
  /** Opt in to status badge links. Preview uses the collection's admin.preview. */
  badgesLinks?: NestedDocsPageTreePluginBadgesLinks
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
  /** Server-only display override. Does not change stored publication status. */
  localeBadgeStatus?: PageTreeLocaleBadgeStatus
  /** Server-only rule. False hides the badge while preserving its aligned slot. */
  localeBadgeVisibility?: PageTreeLocaleBadgeVisibility
  parentFieldSlug?: string
  /**
   * Publish a hierarchy move immediately instead of staging it as a draft - but
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
  badgesLinks?: NestedDocsPageTreePluginBadgesLinks
  breadcrumbsFieldSlug: string
  defaultLimit: number
  hideBreadcrumbs: boolean
  homeIndicator: NestedDocsPageTreePluginResolvedHomeIndicatorConfig
  localeBadgeStatus?: PageTreeLocaleBadgeStatus
  localeBadgeVisibility?: PageTreeLocaleBadgeVisibility
  parentFieldSlug: string
}

export type PageTreeLiveURL<TRequest = PayloadRequest> = (args: {
  collectionSlug: string
  /** Published document read with the current user's access, at depth 0. */
  doc: PageTreeSourceDoc
  locale?: string
  /** Published document's last breadcrumb URL, when available. */
  path?: string
  req: TRequest
}) => null | Promise<null | string | undefined> | string | undefined

export type NestedDocsPageTreePluginBadgesLinks<TRequest = PayloadRequest> = {
  /** Which links to offer for a draft with a published version. @default 'both' */
  draftHasPublishedVersion?: 'both' | 'live' | 'preview'
  /** Website base URL, or a server-only callback returning the final live URL. */
  liveURL?: PageTreeLiveURL<TRequest> | string
  /** Show live link and preview eye icons. When false, 'both' keeps an external-link preview action. @default true */
  showIcons?: boolean
}

export type PageTreeStatusLinks = {
  previewURL?: string
  publicURL?: string
}

export type PageTreeLocaleStatus = {
  locale: string
  status: 'changed' | 'draft' | 'published' | 'unknown'
  visible?: boolean
}

export type PageTreeSourceDoc = {
  __pageTreeLocaleStatuses?: PageTreeLocaleStatus[]
  __pageTreeStatusLinks?: PageTreeStatusLinks
  _displayStatus?: null | string
  _status?: null | string
  id?: number | string
  slug?: null | string
} & Record<string, unknown>

export const nestedDocsPageTreePluginCustomKey = 'nestedDocsPageTreePlugin'

/**
 * Set on Payload's hook context for every page-tree write that leaves the
 * published site unchanged: sibling reorders, and parent moves staged as
 * drafts. Deploy/revalidate hooks read it to skip rebuilds they do not need.
 *
 * It is deliberately NOT set when `publishOnMove` publishes a move, because
 * that move changed the live URL of the page and its descendants and the site
 * does need rebuilding. That way one guard covers every configuration:
 *
 * ```ts
 * if (req.context?.[pageTreeMoveContextKey]) return
 * ```
 *
 * Note the flag describes the *effect* of the write, not its kind - it is
 * absent on published moves even though those are still page-tree moves. Use
 * `pageTreeWriteContextKey` when you need "was this a page-tree write at all".
 */
export const pageTreeMoveContextKey = 'pageTreeMove'

/**
 * Internal: set on every page-tree write regardless of whether it published.
 * Diagnostics uses it so that published moves are still traced, which is the
 * case most worth observing. Not part of the public API.
 */
export const pageTreeWriteContextKey = 'pageTreeWrite'

export type PageTreeMoveContext = {
  [pageTreeMoveContextKey]?: boolean
  [pageTreeWriteContextKey]?: boolean
}
