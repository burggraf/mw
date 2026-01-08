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
  await page.waitForLoadState('domcontentloaded')

  // Use locators for better retry behavior when React re-renders
  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input#password')
  const confirmPasswordInput = page.locator('input#confirmPassword')
  const submitButton = page.locator('button[type="submit"]')

  await emailInput.waitFor({ state: 'visible', timeout: 15000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)
  await confirmPasswordInput.fill(password)

  console.log('Submitting signup form...')

  // Click and wait for "check your email" message (increased timeout for slow internet)
  await Promise.all([
    expect(page.getByText(/check your email|confirm/i)).toBeVisible({ timeout: 15000 }),
    submitButton.click(),
  ])

  // Check if we got redirected (email verification disabled)
  const currentUrl = page.url()
  if (currentUrl.includes('/dashboard') || currentUrl.includes('/setup-church')) {
    console.log('[signUp] Email verification disabled - user already logged in')
  } else {
    console.log('Signup submitted successfully')
  }
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
  // Increased timeout for slow internet
  const confirmEmail = await waitForEmail(mailAccount, 'confirm', 90000)
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
  // Wait for page to be ready (not necessarily networkidle, just DOM loaded)
  await page.waitForLoadState('domcontentloaded')

  // Check if we were redirected away from login (user already logged in)
  const currentUrl = page.url()
  if (!currentUrl.includes('/login')) {
    console.log(`Already authenticated, redirected to: ${currentUrl}`)
    // Sign out first, then sign in as the requested user
    await signOut(page)
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
  }

  // Use locators for better retry behavior when React re-renders
  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input#password')
  const submitButton = page.locator('button[type="submit"]')

  await emailInput.waitFor({ state: 'visible', timeout: 15000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)

  console.log('Submitting login form...')

  // Click and wait for navigation to start (increased timeout for slow internet)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 }),
    submitButton.click(),
  ])

  // Wait for redirect away from login
  await waitForAuthRedirect(page)
}

/**
 * Create a church on the setup-church page
 */
export async function createChurch(page: Page, churchName: string): Promise<void> {
  const churchNameInput = page.locator('input#churchName')
  const submitButton = page.locator('button[type="submit"]')

  await churchNameInput.waitFor({ state: 'visible', timeout: 5000 })

  // Fill the input and dispatch change event to trigger React's onChange
  await churchNameInput.fill(churchName)
  await churchNameInput.dispatchEvent('input')
  await churchNameInput.dispatchEvent('change')

  // Click submit button
  await submitButton.click()

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15000 })
  console.log(`Church created: ${churchName}`)
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
  await page.waitForLoadState('networkidle')

  // Use locators for better retry behavior when React re-renders
  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input#password')
  const submitButton = page.locator('button[type="submit"]')

  await emailInput.waitFor({ state: 'visible', timeout: 10000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)

  console.log('Submitting login form with redirect...')
  await submitButton.click()
}

/**
 * Wait for authentication redirect (dashboard or setup-church)
 */
export async function waitForAuthRedirect(
  page: Page,
  timeoutMs = 30000
): Promise<string> {
  console.log('Waiting for auth redirect...')

  try {
    // Use Playwright's built-in URL matching with polling
    await page.waitForURL(
      (url) => {
        const path = url.pathname
        return path.includes('/dashboard') || path.includes('/setup-church') || path.includes('/team')
      },
      { timeout: timeoutMs }
    )

    const finalUrl = page.url()
    console.log(`Redirected to: ${finalUrl}`)
    return finalUrl
  } catch (error) {
    const currentUrl = page.url()
    console.log(`Auth redirect failed. Current URL: ${currentUrl}`)

    if (currentUrl.includes('/login')) {
      await page.screenshot({ path: 'e2e/screenshots/login-redirect-error.png' })
      throw new Error('Incorrectly redirected back to login page')
    }

    await page.screenshot({ path: 'e2e/screenshots/auth-redirect-timeout.png' })
    throw new Error(`Timeout waiting for auth redirect. Final URL: ${currentUrl}`)
  }
}

/**
 * Sign out the current user
 */
export async function signOut(page: Page): Promise<void> {
  // Navigate to a page with the sidebar first
  const currentUrl = page.url()
  if (!currentUrl.includes('/dashboard') && !currentUrl.includes('/team') && !currentUrl.includes('/setup-church')) {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  }

  // Open user dropdown in sidebar
  const userMenu = page.locator('[data-testid="user-menu"]')
  await userMenu.waitFor({ state: 'visible', timeout: 10000 })
  await userMenu.click()

  const signOutButton = page.locator('text=Sign Out')
  await signOutButton.waitFor({ state: 'visible', timeout: 5000 })
  await signOutButton.click()

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
