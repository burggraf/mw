/**
 * Invitation flow helpers for E2E testing
 */

import { Page, expect } from '@playwright/test'
import { MailTmAccount, waitForEmail, extractInvitationLink } from './mail-tm'

/**
 * Accept an invitation as an already logged-in user
 */
export async function acceptInvitationLoggedIn(
  page: Page,
  inviteToken: string
): Promise<void> {
  await page.goto(`/accept-invite?token=${inviteToken}`)

  // Wait for invitation details to load
  await page.waitForSelector('[data-testid="invitation-details"]', { timeout: 10000 })

  // Click accept button
  await page.click('button:has-text("Accept Invitation")')

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
  console.log('Invitation accepted, redirected to dashboard')
}

/**
 * Accept invitation from email link (new user - not logged in)
 */
export async function acceptInvitationFromEmail(
  page: Page,
  mailAccount: MailTmAccount,
  password: string
): Promise<void> {
  console.log('Waiting for invitation email...')
  const inviteEmail = await waitForEmail(mailAccount.token, 'invited', 60000)
  const inviteLink = extractInvitationLink(inviteEmail)

  console.log(`Visiting invitation link: ${inviteLink}`)
  await page.goto(inviteLink)

  // Should be redirected to signup with invitation context
  await page.waitForURL(/\/signup\?/, { timeout: 10000 })

  // Fill signup form
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  // Email should be prefilled
  const emailValue = await page.inputValue('input[type="email"]')
  expect(emailValue).toBe(mailAccount.address)

  await page.fill('input#password', password)
  await page.fill('input#confirmPassword', password)

  await page.click('button[type="submit"]')

  // Wait for "check your email" message
  await expect(page.getByText(/check your email|confirm/i)).toBeVisible({
    timeout: 10000,
  })
}

/**
 * Accept invitation from email link (existing user - not logged in)
 */
export async function acceptInvitationExistingUser(
  page: Page,
  mailAccount: MailTmAccount,
  password: string
): Promise<void> {
  console.log('Waiting for invitation email...')
  const inviteEmail = await waitForEmail(mailAccount.token, 'invited', 60000)
  const inviteLink = extractInvitationLink(inviteEmail)

  console.log(`Visiting invitation link: ${inviteLink}`)
  await page.goto(inviteLink)

  // Should be redirected to login
  await page.waitForURL(/\/login\?/, { timeout: 10000 })

  // Fill login form
  await page.fill('input[type="email"]', mailAccount.address)
  await page.fill('input#password', password)

  await page.click('button[type="submit"]')

  // Should be redirected back to accept-invite page
  await page.waitForURL(/\/accept-invite/, { timeout: 10000 })

  // Accept the invitation
  await page.waitForSelector('[data-testid="invitation-details"]', { timeout: 10000 })
  await page.click('button:has-text("Accept Invitation")')

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

/**
 * Extract token from invitation URL
 */
export function extractTokenFromUrl(url: string): string {
  const urlObj = new URL(url)
  const token = urlObj.searchParams.get('token')
  if (!token) {
    throw new Error(`No token found in URL: ${url}`)
  }
  return token
}

/**
 * Verify invitation page shows correct details
 */
export async function verifyInvitationDetails(
  page: Page,
  expectedChurchName: string,
  expectedRole: string
): Promise<void> {
  await expect(page.getByText(expectedChurchName)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(new RegExp(expectedRole, 'i'))).toBeVisible({ timeout: 5000 })
}

/**
 * Verify invitation is expired
 */
export async function verifyInvitationExpired(page: Page): Promise<void> {
  await expect(page.getByText(/expired/i)).toBeVisible({ timeout: 5000 })
}

/**
 * Verify invitation is already accepted
 */
export async function verifyInvitationAlreadyAccepted(page: Page): Promise<void> {
  await expect(page.getByText(/already.*accepted/i)).toBeVisible({ timeout: 5000 })
}

/**
 * Verify email mismatch error
 */
export async function verifyEmailMismatch(page: Page): Promise<void> {
  await expect(page.getByText(/different.*email|email.*doesn't match/i)).toBeVisible({
    timeout: 5000,
  })
}
