import type { PageTreeDoc } from './pageTree.js'

export const CANCEL_DRAG_MESSAGE = 'Release to cancel drag.'

export type PageTreeDropValidation = {
  isValid: boolean
  message?: string
  parentID: null | string
}

export function getDropValidation(args: {
  activeDoc: PageTreeDoc
  targetDoc?: PageTreeDoc
}): PageTreeDropValidation {
  const { activeDoc, targetDoc } = args

  if (!targetDoc) {
    if (activeDoc.__pageTreeParentID === null) {
      return {
        isValid: false,
        message: 'Document is already at the root.',
        parentID: null,
      }
    }

    return {
      isValid: true,
      parentID: null,
    }
  }

  if (targetDoc.__pageTreeID === activeDoc.__pageTreeID) {
    return {
      isValid: false,
      message: CANCEL_DRAG_MESSAGE,
      parentID: targetDoc.__pageTreeID,
    }
  }

  if (targetDoc.__pageTreeAncestorIDs.includes(activeDoc.__pageTreeID)) {
    return {
      isValid: false,
      message: 'A document cannot be moved under one of its descendants.',
      parentID: targetDoc.__pageTreeID,
    }
  }

  if (activeDoc.__pageTreeParentID === targetDoc.__pageTreeID) {
    return {
      isValid: false,
      message: 'Document already has that parent.',
      parentID: targetDoc.__pageTreeID,
    }
  }

  return {
    isValid: true,
    parentID: targetDoc.__pageTreeID,
  }
}
