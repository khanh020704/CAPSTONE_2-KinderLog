import mongoose from 'mongoose'
import multer from 'multer'
import { HttpError, NotFoundError } from '../utils/errors.js'

const DUPLICATE_KEY = 11000
const DOCUMENT_VALIDATION_FAILED = 121

export function notFoundHandler(req, res) {
  throw new NotFoundError(`${req.method} ${req.originalUrl} does not exist.`)
}

function describe(err) {
  if (err instanceof HttpError) return err

  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]))
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', fields }
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, code: 'VALIDATION_ERROR', message: `Invalid value for ${err.path}.`, fields: { [err.path]: 'Invalid value.' } }
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large.' : 'The upload could not be read.'
    return { status: 400, code: 'VALIDATION_ERROR', message, fields: { [err.field || 'file']: message } }
  }
  if (err.code === DUPLICATE_KEY) {
    const keys = Object.keys(err.keyPattern || {})
    return {
      status: 409,
      code: 'CONFLICT',
      message: `A record with the same ${keys.join(' and ') || 'value'} already exists.`,
      fields: Object.fromEntries(keys.map((k) => [k, 'Already in use.'])),
    }
  }
  if (err.code === DOCUMENT_VALIDATION_FAILED) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'The record does not match the database rules.' }
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
    console.error(err)
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } })
  }
  const { status, code, message, fields } = known
  res.status(status).json({ error: { code, message, ...(fields && { fields }) } })
}
