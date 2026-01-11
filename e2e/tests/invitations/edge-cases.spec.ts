/**
 * E2E tests for invitation edge cases
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember, goToInvitationsTab, cancelInvitation } from '../../helpers/team-helpers'

test.describe('Invitation Edge Cases', () => {
  test('cancelled invitation cannot be accepted', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Cancel Test Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite user
    const inviteeMail = await createTempEmailAccount()
    await goToTeamPage(page)
    const { inviteLink } = await inviteMember(page, inviteeMail.address, 'editor')

    // Cancel the invitation
    await cancelInvitation(page, inviteeMail.address)

    // Verify invitation is removed from list
    await goToInvitationsTab(page)
    await expect(page.getByText(inviteeMail.address)).not.toBeVisible()

    // Try to use the cancelled invitation link
    await page.goto(inviteLink)

    // Should show error
    await expect(page.getByText(/invalid|expired|cancelled|not found/i)).toBeVisible({
      timeout: 10000,
    })

    console.log('Cancelled invitation correctly rejected')
  })

  test('resending invitation works from UI', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Resend Test Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite user
    const inviteeMail = await createTempEmailAccount()
    await goToTeamPage(page)
    await inviteMember(page, inviteeMail.address, 'editor')

    // Navigate to invitations tab and resend
    await goToInvitationsTab(page)
    const row = page.locator(`[data-testid="invitation-row"]:has-text("${inviteeMail.address}")`)
    // Click the dropdown trigger to open the menu
    await row.locator('[data-testid="invitation-actions-trigger"]').click()
    // Click the resend button in the dropdown menu
    await page.locator('[data-testid="resend-invitation-button"]').click()

    // Wait for success toast
    const successToast = page.locator('[data-sonner-toast][data-type="success"]')
    await expect(successToast).toBeVisible({ timeout: 10000 })
    await expect(successToast).toContainText(/resent/i, { timeout: 5000 })

    console.log('Resend invitation UI action successful')
  })

  test('duplicate invitation is rejected', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Duplicate Test Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite user
    const inviteeMail = await createTempEmailAccount()
    await goToTeamPage(page)
    await inviteMember(page, inviteeMail.address, 'editor')

    // Try to invite same email again
    await page.click('button:has-text("Invite Member")')
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

    await page.fill('input[type="email"]', inviteeMail.address)
    await page.click('[data-testid="role-select"]')
    await page.click('[data-testid="role-option-admin"]')
    await page.click('button:has-text("Send Invitation")')

    // Should show error about duplicate - check in toast container only
    const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
    await expect(errorToast).toBeVisible({ timeout: 10000 })
    await expect(errorToast).toContainText(/already.*invited|invitation.*sent/i, { timeout: 10000 })

    console.log('Duplicate invitation correctly rejected')
  })

  test('email mismatch shows error', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Mismatch Test Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite specific email
    const inviteeMail = await createTempEmailAccount()
    await goToTeamPage(page)
    const { inviteLink } = await inviteMember(page, inviteeMail.address, 'editor')

    // Create different user
    await page.goto('/')
    const differentMail = await createTempEmailAccount()
    await signUpAndConfirm(page, differentMail, 'DifferentPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Different User Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Try to use invitation link as different user
    await page.goto(inviteLink)

    // Should show email mismatch error - check for specific text in the error UI
    await expect(page.getByText('Wrong Account')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/signed in with a different email/i)).toBeVisible({ timeout: 10000 })

    console.log('Email mismatch correctly detected')
  })

  test('already accepted invitation shows message', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Already Accepted Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create and invite existing user
    await page.goto('/')
    const inviteeMail = await createTempEmailAccount()
    await signUpAndConfirm(page, inviteeMail, 'InviteePass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Invitee Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin invites the existing user
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    const { inviteLink } = await inviteMember(page, inviteeMail.address, 'editor')

    // Sign in as invitee and accept
    await page.goto('/')
    await signIn(page, inviteeMail.address, 'InviteePass123!')
    await page.goto(inviteLink)

    await page.waitForSelector('button:has-text("Accept")', { timeout: 10000 })
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Try to use the same link again
    await page.goto(inviteLink)

    // Should show already accepted message
    await expect(page.getByText(/already.*accepted|already.*member/i)).toBeVisible({
      timeout: 10000,
    })

    console.log('Already accepted invitation correctly shows message')
  })
})
