/**
 * Temporary email provider abstraction for E2E testing
 * Supports multiple providers with automatic fallback
 */

export interface TempEmailAccount {
  address: string
  provider: 'guerrillamail' | 'mailtm' | '1secmail'
  // Provider-specific session data
  session: Record<string, string>
}

export interface TempEmailMessage {
  id: string
  from: string
  subject: string
  text?: string
  html?: string
}

// ============ Shared Utilities ============

/**
 * Fetch with retry and exponential backoff for rate limit handling
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

      // Retry on 5xx errors (rate limits often return 503)
      if (response.status >= 500) {
        const delay = Math.pow(2, attempt) * 2000 // 2s, 4s, 8s
        console.log(`Server error ${response.status}, retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      return response
    } catch (error) {
      lastError = error as Error
      const delay = Math.pow(2, attempt) * 2000
      console.log(`Fetch failed: ${lastError.message}, retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

// ============ Guerrilla Mail Provider ============

const GUERRILLA_API = 'https://api.guerrillamail.com/ajax.php'

async function guerrillaCreateAccount(): Promise<TempEmailAccount> {
  const response = await fetch(`${GUERRILLA_API}?f=get_email_address`)

  if (!response.ok) {
    throw new Error(`Guerrilla Mail error: ${response.status}`)
  }

  const data = await response.json()

  return {
    address: data.email_addr,
    provider: 'guerrillamail',
    session: {
      sid_token: data.sid_token,
    },
  }
}

async function guerrillaGetMessages(account: TempEmailAccount): Promise<TempEmailMessage[]> {
  try {
    const response = await fetchWithRetry(
      `${GUERRILLA_API}?f=get_email_list&offset=0&sid_token=${account.session.sid_token}`
    )

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    const messages: TempEmailMessage[] = []

    for (const msg of data.list || []) {
      messages.push({
        id: msg.mail_id,
        from: msg.mail_from,
        subject: msg.mail_subject,
      })
    }

    return messages
  } catch {
    return []
  }
}

async function guerrillaGetMessage(
  account: TempEmailAccount,
  messageId: string
): Promise<TempEmailMessage | null> {
  try {
    const response = await fetchWithRetry(
      `${GUERRILLA_API}?f=fetch_email&email_id=${messageId}&sid_token=${account.session.sid_token}`
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    return {
      id: data.mail_id,
      from: data.mail_from,
      subject: data.mail_subject,
      text: data.mail_body,
      html: data.mail_body,
    }
  } catch {
    return null
  }
}

// ============ 1secmail Provider ============

const ONESECMAIL_API = 'https://www.1secmail.com/api/v1/'
const ONESECMAIL_DOMAINS = ['1secmail.com', '1secmail.org', '1secmail.net']

async function onesecmailCreateAccount(): Promise<TempEmailAccount> {
  // Generate random username
  const username = `test${Date.now()}${Math.random().toString(36).substring(2, 8)}`
  const domain = ONESECMAIL_DOMAINS[Math.floor(Math.random() * ONESECMAIL_DOMAINS.length)]
  const address = `${username}@${domain}`

  return {
    address,
    provider: '1secmail',
    session: {
      login: username,
      domain: domain,
    },
  }
}

async function onesecmailGetMessages(account: TempEmailAccount): Promise<TempEmailMessage[]> {
  const { login, domain } = account.session
  const response = await fetch(
    `${ONESECMAIL_API}?action=getMessages&login=${login}&domain=${domain}`
  )

  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return (data || []).map((msg: any) => ({
    id: String(msg.id),
    from: msg.from,
    subject: msg.subject,
  }))
}

async function onesecmailGetMessage(
  account: TempEmailAccount,
  messageId: string
): Promise<TempEmailMessage | null> {
  const { login, domain } = account.session
  const response = await fetch(
    `${ONESECMAIL_API}?action=readMessage&login=${login}&domain=${domain}&id=${messageId}`
  )

  if (!response.ok) {
    return null
  }

  const data = await response.json()

  return {
    id: String(data.id),
    from: data.from,
    subject: data.subject,
    text: data.textBody,
    html: data.body,
  }
}

// ============ Mail.tm Provider (backup) ============

const MAIL_TM_API = 'https://api.mail.tm'

async function mailtmCreateAccount(): Promise<TempEmailAccount> {
  // Get domain
  const domainRes = await fetch(`${MAIL_TM_API}/domains`)
  if (!domainRes.ok) throw new Error('Mail.tm unavailable')
  const domainData = await domainRes.json()
  const domain = domainData['hydra:member'][0].domain

  const username = `test${Date.now()}${Math.random().toString(36).substring(7)}`
  const address = `${username}@${domain}`
  const password = 'TestPassword123!'

  // Create account
  await fetch(`${MAIL_TM_API}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  // Get token
  const tokenRes = await fetch(`${MAIL_TM_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  if (!tokenRes.ok) throw new Error('Failed to get mail.tm token')
  const tokenData = await tokenRes.json()

  return {
    address,
    provider: 'mailtm',
    session: { token: tokenData.token },
  }
}

async function mailtmGetMessages(account: TempEmailAccount): Promise<TempEmailMessage[]> {
  const response = await fetch(`${MAIL_TM_API}/messages`, {
    headers: { Authorization: `Bearer ${account.session.token}` },
  })

  if (!response.ok) return []

  const data = await response.json()
  return (data['hydra:member'] || []).map((msg: any) => ({
    id: msg.id,
    from: msg.from?.address || '',
    subject: msg.subject,
  }))
}

async function mailtmGetMessage(
  account: TempEmailAccount,
  messageId: string
): Promise<TempEmailMessage | null> {
  const response = await fetch(`${MAIL_TM_API}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${account.session.token}` },
  })

  if (!response.ok) return null

  const data = await response.json()
  return {
    id: data.id,
    from: data.from?.address || '',
    subject: data.subject,
    text: data.text,
    html: data.html?.join(''),
  }
}

// ============ Unified API ============

/**
 * Create a temporary email account using the first available provider
 */
