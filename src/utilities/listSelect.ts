import type { ColumnPreference, SelectType } from 'payload'

import { unflatten } from 'payload/shared'

export function getPageTreeListSelect({
  columns,
  useAsTitle,
  parentFieldSlug,
  breadcrumbsFieldSlug,
  orderableFieldName,
  sort,
}: {
  breadcrumbsFieldSlug: string
  columns: ColumnPreference[]
  orderableFieldName?: string
  parentFieldSlug: string
  sort?: string
  useAsTitle?: string
}): SelectType {
  const select = Object.fromEntries(
    columns.filter(({ active }) => active).map(({ accessor }) => [accessor, true]),
  )
  for (const field of [
    'id', 'slug', '_status', useAsTitle, parentFieldSlug, breadcrumbsFieldSlug, orderableFieldName,
    ...(sort?.split(',').map((field) => field.trim().replace(/^-/, '')) ?? []),
  ]) {
    if (field) { select[field] = true }
  }
  return unflatten(select) as SelectType
}
