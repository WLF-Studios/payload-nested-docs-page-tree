'use client'

import { useConfig, useLocale, useTranslation } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import type { NestedDocsPageTreePluginResolvedBadgeConfig, PageTreeLocaleStatus } from '../types.js'

import { getPageTreeBadgeColor, getPageTreeBadgeLabel } from '../utilities/status.js'

export function PageTreeLocaleStatusBadges({
  badgeConfig,
  collectionSlug,
  docID,
  statuses,
}: {
  badgeConfig: NestedDocsPageTreePluginResolvedBadgeConfig
  collectionSlug?: string
  docID?: number | string
  statuses: PageTreeLocaleStatus[]
}) {
  const { config } = useConfig()
  const locale = useLocale()
  const { t } = useTranslation()

  return (
    <span className="pages-hierarchy-locale-statuses">
      {statuses.map(({ locale: code, status, visible }) => {
        const active = code === locale?.code
        const label = getPageTreeBadgeLabel({ badgeLabels: badgeConfig.labels, status, t })
        const color = getPageTreeBadgeColor({ badgeColors: badgeConfig.colors, status })

        const href =
          visible !== false && collectionSlug && docID !== undefined
            ? formatAdminURL({
                adminRoute: config.routes.admin,
                includeBasePath: true,
                path: `/collections/${encodeURIComponent(collectionSlug)}/${encodeURIComponent(docID)}?${new URLSearchParams({ locale: code })}`,
              })
            : undefined
        const Badge = href ? 'a' : 'span'

        return (
          <span
            className={`pages-hierarchy-locale-status-slot${active ? ' pages-hierarchy-locale-status-slot--active' : ''}`}
            key={code}
          >
            <Badge
              aria-hidden={visible === false ? true : undefined}
              aria-label={`${code.toUpperCase()}: ${label}`}
              className={`pages-hierarchy-status-badge pages-hierarchy-status-badge--${status} pages-hierarchy-locale-status-badge`}
              data-active={active ? 'true' : 'false'}
              data-custom-color={color ? 'true' : undefined}
              data-locale={code}
              data-status={status}
              href={href}
              onClick={href ? (event: React.MouseEvent) => event.stopPropagation() : undefined}
              onPointerDown={
                href ? (event: React.PointerEvent) => event.stopPropagation() : undefined
              }
              role={href ? undefined : 'img'}
              style={{
                ...(color ? ({ '--page-tree-badge-base': color } as React.CSSProperties) : {}),
                ...(visible === false ? { visibility: 'hidden' } : {}),
              }}
            >
              <span className="pages-hierarchy-locale-status-badge__code">
                {code.toUpperCase()}
              </span>
              {active && (
                <>
                  <span
                    aria-hidden="true"
                    className="pages-hierarchy-locale-status-badge__separator"
                  >
                    ·
                  </span>
                  <span className="pages-hierarchy-locale-status-badge__label">{label}</span>
                </>
              )}
            </Badge>
          </span>
        )
      })}
    </span>
  )
}
