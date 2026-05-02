import { describe, expect, it } from 'vitest'

import {
  buildInsertDropTargets,
  getDropTargetParentDoc,
  getOrderPlacementFromDropTarget,
} from './dropTargets.js'
import { buildPageTreeDocs, type PageTreeSourceDoc } from './pageTree.js'

const docs: PageTreeSourceDoc[] = [
  { id: 1, title: 'Home' },
  { id: 2, parent: 1, title: 'About' },
  { id: 3, parent: 2, title: 'Team' },
  { id: 4, title: 'Contact' },
]

const treeDocs = buildPageTreeDocs(docs)
const docsByID = new Map(treeDocs.map((doc) => [doc.__pageTreeID, doc]))

describe('buildInsertDropTargets', () => {
  it('builds thin insert targets only around visible root rows', () => {
    expect(buildInsertDropTargets(treeDocs)).toEqual([
      {
        depth: 0,
        dropID: 'page-insert:0',
        dropType: 'insert',
        parentID: null,
        referenceRowID: '1',
      },
      {
        depth: 0,
        dropID: 'page-insert:1',
        dropType: 'insert',
        parentID: null,
        referenceRowID: '4',
      },
      {
        depth: 0,
        dropID: 'page-insert:2',
        dropType: 'insert',
        parentID: null,
        referenceRowID: '4',
      },
    ])
  })

  it('does not build insert targets when only child rows are visible', () => {
    expect(
      buildInsertDropTargets(treeDocs.filter((doc) => doc.__pageTreeParentID !== null)),
    ).toEqual([])
  })

  it('returns an empty list when there are no rows to insert around', () => {
    expect(buildInsertDropTargets([])).toEqual([])
  })
})

describe('getDropTargetParentDoc', () => {
  it('resolves row targets to the hovered row document', () => {
    expect(
      getDropTargetParentDoc({
        docsByID,
        dropTarget: {
          dropType: 'row',
          insertAfterDropID: 'page-insert:2',
          insertBeforeDropID: 'page-insert:1',
          rowID: '2',
        },
      })?.__pageTreeID,
    ).toBe('2')
  })

  it('resolves root insert targets to no parent document', () => {
    expect(
      getDropTargetParentDoc({
        docsByID,
        dropTarget: buildInsertDropTargets(treeDocs)[1] ?? null,
      }),
    ).toBeNull()
  })
})

describe('getOrderPlacementFromDropTarget', () => {
  it('returns root sibling anchors before the first root row', () => {
    expect(
      getOrderPlacementFromDropTarget({
        activeDoc: docsByID.get('4')!,
        docs: treeDocs,
        docsByID,
        dropTarget: buildInsertDropTargets(treeDocs)[0] ?? null,
      }),
    ).toEqual({
      nextSiblingID: '1',
      parentID: null,
      previousSiblingID: null,
    })
  })

  it('returns root sibling anchors between root rows', () => {
    expect(
      getOrderPlacementFromDropTarget({
        activeDoc: docsByID.get('4')!,
        docs: treeDocs,
        docsByID,
        dropTarget: buildInsertDropTargets(treeDocs)[1] ?? null,
      }),
    ).toEqual({
      nextSiblingID: null,
      parentID: null,
      previousSiblingID: '1',
    })
  })

  it('returns root sibling anchors after the last root row', () => {
    expect(
      getOrderPlacementFromDropTarget({
        activeDoc: docsByID.get('1')!,
        docs: treeDocs,
        docsByID,
        dropTarget: buildInsertDropTargets(treeDocs)[2] ?? null,
      }),
    ).toEqual({
      nextSiblingID: null,
      parentID: null,
      previousSiblingID: '4',
    })
  })

  it('places row drops as the last child of the target row', () => {
    expect(
      getOrderPlacementFromDropTarget({
        activeDoc: docsByID.get('4')!,
        docs: treeDocs,
        docsByID,
        dropTarget: {
          dropType: 'row',
          insertAfterDropID: 'page-insert:2',
          insertBeforeDropID: 'page-insert:1',
          rowID: '1',
        },
      }),
    ).toEqual({
      nextSiblingID: null,
      parentID: '1',
      previousSiblingID: '2',
    })
  })

  it('excludes the moving subtree from sibling anchors', () => {
    expect(
      getOrderPlacementFromDropTarget({
        activeDoc: docsByID.get('2')!,
        docs: treeDocs,
        docsByID,
        dropTarget: {
          dropType: 'row',
          insertAfterDropID: 'page-insert:1',
          insertBeforeDropID: 'page-insert:0',
          rowID: '1',
        },
      }),
    ).toEqual({
      nextSiblingID: null,
      parentID: '1',
      previousSiblingID: null,
    })
  })

  it('returns no sibling anchors when moving into an empty parent', () => {
    expect(
      getOrderPlacementFromDropTarget({
        activeDoc: docsByID.get('4')!,
        docs: treeDocs,
        docsByID,
        dropTarget: {
          dropType: 'row',
          insertAfterDropID: 'page-insert:3',
          insertBeforeDropID: 'page-insert:2',
          rowID: '3',
        },
      }),
    ).toEqual({
      nextSiblingID: null,
      parentID: '3',
      previousSiblingID: null,
    })
  })
})
