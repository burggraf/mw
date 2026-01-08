/**
 * Team page object helpers for E2E testing
 */

import { Page, expect } from '@playwright/test'

export type Role = 'admin' | 'editor' | 'operator'

/**
 * Navigate to team page
 */
export async function goToTeamPage(page: Page): Promise<void> {
  const currentUrl = page.url()
  console.log('[goToTeamPage] Current URL before navigation:', currentUrl)

  // If on setup-church page, this is likely a test setup issue
  // Log a warning but don't throw - let the test proceed to see what happens
  if (currentUrl.includes('/setup-church')) {
    console.warn('[goToTeamPage] WARNING: Called from setup-church page. Tests should create church first.')
  }

  // First, ensure church context is loaded by waiting for church selector
  // This prevents race conditions where Team page loads before church context is ready
  if (!currentUrl.includes('/team')) {
    // If not already on team page, wait for church selector to ensure context is loaded
    try {
      await page.waitForSelector('[data-testid="church-selector"]', { timeout: 5000 })
      console.log('[goToTeamPage] Church selector found, context loaded')
    } catch {
      // Church selector not found
      console.log('[goToTeamPage] Church selector not found, continuing anyway')
    }
  }

  console.log('[goToTeamPage] Navigating to /team')
  await page.goto('/team')

  // Wait for page to load - look for either Team heading or redirect to login
  await Promise.race([
    page.waitForSelector('h1', { timeout: 10000 }),
    page.waitForURL(/\/login/, { timeout: 10000 }),
    page.waitForURL(/\/setup-church/, { timeout: 10000 }),
  ])

  // If redirected to login, that's an error in the test setup
  if (page.url().includes('/login')) {
    throw new Error('Redirected to login - user not authenticated')
  }

  // If redirected back to setup-church, church doesn't exist yet
  if (page.url().includes('/setup-church')) {
    throw new Error('Redirected to setup-church - church must be created first. Test should check for setup-church page and create church before calling goToTeamPage.')
  }

  // Wait for members tab to be present and clickable
  await page.waitForSelector('button[role="tab"]:has-text("Members")', { timeout: 5000 })

  // Wait for members to finish loading (check for member rows or empty state)
  await page.waitForTimeout(500)
  console.log('[goToTeamPage] Team page loaded successfully')
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
  await page.waitForTimeout(5000)

  // Remove listener
  page.off('response', responseHandler)

  // Check for error toast
  const errorToast = await page.locator('[data-sonner-toast][data-type="error"]').isVisible().catch(() => false)
  if (errorToast) {
    const errorText = await page.locator('[data-sonner-toast][data-type="error"]').textContent().catch(() => 'unknown')
    console.log('Error toast visible:', errorText)
    throw new Error(`Invitation failed: ${errorText}`)
  }

  // Check for success toast
  const successToast = await page.locator('[data-sonner-toast][data-type="success"]').isVisible().catch(() => false)
  if (successToast) {
    const successText = await page.locator('[data-sonner-toast][data-type="success"]').textContent().catch(() => 'unknown')
    console.log('Success toast visible:', successText)
  } else {
    console.log('[inviteMember] No success toast found')
  }

  console.log('[inviteMember] Invitation token captured:', invitationToken)

  // Wait for dialog to close and success message
  // If dialog doesn't close automatically, close it manually
  try {
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 })
  } catch {
    console.log('[inviteMember] Dialog still open, closing manually')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 })
  }
  console.log(`Invited ${email} as ${role}`)

  // If we didn't capture the token from response, get it from the invitations tab
  if (!invitationToken) {
    console.log('Token not captured from response, fetching from invitations tab...')
    await goToInvitationsTab(page)

    // Wait for invitations to load - the list might take time to appear
    await page.waitForTimeout(2000)

    // Check if invitations list exists
    const listVisible = await page.locator('[data-testid="invitations-list"]').isVisible().catch(() => false)
    if (!listVisible) {
      // Either no invitations or list is still loading - refresh to be sure
      console.log('[inviteMember] Invitations list not visible, refreshing...')
      await page.reload()
      await page.waitForTimeout(2000)
      await goToInvitationsTab(page)
      await page.waitForTimeout(2000)
    }

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
  await page.click('button[role="tab"]:has-text("Pending")')
  await page.waitForSelector('[data-testid="invitations-list"]', { timeout: 5000 })
}

/**
 * Switch to members tab
 */
export async function goToMembersTab(page: Page): Promise<void> {
  await page.click('button[role="tab"]:has-text("Members")')

  // Wait for members list to appear
  await page.waitForSelector('[data-testid="members-list"]', { timeout: 10000 })

  // Wait for at least one member row to appear (ensures data is loaded)
  await page.waitForSelector('[data-testid="member-row"]', { timeout: 5000 }).catch(() => {
    // If no member rows, might be empty - log but don't fail
    console.log('No member rows found - list might be empty')
  })
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
  // Click the dropdown trigger to open the menu
  await row.locator('[data-testid="invitation-actions-trigger"]').click()

  // Click the cancel button in the dropdown menu
  await page.locator('[data-testid="cancel-invitation-button"]').click()

  // Confirm in dialog - target AlertDialogCancel button specifically
  const dialogCancel = page.locator('[data-state="open"] >> .AlertDialogCancel')
  await dialogCancel.click()

  // Wait for row to disappear
  await expect(row).not.toBeVisible({ timeout: 5000 })
}

/**
 * Resend an invitation
 */
export async function resendInvitation(page: Page, email: string): Promise<void> {
  await goToInvitationsTab(page)

  const row = page.locator(`[data-testid="invitation-row"]:has-text("${email}")`)
  // Click the dropdown trigger to open the menu
  await row.locator('[data-testid="invitation-actions-trigger"]').click()

  // Click the resend button in the dropdown menu
  await page.locator('[data-testid="resend-invitation-button"]').click()

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
