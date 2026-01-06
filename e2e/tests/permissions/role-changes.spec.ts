/**
 * E2E tests for role changes and permissions
 */

import { test, expect } from '@playwright/test'
import { createTempEmailAccount, waitForEmail, extractInvitationLink } from '../../helpers/temp-email'
import { signUpAndConfirm, signIn } from '../../helpers/auth-helpers'
import { goToTeamPage, inviteMember, goToMembersTab, changeMemberRole, removeMember } from '../../helpers/team-helpers'

test.describe('Role Changes', () => {
  test('admin can change member role', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Role Change Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create member
    await page.goto('/')
    const memberMail = await createTempEmailAccount()
    await signUpAndConfirm(page, memberMail, 'MemberPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Member Own Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite as editor
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await inviteMember(page, memberMail.address, 'editor')

    // Member accepts
    const inviteEmail = await waitForEmail(memberMail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    await page.goto('/')
    await signIn(page, memberMail.address, 'MemberPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Admin changes role to operator
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await changeMemberRole(page, memberMail.address, 'operator')

    console.log('Role changed from editor to operator successfully!')

    // Change to admin
    await changeMemberRole(page, memberMail.address, 'admin')

    console.log('Role changed from operator to admin successfully!')
  })

  test('editor cannot access team management', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Editor Perm Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create editor user
    await page.goto('/')
    const editorMail = await createTempEmailAccount()
    await signUpAndConfirm(page, editorMail, 'EditorPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Editor Own Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite as editor
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await inviteMember(page, editorMail.address, 'editor')

    // Editor accepts
    const inviteEmail = await waitForEmail(editorMail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    await page.goto('/')
    await signIn(page, editorMail.address, 'EditorPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Switch to Editor Perm Church
    const churchSelector = page.locator('[data-testid="church-selector"]')
    if (await churchSelector.isVisible()) {
      await churchSelector.click()
      await page.click('text=Editor Perm Church')
    }

    // Try to access team page
    await page.goto('/team')

    // Should see team page but without invite capability or role changes
    // Check that Invite Member button is not visible or disabled
    const inviteButton = page.locator('button:has-text("Invite Member")')
    const isVisible = await inviteButton.isVisible()

    if (isVisible) {
      // If visible, should be disabled
      await expect(inviteButton).toBeDisabled()
    }

    // Check that role selectors are not available for editing
    await goToMembersTab(page)
    const roleSelects = page.locator('[data-testid="role-select"]')
    const count = await roleSelects.count()

    // Editor should not be able to change roles
    for (let i = 0; i < count; i++) {
      const select = roleSelects.nth(i)
      // Either disabled or not interactive
      const isDisabled = await select.isDisabled()
      const pointerEvents = await select.evaluate((el) =>
        window.getComputedStyle(el).pointerEvents
      )

      expect(isDisabled || pointerEvents === 'none').toBeTruthy()
    }

    console.log('Editor correctly restricted from team management')
  })

  test('admin can remove member', async ({ page }) => {
    // Create admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Remove Member Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Create member
    await page.goto('/')
    const memberMail = await createTempEmailAccount()
    await signUpAndConfirm(page, memberMail, 'MemberPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'To Remove Own Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Invite
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await inviteMember(page, memberMail.address, 'editor')

    // Member accepts
    const inviteEmail = await waitForEmail(memberMail, 'invited', 60000)
    const inviteLink = extractInvitationLink(inviteEmail)

    await page.goto('/')
    await signIn(page, memberMail.address, 'MemberPass123!')
    await page.goto(inviteLink)
    await page.click('button:has-text("Accept")')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })

    // Admin removes member
    await page.goto('/')
    await signIn(page, adminMail.address, 'AdminPass123!')
    await goToTeamPage(page)
    await removeMember(page, memberMail.address)

    // Verify member is gone
    await goToMembersTab(page)
    await expect(page.getByText(memberMail.address)).not.toBeVisible()

    // Verify removed member can't access the church
    await page.goto('/')
    await signIn(page, memberMail.address, 'MemberPass123!')

    // Church switcher should not show Remove Member Church
    const selector = page.locator('[data-testid="church-selector"]')
    if (await selector.isVisible()) {
      await selector.click()
      await expect(page.getByText('Remove Member Church')).not.toBeVisible()
    }

    console.log('Member removed successfully!')
  })

  test('cannot demote last admin', async ({ page }) => {
    // Create sole admin
    const adminMail = await createTempEmailAccount()
    await signUpAndConfirm(page, adminMail, 'AdminPass123!')

    if (page.url().includes('/setup-church')) {
      await page.fill('input[name="churchName"]', 'Last Admin Demote Church')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    }

    // Go to team page
    await goToTeamPage(page)
    await goToMembersTab(page)

    // Find own row and try to change role
    const ownRow = page.locator(`[data-testid="member-row"]:has-text("${adminMail.address}")`)
    const roleSelect = ownRow.locator('[data-testid="role-select"]')

    // Should not be able to demote self when sole admin
    if (await roleSelect.isVisible()) {
      await roleSelect.click()
      await page.click('[data-testid="role-option-editor"]')

      // Should show error
      await expect(page.getByText(/last.*admin|cannot.*demote|at least one/i)).toBeVisible({
        timeout: 5000,
      })
    } else {
      // Role select is not visible for last admin - that's also acceptable
      console.log('Role select hidden for last admin')
    }

    console.log('Last admin demotion correctly prevented')
  })
})
