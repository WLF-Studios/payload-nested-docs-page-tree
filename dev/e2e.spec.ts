import { expect, type Page, test } from '@playwright/test'

import { devUser } from './helpers/credentials.js'

async function loginAsSeedUser(page: Page) {
  const response = await page.request.post('/api/users/login', {
    data: devUser,
  })

  expect(response.ok()).toBe(true)
}

async function expandAllRows(page: Page) {
  const collapsed = page.locator('.pages-hierarchy-cell__toggle[aria-expanded="false"]')
  while (await collapsed.count()) {
    await collapsed.first().click()
  }
}

test('remembers expanded branches per user and collection across navigation and queries', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsSeedUser(page)
  const suffix = `tree-state-${Date.now()}`
  const ids: string[] = []
  let otherUserID: string | undefined
  const row = (name: string) => page.locator('[data-page-tree-row="true"]').filter({
    has: page.locator('.pages-hierarchy-cell').getByRole('link', { name: `${suffix}-${name}`, exact: true }),
  })
  const toggle = (name: string) => row(name).locator('.pages-hierarchy-cell__toggle')
  const listURL = `/admin/collections/pages?search=${suffix}&limit=100&sort=_order&locale=en`

  try {
    for (const [name, parentIndex] of [['root', -1], ['child', 0], ['grandchild', 1]] as const) {
      const response = await page.request.post('/api/pages', {
        data: {
          slug: `${suffix}-${name}`,
          _status: 'draft',
          parent: ids[parentIndex],
          title: `${suffix}-${name}`,
        },
      })
      expect(response.ok()).toBe(true)
      ids.push((await response.json()).doc.id)
    }
    await page.goto(listURL)
    // Drag instructions mount after hydration; expanded rows also exist in the server HTML.
    await expect(page.locator('[id^="DndDescribedBy-"]')).toBeAttached()
    await expect(toggle('root')).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle('child')).toHaveAttribute('aria-expanded', 'true')
    await expect(row('grandchild')).toBeVisible()
    await toggle('child').click()
    await expect(toggle('child')).toHaveAttribute('aria-expanded', 'false')
    await toggle('root').click()
    await expect(toggle('root')).toHaveAttribute('aria-expanded', 'false')
    await page.reload()
    await expect(toggle('root')).toHaveAttribute('aria-expanded', 'false')
    await expect(row('child')).toHaveCount(0)
    await toggle('root').click()
    await expect(toggle('child')).toHaveAttribute('aria-expanded', 'false')
    await toggle('child').click()
    await expect(row('grandchild')).toBeVisible()

    await row('grandchild').getByRole('link', { name: `${suffix}-grandchild`, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/collections/pages/${ids[2]}`))
    await page.goBack()
    await expect(row('grandchild')).toBeVisible()
    await page.reload()
    await expect(row('grandchild')).toBeVisible()

    await page.getByRole('button', { name: 'Sort by Title Descending', exact: true }).click()
    await expect(page).toHaveURL(/sort=-title/)
    await expect(row('grandchild')).toBeVisible()
    await page.goto(`/admin/collections/pages?search=${suffix}&limit=1&page=2&locale=en`)
    await expect(row('child')).toBeVisible()
    await page.goto(`/admin/collections/pages?search=${suffix}-grandchild&limit=100&locale=en`)
    await expect(row('grandchild')).toBeVisible()
    await page.goto(listURL)
    await expect(row('grandchild')).toBeVisible()
    await toggle('root').click()
    await page.reload()
    await expect(toggle('root')).toHaveAttribute('aria-expanded', 'false')
    await toggle('root').click()
    await expect(row('grandchild')).toBeVisible()

    // Visiting another collection must not replace the saved expanded IDs.
    await page.goto('/admin/collections/tabbed-pages')
    await expect(page.locator('.pages-hierarchy-cell__toggle[aria-expanded="false"]')).toHaveCount(0)
    await page.goto(listURL)
    await expect(row('grandchild')).toBeVisible()

    const otherUser = { email: `${suffix}@example.com`, password: 'Tree-state-test-123!' }
    const createdUser = await page.request.post('/api/users', { data: otherUser })
    expect(createdUser.ok()).toBe(true)
    otherUserID = (await createdUser.json()).doc.id
    const login = await page.request.post('/api/users/login', { data: otherUser })
    expect(login.ok()).toBe(true)
    await page.goto(listURL)
    await expect(page.locator('[id^="DndDescribedBy-"]')).toBeAttached()
    await expect(row('grandchild')).toBeVisible()
    await toggle('root').click()
    await page.reload()
    await expect(toggle('root')).toHaveAttribute('aria-expanded', 'false')
    await expect(row('child')).toHaveCount(0)
    await loginAsSeedUser(page)
    await page.goto(listURL)
    await expect(row('grandchild')).toBeVisible()

    const storageKey = await page.evaluate((rootID) => Object.keys(localStorage).find((key) =>
      key.startsWith('payload-page-tree:expanded:') &&
      JSON.parse(localStorage.getItem(key)!).includes(rootID),
    ), ids[0])
    expect(storageKey).toBeTruthy()
    for (const invalid of ['invalid JSON', '{}', '[null, {}]']) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey!, value: invalid })
      await page.reload()
      await expect(page.locator('[id^="DndDescribedBy-"]')).toBeAttached()
      await expect(row('grandchild')).toBeVisible()
      await toggle('child').click()
      await expect(row('grandchild')).toHaveCount(0)
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(JSON.stringify([ids[0]]))
    }
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem
      const setItem = Storage.prototype.setItem
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('payload-page-tree:expanded:')) {
          throw new Error('Storage disabled')
        }
        return getItem.call(this, key)
      }
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('payload-page-tree:expanded:')) {
          throw new Error('Storage full')
        }
        return setItem.call(this, key, value)
      }
    })
    await page.reload()
    await expect(page.locator('[id^="DndDescribedBy-"]')).toBeAttached()
    await expect(row('grandchild')).toBeVisible()
    await toggle('root').click()
    await expect(row('child')).toHaveCount(0)
  } finally {
    await loginAsSeedUser(page)
    for (const id of ids.reverse()) {
      await page.request.delete(`/api/pages/${id}`)
    }
    if (otherUserID) {
      await page.request.delete(`/api/users/${otherUserID}`)
    }
  }
})

test('renders the seeded pages tree with the expected columns and mixed statuses', async ({
  page,
}) => {
  await loginAsSeedUser(page)
  await page.goto('/admin')
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/next/seed') && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'seed the database' }).click(),
  ])
  await page.goto('/admin/collections/pages?sort=_order&locale=en')

  await expect(page).toHaveURL(/\/admin\/collections\/pages/)
  await expect(page.locator('.pages-hierarchy-table')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator('.pages-hierarchy-cell__drag-handle').first()).toBeVisible()
  await expect(page.locator('.pages-hierarchy-cell__toggle').first()).toBeVisible()
  await expandAllRows(page)
  await expect(page.locator('[data-page-tree-row="true"]')).toHaveCount(30)
  await expect(
    page.locator('.pages-hierarchy-table tbody tr').filter({
      hasText: 'Careers',
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

test('status badge links split live navigation from the Preview icon', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await loginAsSeedUser(page)
  const suffix = `status-links-${Date.now()}`
  const ids: string[] = []
  await context.route('https://*.example.com/**', (route) => route.fulfill({ body: 'Destination' }))
  try {
    for (const kind of ['both', 'public-only', 'published', 'draft']) {
      const slug = `${suffix}-${kind}`
      const created = await page.request.post('/api/pages?locale=en', {
        data: { slug, _status: kind === 'draft' ? 'draft' : 'published', title: slug },
      })
      expect(created.ok()).toBe(true)
      const { doc } = await created.json()
      ids.push(String(doc.id))
      if (!['draft', 'published'].includes(kind)) {
        const updated = await page.request.patch(`/api/pages/${doc.id}?draft=true&locale=en`, {
          data: { slug: `${slug}-edited`, _status: 'draft' },
        })
        expect(updated.ok()).toBe(true)
      }
    }
    await page.goto(`/admin/collections/pages?search=${suffix}`)
    const row = (kind: string) =>
      page.locator('.pages-hierarchy-table tbody tr').filter({ hasText: `${suffix}-${kind}` })
    const badge = row('both').locator('.pages-hierarchy-status-badge')
    const live = badge.locator('a.pages-hierarchy-status-badge__body')
    const preview = badge.getByRole('link', { name: 'Preview', exact: true })
    await expect(live).toHaveAttribute('href', `https://www.example.com/${suffix}-both`)
    await expect(live).toHaveAttribute('target', '_blank')
    await expect(live).toHaveAttribute('title', 'Live (Open in new tab)')
    const liveTab = page.waitForEvent('popup')
    await live.click()
    await (await liveTab).close()
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute(
      'href',
      `https://preview.example.com/${suffix}-both-edited`,
    )
    await expect(preview).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(preview).toHaveAttribute('target', '_blank')
    await expect(preview).toHaveAttribute('title', 'Preview (Open in new tab)')
    await expect(preview.locator('.icon--eye')).toBeVisible()
    await expect(badge.getByRole('button')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('changed-preview-external-link.png') })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.screenshot({ path: testInfo.outputPath('changed-preview-external-link-dark.png') })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    const previewTab = page.waitForEvent('popup')
    await preview.click()
    await (await previewTab).close()

    await expect(
      row('public-only').getByRole('link', { name: 'Preview', exact: true }),
    ).toHaveCount(0)
    await expect(row('public-only').locator('a.pages-hierarchy-status-badge')).toHaveCount(1)
    await expect(row('published').locator('a.pages-hierarchy-status-badge')).toHaveAttribute(
      'href',
      `https://www.example.com/${suffix}-published`,
    )
    await expect(row('published').locator('a.pages-hierarchy-status-badge')).toHaveAttribute(
      'title',
      'Live (Open in new tab)',
    )
    await expect(row('draft').locator('a.pages-hierarchy-status-badge')).toHaveAttribute(
      'href',
      `https://preview.example.com/${suffix}-draft`,
    )
    await expect(row('draft').locator('a.pages-hierarchy-status-badge')).toHaveAttribute(
      'title',
      'Preview (Open in new tab)',
    )
    await live.focus()
    await page.keyboard.press('Tab')
    await expect(preview).toBeFocused()
    const keyboardTab = page.waitForEvent('popup')
    await page.keyboard.press('Enter')
    await (await keyboardTab).close()
    await expect(page).toHaveURL(new RegExp(`/admin/collections/pages\\?search=${suffix}`))
    await page.setViewportSize({ height: 844, width: 390 })
    await preview.scrollIntoViewIfNeeded()
    await expect(preview).toBeVisible()
    const previewBounds = await preview.boundingBox()
    expect(previewBounds!.x).toBeGreaterThanOrEqual(0)
    expect(previewBounds!.x + previewBounds!.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: testInfo.outputPath('changed-preview-external-link-mobile.png') })
  } finally {
    for (const id of ids) {
      await page.request.delete(`/api/pages/${id}`)
    }
  }
})

