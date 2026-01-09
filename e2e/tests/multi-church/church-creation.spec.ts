/**
 * Focused test for church creation functionality
 * Tests the core user_profile fix in isolation
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount } from '../../helpers/temp-email'
import { signUpAndConfirm } from '../../helpers/auth-helpers'

test.describe('Church Creation', () => {
  test('user can create a church after signup', async ({ page }) => {
    test.setTimeout(300000) // 5 minutes for slow internet

    // Sign up and create a church
    const userMail = await createTempEmailAccount()
    await signUpAndConfirm(page, userMail, 'TestPass123!')

    // Should be on setup-church page
    const currentUrl = page.url()
    expect(currentUrl).toContain('/setup-church')

    console.log('[Test] Creating church...')
    const churchNameInput = page.locator('input#churchName')
    const submitButton = page.locator('button[type="submit"]')

    await churchNameInput.fill('Test Church')
    await submitButton.click()

    // Wait for redirect to dashboard with increased timeout
    await page.waitForURL(/\/dashboard/, { timeout: 30000 })
    console.log('[Test] ✓ Church created successfully, redirected to dashboard')

    // Verify we're actually on dashboard
    await expect(page.locator('h1')).toBeVisible()
  })
})
