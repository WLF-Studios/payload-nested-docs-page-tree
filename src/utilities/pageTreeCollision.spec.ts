import { describe, expect, it } from 'vitest'

import type { PageTreeInsertDropTarget, PageTreeRowDropTarget } from './dropTargets.js'

import {
  PAGE_TREE_INSERT_EDGE_SIZE_PX,
  resolvePageTreePointerCollisionID,
} from './pageTreeCollision.js'

const beforeInsertTarget: PageTreeInsertDropTarget = {
  depth: 0,
  dropID: 'page-insert:0',
  dropType: 'insert',
  parentID: null,
  referenceRowID: '1',
}

const afterInsertTarget: PageTreeInsertDropTarget = {
  depth: 0,
  dropID: 'page-insert:1',
  dropType: 'insert',
  parentID: null,
  referenceRowID: '2',
}

function buildRowDropTarget(args: {
  insertAfterDropID: string
  insertBeforeDropID: string
  rowID: string
}): PageTreeRowDropTarget {
  const { insertAfterDropID, insertBeforeDropID, rowID } = args

  return {
    dropType: 'row',
    insertAfterDropID,
    insertBeforeDropID,
    rowID,
  }
}

function buildRowCollision(args: {
  bottom?: number
  dropTarget?: PageTreeRowDropTarget
  id?: string
  top?: number
}) {
  const { id = 'page-drop:1', bottom = 140, dropTarget, top = 100 } = args

  return {
    id,
    dropTarget:
      dropTarget ??
      buildRowDropTarget({
        insertAfterDropID: afterInsertTarget.dropID,
        insertBeforeDropID: beforeInsertTarget.dropID,
        rowID: '1',
      }),
    rect: {
      bottom,
      top,
    },
  }
}

describe('resolvePageTreePointerCollisionID', () => {
  it('keeps the row target when the pointer is away from the insert edge', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [buildRowCollision({})],
        pointerCoordinates: {
          x: 24,
          y: 100 + PAGE_TREE_INSERT_EDGE_SIZE_PX + 8,
        },
      }),
    ).toBe('page-drop:1')
  })

  it('resolves the top edge of a row to the previous insert target', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [buildRowCollision({})],
        pointerCoordinates: {
          x: 24,
          y: 100 + PAGE_TREE_INSERT_EDGE_SIZE_PX,
        },
      }),
    ).toBe(beforeInsertTarget.dropID)
  })

  it('resolves the bottom edge of a row to the next insert target', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [buildRowCollision({})],
        pointerCoordinates: {
          x: 24,
          y: 140 - PAGE_TREE_INSERT_EDGE_SIZE_PX,
        },
      }),
    ).toBe(afterInsertTarget.dropID)
  })

  it('uses the leading insert target for the first row top edge', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [
          buildRowCollision({
            id: 'page-drop:home',
            dropTarget: buildRowDropTarget({
              insertAfterDropID: 'page-insert:1',
              insertBeforeDropID: 'page-insert:0',
              rowID: 'home',
            }),
          }),
        ],
        pointerCoordinates: {
          x: 24,
          y: 100 + 1,
        },
      }),
    ).toBe('page-insert:0')
  })

  it('uses the trailing insert target for the last row bottom edge', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [
          buildRowCollision({
            id: 'page-drop:contact',
            dropTarget: buildRowDropTarget({
              insertAfterDropID: 'page-insert:4',
              insertBeforeDropID: 'page-insert:3',
              rowID: 'contact',
            }),
          }),
        ],
        pointerCoordinates: {
          x: 24,
          y: 140 - 1,
        },
      }),
    ).toBe('page-insert:4')
  })

  it('returns the direct insert collision when the pointer is already over an insert target', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [
          {
            id: beforeInsertTarget.dropID,
            dropTarget: beforeInsertTarget,
          },
          buildRowCollision({}),
        ],
        pointerCoordinates: {
          x: 24,
          y: 102,
        },
      }),
    ).toBe(beforeInsertTarget.dropID)
  })

  it('returns null when pointer coordinates are unavailable so the caller can fall back', () => {
    expect(
      resolvePageTreePointerCollisionID({
        collisions: [buildRowCollision({})],
        pointerCoordinates: null,
      }),
    ).toBeNull()
  })
})
