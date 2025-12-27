import { test, expect } from '@playwright/test'

// Mail.tm API helpers
const MAIL_TM_API = 'https://api.mail.tm'

interface MailTmAccount {
  address: string
  password: string
  token: string
}

interface MailTmMessage {
  id: string
  from: { address: string }
  subject: string
  text?: string
  html?: string[]
}

async function getMailTmDomain(): Promise<string> {
  const response = await fetch(`${MAIL_TM_API}/domains`)
  const data = await response.json()
  return data['hydra:member'][0].domain
}

async function createMailTmAccount(): Promise<MailTmAccount> {
  const domain = await getMailTmDomain()
  const username = `test${Date.now()}${Math.random().toString(36).substring(7)}`
  const address = `${username}@${domain}`
  const password = 'TestPassword123!'

  console.log(`Creating mail.tm account: ${address}`)

  // Create account
  const createResponse = await fetch(`${MAIL_TM_API}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  if (!createResponse.ok) {
    const error = await createResponse.text()
    throw new Error(`Failed to create mail.tm account: ${error}`)
  }

  // Get token
  const tokenResponse = await fetch(`${MAIL_TM_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    throw new Error(`Failed to get mail.tm token: ${error}`)
  }

  const tokenData = await tokenResponse.json()
  console.log(`Got mail.tm token for ${address}`)

  return { address, password, token: tokenData.token }
}

async function waitForEmail(
  token: string,
  subjectContains: string,
  timeoutMs = 60000
): Promise<MailTmMessage> {
  const startTime = Date.now()
  console.log(`Waiting for email containing "${subjectContains}"...`)

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${MAIL_TM_API}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.ok) {
      const data = await response.json()
      const messages = data['hydra:member'] || []

      for (const msg of messages) {
        if (msg.subject?.toLowerCase().includes(subjectContains.toLowerCase())) {
          console.log(`Found email: "${msg.subject}"`)
          // Get full message content
          const fullResponse = await fetch(`${MAIL_TM_API}/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (fullResponse.ok) {
            return await fullResponse.json()
          }
        }
      }
    }

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(`Timeout waiting for email containing "${subjectContains}"`)
}

function extractConfirmationLink(message: MailTmMessage): string {
  // Try HTML content first
  const htmlContent = message.html?.join('') || ''
  const textContent = message.text || ''
  const content = htmlContent || textContent

  console.log('Email content preview:', content.substring(0, 500))

  // Look for confirmation link patterns
  // Supabase sends links like: https://project.supabase.co/auth/v1/verify?token=...&type=signup&redirect_to=...
  // Or: http://localhost:5173/auth/callback#access_token=...

  // Pattern 1: Look for href with auth/callback or verify
  const hrefMatch = content.match(/href=["']([^"']*(?:auth\/callback|verify)[^"']*)["']/i)
  if (hrefMatch) {
    console.log('Found confirmation link (href):', hrefMatch[1])
    return hrefMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 2: Look for bare URLs with auth/callback or verify
  const urlMatch = content.match(/(https?:\/\/[^\s<>"']+(?:auth\/callback|verify)[^\s<>"']*)/i)
  if (urlMatch) {
    console.log('Found confirmation link (url):', urlMatch[1])
    return urlMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 3: Any link with token parameter
  const tokenMatch = content.match(/(https?:\/\/[^\s<>"']*token=[^\s<>"']*)/i)
  if (tokenMatch) {
    console.log('Found confirmation link (token):', tokenMatch[1])
    return tokenMatch[1].replace(/&amp;/g, '&')
  }

  console.log('Full email content:', content)
  throw new Error('Could not find confirmation link in email')
}

test.describe('Email/Password Signup Flow', () => {
  test('should complete full signup flow with email confirmation', async ({ page }) => {
    // Step 1: Create temp email account
    const mailAccount = await createMailTmAccount()
    const testPassword = 'SecurePassword123!'

    console.log(`\n=== Starting signup test with ${mailAccount.address} ===\n`)

    // Step 2: Navigate to signup page
    await page.goto('/signup')

    // Wait for page to load - look for email input
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })

    // Take a screenshot to see what we have
    await page.screenshot({ path: 'e2e/screenshots/signup-page.png' })
    console.log('Signup page loaded, current URL:', page.url())

    // Step 3: Fill in signup form
    await page.fill('input[type="email"]', mailAccount.address)
    await page.fill('input#password', testPassword)
    await page.fill('input#confirmPassword', testPassword)

    // Step 4: Submit form
    console.log('Submitting signup form...')
    await page.click('button[type="submit"]')

    // Step 5: Wait for "check your email" message
    await expect(page.getByText('Check your email to confirm')).toBeVisible({
      timeout: 10000,
    })
    console.log('Signup submitted, waiting for confirmation email...')

    // Step 6: Wait for confirmation email
    const confirmEmail = await waitForEmail(mailAccount.token, 'confirm', 60000)
    const confirmLink = extractConfirmationLink(confirmEmail)
    console.log(`Confirmation link: ${confirmLink}`)

    // Step 7: Visit confirmation link
    console.log('Visiting confirmation link...')
    await page.goto(confirmLink)

    // Step 8: Log all console messages for debugging
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type()}] ${msg.text()}`)
    })

    // Step 9: Wait for redirect (either to dashboard or setup-church)
    console.log('Waiting for redirect after email confirmation...')

    // Give it time to process - watch the URL
    let attempts = 0
    const maxAttempts = 30
    while (attempts < maxAttempts) {
      const url = page.url()
      console.log(`Current URL (attempt ${attempts + 1}): ${url}`)

      if (url.includes('/dashboard') || url.includes('/setup-church')) {
        console.log(`SUCCESS: Redirected to ${url}`)
        break
      }

      if (url.includes('/login')) {
        console.log('ERROR: Redirected to login page instead of dashboard/setup-church')
        // Take a screenshot
        await page.screenshot({ path: 'e2e/screenshots/login-redirect-error.png' })
        throw new Error('Incorrectly redirected to login page')
      }

      await page.waitForTimeout(1000)
      attempts++
    }

    if (attempts >= maxAttempts) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'e2e/screenshots/timeout-error.png' })

      // Get page content for debugging
      const content = await page.content()
      console.log('Page content at timeout:', content.substring(0, 2000))

      throw new Error(`Timeout waiting for redirect. Final URL: ${page.url()}`)
    }

    // Step 10: Verify we landed on the right page
    const finalUrl = page.url()
    expect(finalUrl).toMatch(/\/(dashboard|setup-church)/)
    console.log(`\n=== Test completed successfully! Final URL: ${finalUrl} ===\n`)
  })
})
