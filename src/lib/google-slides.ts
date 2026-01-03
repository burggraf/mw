/**
 * Extracts presentation ID from various Google Slides URL formats
 */
export function extractPresentationId(url: string): string | null {
  // Handle various URL formats:
  // https://docs.google.com/presentation/d/PRESENTATION_ID/edit
  // https://docs.google.com/presentation/d/PRESENTATION_ID/
  // https://docs.google.com/presentation/d/PRESENTATION_ID
  const patterns = [
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

/**
 * Fetches presentation metadata from Google Slides API
 */
export async function getPresentation(
  accessToken: string,
  presentationId: string
): Promise<{
  presentationId: string
  title: string
  slides: Array<{ objectId: string }>
}> {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Presentation not found. Check the URL and your access permissions.')
    }
    if (response.status === 403) {
      throw new Error('You do not have access to this presentation.')
    }
    throw new Error(`Failed to fetch presentation: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetches a slide thumbnail URL from Google Slides API
 */
export async function getSlideThumbnail(
  accessToken: string,
  presentationId: string,
  pageObjectId: string
): Promise<{ contentUrl: string; width: number; height: number }> {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}/pages/${pageObjectId}/thumbnail?thumbnailProperties.thumbnailSize=LARGE&thumbnailProperties.mimeType=PNG`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch slide thumbnail: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Downloads an image from a URL and returns it as a Blob
 */
export async function downloadImage(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`)
  }
  return response.blob()
}
