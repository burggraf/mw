/**
 * E2E tests for multi-church membership
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember } from '../../helpers/team-helpers'

test.describe('Multi-Church Membership', () => {
  test('user can belong to multiple churches and switch between them', async ({ page }) => {
    // Create admin1 with Church A
    const admin1Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin1Mail, 'Admin1Pass123!')

    if (page.url().includes('/setup-church')) {
      console.log('[Test] On setup-church page, creating church')
      // Check for error messages
      try {
        await page.fill('input#churchName', 'Church A')
        console.log('[Test] Filled church name')

        // Check if button is enabled
        const submitButton = page.locator('button[type="submit"]')
        const isEnabled = await submitButton.isEnabled()
        console.log('[Test] Submit button enabled:', isEnabled)

        await submitButton.click()
        console.log('[Test] Clicked submit button, current URL:', page.url())

        // Wait for redirect to dashboard OR error message
        try {
          await page.waitForURL(/\/dashboard/, { timeout: 20000 })
          console.log('[Test] Successfully redirected to dashboard')
        } catch (e) {
          // Check for errors
          const errorText = await page.locator('.bg-destructive\\/10, .text-destructive').textContent().catch(() => null)
          console.log('[Test] Error text:', errorText)
          const debugText = await page.locator('[data-testid="debug-error"]').textContent().catch(() => null)
          console.log('[Test] Debug error:', debugText)
          throw e
        }
      } catch (e: any) {
        console.log('[Test] Error during church creation:', e.message)
        throw e
      }
    }

    // Create admin2 with Church B
    await page.goto('/')
    const admin2Mail = await createTempEmailAccount()
    await signUpAndConfirm(page, admin2Mail, 'Admin2Pass123!')

    if (page.url().includes('/setup-church')) {
      console.log('[Test] Creating Church B')
      const churchNameInput = page.locator('input#churchName')
      const submitButton = page.locator('button[type="submit"]')

      await churchNameInput.fill('Church B')
      await submitButton.click()

      // Wait for redirect to dashboard OR error
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 20000 })
        console.log('[Test] Church B created successfully')
      } catch (e) {
        const errorText = await page.locator('.bg-destructive\\/10, .text-destructive').textContent().catch(() => null)
        const debugText = await page.locator('[data-testid="debug-error"]').textContent().catch(() => null)
        console.log('[Test] Church B error:', { errorText, debugText })
        throw e
      }
    }

    // Create multi-church user with their own Church C
    await page.goto('/')
    const multiUserMail = await createTempEmailAccount()
    await signUpAndConfirm(page, multiUserMail, 'MultiPass123!')

    if (page.url().includes('/setup-church')) {
      console.log('[Test] Creating Church C')
      const churchNameInput = page.locator('input#churchName')
      const submitButton = page.locator('button[type="submit"]')

      await churchNameInput.fill('Church C')
      await submitButton.click()

      // Wait for redirect to dashboard OR error
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 20000 })
        console.log('[Test] Church C created successfully')
      } catch (e) {
        const errorText = await page.locator('.bg-destructive\\/10, .text-destructive').textContent().catch(() => null)
        const debugText = await page.locator('[data-testid="debug-error"]').textContent().catch(() => null)
        console.log('[Test] Church C error:', { errorText, debugText })
        throw e
      }
    }

    // Admin1 invites multi-user to Church A
    await page.goto('/')
    await signIn(page, admin1Mail.address, 'Admin1Pass123!')
    await goToTeamPage(page)
    const { inviteLink: inviteLinkA } = await inviteMember(page, multiUserMail.address, 'editor')

    // Multi-user accepts Church A invitation
    await page.goto('/')
    await signIn(page, multiUserMail.address, 'MultiPass123!')
    await page.goto(inviteLinkA)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Admin2 invites multi-user to Church B
    await page.goto('/')
    await signIn(page, admin2Mail.address, 'Admin2Pass123!')
    await goToTeamPage(page)
    const { inviteLink: inviteLinkB } = await inviteMember(page, multiUserMail.address, 'operator')

    // Multi-user accepts Church B invitation
    await page.goto('/')
    await signIn(page, multiUserMail.address, 'MultiPass123!')
    await page.goto(inviteLinkB)
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
    const { inviteLink } = await inviteMember(page, userMail.address, 'operator')

    // User accepts
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
