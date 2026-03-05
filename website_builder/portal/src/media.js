/**
 * Client-side media processing for Website Builder.
 * Pure browser APIs (Canvas, ImageBitmap, HTMLVideoElement). No dependencies.
 */

/**
 * Resize an image file to fit within maxDimension, returned as a JPEG Blob.
 * Skips resize if already under max dimensions.
 * @param {File|Blob} file
 * @param {{ maxDimension?: number, quality?: number }} opts
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function resizeImage(file, { maxDimension = 2000, quality = 0.85 } = {}) {
  const bmp = await createImageBitmap(file);
  const { width: origW, height: origH } = bmp;

  // No resize needed
  if (origW <= maxDimension && origH <= maxDimension) {
    const canvas = new OffscreenCanvas(origW, origH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { blob, width: origW, height: origH };
  }

  // Scale down proportionally
  const scale = maxDimension / Math.max(origW, origH);
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { blob, width: w, height: h };
}

/**
 * Create a small thumbnail data URL for list previews.
 * @param {File|Blob} file
 * @param {{ maxDimension?: number, quality?: number }} opts
 * @returns {Promise<string>} data URL
 */
export async function createThumbnail(file, { maxDimension = 200, quality = 0.6 } = {}) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return blobToDataURL(blob);
}

/**
 * Extract a poster thumbnail and metadata from a video file.
 * @param {File} file
 * @param {{ seekTime?: number, maxDimension?: number }} opts
 * @returns {Promise<{ thumbnail: string, duration: number, width: number, height: number }>}
 */
export async function extractVideoThumbnail(file, { seekTime = 1, maxDimension = 400 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Video thumbnail extraction timed out'));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        video.removeAttribute('src');
        video.load();
      }

      video.onerror = () => {
        cleanup();
        reject(new Error(`Cannot load video: ${file.name}`));
      };

      video.onloadedmetadata = () => {
        // Seek to seekTime or 10% of duration, whichever is smaller
        const target = Math.min(seekTime, video.duration * 0.1 || 0);
        video.currentTime = target;
      };

      video.onseeked = () => {
        try {
          const { videoWidth, videoHeight, duration } = video;
          const scale = Math.min(1, maxDimension / Math.max(videoWidth, videoHeight));
          const w = Math.round(videoWidth * scale);
          const h = Math.round(videoHeight * scale);

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, w, h);

          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          cleanup();
          resolve({ thumbnail, duration, width: videoWidth, height: videoHeight });
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Format bytes as human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format seconds as m:ss duration string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// -- Internal helpers --

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