test('the Seed button populates shared and localized status collections', async ({ page }) => {
  test.setTimeout(90_000)
  await loginAsSeedUser(page)
  await page.goto('/admin')
  const seeded = page.waitForResponse(
    (response) => response.url().includes('/next/seed') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'seed the database' }).click()
  expect((await seeded).ok()).toBe(true)
  await expect(page.getByRole('link', { name: 'localized pages collection' })).toBeVisible()

  await page.goto('/admin/collections/pages?locale=en')
  await expect(page.locator('.pages-hierarchy-table')).toBeVisible()
  await expandAllRows(page)
  await expect(page.locator('[data-page-tree-row="true"]')).toHaveCount(30)
  await expect(page.locator('.pages-hierarchy-locale-statuses')).toHaveCount(0)
  await expect(page.getByText('<No Title>', { exact: true })).toHaveCount(0)

  await page.goto('/admin/collections/tabbed-pages?locale=fr')
  await expect(page.locator('.pages-hierarchy-table')).toBeVisible()
  await expandAllRows(page)
  await expect(page.locator('[data-page-tree-row="true"]')).toHaveCount(30)
  await expect(page.getByText('<No Title>', { exact: true })).toHaveCount(0)

  await page.goto('/admin/collections/localized-pages?locale=en')
  await expect(page.locator('.pages-hierarchy-table')).toBeVisible()
  await expandAllRows(page)
  await expect(page.locator('[data-page-tree-row="true"]')).toHaveCount(30)
  await expect(page.locator('.pages-hierarchy-locale-statuses')).toHaveCount(30)
  const careers = page.locator('[data-page-tree-row="true"]').filter({ hasText: 'Careers' })
  await expect(careers.locator('[data-locale="en"]')).toHaveAttribute('data-status', 'published')
  await expect(careers.locator('[data-locale="en"]')).toHaveAttribute('data-active', 'true')
  await expect(careers.locator('[data-locale="de"]')).toHaveAttribute('data-status', 'changed')
  await expect(careers.locator('[data-locale="de"]')).toHaveText('DE')
  await expect(careers.locator('.pages-hierarchy-locale-status-badge__code')).toHaveText(['EN', 'FR', 'DE'])
  await expect(careers.locator('[data-locale="fr"]')).toHaveAttribute('data-status', 'draft')
  await expect(page.locator('.pages-hierarchy-locale-statuses svg')).toHaveCount(0)
  await expect(page.locator('.pages-hierarchy-locale-statuses [title]')).toHaveCount(0)

  await page.goto('/admin/collections/localized-pages?locale=de')
  const germanCareers = page.locator('[data-page-tree-row="true"]').filter({ hasText: 'Careers' })
  await expect(germanCareers.locator('[data-locale="de"]')).toHaveAttribute('data-active', 'true')
  await expect(germanCareers.locator('[data-locale="de"] .pages-hierarchy-locale-status-badge__label')).toBeVisible()
  await expect(germanCareers.locator('[data-locale="en"]')).toHaveText('EN')

  for (const locale of ['en', 'fr', 'de']) {
    await page.goto('/admin/collections/localized-pages?locale=' + locale)
    const groups = page.locator('.pages-hierarchy-locale-statuses')
    await expect(groups).toHaveCount(30)
    const positions = await groups.evaluateAll((elements) => elements.map((element) =>
      Array.from(element.querySelectorAll('.pages-hierarchy-locale-status-badge')).map((badge) => {
        const { height, width, x, y } = badge.getBoundingClientRect()
        return { height, width, x, y }
      }),
    ))
    for (const row of positions) {
      expect(row).toHaveLength(3)
      for (let index = 0; index < row.length; index++) {
        expect(Math.abs(row[index].y - row[0].y)).toBeLessThan(1)
        expect(Math.abs(row[index].x - positions[0][index].x)).toBeLessThan(1)
        if (index > 0) {
          expect(row[index].x).toBeGreaterThanOrEqual(row[index - 1].x + row[index - 1].width)
        }
      }
    }
  }
  await page.screenshot({ fullPage: true, path: 'test-results/locale-badge-alignment.png' })
})
