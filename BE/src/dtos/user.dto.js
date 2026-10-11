import { pick, toResponse } from './helpers.js'

// `password` is plain text from the client; the service stores it as `passwordHash`.
const INPUT_FIELDS = ['username', 'password', 'fullName', 'email', 'phoneNumber', 'role', 'avatarUrl', 'isActive', 'isLocked']
const RESPONSE_FIELDS = ['username', 'fullName', 'email', 'phoneNumber', 'role', 'avatarUrl', 'isActive', 'isLocked', 'lastLoginAt', 'createdAt', 'updatedAt']

export const toCreateUserDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateUserDto = (body) => pick(body, INPUT_FIELDS)
export const toUserResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
