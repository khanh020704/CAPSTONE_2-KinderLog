import { Schema, model } from 'mongoose'
import { hasMany, schemaOptions } from './helpers.js'

export const USER_ROLES = ['ADMIN', 'TEACHER', 'PARENT']

const userSchema = new Schema(
  {
    username: { type: String, required: true, maxlength: 50, unique: true },
    // Left out of query results; load it with .select('+passwordHash') when checking a login.
    passwordHash: { type: String, required: true, maxlength: 255, select: false },
    fullName: { type: String, required: true, maxlength: 100 },
    // sparse: users without an email do not collide on the unique index.
    email: { type: String, maxlength: 150, unique: true, sparse: true },
    // Used to sign in. sparse: users without a phone number do not collide on the unique index.
    phoneNumber: { type: String, maxlength: 15, unique: true, sparse: true },
    role: { type: String, required: true, enum: USER_ROLES },
    avatarUrl: { type: String, maxlength: 500 },
    isActive: { type: Boolean, required: true, default: true },
    isLocked: { type: Boolean, required: true, default: false },
    lastLoginAt: { type: Date },
  },
  schemaOptions({ collection: 'users', timestamps: true }),
)

hasMany(userSchema, 'classes', 'Class', 'teacherId')
hasMany(userSchema, 'childLinks', 'ParentStudentMap', 'parentId')
hasMany(userSchema, 'notifications', 'Notification', 'userId')

export default model('User', userSchema)
