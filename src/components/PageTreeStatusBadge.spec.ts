import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PageTreeStatusBadge } from './PageTreeStatusBadge.js'

vi.mock('@payloadcms/ui', () => ({
  ExternalLinkIcon: () =>
    React.createElement('svg', { 'data-page-tree-test-icon': 'external-link' }),
  LinkIcon: () => React.createElement('svg', { 'data-page-tree-test-icon': 'link' }),
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@payloadcms/ui/icons/Eye', () => ({
  EyeIcon: ({ active }: { active: boolean }) =>
    React.createElement('svg', { 'data-page-tree-test-icon': active ? 'eye-off' : 'eye' }),
}))

describe('PageTreeStatusBadge', () => {
  const doc = {
    __pageTreeStatusLinks: {
      previewURL: 'https://example.com/preview',
      publicURL: 'https://example.com/live',
    },
    _displayStatus: 'changed',
  }
  const badgeConfig = { colors: {}, labels: { changed: 'Custom label' } }

  it.each(['live', 'preview', 'both'] as const)(
    'renders the %s destinations regardless of the badge label',
    (mode) => {
      const html = renderToStaticMarkup(
        React.createElement(PageTreeStatusBadge, {
          badgeConfig,
          badgesLinks: { draftHasPublishedVersion: mode },
          doc,
        }),
      )
      expect(html.match(/<a /g)?.length).toBe(mode === 'both' ? 2 : 1)
      expect(html.includes('href="https://example.com/live"')).toBe(mode !== 'preview')
      expect(html.includes('href="https://example.com/preview"')).toBe(mode !== 'live')
      const links = html.match(/<a\b[^>]*>.*?<\/a>/g) ?? []
      for (const link of links) {
        const preview = link.includes('href="https://example.com/preview"')
        expect(link).toContain(`data-page-tree-test-icon="${preview ? 'eye' : 'link'}"`)
        expect(link).toContain('aria-hidden="true"')
        expect(link).toContain('target="_blank"')
      }
      expect(links[0]).toMatch(/>Custom label<span aria-hidden="true"/)
    },
  )

  it.each([
    ['published', 'both', 'link'],
    ['draft', 'both', 'eye'],
  ] as const)('shows the %s icon when enabled', (status, mode, icon) => {
    const html = renderToStaticMarkup(
      React.createElement(PageTreeStatusBadge, {
        badgeConfig,
        badgesLinks: { draftHasPublishedVersion: mode, showIcons: true },
        doc: { ...doc, _displayStatus: status },
      }),
    )
    expect(html).toContain(`data-page-tree-test-icon="${icon}"`)
    expect(html.match(/<svg/g)).toHaveLength(1)
  })

  it.each([
    ['published', 'both', 1],
    ['draft', 'both', 1],
    ['changed', 'live', 1],
    ['changed', 'preview', 1],
    ['changed', 'both', 2],
  ] as const)('hides inline icons for %s in %s mode', (status, mode, linkCount) => {
    const html = renderToStaticMarkup(
      React.createElement(PageTreeStatusBadge, {
        badgeConfig,
        badgesLinks: { draftHasPublishedVersion: mode, showIcons: false },
        doc: { ...doc, _displayStatus: status },
      }),
    )
    const links = html.match(/<a\b[^>]*>.*?<\/a>/g) ?? []
    expect(links).toHaveLength(linkCount)
    expect(links[0]).not.toContain('<svg')
    if (linkCount === 2) {
      expect(links[1]).toContain('href="https://example.com/preview"')
      expect(links[1]).toContain('data-page-tree-test-icon="external-link"')
      expect(html.match(/<svg/g)).toHaveLength(1)
    } else {
      expect(html).not.toContain('<svg')
    }
  })

  it('ignores even stale link metadata when links are disabled', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageTreeStatusBadge, { badgeConfig, doc }),
    )
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('<svg')
  })

  it('defaults to both with an unlinked body when the live URL is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageTreeStatusBadge, {
        badgeConfig,
        badgesLinks: {},
        doc: { ...doc, __pageTreeStatusLinks: { previewURL: 'https://example.com/preview' } },
      }),
    )
    expect(html.match(/<a /g)?.length).toBe(1)
    expect(html).toContain('<span class="pages-hierarchy-status-badge__body">Custom label</span>')
    expect(html).toContain('href="https://example.com/preview"')
  })

  it('does not substitute live when preview-only mode has no preview URL', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageTreeStatusBadge, {
        badgeConfig,
        badgesLinks: { draftHasPublishedVersion: 'preview' },
        doc: { ...doc, __pageTreeStatusLinks: { publicURL: 'https://example.com/live' } },
      }),
    )
    expect(html).not.toContain('<a ')
  })
})
