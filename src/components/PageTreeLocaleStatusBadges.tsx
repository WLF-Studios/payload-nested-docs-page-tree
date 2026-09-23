'use client'

import { useLocale, useTranslation } from '@payloadcms/ui'
import React from 'react'

import type { NestedDocsPageTreePluginResolvedBadgeConfig, PageTreeLocaleStatus } from '../types.js'

import { getPageTreeBadgeColor, getPageTreeBadgeLabel } from '../utilities/status.js'

export function PageTreeLocaleStatusBadges({
  badgeConfig,
  statuses,
}: {
  badgeConfig: NestedDocsPageTreePluginResolvedBadgeConfig
  statuses: PageTreeLocaleStatus[]
}) {
  const locale = useLocale()
  const { t } = useTranslation()

  return (
    <span className="pages-hierarchy-locale-statuses">
      {statuses.map(({ locale: code, status }) => {
        const active = code === locale?.code
        const label = getPageTreeBadgeLabel({ badgeLabels: badgeConfig.labels, status, t })
        const color = getPageTreeBadgeColor({ badgeColors: badgeConfig.colors, status })

        return (
          <span
            className={`pages-hierarchy-locale-status-slot${active ? ' pages-hierarchy-locale-status-slot--active' : ''}`}
            key={code}
          >
            <span
              aria-label={`${code.toUpperCase()}: ${label}`}
              className={`pages-hierarchy-status-badge pages-hierarchy-status-badge--${status} pages-hierarchy-locale-status-badge`}
              data-active={active ? 'true' : 'false'}
              data-custom-color={color ? 'true' : undefined}
              data-locale={code}
              data-status={status}
              role="img"
              style={
                color ? ({ '--page-tree-badge-base': color } as React.CSSProperties) : undefined
              }
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
            </span>
          </span>
        )
      })}
    </span>
  )
}
