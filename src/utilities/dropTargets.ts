import type { PageTreeDoc } from './pageTree.js'

export type PageTreeInsertDropTarget = {
  depth: number
  dropID: string
  dropType: 'insert'
  parentID: null | string
  referenceRowID: string
}

export type PageTreeRowDropTarget = {
  dropType: 'row'
  insertAfterDropID: string
  insertBeforeDropID: string
  rowID: string
}

export type PageTreeDropTarget = PageTreeInsertDropTarget | PageTreeRowDropTarget

export function buildInsertDropTargets(docs: PageTreeDoc[]): PageTreeInsertDropTarget[] {
  if (docs.length === 0) {
    return []
  }

  return Array.from({ length: docs.length + 1 }, (_, index) => {
    const referenceDoc = docs[index] ?? docs[docs.length - 1]

    return {
      depth: referenceDoc.__pageTreeDepth,
      dropID: `page-insert:${index}`,
      dropType: 'insert',
      parentID: referenceDoc.__pageTreeParentID,
      referenceRowID: referenceDoc.__pageTreeID,
    }
  })
}

export function getDropTargetParentDoc(args: {
  docsByID: ReadonlyMap<string, PageTreeDoc>
  dropTarget: null | PageTreeDropTarget
}): null | PageTreeDoc {
  const { docsByID, dropTarget } = args

  if (!dropTarget) {
    return null
  }

  if (dropTarget.dropType === 'row') {
    return docsByID.get(dropTarget.rowID) ?? null
  }

  if (dropTarget.parentID === null) {
    return null
  }

  return docsByID.get(dropTarget.parentID) ?? null
}
