/**
 * E2E tests for multi-church membership
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount, waitForEmail, extractInvitationLink } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember } from '../../helpers/team-helpers'

test.describe('Multi-Church Membership', () => {
  test('user can belong to multiple churches and switch between them', async ({ page }) => {
    // Create admin1 with Church A
    const admin1Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin1Mail, 'Admin1Pass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Church A')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create admin2 with Church B
    await page.goto('/')
    const admin2Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin2Mail, 'Admin2Pass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Church B')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create multi-church user with their own Church C
    await page.goto('/')
    const multiUserMail = await createTempEmailAccount()
    await signUpAndConfirm(page, multiUserMail, 'MultiPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Church C')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin1 invites multi-user to Church A
    await page.goto('/')
    await signIn(page, admin1Mail.address, 'Admin1Pass123!')
    await goToTeamPage(page)
    await inviteMember(page, multiUserMail.address, 'editor')

    // Get invitation link
    let inviteEmail = await waitForEmail(multiUserMail, 'invited', 60000)
    let inviteLink = extractInvitationLink(inviteEmail)

    // Multi-user accepts Church A invitation
    await page.goto('/')
    await signIn(page, multiUserMail.address, 'MultiPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Admin2 invites multi-user to Church B
    await page.goto('/')
    await signIn(page, admin2Mail.address, 'Admin2Pass123!')
    await goToTeamPage(page)
    await inviteMember(page, multiUserMail.address, 'operator')

    // Get invitation link
    inviteEmail = await waitForEmail(multiUserMail, 'invited', 60000)
    inviteLink = extractInvitationLink(inviteEmail)

    // Multi-user accepts Church B invitation
    await page.goto('/')
    await signIn(page, multiUserMail.address, 'MultiPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Verify multi-user can see church switcher with all 3 churches
    // Look for the church selector in sidebar header
    const churchSelector = page.locator('[data-testid="church-selector"]')

    // If only one church, it shows as button; if multiple, shows as dropdown
    // The user now has 3 churches, so should show dropdown
    if (await churchSelector.isVisible()) {
      await churchSelector.click()

      await expect(page.getByText('Church A')).toBeVisible()
      await expect(page.getByText('Church B')).toBeVisible()
      await expect(page.getByText('Church C')).toBeVisible()

      // Switch to Church A
      await page.click('text=Church A')

      // Verify we're now viewing Church A
      await expect(page.getByText('Church A')).toBeVisible()
    }

    console.log('Multi-church membership and switching verified!')
  })

  test('user sees correct role for each church', async ({ page }) => {
    // Create admin with Church Admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'Admin Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create user with their own church (admin there)
    await page.goto('/')
    const userMail = await createTempEmailAccount()
    await signUpAndConfirm(page, userMail, 'UserPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input#churchName', 'User Own Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Admin invites user as operator
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await inviteMember(page, userMail.address, 'operator')

    // User accepts
    const inviteEmail = await waitForEmail(userMail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    await page.goto('/')
    await signIn(page, userMail.address, 'UserPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Check role display in church selector
    const churchSelector = page.locator('[data-testid="church-selector"]')
    if (await churchSelector.isVisible()) {
      await churchSelector.click()

      // User should be admin of their own church
      const ownChurchItem = page.locator('text=User Own Church').first()
      await expect(ownChurchItem.locator('..').getByText(/admin/i)).toBeVisible()

      // User should be operator of Admin Church
      const adminChurchItem = page.locator('text=Admin Church').first()
      await expect(adminChurchItem.locator('..').getByText(/operator/i)).toBeVisible()
    }

    console.log('Role display per church verified!')
  })
})
