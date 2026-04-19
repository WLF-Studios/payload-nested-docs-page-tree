import type {
  NestedDocsPageTreePluginBadgeConfig,
  NestedDocsPageTreePluginBadgeMap,
  NestedDocsPageTreePluginResolvedBadgeConfig,
} from '../types.js'
import { nestedDocsPageTreePluginBadgeStatuses } from '../types.js'

function normalizeBadgeMap(value: unknown): NestedDocsPageTreePluginBadgeMap {
  const normalized: NestedDocsPageTreePluginBadgeMap = {}

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return normalized
  }

  const badgeMap = value as Record<string, unknown>

  for (const status of nestedDocsPageTreePluginBadgeStatuses) {
    const statusValue = badgeMap[status]

    if (typeof statusValue === 'string' && statusValue.trim().length > 0) {
      normalized[status] = statusValue.trim()
    }
  }

  return normalized
}

export function normalizeNestedDocsPageTreePluginBadgeConfig(
  value: NestedDocsPageTreePluginBadgeConfig | unknown,
): NestedDocsPageTreePluginResolvedBadgeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      colors: {},
      labels: {},
    }
  }

  const badgeConfig = value as NestedDocsPageTreePluginBadgeConfig

  return {
    colors: normalizeBadgeMap(badgeConfig.colors),
    labels: normalizeBadgeMap(badgeConfig.labels),
  }
}
