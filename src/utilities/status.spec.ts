import { describe, expect, it } from 'vitest'

import {
  getPageTreeBadgeColor,
  getPageTreeBadgeLabel,
  getPageTreeDisplayStatus,
  getPageTreeDisplayStatusLabelKey,
  withPageTreeDisplayStatuses,
} from './status.js'

describe('getPageTreeDisplayStatus', () => {
  it('prefers the changed display status over the stored draft status', () => {
    expect(
      getPageTreeDisplayStatus({
        _displayStatus: 'changed',
        _status: 'draft',
      }),
    ).toBe('changed')
  })

  it('falls back to the stored status when display status is unavailable', () => {
    expect(
      getPageTreeDisplayStatus({
        _status: 'published',
      }),
    ).toBe('published')
  })

  it('returns unknown for unsupported values', () => {
    expect(
      getPageTreeDisplayStatus({
        _displayStatus: 'archived',
        _status: 'archived',
      }),
    ).toBe('unknown')
  })
})

describe('getPageTreeDisplayStatusLabelKey', () => {
  it('maps changed docs to the changed translation', () => {
    expect(getPageTreeDisplayStatusLabelKey('changed')).toBe('version:changed')
  })
})

describe('getPageTreeBadgeLabel', () => {
  const translate = (key: ReturnType<typeof getPageTreeDisplayStatusLabelKey>) => key

  it('uses the custom label for known statuses', () => {
    expect(
      getPageTreeBadgeLabel({
        badgeLabels: {
          changed: 'Needs Publish',
        },
        status: 'changed',
        t: translate,
      }),
    ).toBe('Needs Publish')
  })

  it('falls back to the translated default label when no override exists', () => {
    expect(
      getPageTreeBadgeLabel({
        badgeLabels: {},
        status: 'published',
        t: translate,
      }),
    ).toBe('version:published')
  })
})

describe('getPageTreeBadgeColor', () => {
  it('returns the custom color for known statuses', () => {
    expect(
      getPageTreeBadgeColor({
        badgeColors: {
          changed: '#d97706',
        },
        status: 'changed',
      }),
    ).toBe('#d97706')
  })

  it('returns undefined when no custom color exists', () => {
    expect(
      getPageTreeBadgeColor({
        badgeColors: {},
        status: 'draft',
      }),
    ).toBeUndefined()
  })
})

describe('withPageTreeDisplayStatuses', () => {
  it('marks a draft with an existing published document as changed', () => {
    expect(
      withPageTreeDisplayStatuses({
        currentDocs: [
          {
            _status: 'published',
            id: 'page-1',
          },
        ],
        draftDocs: [
          {
            _status: 'draft',
            id: 'page-1',
          },
        ],
      }),
    ).toMatchObject([
      {
        _displayStatus: 'changed',
        _status: 'draft',
        id: 'page-1',
      },
    ])
  })

  it('keeps unpublished drafts as draft', () => {
    expect(
      withPageTreeDisplayStatuses({
        currentDocs: [
          {
            _status: 'draft',
            id: 'page-2',
          },
        ],
        draftDocs: [
          {
            _status: 'draft',
            id: 'page-2',
          },
        ],
      }),
    ).toMatchObject([
      {
        _displayStatus: 'draft',
        _status: 'draft',
        id: 'page-2',
      },
    ])
  })
})
