// Google Slides API types

export interface GooglePresentation {
  presentationId: string
  title: string
  slides: GoogleSlide[]
  pageSize: {
    width: { magnitude: number; unit: string }
    height: { magnitude: number; unit: string }
  }
}

export interface GoogleSlide {
  objectId: string
  slideProperties?: {
    layoutObjectId?: string
    masterObjectId?: string
  }
}

export interface GoogleThumbnail {
  contentUrl: string
  width: number
  height: number
}

export interface GoogleSlidesImportState {
  step: 'url' | 'authenticating' | 'loading' | 'preview' | 'importing' | 'complete' | 'error'
  url: string
  presentationId: string | null
  presentation: GooglePresentation | null
  folderName: string
  currentSlide: number
  totalSlides: number
  error: string | null
}
