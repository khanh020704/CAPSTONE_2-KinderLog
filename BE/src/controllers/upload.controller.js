import { publicUrl } from '../config/upload.js'
import { FieldError, ForbiddenError } from '../utils/errors.js'

// Who may upload for which purpose.
const PURPOSES = { 'journal-photo': ['TEACHER'], 'student-photo': ['ADMIN'] }

export function uploadImage(req, res) {
  const roles = PURPOSES[req.body?.purpose]
  if (!roles) throw new FieldError('purpose', 'Use journal-photo or student-photo.')
  if (!roles.includes(req.user.role)) throw new ForbiddenError()
  if (!req.file) throw new FieldError('file', 'Choose an image to upload.')
  res.status(201).json({ url: publicUrl(req, req.file.filename), contentType: req.file.mimetype, size: req.file.size })
}
