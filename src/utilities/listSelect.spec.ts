import { describe, expect, it } from 'vitest'

import { getPageTreeListSelect } from './listSelect.js'
import { buildPageTreeDocs } from './pageTree.js'

describe('getPageTreeListSelect', () => {
  it('preserves multi-field sibling sorting when the primary sort column is hidden', () => {
    const options = {
      breadcrumbsFieldSlug: 'breadcrumbs',
      columns: [
        { accessor: 'title', active: true },
        { accessor: 'publishedAt', active: false },
      ],
      parentFieldSlug: 'parent',
      sort: '-publishedAt,title',
      useAsTitle: 'title',
    }
    const select = getPageTreeListSelect(options)
    const docs = [
      { id: 1, title: 'Z', publishedAt: '2026-09-25', parent: null },
      { id: 2, title: 'A', publishedAt: '2026-09-24', parent: null },
    ]
    const selectedDocs = docs.map((doc) =>
      Object.fromEntries(Object.entries(doc).filter(([field]) => select[field] === true)),
    )

    expect(buildPageTreeDocs(selectedDocs, { sort: options.sort }).map(({ id }) => id)).toEqual([
      1,
      2,
    ])
  })
})
