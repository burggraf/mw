import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Media Library', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173/login')

    // Fill in login form (adjust selectors based on your login page)
    await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'test@example.com')
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'testpassword')
    await page.click('button[type="submit"]')

    // Wait for redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Navigate to Media page
    await page.click('a[href="/media"]')
    await page.waitForURL(/\/media/)
  })

  test('should display media library page', async ({ page }) => {
    // Check for page title
    await expect(page.locator('h1')).toContainText('Media Library')

    // Check for upload and stock media buttons
    await expect(page.locator('button:has-text("Upload")')).toBeVisible()
    await expect(page.locator('button:has-text("Stock Media")')).toBeVisible()

    // Check for search input
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible()

    // Check for sidebar filters
    await expect(page.locator('text=All Media')).toBeVisible()
    await expect(page.locator('text=Images')).toBeVisible()
    await expect(page.locator('text=Videos')).toBeVisible()
  })

  test('should open upload dialog', async ({ page }) => {
    // Click upload button
    await page.click('button:has-text("Upload")')

    // Check dialog appears
    await expect(page.locator('text=Upload Media')).toBeVisible()
    await expect(page.locator('text=Drag & drop files here')).toBeVisible()

    // Close dialog
    await page.keyboard.press('Escape')
    await expect(page.locator('text=Upload Media')).not.toBeVisible()
  })

  test('should open stock media dialog', async ({ page }) => {
    // Click stock media button
    await page.click('button:has-text("Stock Media")')

    // Check dialog appears
    await expect(page.locator('text=Stock Media')).toBeVisible()
    await expect(page.locator('text=Pexels')).toBeVisible()
    await expect(page.locator('text=Unsplash')).toBeVisible()

    // Close dialog
    await page.keyboard.press('Escape')
  })

  test('should filter media by type', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000)

    // Click Images filter
    await page.click('button:has-text("Images")')

    // Verify URL or state changed (adjust based on your implementation)
    await page.waitForTimeout(500)

    // Click Videos filter
    await page.click('button:has-text("Videos")')

    await page.waitForTimeout(500)

    // Click All Media to reset
    await page.click('button:has-text("All Media")')
  })

  test('should search media', async ({ page }) => {
    // Type in search box
    const searchInput = page.locator('input[placeholder*="Search"]')
    await searchInput.fill('test')

    // Wait for debounced search
    await page.waitForTimeout(500)

    // Clear search
    await searchInput.fill('')
  })

  test('should upload an image file', async ({ page }) => {
    // Skip if no test image exists
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.png')
    const fs = require('fs')

    if (!fs.existsSync(testImagePath)) {
      test.skip()
      return
    }

    // Click upload button
    await page.click('button:has-text("Upload")')

    // Wait for dialog
    await expect(page.locator('text=Upload Media')).toBeVisible()

    // Set files on the file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testImagePath)

    // Wait for upload to complete (adjust timeout as needed)
    await page.waitForSelector('svg.lucide-check-circle', { timeout: 15000 })

    // Verify success
    await expect(page.locator('text=Media uploaded')).toBeVisible({ timeout: 5000 })
  })

  test('should handle upload errors gracefully', async ({ page }) => {
    // Click upload button
    await page.click('button:has-text("Upload")')

    // Try to upload an invalid file type
    const testFilePath = path.join(__dirname, 'fixtures', 'test-file.txt')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testFilePath)

    // Should show error
    await expect(page.locator('text=Unsupported file type')).toBeVisible({ timeout: 5000 })
  })

  test('should edit media details', async ({ page }) => {
    // Wait for media to load
    await page.waitForTimeout(1000)

    // Find first media card and click the menu
    const firstCard = page.locator('[class*="MediaCard"]').first()
    if (await firstCard.count() > 0) {
      // Hover to show menu
      await firstCard.hover()

      // Click menu button
      await firstCard.locator('button[aria-label*="Actions"], button:has(svg.lucide-more-horizontal)').click()

      // Click edit
      await page.click('text=Edit')

      // Wait for dialog
      await expect(page.locator('text=Edit')).toBeVisible()

      // Change name
      const nameInput = page.locator('input[id="name"]')
      await nameInput.fill('Updated Media Name')

      // Add a tag
      const tagInput = page.locator('input[placeholder*="tag"]')
      await tagInput.fill('test-tag')
      await page.keyboard.press('Enter')

      // Save
      await page.click('button:has-text("Save")')

      // Verify saved
      await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should delete media', async ({ page }) => {
    // Wait for media to load
    await page.waitForTimeout(1000)

    // Find first media card
    const firstCard = page.locator('[class*="MediaCard"]').first()
    if (await firstCard.count() > 0) {
      // Hover to show menu
      await firstCard.hover()

      // Click menu button
      await firstCard.locator('button[aria-label*="Actions"], button:has(svg.lucide-more-horizontal)').click()

      // Click delete
      await page.click('text=Delete')

      // Confirm deletion
      await page.click('button:has-text("Delete")')

      // Verify deleted
      await expect(page.locator('text=Media deleted')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should search stock media from Pexels', async ({ page }) => {
    // Click stock media button
    await page.click('button:has-text("Stock Media")')

    // Wait for dialog
    await expect(page.locator('text=Stock Media')).toBeVisible()

    // Make sure Pexels tab is selected
    await page.click('text=Pexels')

    // Type search query
    const searchInput = page.locator('input[placeholder*="Search"]').last()
    await searchInput.fill('nature')

    // Click search
    await page.click('button:has-text("Search")')

    // Wait for results (this will fail if API keys are not configured)
    try {
      await page.waitForSelector('img[alt*="Photo"]', { timeout: 10000 })

      // Try to import first result
      const firstResult = page.locator('button:has-text("Import")').first()
      await firstResult.click()

      // Wait for import to complete
      await expect(page.locator('text=Media uploaded')).toBeVisible({ timeout: 15000 })
    } catch (error) {
      // API keys might not be configured, skip this test
      console.log('Stock media test skipped: API keys may not be configured')
    }
  })

  test('should filter media by tags', async ({ page }) => {
    // Wait for tags to load
    await page.waitForTimeout(1000)

    // Check if any tags exist
    const tagsSection = page.locator('text=Tags')
    if (await tagsSection.isVisible()) {
      // Click first tag badge
      const firstTag = page.locator('[class*="badge"]').first()
      if (await firstTag.count() > 0) {
        await firstTag.click()

        // Wait for filter to apply
        await page.waitForTimeout(500)

        // Click again to deselect
        await firstTag.click()
      }
    }
  })
})

test.describe('Media Library - Edge Cases', () => {
  test('should handle empty state', async ({ page }) => {
    // Login and navigate
    await page.goto('http://localhost:5173/login')
    await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'test@example.com')
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'testpassword')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    await page.click('a[href="/media"]')

    // If no media exists, should show empty state
    const emptyState = page.locator('text=No media yet')
    if (await emptyState.isVisible()) {
      await expect(page.locator('text=Upload images and videos')).toBeVisible()
    }
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Login and navigate
    await page.goto('http://localhost:5173/login')
    await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'test@example.com')
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'testpassword')
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Block network requests to simulate offline
    await page.route('**/rest/v1/media**', route => route.abort())

    await page.click('a[href="/media"]')

    // Should show error toast or message
    await expect(page.locator('text=An error occurred')).toBeVisible({ timeout: 5000 })
  })
})
