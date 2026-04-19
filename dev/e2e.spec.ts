import { expect, test, type Page } from '@playwright/test'

import { devUser } from './helpers/credentials.js'

async function loginAsSeedUser(page: Page) {
  const response = await page.request.post('/api/users/login', {
    data: devUser,
  })

  expect(response.ok()).toBe(true)
}

test('renders the seeded pages tree with the expected columns and mixed statuses', async ({
  page,
}) => {
  await loginAsSeedUser(page)
  await page.goto('/admin/collections/pages')

  await expect(page).toHaveURL(/\/admin\/collections\/pages/)
  await expect(page.locator('.pages-hierarchy-table')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator('.pages-hierarchy-cell__drag-handle').first()).toBeVisible()
  await expect(page.locator('.pages-hierarchy-cell__toggle').first()).toBeVisible()
  await expect(page.locator('.pages-hierarchy-table tbody tr')).toHaveCount(30)
  await expect(
    page.locator('.pages-hierarchy-table tbody tr').filter({
      hasText: 'About',
    }),
  ).toHaveCount(1)
  await expect(
    page.locator('.pages-hierarchy-table tbody tr').filter({
      hasText: 'Leadership',
    }),
  ).toHaveCount(1)
  await expect(page.locator('.pages-hierarchy-status-badge--published').first()).toBeVisible()
  await expect(page.locator('.pages-hierarchy-status-badge--draft').first()).toBeVisible()

  const visibleHeaders = (await page.locator('.pages-hierarchy-table thead th').allTextContents())
    .map((header) => header.trim())
    .filter(Boolean)

  expect(visibleHeaders).toEqual(['Title', 'Published', 'Updated At', 'Parent', 'Slug', 'Status'])
})
