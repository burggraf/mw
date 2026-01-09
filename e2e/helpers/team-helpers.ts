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

  // Wait for page to load successfully OR redirect to login/setup-church (increased timeout for slow internet)
  await Promise.race([
    page.waitForSelector('h1', { timeout: 30000 }),
    page.waitForURL(/\/login/, { timeout: 30000 }),
    page.waitForURL(/\/setup-church/, { timeout: 30000 }),
  ])

  // If redirected to login, that's an error in the test setup
  if (page.url().includes('/login')) {
    throw new Error('Redirected to login - user not authenticated')
  }

  // If redirected back to setup-church, church doesn't exist yet
  if (page.url().includes('/setup-church')) {
    throw new Error('Redirected to setup-church - church must be created first. Test should check for setup-church page and create church before calling goToTeamPage.')
  }

  // Wait for members tab to be present and clickable (increased for slow internet)
  await page.waitForSelector('button[role="tab"]:has-text("Members")', { timeout: 15000 })

  // Wait for members to finish loading
  await page.waitForTimeout(1000)
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

  // Wait for the request to complete (increased for slow internet)
  await page.waitForTimeout(10000)

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

  // Wait for dialog to close and success message (increased timeout for slow internet)
  // If dialog doesn't close automatically, close it manually
  try {
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 })
  } catch {
    console.log('[inviteMember] Dialog still open, closing manually')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1000)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 })
  }
  console.log(`Invited ${email} as ${role}`)

  // If we didn't capture the token from response, get it from the invitations tab
  if (!invitationToken) {
    console.log('Token not captured from response, fetching from invitations tab...')
    await goToInvitationsTab(page)

    // Wait for invitations to load - the list might take time to appear (increased for slow internet)
    await page.waitForTimeout(5000)

    // Check if invitations list exists
    const listVisible = await page.locator('[data-testid="invitations-list"]').isVisible().catch(() => false)
    if (!listVisible) {
      // Either no invitations or list is still loading - refresh to be sure
      console.log('[inviteMember] Invitations list not visible, refreshing...')
      await page.reload()
      await page.waitForTimeout(5000)
      await goToInvitationsTab(page)
      await page.waitForTimeout(5000)
    }

    // Look for the invitation row and get the token from data-token attribute (increased timeout)
    const row = page.locator(`[data-testid="invitation-row"]:has-text("${email}")`)
    await row.waitFor({ state: 'visible', timeout: 20000 })
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
  await page.waitForSelector('[data-testid="invitations-list"]', { timeout: 15000 })
}

/**
 * Switch to members tab
 */
