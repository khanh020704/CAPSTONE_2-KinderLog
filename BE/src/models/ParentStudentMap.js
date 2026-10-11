import { Schema, model } from 'mongoose'
import { belongsTo, ref, schemaOptions } from './helpers.js'

export const RELATIONSHIPS = ['Cha', 'Mẹ', 'Ông', 'Bà', 'Người giám hộ', 'Khác']

const parentStudentMapSchema = new Schema(
  {
    parentId: ref('User', { required: true }),
    studentId: ref('Student', { required: true }),
    relationship: { type: String, required: true, enum: RELATIONSHIPS },
    isPrimary: { type: Boolean, required: true, default: false },
    canPickup: { type: Boolean, required: true, default: true },
    // Only active links let a parent see the child, and let the teacher and parent message each other.
    isActive: { type: Boolean, required: true, default: true },
  },
  schemaOptions({ collection: 'parent_student_map', timestamps: { createdAt: true, updatedAt: false } }),
)

parentStudentMapSchema.index({ parentId: 1, studentId: 1 }, { unique: true })
parentStudentMapSchema.index({ studentId: 1 })

belongsTo(parentStudentMapSchema, 'parent', 'User', 'parentId')
belongsTo(parentStudentMapSchema, 'student', 'Student', 'studentId')

export default model('ParentStudentMap', parentStudentMapSchema)
