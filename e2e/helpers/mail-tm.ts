/**
 * Mail.tm API helpers for E2E testing with real email verification
 *
 * Mail.tm provides free temporary email accounts that we use to test
 * email flows like signup confirmation and invitation acceptance.
 *
 * Rate limit: 8 queries per second
 */

const MAIL_TM_API = 'https://api.mail.tm'

/**
 * Retry a fetch with exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // Retry on 5xx errors
      if (response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000
        console.log(`Server error ${response.status}, retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      return response
    } catch (error) {
      lastError = error as Error
      const delay = Math.pow(2, attempt) * 1000
      console.log(`Fetch failed: ${lastError.message}, retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

export interface MailTmAccount {
  address: string
  password: string
  token: string
}

export interface MailTmMessage {
  id: string
  from: { address: string }
  subject: string
  text?: string
  html?: string[]
}

/**
 * Get an available mail.tm domain
 */
export async function getMailTmDomain(): Promise<string> {
  const response = await fetchWithRetry(`${MAIL_TM_API}/domains`)

  if (!response.ok) {
    throw new Error(`Failed to get mail.tm domains: ${response.status} ${response.statusText}`)
  }

  const text = await response.text()
  try {
    const data = JSON.parse(text)
    return data['hydra:member'][0].domain
  } catch (e) {
    throw new Error(`Invalid JSON from mail.tm domains: ${text.substring(0, 200)}`)
  }
}

/**
 * Create a new temporary email account
 */
export async function createMailTmAccount(): Promise<MailTmAccount> {
  const domain = await getMailTmDomain()
  const username = `test${Date.now()}${Math.random().toString(36).substring(7)}`
  const address = `${username}@${domain}`
  const password = 'TestPassword123!'

  console.log(`Creating mail.tm account: ${address}`)

  // Small delay to avoid rate limiting
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Create account
  const createResponse = await fetchWithRetry(`${MAIL_TM_API}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  if (!createResponse.ok) {
    const error = await createResponse.text()
    throw new Error(`Failed to create mail.tm account: ${createResponse.status} - ${error.substring(0, 200)}`)
  }

  // Small delay to avoid rate limiting
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Get token
  const tokenResponse = await fetchWithRetry(`${MAIL_TM_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    throw new Error(`Failed to get mail.tm token: ${tokenResponse.status} - ${error.substring(0, 200)}`)
  }

  const tokenText = await tokenResponse.text()
  let tokenData
  try {
    tokenData = JSON.parse(tokenText)
  } catch (e) {
    throw new Error(`Invalid JSON from mail.tm token: ${tokenText.substring(0, 200)}`)
  }
  console.log(`Got mail.tm token for ${address}`)

  return { address, password, token: tokenData.token }
}

/**
 * Wait for an email matching the subject pattern
 */
export async function waitForEmail(
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

    // Wait 2 seconds before checking again (rate limit protection)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(`Timeout waiting for email containing "${subjectContains}"`)
}

/**
 * Extract a confirmation/verification link from email content
 */
export function extractConfirmationLink(message: MailTmMessage): string {
  const htmlContent = message.html?.join('') || ''
  const textContent = message.text || ''
  const content = htmlContent || textContent

  console.log('Email content preview:', content.substring(0, 500))

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

/**
 * Extract invitation link from email content
 */
export function extractInvitationLink(message: MailTmMessage): string {
  const htmlContent = message.html?.join('') || ''
  const textContent = message.text || ''
  const content = htmlContent || textContent

  console.log('Email content preview:', content.substring(0, 500))

  // Pattern 1: Look for href with accept-invite
  const hrefMatch = content.match(/href=["']([^"']*accept-invite[^"']*)["']/i)
  if (hrefMatch) {
    console.log('Found invitation link (href):', hrefMatch[1])
    return hrefMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 2: Look for bare URLs with accept-invite
  const urlMatch = content.match(/(https?:\/\/[^\s<>"']+accept-invite[^\s<>"']*)/i)
  if (urlMatch) {
    console.log('Found invitation link (url):', urlMatch[1])
    return urlMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 3: Look for any invitation token URL
  const tokenMatch = content.match(/(https?:\/\/[^\s<>"']*[?&]token=[^\s<>"']*)/i)
  if (tokenMatch) {
    console.log('Found invitation link (token):', tokenMatch[1])
    return tokenMatch[1].replace(/&amp;/g, '&')
  }

  console.log('Full email content:', content)
  throw new Error('Could not find invitation link in email')
}

/**
 * Delete all messages in an account (cleanup)
 */
export async function clearMailbox(token: string): Promise<void> {
  const response = await fetch(`${MAIL_TM_API}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.ok) {
    const data = await response.json()
    const messages = data['hydra:member'] || []

    for (const msg of messages) {
      await fetch(`${MAIL_TM_API}/messages/${msg.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}
