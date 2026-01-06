/**
 * E2E tests for leaving churches
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount, waitForEmail, extractInvitationLink } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember, goToMembersTab, leaveChurch } from '../../helpers/team-helpers'

test.describe('Leaving Churches', () => {
  test('user can leave a church they were invited to', async ({ page }) => {
    // Create admin with church
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Leave Test Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create user with their own church
    await page.goto('/')
    const userMail = await createTempEmailAccount()
    await signUpAndConfirm(page, userMail, 'UserPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'User Home Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin invites user
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await inviteMember(page, userMail.address, 'editor')

    // User accepts invitation
    const inviteEmail = await waitForEmail(userMail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    await page.goto('/')
    await signIn(page, userMail.address, 'UserPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Switch to Leave Test Church
    const churchSelector = page.locator('[data-testid="church-selector"]')
    if (await churchSelector.isVisible()) {
      await churchSelector.click()
      await page.click('text=Leave Test Church')
    }

    // Go to team page and leave
    await goToTeamPage(page)
    await leaveChurch(page)

    // Should be redirected to dashboard (of remaining church)
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Verify Leave Test Church is no longer accessible
    const selector = page.locator('[data-testid="church-selector"]')
    if (await selector.isVisible()) {
      await selector.click()
      await expect(page.getByText('Leave Test Church')).not.toBeVisible()
    }

    console.log('User left church successfully!')
  })

  test('last admin cannot leave church', async ({ page }) => {
    // Create sole admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Sole Admin Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Go to team page
    await goToTeamPage(page)
    await goToMembersTab(page)

    // Try to leave
    const leaveButton = page.locator('button:has-text("Leave Church")')

    // Button should be disabled or show warning when clicked
    if (await leaveButton.isEnabled()) {
      await leaveButton.click()

      // Should show last admin warning
      await expect(page.getByText(/last.*admin|cannot.*leave|transfer.*admin/i)).toBeVisible({
        timeout: 5000,
      })
    } else {
      // Button is disabled
      await expect(leaveButton).toBeDisabled()
    }

    console.log('Last admin correctly prevented from leaving')
  })

  test('admin can leave if another admin exists', async ({ page }) => {
    // Create first admin
    const admin1Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin1Mail, 'Admin1Pass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Two Admins Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create second admin (will be invited)
    await page.goto('/')
    const admin2Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin2Mail, 'Admin2Pass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Admin2 Own Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin1 invites admin2 as admin
    await page.goto('/')
    await signIn(page, admin1Mail.address, 'Admin1Pass123!')
    await goToTeamPage(page)
    await inviteMember(page, admin2Mail.address, 'admin')

    // Admin2 accepts
    const inviteEmail = await waitForEmail(admin2Mail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    await page.goto('/')
    await signIn(page, admin2Mail.address, 'Admin2Pass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Now admin1 should be able to leave
    await page.goto('/')
    await signIn(page, admin1Mail.address, 'Admin1Pass123!')

    // Switch to Two Admins Church
    const churchSelector = page.locator('[data-testid="church-selector"]')
    if (await churchSelector.isVisible()) {
      await churchSelector.click()
      await page.click('text=Two Admins Church')
    }

    await goToTeamPage(page)
    await leaveChurch(page)

    // Should be redirected
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    console.log('Admin with another admin present left successfully!')
  })
})
