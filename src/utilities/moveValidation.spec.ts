import { describe, expect, it } from 'vitest'

import { getDropValidation } from './moveValidation.js'
import { buildPageTreeDocs, type PageTreeSourceDoc } from './pageTree.js'

const docs: PageTreeSourceDoc[] = [
  { id: 1, title: 'Home' },
  { id: 2, parent: 1, title: 'About' },
  { id: 3, parent: 2, title: 'Team' },
  { id: 4, title: 'Contact' },
]

const treeDocs = buildPageTreeDocs(docs)
const docsByID = new Map(treeDocs.map((doc) => [doc.__pageTreeID, doc]))
const homeDoc = docsByID.get('1')!
const aboutDoc = docsByID.get('2')!
const teamDoc = docsByID.get('3')!
const contactDoc = docsByID.get('4')!

describe('getDropValidation', () => {
  it('allows moving a nested document to the root', () => {
    expect(getDropValidation({ activeDoc: aboutDoc })).toMatchObject({
      isValid: true,
      parentID: null,
    })
  })

  it('rejects moving a root document to the root again', () => {
    expect(getDropValidation({ activeDoc: homeDoc })).toMatchObject({
      isValid: false,
      parentID: null,
    })
  })

  it('rejects dropping a document onto itself', () => {
    expect(getDropValidation({ activeDoc: aboutDoc, targetDoc: aboutDoc })).toMatchObject({
      isValid: false,
      parentID: '2',
    })
  })

  it('rejects moving a document under one of its descendants', () => {
    expect(getDropValidation({ activeDoc: aboutDoc, targetDoc: teamDoc })).toMatchObject({
      isValid: false,
      parentID: '3',
    })
  })

  it('rejects moving a document to the same parent', () => {
    expect(getDropValidation({ activeDoc: teamDoc, targetDoc: aboutDoc })).toMatchObject({
      isValid: false,
      parentID: '2',
    })
  })

  it('allows moving a document to a different parent', () => {
    expect(getDropValidation({ activeDoc: teamDoc, targetDoc: contactDoc })).toMatchObject({
      isValid: true,
      parentID: '4',
    })
  })
})
