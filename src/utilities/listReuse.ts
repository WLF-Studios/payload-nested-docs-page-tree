import type { CollectionConfig, Column, PaginatedDocs, SelectType } from 'payload'

import { flattenTopLevelFields } from 'payload/shared'

import type { PageTreeSourceDoc } from '../types.js'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function hasUniqueDocIDs(docs: PageTreeSourceDoc[]): boolean {
  return docs.every(({ id }) => typeof id === 'string' || typeof id === 'number') &&
    new Set(docs.map(({ id }) => String(id))).size === docs.length
}

export function getCompleteListDocs(data?: Partial<PaginatedDocs>): PageTreeSourceDoc[] | undefined {
  if (!Array.isArray(data?.docs) || data.page !== 1 || data.hasNextPage || data.hasPrevPage ||
      data.docs.length !== data.totalDocs || !hasUniqueDocIDs(data.docs)) {
    return undefined
  }
  // Native historical display status is not the plugin's current-document status.
  return data.docs.map(({ _displayStatus: _nativeStatus, ...doc }) => doc)
}

export function getMissingListSelect(docs: PageTreeSourceDoc[], select: SelectType): SelectType {
  function missing(selection: RecordValue, records: unknown[]): RecordValue {
    const result: RecordValue = {}
    for (const [key, value] of Object.entries(selection)) {
      if (value === true) {
        if (records.some(record => !isRecord(record) || !Object.hasOwn(record, key))) {result[key] = true}
      } else if (isRecord(value)) {
        const child = missing(value, records.map(record => isRecord(record) ? record[key] : undefined))
        if (Object.keys(child).length) {result[key] = child}
      }
    }
    return result
  }
  return missing(select, docs) as SelectType
}

export function mergeListMetadata(
  docs: PageTreeSourceDoc[],
  metadata: PageTreeSourceDoc[],
): PageTreeSourceDoc[] {
  function merge(original: RecordValue, extra: RecordValue): RecordValue {
    const result = { ...original }
    for (const [key, value] of Object.entries(extra)) {
      result[key] = isRecord(value) && isRecord(result[key]) ? merge(result[key], value) : value
    }
    return result
  }
  const byID = new Map(metadata.map(doc => [String(doc.id), doc]))
  return docs.flatMap(doc => {
    const extra = byID.get(String(doc.id))
    // A supplementary read must not resurrect a document that is no longer readable.
    return extra ? [merge(doc, extra) as PageTreeSourceDoc] : []
  })
}

export function canReuseListCells({
  collectionConfig,
  columns,
  docs,
  useAsTitle,
}: {
  collectionConfig: CollectionConfig
  columns: Column[]
  docs: PageTreeSourceDoc[]
  useAsTitle: string
}): boolean {
  if (collectionConfig.admin?.formatDocURL || !hasUniqueDocIDs(docs) ||
      !columns.some(col => col.accessor === useAsTitle && col.active)) {
    return false
  }
  // Payload strips component configuration from Column.field. Inspect server fields.
  const fields = flattenTopLevelFields(collectionConfig.fields, {
    keepPresentationalFields: true,
    moveSubFieldsToTop: true,
  })
  return columns.every(column => {
    if (!column.active) {return true}
    const field = fields.find(field => (field.accessor ?? field.name) === column.accessor)
    // Custom cells and rich text editors may depend on the enriched tree rowData.
    const customCell = field?.admin && 'components' in field.admin && field.admin.components?.Cell
    return !customCell && field?.type !== 'richText' &&
      (column.accessor === '_status' || column.renderedCells?.length === docs.length)
  })
}
