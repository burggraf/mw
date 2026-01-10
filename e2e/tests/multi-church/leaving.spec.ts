/**
 * E2E tests for leaving churches
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember, goToMembersTab, leaveChurch, acceptInvitation } from '../../helpers/team-helpers'

test.describe('Leaving Churches', () => {
  test('user can leave a church they were invited to', async ({ page }) => {
    // Create admin with church
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Leave Test Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create user with their own church
    await page.goto('/')
    const userMail = await createTempEmailAccount()
    await signUpAndConfirm(page, userMail, 'UserPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'User Home Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin invites user
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    const { inviteLink } = await inviteMember(page, userMail.address, 'editor')

    // User accepts invitation
    await page.goto('/')
    await signIn(page, userMail.address, 'UserPass123!')
    await acceptInvitation(page, inviteLink)

    // Switch to Leave Test Church - wait for selector to be ready
    console.log('[Test] Waiting for church selector to be visible...')
    const churchSelector = page.locator('[data-testid="church-selector"]')
    await churchSelector.waitFor({ state: 'visible', timeout: 10000 })
    console.log('[Test] Church selector visible, clicking to switch churches...')

    await churchSelector.click()
    await page.waitForTimeout(500) // Wait for dropdown to open

    // Click on "Leave Test Church" option
    await page.click('text=Leave Test Church')
    console.log('[Test] Switched to Leave Test Church')

    // Wait a moment for the church context to switch
    await page.waitForTimeout(2000)

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
      await page.fill('input#churchName', 'Sole Admin Church')
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
      await page.fill('input#churchName', 'Two Admins Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create second admin (will be invited)
    await page.goto('/')
    const admin2Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin2Mail, 'Admin2Pass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Admin2 Own Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin1 invites admin2 as admin
    await page.goto('/')
    await signIn(page, admin1Mail.address, 'Admin1Pass123!')
    await goToTeamPage(page)
    const { inviteLink } = await inviteMember(page, admin2Mail.address, 'admin')

    // Admin2 accepts invitation
    await page.goto('/')
    await signIn(page, admin2Mail.address, 'Admin2Pass123!')
    await acceptInvitation(page, inviteLink)

    // Now admin1 should be able to leave
    await page.goto('/')
    await signIn(page, admin1Mail.address, 'Admin1Pass123!')

    // Wait for church context to load after sign in
    console.log('[Test] Waiting for church context to load...')
    await page.waitForTimeout(2000)

    // Check if church selector exists (multiple churches)
    const churchSelector = page.locator('[data-testid="church-selector"]')
    const selectorVisible = await churchSelector.isVisible().catch(() => false)

    if (selectorVisible) {
      console.log('[Test] Multiple churches found, switching to Two Admins Church...')
      await churchSelector.click()
      await page.waitForTimeout(500) // Wait for dropdown to open
      await page.click('text=Two Admins Church')
      console.log('[Test] Switched to Two Admins Church')
      await page.waitForTimeout(1000)
    } else {
      console.log('[Test] Only one church, no selector needed - already on Two Admins Church')
    }

    await goToTeamPage(page)
    await leaveChurch(page)

    // Should be redirected
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    console.log('Admin with another admin present left successfully!')
  })
})
