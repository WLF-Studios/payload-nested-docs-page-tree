import { describe, expect, it } from 'vitest'

import { normalizeNestedDocsPageTreePluginBadgeConfig } from './badgeConfig.js'

describe('normalizeNestedDocsPageTreePluginBadgeConfig', () => {
  it('keeps valid color and label overrides', () => {
    expect(
      normalizeNestedDocsPageTreePluginBadgeConfig({
        colors: {
          changed: '#d97706',
          published: '#1f8f5f',
        },
        labels: {
          changed: 'Needs Publish',
          draft: 'Unpublished',
        },
      }),
    ).toEqual({
      colors: {
        changed: '#d97706',
        published: '#1f8f5f',
      },
      labels: {
        changed: 'Needs Publish',
        draft: 'Unpublished',
      },
    })
  })

  it('keeps the documented custom badge example', () => {
    expect(
      normalizeNestedDocsPageTreePluginBadgeConfig({
        colors: {
          changed: '#9333ea',
          draft: '#dc2626',
          published: '#1e90ff',
        },
        labels: {
          changed: 'Has Changes',
          draft: 'Draft Only',
          published: 'Live',
        },
      }),
    ).toEqual({
      colors: {
        changed: '#9333ea',
        draft: '#dc2626',
        published: '#1e90ff',
      },
      labels: {
        changed: 'Has Changes',
        draft: 'Draft Only',
        published: 'Live',
      },
    })
  })

  it('drops unsupported and empty values', () => {
    expect(
      normalizeNestedDocsPageTreePluginBadgeConfig({
        colors: {
          archived: '#000000',
          draft: '   ',
        },
        labels: {
          changed: '',
          published: 100,
        },
      }),
    ).toEqual({
      colors: {},
      labels: {},
    })
  })

  it('returns empty overrides when config is missing', () => {
    expect(normalizeNestedDocsPageTreePluginBadgeConfig(undefined)).toEqual({
      colors: {},
      labels: {},
    })
  })
})
