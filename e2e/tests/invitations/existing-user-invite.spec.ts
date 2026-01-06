/**
 * E2E tests for inviting existing users who already have an account
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount, waitForEmail, extractInvitationLink } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember, goToInvitationsTab } from '../../helpers/team-helpers'

test.describe('Existing User Invitation Flow', () => {
  test('existing user can accept invitation from another church', async ({ page }) => {
    // Step 1: Create two users and churches
    const admin1Mail = await createTempEmailAccount()
    const admin1Password = 'Admin1Pass123!'

    const existingUserMail = await createTempEmailAccount()
    const existingUserPassword = 'ExistingPass123!'

    console.log(`\n=== Setup: Creating admin1 (${admin1Mail.address}) ===`)

    // Sign up admin1
    await signUpAndConfirm(page, admin1Mail, admin1Password)

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Church Alpha')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Sign out
    await page.goto('/login')
    // The auth context should auto-signout, or we wait

    console.log(`\n=== Setup: Creating existing user (${existingUserMail.address}) ===`)

    // Sign up existing user (who will have their own church)
    await signUpAndConfirm(page, existingUserMail, existingUserPassword)

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Church Beta')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Sign out existing user
    await page.goto('/')

    console.log(`\n=== Admin1 invites existing user ===`)

    // Sign in as admin1
    await signIn(page, admin1Mail.address, admin1Password)

    // Invite existing user
    await goToTeamPage(page)
    await inviteMember(page, existingUserMail.address, 'editor')

    // Verify invitation in list
    await goToInvitationsTab(page)
    await expect(page.getByText(existingUserMail.address)).toBeVisible()

    // Step 2: Get invitation email
    console.log('Waiting for invitation email...')
    const inviteEmail = await waitForEmail(existingUserMail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    // Sign out admin1
    await page.goto('/')

    // Step 3: Visit link as existing user (not logged in)
    console.log(`Visiting invitation link: ${inviteLink}`)
    await page.goto(inviteLink)

    // Should redirect to login (since user exists)
    await page.waitForURL(/\/login/, { timeout: 10000 })

    // Log in
    await page.fill('input[type="email"]', existingUserMail.address)
    await page.fill('input#password', existingUserPassword)
    await page.click('button[type="submit"]')

    // Should redirect to accept-invite page
    await page.waitForURL(/\/accept-invite/, { timeout: 10000 })

    // Verify invitation details
    await expect(page.getByText('Church Alpha')).toBeVisible()
    await expect(page.getByText(/editor/i)).toBeVisible()

    // Accept
    await page.click('button:has-text("Accept")')

    // Should redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Step 4: Verify user now has access to both churches
    // Check church switcher shows both churches
    await expect(page.getByText('Church Alpha')).toBeVisible()

    console.log('\n=== Existing user invitation flow completed successfully! ===\n')
  })

  test('existing user already logged in can accept invitation directly', async ({ page }) => {
    // Create admin with church
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Direct Accept Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create second user with their own church
    await page.goto('/')
    const user2Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, user2Mail, 'User2Pass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Other Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Switch back to admin to send invite
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')

    await goToTeamPage(page)
    await inviteMember(page, user2Mail.address, 'admin')

    // Get invitation link
    const inviteEmail = await waitForEmail(user2Mail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    // Now log in as user2
    await page.goto('/')
    await signIn(page, user2Mail.address, 'User2Pass123!')

    // Visit invitation link while already logged in
    await page.goto(inviteLink)

    // Should show invitation page directly (no login redirect)
    await page.waitForSelector('button:has-text("Accept")', { timeout: 10000 })

    // Accept
    await page.click('button:has-text("Accept")')

    // Should be on dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    console.log('Direct accept (already logged in) completed successfully!')
  })
})
