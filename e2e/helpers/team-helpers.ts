/**
 * Team page object helpers for E2E testing
 */

import { Page, expect } from '@playwright/test'

export type Role = 'admin' | 'editor' | 'operator'

/**
 * Navigate to team page
 */
export async function goToTeamPage(page: Page): Promise<void> {
  await page.goto('/team')
  // Wait for page to load - look for either Team heading or redirect to login
  await Promise.race([
    page.waitForSelector('h1', { timeout: 10000 }),
    page.waitForURL(/\/login/, { timeout: 10000 }),
  ])

  // If redirected to login, that's an error in the test setup
  if (page.url().includes('/login')) {
    throw new Error('Redirected to login - user not authenticated')
  }

  // Wait for content to load
  await page.waitForTimeout(1000)
}

/**
 * Open invite member dialog
 */
export async function openInviteDialog(page: Page): Promise<void> {
  // Wait for button to appear
  const button = page.locator('button:has-text("Invite Member")')
  await button.waitFor({ state: 'visible', timeout: 10000 })
  await button.click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
}

export interface InviteMemberResult {
  token: string
  inviteLink: string
}

/**
 * Invite a member and return the invitation link
 */
export async function inviteMember(
  page: Page,
  email: string,
  role: Role
): Promise<InviteMemberResult> {
  await openInviteDialog(page)

  await page.fill('input[type="email"]', email)

  // Select role
  await page.click('[data-testid="role-select"]')
  await page.click(`[data-testid="role-option-${role}"]`)

  // Capture the invitation response to get the token
  let invitationToken: string | null = null
  const responseHandler = async (response: any) => {
    const url = response.url()
    if (url.includes('/invitations') && response.request().method() === 'POST') {
      try {
        const body = await response.json().catch(() => null)
        if (body && body.length > 0 && body[0].token) {
          invitationToken = body[0].token
          console.log('Captured invitation token:', invitationToken)
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  page.on('response', responseHandler)

  console.log('Clicking Send Invitation button...')
  await page.click('button:has-text("Send Invitation")')

  // Wait a bit for the request to complete
  await page.waitForTimeout(3000)

  // Remove listener
  page.off('response', responseHandler)

  // Check for error toast
  const errorToast = await page.locator('[data-sonner-toast][data-type="error"]').isVisible().catch(() => false)
  if (errorToast) {
    const errorText = await page.locator('[data-sonner-toast][data-type="error"]').textContent().catch(() => 'unknown')
    console.log('Error toast visible:', errorText)
    throw new Error(`Invitation failed: ${errorText}`)
  }

  // Wait for dialog to close and success message
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 })
  console.log(`Invited ${email} as ${role}`)

  // If we didn't capture the token from response, get it from the invitations tab
  if (!invitationToken) {
    console.log('Token not captured from response, fetching from invitations tab...')
    await goToInvitationsTab(page)

    // Look for the invitation row and get the token from data-token attribute
    const row = page.locator(`[data-testid="invitation-row"]:has-text("${email}")`)
    await row.waitFor({ state: 'visible', timeout: 10000 })
    const tokenAttr = await row.getAttribute('data-token')

    if (tokenAttr) {
      invitationToken = tokenAttr
      console.log('Got token from data-token attribute:', invitationToken)
    }
  }

  if (!invitationToken) {
    throw new Error('Failed to capture invitation token')
  }

  // Construct the invite link using localhost (tests run locally)
  const baseUrl = 'http://localhost:5173'
  const inviteLink = `${baseUrl}/accept-invite?token=${invitationToken}`

  return { token: invitationToken, inviteLink }
}

/**
 * Switch to invitations tab
 */
export async function goToInvitationsTab(page: Page): Promise<void> {
  await page.click('button[role="tab"]:has-text("Invitations")')
  await page.waitForSelector('[data-testid="invitations-list"]', { timeout: 5000 })
}

/**
 * Switch to members tab
 */
export async function goToMembersTab(page: Page): Promise<void> {
  await page.click('button[role="tab"]:has-text("Members")')
  await page.waitForSelector('[data-testid="members-list"]', { timeout: 5000 })
}

/**
 * Get list of pending invitations
 */
export async function getPendingInvitations(page: Page): Promise<string[]> {
  await goToInvitationsTab(page)
  const rows = page.locator('[data-testid="invitation-row"]')
  const count = await rows.count()

  const emails: string[] = []
  for (let i = 0; i < count; i++) {
    const email = await rows.nth(i).locator('[data-testid="invitation-email"]').textContent()
    if (email) emails.push(email)
  }

  return emails
}

/**
 * Cancel an invitation
 */
export async function cancelInvitation(page: Page, email: string): Promise<void> {
  await goToInvitationsTab(page)

  const row = page.locator(`[data-testid="invitation-row"]:has-text("${email}")`)
  await row.locator('button:has-text("Cancel")').click()

  // Confirm in dialog
  await page.click('button:has-text("Confirm")')

  // Wait for row to disappear
  await expect(row).not.toBeVisible({ timeout: 5000 })
}

/**
 * Resend an invitation
 */
export async function resendInvitation(page: Page, email: string): Promise<void> {
  await goToInvitationsTab(page)

  const row = page.locator(`[data-testid="invitation-row"]:has-text("${email}")`)
  await row.locator('button:has-text("Resend")').click()

  // Wait for success message
  await expect(page.getByText(/sent|resent/i)).toBeVisible({ timeout: 5000 })
}

/**
 * Copy invitation link
 */
export async function copyInvitationLink(page: Page, email: string): Promise<string> {
  await goToInvitationsTab(page)

  const row = page.locator(`[data-testid="invitation-row"]:has-text("${email}")`)
  await row.locator('button:has-text("Copy Link")').click()

  // Read from clipboard
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  return clipboardText
}

/**
 * Get list of team members
 */
export async function getTeamMembers(page: Page): Promise<{ email: string; role: Role }[]> {
  await goToMembersTab(page)
  const rows = page.locator('[data-testid="member-row"]')
  const count = await rows.count()

  const members: { email: string; role: Role }[] = []
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    const email = await row.locator('[data-testid="member-email"]').textContent()
    const role = await row.locator('[data-testid="member-role"]').textContent()
    if (email && role) {
      members.push({ email, role: role.toLowerCase() as Role })
    }
  }

  return members
}

/**
 * Change a member's role
 */
export async function changeMemberRole(
  page: Page,
  email: string,
  newRole: Role
): Promise<void> {
  await goToMembersTab(page)

  const row = page.locator(`[data-testid="member-row"]:has-text("${email}")`)
  await row.locator('[data-testid="role-select"]').click()
  await page.click(`[data-testid="role-option-${newRole}"]`)

  // Wait for update
  await expect(row.locator(`[data-testid="member-role"]:has-text("${newRole}")`)).toBeVisible({
    timeout: 5000,
  })
}

/**
 * Remove a member from the team
 */
export async function removeMember(page: Page, email: string): Promise<void> {
  await goToMembersTab(page)

  const row = page.locator(`[data-testid="member-row"]:has-text("${email}")`)
  await row.locator('button:has-text("Remove")').click()

  // Confirm in dialog
  await page.click('button:has-text("Remove"):visible')

  // Wait for row to disappear
  await expect(row).not.toBeVisible({ timeout: 5000 })
}

/**
 * Leave the current church
 */
export async function leaveChurch(page: Page): Promise<void> {
  await goToMembersTab(page)

  await page.click('button:has-text("Leave Church")')

  // Confirm in dialog
  await page.click('button:has-text("Leave"):visible')

  // Wait for redirect
  await page.waitForURL(/\/(dashboard|setup-church)/, { timeout: 10000 })
}
