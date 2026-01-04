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

  const targetWidth = 1920
  const targetHeight = 1080

  // Create container - on-screen but invisible for proper rendering
  // Using visibility:hidden instead of opacity:0 as it's more reliable for html2canvas
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${targetWidth}px;
    height: ${targetHeight}px;
    overflow: hidden;
    background-color: #ffffff;
    visibility: hidden;
    pointer-events: none;
    z-index: -9999;
  `
  document.body.appendChild(container)

  const images: SlideImage[] = []

  try {
    const previewer = init(container, {
      width: targetWidth,
      height: targetHeight,
      mode: 'slide',
    })

    await previewer.load(arrayBuffer)
    const slideCount = previewer.slideCount

    for (let i = 0; i < slideCount; i++) {
      onProgress?.(i + 1, slideCount)

      // Render this slide
      previewer.renderSingleSlide(i)

      // The library creates .pptx-preview-slide-wrapper with:
      // - width/height from renderPort (should be targetWidth x calculated height)
      // - position: absolute (in slide mode)
      // - top: centered vertically
      // - margin: 0 auto 10px
      //
      // The inner content (.slide-wrapper, etc.) uses CSS transforms to scale up
      // from native PPTX dimensions. html2canvas may not capture transforms correctly.

      const slideWrapper = container.querySelector('.pptx-preview-slide-wrapper') as HTMLElement

      if (slideWrapper) {
        // The library structure is:
        // slideWrapper (pptx-preview-slide-wrapper) - sized to 1920x1080 (our target)
        //   └── slide-background - 100% x 100%, no transform
        //   └── slide-master-wrapper - native PPTX size (e.g. 720x405) with CSS transform: scale()
        //   └── slide-layout-wrapper - native PPTX size with CSS transform
        //   └── slide-wrapper - native PPTX size with CSS transform
        //
        // PROBLEM: html2canvas does NOT properly apply CSS transforms. It captures the
        // inner content at native size (720x405) leaving white space in the 1920x1080 canvas.
        //
        // SOLUTION: Capture the slide-wrapper at native size, then scale up to target.

        // Wait for all images in the slide to load
        const allImages = container.querySelectorAll('img')
        await Promise.all(
          Array.from(allImages).map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve()
            return new Promise<void>(resolve => {
              const timeout = setTimeout(resolve, 3000)
              img.onload = () => { clearTimeout(timeout); resolve() }
              img.onerror = () => { clearTimeout(timeout); resolve() }
            })
          })
        )

        // Make container visible for capture
        container.style.visibility = 'visible'

        // Wait for browser to paint
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })

        // PROBLEM: html2canvas doesn't properly apply CSS transforms.
        // The pptx-preview library renders at native size (e.g., 720x405) with scale(2.667)
        // transforms to reach 1920x1080. html2canvas partially applies these transforms,
        // resulting in content at ~75% size with white bars on right/bottom.
        //
        // SOLUTION: Capture the full slideWrapper, detect the actual content bounds
        // by finding where white bars begin, crop to content area, and scale to target.

        // Capture the slideWrapper as-is
        const capturedCanvas = await html2canvas(slideWrapper, {
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: 1, // Force 1:1 pixel ratio
        })

        // Hide container again after capture
        container.style.visibility = 'hidden'

        // Detect actual content bounds by scanning for white edges
        const tempCtx = capturedCanvas.getContext('2d')
        let contentWidth = capturedCanvas.width
        let contentHeight = capturedCanvas.height

        if (tempCtx) {
          // Scan from right edge to find where content ends (non-white pixels)
          const imageData = tempCtx.getImageData(0, 0, capturedCanvas.width, capturedCanvas.height)
          const pixels = imageData.data

          // Find right edge of content (scan from right, looking for non-white columns)
          for (let x = capturedCanvas.width - 1; x >= 0; x--) {
            let hasContent = false
            // Sample several rows to check if column has content
            for (let sampleY = 0; sampleY < capturedCanvas.height; sampleY += 10) {
              const idx = (sampleY * capturedCanvas.width + x) * 4
              const r = pixels[idx]
              const g = pixels[idx + 1]
              const b = pixels[idx + 2]
              // Check if pixel is not white (allow some tolerance)
              if (r < 250 || g < 250 || b < 250) {
                hasContent = true
                break
              }
            }
            if (hasContent) {
              contentWidth = x + 1
              break
            }
          }

          // Find bottom edge of content
          for (let y = capturedCanvas.height - 1; y >= 0; y--) {
            let hasContent = false
            // Sample several columns to check if row has content
            for (let sampleX = 0; sampleX < contentWidth; sampleX += 10) {
              const idx = (y * capturedCanvas.width + sampleX) * 4
              const r = pixels[idx]
              const g = pixels[idx + 1]
              const b = pixels[idx + 2]
              if (r < 250 || g < 250 || b < 250) {
                hasContent = true
                break
              }
            }
            if (hasContent) {
              contentHeight = y + 1
              break
            }
          }
        }

        // Ensure minimum content size (at least 50% of target)
        contentWidth = Math.max(contentWidth, targetWidth / 2)
        contentHeight = Math.max(contentHeight, targetHeight / 2)

        // Create final canvas and scale content to fill target dimensions
        const finalCanvas = document.createElement('canvas')
        finalCanvas.width = targetWidth
        finalCanvas.height = targetHeight
        const ctx = finalCanvas.getContext('2d')
        if (ctx) {
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          // Crop detected content area and scale to fill target
          ctx.drawImage(
            capturedCanvas,
            0, 0, contentWidth, contentHeight,  // Source: detected content bounds
            0, 0, targetWidth, targetHeight      // Dest: fill entire target canvas
          )
        }

        const blob = await new Promise<Blob>((resolve, reject) => {
          finalCanvas.toBlob(
            b => b ? resolve(b) : reject(new Error('Failed to create blob')),
            'image/png',
            0.95
          )
        })

        images.push({
          blob,
          width: finalCanvas.width,
          height: finalCanvas.height,
        })
      }
    }

    previewer.destroy()
    return images
  } finally {
    document.body.removeChild(container)
  }
}
