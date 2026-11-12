import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const uploadRoot = () => process.env.UPLOAD_DIR ?? 'uploads';
const maxBytes = () => Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const AUDIO_TYPES = /^(audio\/|video\/webm)/; // MediaRecorder in Chrome reports video/webm for audio-only recordings

/**
 * Photos are kept in memory and handed to MediaStorageService, which stores them in ImageKit when it is configured
 * or under UPLOAD_DIR/photos (served statically at /uploads/photos).
 */
export function photoUpload(): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) =>
      IMAGE_TYPES.includes(file.mimetype)
        ? cb(null, true)
        : cb(new BadRequestException('Only JPEG, PNG, WEBP or HEIC images'), false),
  };
}

/** Recordings stay in memory: they are streamed to Whisper and never stored. */
export function audioUpload(): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes(), files: 1 },
    fileFilter: (_req, file, cb) =>
      AUDIO_TYPES.test(file.mimetype)
        ? cb(null, true)
        : cb(new BadRequestException('The recording must be an audio file'), false),
  };
}
