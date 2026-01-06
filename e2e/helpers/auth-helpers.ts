/**
 * Auth page object helpers for E2E testing
 */

import { Page, expect } from '@playwright/test'
import { TempEmailAccount, waitForEmail, extractConfirmationLink } from './temp-email'

export interface TestUser {
  email: string
  password: string
  mailAccount: TempEmailAccount
}

/**
 * Sign up a new user with email/password
 */
export async function signUp(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/signup')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  await page.fill('input[type="email"]', email)
  await page.fill('input#password', password)
  await page.fill('input#confirmPassword', password)

  console.log('Submitting signup form...')
  await page.click('button[type="submit"]')

  // Wait for "check your email" message
  await expect(page.getByText(/check your email|confirm/i)).toBeVisible({
    timeout: 10000,
  })
  console.log('Signup submitted successfully')
}

/**
 * Sign up and confirm email
 */
export async function signUpAndConfirm(
  page: Page,
  mailAccount: TempEmailAccount,
  password: string
): Promise<void> {
  await signUp(page, mailAccount.address, password)

  console.log('Waiting for confirmation email...')
  const confirmEmail = await waitForEmail(mailAccount, 'confirm', 60000)
  const confirmLink = extractConfirmationLink(confirmEmail)

  console.log(`Visiting confirmation link: ${confirmLink}`)
  await page.goto(confirmLink)

  // Wait for redirect to dashboard or setup-church
  await waitForAuthRedirect(page)
}

/**
 * Sign in with email/password
 */
export async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  await page.fill('input[type="email"]', email)
  await page.fill('input#password', password)

  console.log('Submitting login form...')
  await page.click('button[type="submit"]')

  // Wait for redirect away from login
  await waitForAuthRedirect(page)
}

/**
 * Sign in with redirect URL
 */
export async function signInWithRedirect(
  page: Page,
  email: string,
  password: string,
  redirectTo: string
): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(redirectTo)}`)
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  await page.fill('input[type="email"]', email)
  await page.fill('input#password', password)

  console.log('Submitting login form with redirect...')
  await page.click('button[type="submit"]')
}

/**
 * Wait for authentication redirect (dashboard or setup-church)
 */
export async function waitForAuthRedirect(
  page: Page,
  timeoutMs = 30000
): Promise<string> {
  console.log('Waiting for auth redirect...')

  let attempts = 0
  const maxAttempts = timeoutMs / 1000

  while (attempts < maxAttempts) {
    const url = page.url()
    console.log(`Current URL (attempt ${attempts + 1}): ${url}`)

    if (url.includes('/dashboard') || url.includes('/setup-church') || url.includes('/team')) {
      console.log(`Redirected to: ${url}`)
      return url
    }

    if (url.includes('/login') && attempts > 5) {
      await page.screenshot({ path: 'e2e/screenshots/login-redirect-error.png' })
      throw new Error('Incorrectly redirected back to login page')
    }

    await page.waitForTimeout(1000)
    attempts++
  }

  await page.screenshot({ path: 'e2e/screenshots/auth-redirect-timeout.png' })
  throw new Error(`Timeout waiting for auth redirect. Final URL: ${page.url()}`)
}

/**
 * Sign out the current user
 */
export async function signOut(page: Page): Promise<void> {
  // Open user dropdown in sidebar
  await page.click('[data-testid="user-menu"]')
  await page.click('text=Sign Out')

  // Wait for redirect to landing or login
  await page.waitForURL(/\/(login)?$/, { timeout: 10000 })
}

/**
 * Check if user is currently signed in
 */
export async function isSignedIn(page: Page): Promise<boolean> {
  try {
    // Check for sidebar user menu presence
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 3000 })
    return true
  } catch {
    return false
  }
}
