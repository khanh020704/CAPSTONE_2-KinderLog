import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { memoryStorage, diskStorage } from 'multer';
import { extname, join } from 'path';

const uploadRoot = () => process.env.UPLOAD_DIR ?? 'uploads';
const maxBytes = () => Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

export const PHOTO_PUBLIC_PATH = '/uploads/photos';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const AUDIO_TYPES = /^(audio\/|video\/webm)/; // MediaRecorder in Chrome reports video/webm for audio-only recordings

/** Photos go to disk under UPLOAD_DIR/photos and are served statically at /uploads/photos. */
export function photoUpload(): MulterOptions {
  const dir = join(uploadRoot(), 'photos');
  mkdirSync(dir, { recursive: true });
  return {
    storage: diskStorage({
      destination: dir,
      filename: (_req, file, cb) =>
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`),
    }),
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
