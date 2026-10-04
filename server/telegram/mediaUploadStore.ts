import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UploadedMediaItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  diskPath?: string;
  createdAt: number;
  expiresAt: number;
}

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  normalizedMimeType?: string;
}

export const MAX_MEDIA_SIZES = Object.freeze({
  photo: 10 * 1024 * 1024,      // 10 MB
  animation: 15 * 1024 * 1024,  // 15 MB
  video: 50 * 1024 * 1024,      // 50 MB
  document: 50 * 1024 * 1024    // 50 MB
});

export const BLOCKED_EXTENSIONS = Object.freeze(new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.js', '.mjs', '.cjs',
  '.vbs', '.ps1', '.msi', '.dll', '.com', '.scr', '.pif', '.hta',
  '.cpl', '.jar', '.apk', '.bin', '.app', '.command'
]));

export const ALLOWED_MIME_TYPES = Object.freeze({
  photo: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg'
  ]),
  video: new Set([
    'video/mp4',
    'video/quicktime',
    'video/x-matroska',
    'video/webm',
    'video/mpeg',
    'video/3gpp',
    'video/avi',
    'video/x-msvideo'
  ]),
  animation: new Set([
    'image/gif',
    'video/mp4'
  ])
});

export class MediaUploadStore {
  private inMemoryCache: Map<string, UploadedMediaItem> = new Map();
  private uploadDir: string;

  constructor(customUploadDir?: string) {
    this.uploadDir = customUploadDir || path.join(process.cwd(), 'data', 'uploads');
    this.ensureUploadDir();
  }

  private ensureUploadDir(): void {
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } catch (err: any) {
      console.warn(`[MediaUploadStore] Notice creating upload dir ${this.uploadDir}:`, err?.message);
    }
  }

  public getUploadDir(): string {
    return this.uploadDir;
  }

  /**
   * Validates file size, extension, and MIME type.
   */
  public validateFile(
    file: { buffer?: Buffer; size?: number; filename: string; mimeType: string },
    expectedContentType?: string
  ): MediaValidationResult {
    const size = file.buffer ? file.buffer.length : (file.size || 0);
    const filename = file.filename || 'media';
    const mimeType = (file.mimeType || 'application/octet-stream').toLowerCase().trim();
    const ext = path.extname(filename).toLowerCase();

    // 1. Block dangerous executable files
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `Executable or script files (${ext}) are not permitted for security reasons.`
      };
    }

    if (size <= 0) {
      return { valid: false, error: 'Uploaded file cannot be empty.' };
    }

    // 2. Check size according to content type
    const category = (expectedContentType || 'document').toLowerCase() as keyof typeof MAX_MEDIA_SIZES;
    const maxSize = MAX_MEDIA_SIZES[category] ?? MAX_MEDIA_SIZES.document;

    if (size > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024));
      return {
        valid: false,
        error: `File size (${(size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit for ${category} (${maxMb} MB).`
      };
    }

    // 3. MIME type checks for specific media types
    if (category === 'photo') {
      if (!ALLOWED_MIME_TYPES.photo.has(mimeType) && !['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        return {
          valid: false,
          error: `Invalid photo format (${mimeType}). Supported formats: JPEG, PNG, WEBP.`
        };
      }
    } else if (category === 'video') {
      if (!ALLOWED_MIME_TYPES.video.has(mimeType) && !['.mp4', '.mov', '.mkv', '.webm', '.avi'].includes(ext)) {
        return {
          valid: false,
          error: `Invalid video format (${mimeType}). Supported formats: MP4, MOV, MKV, WEBM.`
        };
      }
    } else if (category === 'animation') {
      if (!ALLOWED_MIME_TYPES.animation.has(mimeType) && !['.gif', '.mp4'].includes(ext)) {
        return {
          valid: false,
          error: `Invalid animation format (${mimeType}). Supported formats: GIF, MP4.`
        };
      }
    }

    return { valid: true, normalizedMimeType: mimeType };
  }

  /**
   * Stores a media file in memory and saves to disk for crash/restart persistence.
   */
  public storeMedia(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    ttlMs: number = 24 * 60 * 60 * 1000 // 24 hours default TTL
  ): UploadedMediaItem {
    const id = `upl_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskFilename = `${id}_${sanitizedFilename}`;
    const diskPath = path.join(this.uploadDir, diskFilename);

    // Save to disk
    try {
      this.ensureUploadDir();
      fs.writeFileSync(diskPath, buffer);
    } catch (err: any) {
      console.warn(`[MediaUploadStore] Could not write to disk ${diskPath}:`, err?.message);
    }

    const item: UploadedMediaItem = {
      id,
      filename: sanitizedFilename,
      mimeType,
      size: buffer.length,
      buffer,
      diskPath,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs
    };

    this.inMemoryCache.set(id, item);
    return item;
  }

  /**
   * Retrieves an uploaded media item by ID (resolving from memory or reading from disk).
   */
  public getMedia(id: string): UploadedMediaItem | undefined {
    if (!id) return undefined;
    const cleanId = id.startsWith('upload:') ? id.substring(7) : id;

    // 1. Check memory cache
    const cached = this.inMemoryCache.get(cleanId);
    if (cached) {
      return cached;
    }

    // 2. Check disk
    try {
      this.ensureUploadDir();
      const files = fs.readdirSync(this.uploadDir);
      const match = files.find(f => f.startsWith(`${cleanId}_`) || f === cleanId);
      if (match) {
        const fullPath = path.join(this.uploadDir, match);
        const buffer = fs.readFileSync(fullPath);
        const originalName = match.replace(`${cleanId}_`, '');
        const ext = path.extname(originalName).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.pdf') mimeType = 'application/pdf';

        const item: UploadedMediaItem = {
          id: cleanId,
          filename: originalName || 'file',
          mimeType,
          size: buffer.length,
          buffer,
          diskPath: fullPath,
          createdAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        };
        this.inMemoryCache.set(cleanId, item);
        return item;
      }
    } catch (err: any) {
      console.warn(`[MediaUploadStore] Error retrieving media ${cleanId} from disk:`, err?.message);
    }

    return undefined;
  }

  public hasMedia(id: string): boolean {
    return Boolean(this.getMedia(id));
  }

  public deleteMedia(id: string): boolean {
    const cleanId = id.startsWith('upload:') ? id.substring(7) : id;
    const cached = this.inMemoryCache.get(cleanId);
    this.inMemoryCache.delete(cleanId);

    if (cached?.diskPath && fs.existsSync(cached.diskPath)) {
      try {
        fs.unlinkSync(cached.diskPath);
      } catch {}
    }

    return true;
  }

  public reset(): void {
    this.inMemoryCache.clear();
  }
}

export const mediaUploadStore = new MediaUploadStore();
