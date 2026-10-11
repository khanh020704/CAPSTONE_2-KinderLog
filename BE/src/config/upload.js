import { mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import multer from 'multer'
import { BadRequestError } from '../utils/errors.js'

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(import.meta.dirname, '../../uploads'))
mkdirSync(UPLOAD_DIR, { recursive: true })

const MB = 1024 * 1024

// The stored name is random and the extension comes from this list, never from the client's file name.
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }
const AUDIO_TYPES = {
  'audio/webm': '.webm',
  'video/webm': '.webm', // some browsers label MediaRecorder audio this way
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
}

const baseType = (file) => file.mimetype.split(';')[0].trim().toLowerCase()

function uploader(types, maxBytes, message) {
  return multer({
    limits: { fileSize: maxBytes, files: 1 },
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (req, file, done) => done(null, `${randomBytes(16).toString('hex')}${types[baseType(file)]}`),
    }),
    fileFilter: (req, file, done) => (types[baseType(file)] ? done(null, true) : done(new BadRequestError(message, { file: message }))),
  })
}

export const imageUpload = uploader(IMAGE_TYPES, 5 * MB, 'Upload a JPEG, PNG, WebP or GIF image.')
export const audioUpload = uploader(AUDIO_TYPES, 25 * MB, 'Upload a WebM, OGG, MP3, M4A or WAV recording.')

// Files are served from /uploads. The address is unguessable but not access-controlled.
export const publicUrl = (req, filename) =>
  `${process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`}/uploads/${filename}`
