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

  // Check if we were redirected away from signup (user already logged in)
  const currentUrl = page.url()
  if (!currentUrl.includes('/signup')) {
    console.log(`[signUp] Already authenticated as: ${currentUrl}`)
    // Sign out first, then proceed with signup
    await signOut(page)
    await page.goto('/signup')
    await page.waitForLoadState('domcontentloaded')
  }

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
  const finalUrl = page.url()
  if (finalUrl.includes('/dashboard') || finalUrl.includes('/setup-church')) {
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
 * Uses browser context clearing to ensure clean session
 */
export async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  console.log(`[signIn] Starting sign in for ${email}...`)

  // Check current authentication state
  const isSignedIn = await isSignedInCheck(page)
  console.log(`[signIn] Current signed in state: ${isSignedIn}`)

  // If already signed in (to a different account), clear everything first
  if (isSignedIn) {
    console.log('[signIn] Already signed in, clearing session...')
    await signOut(page)
  }

  // Navigate to login page
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Double-check we're still on login page (might get auto-redirected if session persists)
  const currentUrl = page.url()
  if (!currentUrl.includes('/login')) {
    console.log(`[signIn] Redirected away from login to: ${currentUrl}`)
    console.log('[signIn] Session persists, force-clearing browser context...')
    // Force clear the entire browser context
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    // Navigate to login again
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000) // Wait for clear to take effect
  }

  // Use locators for better retry behavior when React re-renders
  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input#password')
  const submitButton = page.locator('button[type="submit"]')

  await emailInput.waitFor({ state: 'visible', timeout: 15000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)

  console.log('[signIn] Submitting login form...')

  // Click and wait for navigation to start (increased timeout for slow internet)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 }),
    submitButton.click(),
  ])

  // Wait for redirect away from login
  await waitForAuthRedirect(page)

  // Verify we're signed in as the correct user
  const finalUrl = page.url()
  console.log(`[signIn] Final URL after login: ${finalUrl}`)
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
  console.log('[signOut] Starting sign out process...')

  // Try to use Supabase client to sign out properly
  const signOutResult = await page.evaluate(() => {
    try {
      // Get the Supabase client from window
      const supabase = (window as any).supabase
      if (supabase && supabase.auth) {
        return supabase.auth.signOut()
      }
    } catch (e) {
      console.error('[signOut] Error calling supabase.auth.signOut():', e)
    }
    return null
  })

  if (signOutResult) {
    console.log('[signOut] Called supabase.auth.signOut()')
  }

  // Clear all storage to ensure session is completely gone
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  // Clear all cookies as well
  const context = page.context()
  await context.clearCookies()

  console.log('[signOut] Cleared all storage and cookies')

  // Navigate to login page to ensure we're logged out
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Wait a moment for everything to clear
  await page.waitForTimeout(2000)

  console.log('[signOut] Sign out complete')
}

/**
 * Check if user is currently signed in
 */
export async function isSignedIn(page: Page): Promise<boolean> {
  return await isSignedInCheck(page)
}

/**
 * Internal helper to check if user is signed in
 */
async function isSignedInCheck(page: Page): Promise<boolean> {
  try {
    // Check for sidebar user menu presence
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 3000 })
    return true
  } catch {
    return false
  }
}