export async function createTempEmailAccount(): Promise<TempEmailAccount> {
  // Try Guerrilla Mail first (emails actually get delivered here)
  try {
    console.log('Creating temp email with Guerrilla Mail...')
    // Add a small delay to help with rate limiting across tests
    await new Promise((resolve) => setTimeout(resolve, 500))
    const account = await guerrillaCreateAccountWithRetry()
    console.log(`Created temp email: ${account.address}`)
    return account
  } catch (e) {
    console.log('Guerrilla Mail failed, trying Mail.tm...')
  }

  // Fall back to Mail.tm
  try {
    const account = await mailtmCreateAccount()
    console.log(`Created temp email: ${account.address}`)
    return account
  } catch (e) {
    throw new Error('All temp email providers unavailable')
  }
}

/**
 * Guerrilla Mail with retry logic
 */
async function guerrillaCreateAccountWithRetry(): Promise<TempEmailAccount> {
  const response = await fetchWithRetry(`${GUERRILLA_API}?f=get_email_address`)

  if (!response.ok) {
    throw new Error(`Guerrilla Mail error: ${response.status}`)
  }

  const data = await response.json()

  return {
    address: data.email_addr,
    provider: 'guerrillamail',
    session: {
      sid_token: data.sid_token,
    },
  }
}

/**
 * Wait for an email matching the subject pattern
 */
export async function waitForEmail(
  account: TempEmailAccount,
  subjectContains: string,
  timeoutMs = 60000
): Promise<TempEmailMessage> {
  const startTime = Date.now()
  console.log(`Waiting for email containing "${subjectContains}"...`)

  const getMessages =
    account.provider === '1secmail'
      ? onesecmailGetMessages
      : account.provider === 'guerrillamail'
        ? guerrillaGetMessages
        : mailtmGetMessages
  const getMessage =
    account.provider === '1secmail'
      ? onesecmailGetMessage
      : account.provider === 'guerrillamail'
        ? guerrillaGetMessage
        : mailtmGetMessage

  while (Date.now() - startTime < timeoutMs) {
    const messages = await getMessages(account)

    for (const msg of messages) {
      if (msg.subject?.toLowerCase().includes(subjectContains.toLowerCase())) {
        console.log(`Found email: "${msg.subject}"`)
        const fullMsg = await getMessage(account, msg.id)
        if (fullMsg) return fullMsg
      }
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  throw new Error(`Timeout waiting for email containing "${subjectContains}"`)
}

/**
 * Extract a confirmation/verification link from email content
 */
export function extractConfirmationLink(message: TempEmailMessage): string {
  const content = message.html || message.text || ''

  console.log('Email content preview:', content.substring(0, 500))

  // Pattern 1: Look for href with auth/callback or verify
  const hrefMatch = content.match(/href=["']([^"']*(?:auth\/callback|verify)[^"']*)["']/i)
  if (hrefMatch) {
    return hrefMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 2: Look for bare URLs with auth/callback or verify
  const urlMatch = content.match(/(https?:\/\/[^\s<>"']+(?:auth\/callback|verify)[^\s<>"']*)/i)
  if (urlMatch) {
    return urlMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 3: Any link with token parameter
  const tokenMatch = content.match(/(https?:\/\/[^\s<>"']*token=[^\s<>"']*)/i)
  if (tokenMatch) {
    return tokenMatch[1].replace(/&amp;/g, '&')
  }

  throw new Error('Could not find confirmation link in email')
}

/**
 * Extract invitation link from email content
 */
export function extractInvitationLink(message: TempEmailMessage): string {
  const content = message.html || message.text || ''

  // Pattern 1: Look for href with accept-invite
  const hrefMatch = content.match(/href=["']([^"']*accept-invite[^"']*)["']/i)
  if (hrefMatch) {
    return hrefMatch[1].replace(/&amp;/g, '&')
  }

  // Pattern 2: Look for bare URLs with accept-invite
  const urlMatch = content.match(/(https?:\/\/[^\s<>"']+accept-invite[^\s<>"']*)/i)
  if (urlMatch) {
    return urlMatch[1].replace(/&amp;/g, '&')
  }

  throw new Error('Could not find invitation link in email')
}
