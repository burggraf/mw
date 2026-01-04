import { init } from 'pptx-preview'
import html2canvas from 'html2canvas'

export interface PowerPointMetadata {
  title: string
  slideCount: number
}

export interface SlideImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Validates that a file is a valid PPTX file
 */
export function isValidPptxFile(file: File): boolean {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pptx',
  ]
  const validExtension = file.name.toLowerCase().endsWith('.pptx')
  return validTypes.includes(file.type) || validExtension
}

/**
 * Extracts metadata from a PPTX file
 */
export async function getPowerPointMetadata(file: File): Promise<PowerPointMetadata> {
  const arrayBuffer = await file.arrayBuffer()

  // Create a temporary hidden container for the previewer
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  container.style.width = '1920px'
  container.style.height = '1080px'
  document.body.appendChild(container)

  try {
    const previewer = init(container, {
      width: 1920,
      height: 1080,
      mode: 'slide',
    })

    await previewer.load(arrayBuffer)

    // Extract title from filename (remove .pptx extension)
    const title = file.name.replace(/\.pptx$/i, '')
    const slideCount = previewer.slideCount

    previewer.destroy()

    return { title, slideCount }
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * Renders all slides from a PPTX file and captures them as images
 */
export async function renderSlidesToImages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<SlideImage[]> {
  const arrayBuffer = await file.arrayBuffer()

  // Create a hidden container for rendering
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  container.style.width = '1920px'
  container.style.height = '1080px'
  container.style.overflow = 'hidden'
  container.style.backgroundColor = '#ffffff'
  document.body.appendChild(container)

  const images: SlideImage[] = []

  try {
    const previewer = init(container, {
      width: 1920,
      height: 1080,
      mode: 'slide',
    })

    await previewer.load(arrayBuffer)
    const slideCount = previewer.slideCount

    for (let i = 0; i < slideCount; i++) {
      onProgress?.(i + 1, slideCount)

      // Render this slide
      previewer.renderSingleSlide(i)

      // Wait for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 100))

      // Find the slide element within the wrapper
      const slideElement = container.querySelector('.pptx-preview-slide-wrapper') as HTMLElement
        || container.querySelector('.slide-wrapper') as HTMLElement
        || container.firstElementChild as HTMLElement

      if (slideElement) {
        // Capture the slide as an image
        const canvas = await html2canvas(slideElement, {
          backgroundColor: '#ffffff',
          scale: 1,
          useCORS: true,
          allowTaint: true,
          width: 1920,
          height: 1080,
        })

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
            'image/png',
            0.95
          )
        })

        images.push({
          blob,
          width: canvas.width,
          height: canvas.height,
        })
      }
    }

    previewer.destroy()
    return images
  } finally {
    document.body.removeChild(container)
  }
}
