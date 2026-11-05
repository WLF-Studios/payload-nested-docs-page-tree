import { describe, expect, it } from 'vitest'

import { getCompleteListDocs, getMissingListSelect, mergeListMetadata } from './listReuse.js'

describe('native list reuse', () => {
  it('removes historical native status without mutating the original document', () => {
    const doc = { id: 1, _displayStatus: 'changed', _status: 'draft' }
    expect(getCompleteListDocs({ docs: [doc], page: 1, totalDocs: 1 }))
      .toEqual([{ id: 1, _status: 'draft' }])
    expect(doc._displayStatus).toBe('changed')
  })

  it.each([
    { docs: [{ id: 1 }], page: 1, totalDocs: 2 },
    { docs: [{ id: 1 }], page: 2, totalDocs: 1 },
    { docs: [{ id: 1 }, { id: '1' }], page: 1, totalDocs: 2 },
    { docs: [{}], page: 1, totalDocs: 1 },
  ])('rejects incomplete or ambiguous native data: %j', (data) => {
    expect(getCompleteListDocs(data)).toBeUndefined()
  })

  it('accepts empty complete results and does not request missing fields', () => {
    expect(getCompleteListDocs({ docs: [], page: 1, totalDocs: 0 })).toEqual([])
    expect(getMissingListSelect([], { parent: true })).toEqual({})
  })

  it('preserves null parents and requests fields missing on any row', () => {
    expect(getMissingListSelect([{ id: 1, parent: null }, { id: 2 }], { id: true, parent: true }))
      .toEqual({ parent: true })
  })

  it('drops documents excluded by the supplementary permission-aware read', () => {
    expect(mergeListMetadata([{ id: 1, title: 'Allowed' }, { id: 2, title: 'Revoked' }], [
      { id: 1, parent: null },
    ]).map(doc => doc.id)).toEqual([1])
  })
})
