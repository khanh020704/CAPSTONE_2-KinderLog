// Errors the API answers with on purpose. The error middleware turns them into
// { error: { code, message, fields } } with the matching HTTP status.
export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Invalid request.', fields) {
    super(400, 'VALIDATION_ERROR', message, fields)
  }
}

export class UnauthenticatedError extends HttpError {
  constructor(message = 'Authentication is required.', code = 'UNAUTHENTICATED') {
    super(401, code, message)
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'You do not have permission to do this.', code = 'FORBIDDEN') {
    super(403, code, message)
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found.', code = 'NOT_FOUND') {
    super(404, code, message)
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'This conflicts with an existing record.', code = 'CONFLICT', fields) {
    super(409, code, message, fields)
  }
}

// The request is well formed but not allowed in the record's current state.
export class InvalidStateError extends HttpError {
  constructor(message, code = 'INVALID_STATE') {
    super(422, code, message)
  }
}

// One field is wrong: new FieldError('phone', 'Enter a 10-digit phone number starting with 0.')
export class FieldError extends BadRequestError {
  constructor(field, message) {
    super(message, { [field]: message })
  }
}
