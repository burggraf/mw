/**
 * E2E tests for Team UI components (no email required)
 * These tests verify the UI renders correctly
 */

import { test, expect } from '@playwright/test'

test.describe('Team UI', () => {
  test.beforeEach(async ({ page }) => {
    // Go to team page - will redirect to login if not authenticated
    await page.goto('/team')
  })

  test('redirects to login when not authenticated', async ({ page }) => {
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/login')
  })

  test('login page has correct elements', async ({ page }) => {
    await page.waitForURL(/\/login/, { timeout: 10000 })

    // Check login form elements exist
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // Check Google sign-in button exists
    await expect(page.getByText(/Google/)).toBeVisible()
  })

  test('signup page has correct elements', async ({ page }) => {
    await page.goto('/signup')

    // Check signup form elements exist
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.locator('input#confirmPassword')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('accept-invite page shows error without token', async ({ page }) => {
    await page.goto('/accept-invite')

    // Should show error about missing token
    await expect(page.getByText('Invalid Invitation')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('No invitation token provided')).toBeVisible()
  })

  test('accept-invite page shows error with invalid token', async ({ page }) => {
    await page.goto('/accept-invite?token=invalid-token-12345')

    // Should show error about invalid invitation
    await expect(page.getByText('Invalid Invitation')).toBeVisible({ timeout: 10000 })
  })
})
