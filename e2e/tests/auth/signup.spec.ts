/**
 * E2E tests for email/password signup flow
 */

import { test, expect } from '@playwright/test'
import {
  createTempEmailAccount,
  waitForEmail,
  extractConfirmationLink,
} from '../../helpers/temp-email'

test.describe('Email/Password Signup Flow', () => {
  test('should complete full signup flow with email confirmation', async ({ page }) => {
    // Step 1: Create temp email account
    const mailAccount = await createTempEmailAccount()
    const testPassword = 'SecurePassword123!'

    console.log(`\n=== Starting signup test with ${mailAccount.address} ===\n`)

    // Step 2: Navigate to signup page
    await page.goto('/signup')
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    console.log('Signup page loaded, current URL:', page.url())

    // Step 3: Fill in signup form
    await page.fill('input[type="email"]', mailAccount.address)
    await page.fill('input#password', testPassword)
    await page.fill('input#confirmPassword', testPassword)

    // Step 4: Submit form
    console.log('Submitting signup form...')
    await page.click('button[type="submit"]')

    // Step 5: Wait for "check your email" message
    await expect(page.getByText(/check your email|confirm/i)).toBeVisible({
      timeout: 10000,
    })
    console.log('Signup submitted, waiting for confirmation email...')

    // Step 6: Wait for confirmation email
    const confirmEmail = await waitForEmail(mailAccount, 'confirm', 60000)
    const confirmLink = extractConfirmationLink(confirmEmail)
    console.log(`Confirmation link: ${confirmLink}`)

    // Step 7: Visit confirmation link
    console.log('Visiting confirmation link...')
    await page.goto(confirmLink)

    // Step 8: Wait for redirect (either to dashboard or setup-church)
    console.log('Waiting for redirect after email confirmation...')

    let attempts = 0
    const maxAttempts = 30
    while (attempts < maxAttempts) {
      const url = page.url()
      console.log(`Current URL (attempt ${attempts + 1}): ${url}`)

      if (url.includes('/dashboard') || url.includes('/setup-church')) {
        console.log(`SUCCESS: Redirected to ${url}`)
        break
      }

      if (url.includes('/login') && attempts > 5) {
        await page.screenshot({ path: 'e2e/screenshots/login-redirect-error.png' })
        throw new Error('Incorrectly redirected to login page')
      }

      await page.waitForTimeout(1000)
      attempts++
    }

    if (attempts >= maxAttempts) {
      await page.screenshot({ path: 'e2e/screenshots/timeout-error.png' })
      throw new Error(`Timeout waiting for redirect. Final URL: ${page.url()}`)
    }

    // Step 9: Verify we landed on the right page
    const finalUrl = page.url()
    expect(finalUrl).toMatch(/\/(dashboard|setup-church)/)
    console.log(`\n=== Test completed successfully! Final URL: ${finalUrl} ===\n`)
  })

  test('should show error for password mismatch', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })

    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input#password', 'Password123!')
    await page.fill('input#confirmPassword', 'DifferentPassword123!')

    await page.click('button[type="submit"]')

    // Should show password mismatch error
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({
      timeout: 5000,
    })
  })

  test('should show error for short password', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })

    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input#password', 'short')
    await page.fill('input#confirmPassword', 'short')

    await page.click('button[type="submit"]')

    // Should show password length error
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible({
      timeout: 5000,
    })
  })

  test('should redirect to login if already have account', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })

    // Click the "Sign In" link
    await page.click('a:has-text("Sign In")')

    // Should be on login page
    await expect(page).toHaveURL(/\/login/)
  })
})
