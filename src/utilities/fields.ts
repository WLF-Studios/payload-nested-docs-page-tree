import type { Field } from 'payload'

/**
 * Rows, collapsibles, unnamed groups, and unnamed tabs are presentational
 * only: Payload stores their children directly on the document, so a field
 * nested inside one is still a top-level field as far as the data is
 * concerned. Named groups and named tabs nest their children under their own
 * key, so traversal stops at those.
 */
function getPresentationalChildFields(field: Field): Field[] | null {
  if (field.type === 'row' || field.type === 'collapsible') {
    return field.fields
  }

  if (field.type === 'group' && !('name' in field)) {
    return field.fields
  }

  if (field.type === 'tabs') {
    return field.tabs.flatMap((tab) => ('name' in tab ? [] : tab.fields))
  }

  return null
}

/**
 * Finds the field stored under `fieldName` at the top level of the document,
 * looking through presentational containers such as tabs and rows.
 */
export function findTopLevelField(fields: Field[], fieldName: string): Field | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === fieldName) {
      return field
    }

    const childFields = getPresentationalChildFields(field)

    if (childFields) {
      const match = findTopLevelField(childFields, fieldName)

      if (match) {
        return match
      }
    }
  }

  return undefined
}

/**
 * Maps `mapField` over every field stored at the top level of the document,
 * rebuilding presentational containers so nested fields are patched in place.
 */
export function mapTopLevelFields(
  fields: Field[],
  mapField: (field: Field) => Field,
): Field[] {
  return fields.map((field) => {
    if (
      field.type === 'row' ||
      field.type === 'collapsible' ||
      (field.type === 'group' && !('name' in field))
    ) {
      return {
        ...field,
        fields: mapTopLevelFields(field.fields, mapField),
      } as Field
    }

    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) =>
          'name' in tab
            ? tab
            : {
                ...tab,
                fields: mapTopLevelFields(tab.fields, mapField),
              },
        ),
      } as Field
    }

    return mapField(field)
  })
}
