/**
 * E2E tests for inviting new users who don't have an account yet
 */

import { test, expect } from '@playwright/test'
import {
  createTempEmailAccount,
  waitForEmail,
  extractConfirmationLink,
  extractInvitationLink,
} from '../../helpers/temp-email'
import { goToTeamPage, inviteMember, goToInvitationsTab } from '../../helpers/team-helpers'

/**
 * Helper to sign up, confirm email, and create church
 */
async function signUpAndCreateChurch(
  page: any,
  mailAccount: any,
  password: string,
  churchName: string
) {
  await page.goto('/signup')
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })

  await page.fill('input[type="email"]', mailAccount.address)
  await page.fill('input#password', password)
  await page.fill('input#confirmPassword', password)

  await page.click('button[type="submit"]')

  // Wait for "check your email" message
  await expect(page.getByText(/check your email|confirm/i)).toBeVisible({
    timeout: 10000,
  })

  // Get confirmation email
  const confirmEmail = await waitForEmail(mailAccount, 'confirm', 60000)
  const confirmLink = extractConfirmationLink(confirmEmail)

  await page.goto(confirmLink)

  // Wait for redirect
  let attempts = 0
  while (attempts < 30) {
    const url = page.url()
    if (url.includes('/dashboard') || url.includes('/setup-church')) {
      break
    }
    await page.waitForTimeout(1000)
    attempts++
  }

  // Check if we need to create a church (either on setup-church page or see "Create Church" button)
  console.log('Checking for church creation, URL:', page.url())

  const setupChurchInput = page.locator('input#churchName')
  const inputVisible = await setupChurchInput.isVisible({ timeout: 2000 }).catch(() => false)
  console.log('Setup church input visible:', inputVisible)

  // First check if we're already on setup-church page
  if (inputVisible) {
    // We're on the setup-church page
    console.log('On setup-church, creating church:', churchName)
    await page.fill('input#churchName', churchName)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    console.log('Church created, now on dashboard')
  } else {
    // We're on dashboard - navigate directly to setup-church
    console.log('Navigating to /setup-church to create church')
    await page.goto('/setup-church')
    await page.waitForSelector('input#churchName', { timeout: 5000 })
    await page.fill('input#churchName', churchName)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    console.log('Church created via navigation, now on dashboard')
  }

  // Reload page to ensure ChurchContext loads the new church
  console.log('Reloading page to refresh context...')
  await page.reload()
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
  await page.waitForTimeout(1000)
  console.log('Church setup complete, on dashboard')
}

test.describe('New User Invitation Flow', () => {
  test('admin can invite a new user who signs up and accepts', async ({ page }) => {
    // Step 1: Create admin account
    const adminMail = await createTempEmailAccount()
    const adminPassword = 'AdminPass123!'

    console.log(`\n=== Admin signup: ${adminMail.address} ===\n`)

    // Sign up admin and create church
    await signUpAndCreateChurch(page, adminMail, adminPassword, 'Test Church')

    // Step 2: Create invitee email account
    const inviteeMail = await createTempEmailAccount()
    const inviteePassword = 'InviteePass123!'

    console.log(`\n=== Inviting new user: ${inviteeMail.address} ===\n`)

    // Step 3: Go to team page and invite
    await goToTeamPage(page)
    await inviteMember(page, inviteeMail.address, 'editor')

    // Verify invitation appears in list
    await goToInvitationsTab(page)
    await expect(page.getByText(inviteeMail.address)).toBeVisible()

    // Step 4: Get invitation link via Copy Link button (email sending may not be configured)
    console.log('Getting invitation link...')
    // Click the actions menu on the invitation row
    await page.locator('[data-testid="invitation-row"]').first().locator('button').click()
    // Click "Copy Invitation Link" in the dropdown
    await page.getByText(/copy invitation link/i).click()
    // Wait for clipboard to be updated
    await page.waitForTimeout(500)
    // Read the link from clipboard
    const inviteLink = await page.evaluate(() => navigator.clipboard.readText())
    console.log(`Invitation link from clipboard: ${inviteLink}`)

    // Step 5: Sign out admin first, then visit invitation link as new user
    console.log('Signing out admin user...')
    // Click user menu in sidebar footer
    await page.locator('[data-testid="user-menu"]').click()
    await page.getByText(/sign out/i).click()
    await page.waitForURL(/^\/$|\/login/, { timeout: 10000 })
    console.log('Admin signed out, visiting invitation link...')
    await page.goto(inviteLink)

    // Should show accept-invite page with Sign Up option
    await page.waitForURL(/\/accept-invite/, { timeout: 10000 })
    await expect(page.getByText("You're Invited!")).toBeVisible()
    await expect(page.getByText('Test Church')).toBeVisible()

    // Click Sign Up link (new user doesn't have account)
    await page.getByRole('link', { name: /sign up/i }).click()
    await page.waitForURL(/\/signup/, { timeout: 10000 })

    // Email should be prefilled
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toHaveValue(inviteeMail.address)

    // Complete signup
    await page.fill('input#password', inviteePassword)
    await page.fill('input#confirmPassword', inviteePassword)
    await page.click('button[type="submit"]')

    // Wait for confirmation message
    await expect(page.getByText(/check your email|confirm/i)).toBeVisible({ timeout: 10000 })

    // Step 6: Get confirmation email and confirm
    console.log('Waiting for signup confirmation email...')
    const confirmEmail = await waitForEmail(inviteeMail, 'confirm', 60000)
    const confirmLink = extractConfirmationLink(confirmEmail)

    await page.goto(confirmLink)

    // Step 7: Should redirect to accept-invite page after confirmation
    await page.waitForURL(/\/(accept-invite|dashboard)/, { timeout: 30000 })

    // If on accept-invite, click accept
    if (page.url().includes('accept-invite')) {
      await page.waitForSelector('button:has-text("Accept")', { timeout: 10000 })
      await page.click('button:has-text("Accept")')
    }

    // Step 8: Verify user is now on dashboard as member of the church
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Verify church name is visible
    await expect(page.getByText('Test Church')).toBeVisible()

    console.log('\n=== New user invitation flow completed successfully! ===\n')
  })

  test('invitation to new user as operator role', async ({ page }) => {
    // Create admin and sign up
    const adminMail = await createTempEmailAccount()
    await signUpAndCreateChurch(page, adminMail, 'AdminPass123!', 'Role Test Church')

    // Invite new user as operator
    const operatorMail = await createTempEmailAccount()

    await goToTeamPage(page)
    await inviteMember(page, operatorMail.address, 'operator')

    // Verify in list
    await goToInvitationsTab(page)
    await expect(page.getByText(operatorMail.address)).toBeVisible()
    // Check for operator role badge within the invitation row
    await expect(page.getByTestId('invitation-row').getByText('Operator')).toBeVisible()

    console.log('Operator invitation created successfully')
  })
})
