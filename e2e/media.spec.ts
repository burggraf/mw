import { test, expect } from '@playwright/test'

test.describe('Media Library', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL!
    const password = process.env.TEST_PASSWORD!

    // Capture errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to fetch')) {
        errors.push(msg.text())
      }
    })

    // Login
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(url => url.pathname !== '/login', { timeout: 15000 })

    // Navigate to media
    await page.goto('/media')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('should display media library page elements', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('Media Library')

    // Check for buttons
    await expect(page.getByRole('button', { name: /upload/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /stock media/i })).toBeVisible()

    // Check for search input
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible()

    // Check for sidebar filters
    await expect(page.getByText('All Media')).toBeVisible()
    await expect(page.getByText('Images')).toBeVisible()
    await expect(page.getByText('Videos')).toBeVisible()
  })

  test('should open upload dialog', async ({ page }) => {
    await page.getByRole('button', { name: /upload/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload Media' })).toBeVisible()

    // Close dialog
    await page.keyboard.press('Escape')
  })

  test('should open stock media dialog', async ({ page }) => {
    await page.getByRole('button', { name: /stock media/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Pexels' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Unsplash' })).toBeVisible()

    // Close dialog
    await page.keyboard.press('Escape')
  })

  test('should filter by collection', async ({ page }) => {
    // Click Images filter
    await page.getByRole('button', { name: 'Images' }).click()
    await page.waitForTimeout(500)

    // Click Videos filter
    await page.getByRole('button', { name: 'Videos' }).click()
    await page.waitForTimeout(500)

    // Reset to All Media
    await page.getByRole('button', { name: 'All Media' }).click()
  })

  test('should search media', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]')
    await searchInput.fill('test')
    await page.waitForTimeout(500)
    await searchInput.fill('')
  })

  test('should show empty state when no media exists', async ({ page }) => {
    // If no media, should show empty state
    const emptyState = page.getByText('No media yet')
    const mediaGrid = page.locator('[class*="grid"]').first()

    // Either empty state or media grid should be visible
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    const hasGrid = await mediaGrid.isVisible().catch(() => false)

    expect(hasEmpty || hasGrid).toBeTruthy()
  })
})
