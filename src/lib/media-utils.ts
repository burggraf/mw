import { v4 as uuidv4 } from 'uuid';

// Allowed MIME types
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

// Size limits in bytes
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// Thumbnail settings
export const THUMBNAIL_WIDTH = 200;
export const THUMBNAIL_QUALITY = 0.8;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileType?: 'image' | 'video';
}

/**
 * Validates a file's type and size
 */
export function validateFile(file: File): FileValidationResult {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type as AllowedVideoType);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Allowed types: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}`,
    };
  }

  if (isImage && file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image file too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
      fileType: 'image',
    };
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: `Video file too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: ${MAX_VIDEO_SIZE / 1024 / 1024}MB`,
      fileType: 'video',
    };
  }

  return {
    valid: true,
    fileType: isImage ? 'image' : 'video',
  };
}

/**
 * Gets the dimensions of an image file
 */
export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Gets the dimensions and duration of a video file
 */
export function getVideoDimensions(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };

    video.src = url;
  });
}

/**
 * Generates a thumbnail from an image file
 * Returns a WebP blob at the specified quality
 */
export function generateImageThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate thumbnail dimensions maintaining aspect ratio
      const aspectRatio = img.naturalHeight / img.naturalWidth;
      const thumbWidth = THUMBNAIL_WIDTH;
      const thumbHeight = Math.round(THUMBNAIL_WIDTH * aspectRatio);

      // Create canvas and draw scaled image
      const canvas = document.createElement('canvas');
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

      // Convert to WebP blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate thumbnail blob'));
          }
        },
        'image/webp',
        THUMBNAIL_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail generation'));
    };

    img.src = url;
  });
}

/**
 * Generates a thumbnail from a video file
 * Extracts a frame at 1 second or 10% of duration (whichever is smaller)
 * Returns a WebP blob
 */
export function generateVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');

    video.onloadedmetadata = () => {
      // Seek to 1 second or 10% of duration, whichever is smaller
      const seekTime = Math.min(1, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      // Calculate thumbnail dimensions maintaining aspect ratio
      const aspectRatio = video.videoHeight / video.videoWidth;
      const thumbWidth = THUMBNAIL_WIDTH;
      const thumbHeight = Math.round(THUMBNAIL_WIDTH * aspectRatio);

      // Create canvas and draw video frame
      const canvas = document.createElement('canvas');
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);

      // Clean up video URL
      URL.revokeObjectURL(url);

      // Convert to WebP blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate video thumbnail blob'));
          }
        },
        'image/webp',
        THUMBNAIL_QUALITY
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for thumbnail generation'));
    };

    video.src = url;
  });
}

/**
 * Maps MIME type to file extension
 */
export function getFileExtension(mimeType: string): string {
  const mimeToExtension: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };

  return mimeToExtension[mimeType] || 'bin';
}

export interface ImageResizeResult {
  blob: Blob;
  wasResized: boolean;
  originalDimensions: { width: number; height: number };
  newDimensions: { width: number; height: number };
}

/**
 * Resizes an image if either dimension exceeds the maximum
 * Maintains aspect ratio by fitting the longer edge to maxDimension
 * @param file - The image file to check and potentially resize
 * @param maxDimension - Maximum allowed width or height (default: 3840 for 4K)
 * @returns A promise resolving to the (possibly resized) blob and metadata
 */
export function resizeImageIfNeeded(
  file: File | Blob,
  maxDimension: number = 3840
): Promise<ImageResizeResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;

      // Check if resize is needed
      if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
        // No resize needed
        resolve({
          blob: file instanceof File ? file : new File([file], 'image', { type: file.type }),
          wasResized: false,
          originalDimensions: { width: originalWidth, height: originalHeight },
          newDimensions: { width: originalWidth, height: originalHeight },
        });
        return;
      }

      // Calculate new dimensions maintaining aspect ratio
      let newWidth = originalWidth;
      let newHeight = originalHeight;

      if (originalWidth > originalHeight) {
        // Landscape or square: constrain width
        newWidth = maxDimension;
        newHeight = Math.round((originalHeight * maxDimension) / originalWidth);
      } else {
        // Portrait: constrain height
        newHeight = maxDimension;
        newWidth = Math.round((originalWidth * maxDimension) / originalHeight);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // If we can't get a context, return original (shouldn't happen)
        resolve({
          blob: file instanceof File ? file : new File([file], 'image', { type: file.type }),
          wasResized: false,
          originalDimensions: { width: originalWidth, height: originalHeight },
          newDimensions: { width: originalWidth, height: originalHeight },
        });
        return;
      }

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Convert back to blob, preserving original MIME type
      const mimeType = file.type || 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              blob,
              wasResized: true,
              originalDimensions: { width: originalWidth, height: originalHeight },
              newDimensions: { width: newWidth, height: newHeight },
            });
          } else {
            // Blob conversion failed, return original
            resolve({
              blob: file instanceof File ? file : new File([file], 'image', { type: file.type }),
              wasResized: false,
              originalDimensions: { width: originalWidth, height: originalHeight },
              newDimensions: { width: originalWidth, height: originalHeight },
            });
          }
        },
        mimeType,
        0.92 // High quality for resized images
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // On error, return original without resizing
      resolve({
        blob: file instanceof File ? file : new File([file], 'image', { type: file.type }),
        wasResized: false,
        originalDimensions: { width: 0, height: 0 },
        newDimensions: { width: 0, height: 0 },
      });
    };

    img.src = url;
  });
}

/**
 * Generates a storage path for a file
 * @param churchId - The church's unique identifier
 * @param filename - Original filename (used to extract extension if mimeType not provided)
 * @param isThumb - Whether this is a thumbnail path
 * @param mimeType - Optional MIME type for extension lookup
 */
export function generateStoragePath(
  churchId: string,
  filename: string,
  isThumb: boolean = false,
  mimeType?: string
): string {
  const uuid = uuidv4();

  if (isThumb) {
    return `${churchId}/thumbnails/${uuid}_thumb.webp`;
  }

  // Get extension from MIME type or filename
  let extension: string;
  if (mimeType) {
    extension = getFileExtension(mimeType);
  } else {
    // Extract extension from filename
    const parts = filename.split('.');
    extension = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
  }

  return `${churchId}/originals/${uuid}.${extension}`;
}