export async function goToMembersTab(page: Page): Promise<void> {
  await page.click('button[role="tab"]:has-text("Members")')

  // Wait for members list to appear (increased for slow internet)
  await page.waitForSelector('[data-testid="members-list"]', { timeout: 20000 })

  // Wait for at least one member row to appear (ensures data is loaded, increased for slow internet)
  await page.waitForSelector('[data-testid="member-row"]', { timeout: 10000 }).catch(() => {
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
 * Accept a church invitation
 * Navigates to the invite link and clicks the accept button
 */
export async function acceptInvitation(page: Page, inviteLink: string): Promise<void> {
  console.log('[acceptInvitation] Navigating to invite link:', inviteLink)
  await page.goto(inviteLink)

  // Wait for page to load completely
  console.log('[acceptInvitation] Waiting for accept invitation page to load...')
  await page.waitForLoadState('domcontentloaded')

  // Wait a bit for React to render
  await page.waitForTimeout(2000)

  // Check if we're on login page (shouldn't be)
  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    throw new Error('[acceptInvitation] Redirected to login instead of accept invitation page. Session may have been lost.')
  }

  // Check if we're in the "not logged in" state
  // This happens when the user is not authenticated after signIn
  // Look for the invitation-details card which only appears when user is authenticated
  const hasInvitationDetails = await page.locator('[data-testid="invitation-details"]').isVisible().catch(() => false)
  if (!hasInvitationDetails) {
    // Page doesn't have the invitation details card - likely not authenticated or error
    // Take a screenshot for debugging
    await page.screenshot({ path: 'e2e/screenshots/accept-invite-not-authenticated.png' })

    const pageText = await page.locator('body').textContent()
    console.log('[acceptInvitation] Page text:', pageText?.substring(0, 500))

    // Check for specific error states
    if (pageText?.includes('Failed to fetch')) {
      throw new Error('[acceptInvitation] Failed to fetch invitation details. This may be a network issue or the invitation may be invalid.')
    }
    if (pageText?.includes('Wrong Account')) {
      throw new Error('[acceptInvitation] Wrong account - signed in as different user than invitation was sent to. The signIn helper may have failed to switch users.')
    }
    if (pageText?.includes('Invite Not Found') || pageText?.includes('Invalid Invitation')) {
      throw new Error('[acceptInvitation] Invitation not found or invalid. The invitation token may be incorrect or expired.')
    }
    if (pageText?.includes('Invite Expired') || pageText?.includes('Expired')) {
      throw new Error('[acceptInvitation] Invitation has expired.')
    }
    if (pageText?.includes('Already Accepted')) {
      throw new Error('[acceptInvitation] Invitation has already been accepted.')
    }
    if (pageText?.includes('You need to login')) {
      throw new Error('[acceptInvitation] User is not authenticated. The signIn helper may have failed.')
    }

    throw new Error('[acceptInvitation] Page is in unexpected state. Check screenshot: e2e/screenshots/accept-invite-not-authenticated.png')
  }

  // Wait for and click the accept button using data-testid for reliability
  console.log('[acceptInvitation] Waiting for accept button...')
  await page.waitForSelector('[data-testid="accept-button"]', { timeout: 30000 })

  console.log('[acceptInvitation] Clicking Accept button')
  await page.click('[data-testid="accept-button"]')

  // Wait for redirect with increased timeout for slow internet
  console.log('[acceptInvitation] Waiting for redirect to dashboard...')
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 30000 })
    console.log('[acceptInvitation] Successfully accepted invitation and redirected to dashboard')
  } catch (e) {
    console.log('[acceptInvitation] Failed to redirect after accepting invitation, current URL:', page.url())
    throw e
  }
}

/**
 * Leave the current church
 */
export async function leaveChurch(page: Page): Promise<void> {
  await goToMembersTab(page)

  // Check if Leave Church button exists and is enabled
  const leaveButton = page.locator('[data-testid="leave-church-button"]')
  console.log('[leaveChurch] Waiting for Leave Church button...')
  await leaveButton.waitFor({ state: 'visible', timeout: 10000 })

  const isEnabled = await leaveButton.isEnabled()
  console.log('[leaveChurch] Leave Church button enabled:', isEnabled)

  if (!isEnabled) {
    throw new Error('[leaveChurch] Leave Church button is disabled. User may not have permission to leave.')
  }

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Browser Console Error]', msg.text())
    }
  })

  // Click the Leave Church button
  console.log('[leaveChurch] Clicking Leave Church button')
  await leaveButton.click()

  // Wait a moment for React state to update
  await page.waitForTimeout(2000)

  // Check if dialog appeared
  const hasDialog = await page.locator('[role="dialog"]').isVisible().catch(() => false)
  console.log('[leaveChurch] Dialog visible:', hasDialog)

  if (!hasDialog) {
    // Take screenshot to debug
    await page.screenshot({ path: 'e2e/screenshots/leave-church-no-dialog.png' })

    // Check page content
    const bodyText = await page.locator('body').textContent()
    console.log('[leaveChurch] Page contains "Leave Church":', bodyText?.includes('Leave Church'))

    throw new Error('[leaveChurch] Dialog did not appear after clicking Leave Church button. Check screenshot: e2e/screenshots/leave-church-no-dialog.png')
  }

  // The confirmation button should have destructive styling and contain "Leave"
  console.log('[leaveChurch] Looking for confirmation button...')
  const confirmButton = page.locator('[role="dialog"] button:has-text("Leave")').first()
  await confirmButton.waitFor({ state: 'visible', timeout: 5000 })

  console.log('[leaveChurch] Clicking confirmation button')
  await confirmButton.click()

  // Wait for redirect (increased timeout for slow internet)
  console.log('[leaveChurch] Waiting for redirect...')
  await page.waitForURL(/\/(dashboard|setup-church)/, { timeout: 30000 })
  console.log('[leaveChurch] Left church successfully')
}
