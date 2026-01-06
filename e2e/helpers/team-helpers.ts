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

/**
 * Invite a member
 */
export async function inviteMember(
  page: Page,
  email: string,
  role: Role
): Promise<void> {
  await openInviteDialog(page)

  await page.fill('input[type="email"]', email)

  // Select role
  await page.click('[data-testid="role-select"]')
  await page.click(`[data-testid="role-option-${role}"]`)

  // Listen for network errors on invitations endpoint
  const invitationResponses: { url: string; status: number; error?: string }[] = []
  const responseHandler = async (response: any) => {
    const url = response.url()
    if (url.includes('invitations')) {
      try {
        const body = await response.text().catch(() => '')
        invitationResponses.push({
          url,
          status: response.status(),
          error: body.includes('error') ? body.substring(0, 200) : undefined
        })
      } catch {
        invitationResponses.push({ url, status: response.status() })
      }
    }
  }
  page.on('response', responseHandler)

  console.log('Clicking Send Invitation button...')
  await page.click('button:has-text("Send Invitation")')

  // Wait a bit for the request to complete
  await page.waitForTimeout(3000)
  console.log('Invitation API responses:', JSON.stringify(invitationResponses, null, 2))

  // Check for error toast
  const errorToast = await page.locator('[data-sonner-toast][data-type="error"]').isVisible().catch(() => false)
  if (errorToast) {
    const errorText = await page.locator('[data-sonner-toast][data-type="error"]').textContent().catch(() => 'unknown')
    console.log('Error toast visible:', errorText)
  }

  // Wait for dialog to close and success message
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 })
  console.log(`Invited ${email} as ${role}`)
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
