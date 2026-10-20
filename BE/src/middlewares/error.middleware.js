import multer from 'multer'
import { duplicateFields, isDuplicate, referenceProblem } from '../db/errors.js'
import { HttpError, NotFoundError } from '../utils/errors.js'

export function notFoundHandler(req, res) {
  throw new NotFoundError(`${req.method} ${req.originalUrl} does not exist.`)
}

function describe(err) {
  if (err instanceof HttpError) return err

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large.' : 'The upload could not be read.'
    return { status: 400, code: 'VALIDATION_ERROR', message, fields: { [err.field || 'file']: message } }
  }
  if (isDuplicate(err)) {
    const keys = duplicateFields(err)
    return {
      status: 409,
      code: 'CONFLICT',
      message: `A record with the same ${keys.join(' and ') || 'value'} already exists.`,
      fields: Object.fromEntries(keys.map((k) => [k, 'Already in use.'])),
    }
  }
  const reference = referenceProblem(err)
  if (reference?.kind === 'in-use') {
    return { status: 409, code: 'CONFLICT', message: 'Other records still use this record. Remove or change them first.' }
  }
  if (reference) {
    const message = reference.kind === 'check' ? 'This value is not allowed.' : 'The referenced record does not exist.'
    return { status: 400, code: 'VALIDATION_ERROR', message, ...(reference.field && { fields: { [reference.field]: message } }) }
  }
  // Malformed JSON bodies and similar errors raised by Express itself.
  if (err.status >= 400 && err.status < 500) {
    return { status: err.status, code: 'BAD_REQUEST', message: err.message }
  }
  return null
}

// Express recognises an error handler by its four arguments.
export function errorHandler(err, req, res, next) {
  const known = describe(err)
  if (!known) {
    console.error(`${req.method} ${req.originalUrl} failed:`, err)
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } })
  }
  const { status, code, message, fields } = known
  res.status(status).json({ error: { code, message, ...(fields && { fields }) } })
}
