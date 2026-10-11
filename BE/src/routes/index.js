import { Router } from 'express'
import { audioUpload, imageUpload } from '../config/upload.js'
import { authenticate, authorize } from '../middlewares/auth.middleware.js'
import { getHealth } from '../controllers/health.controller.js'
import * as auth from '../controllers/auth.controller.js'
import * as account from '../controllers/account.controller.js'
import * as settings from '../controllers/settings.controller.js'
import * as teacher from '../controllers/teacher.controller.js'
import * as attendanceSheet from '../controllers/attendance-sheet.controller.js'
import * as journal from '../controllers/journal.controller.js'
import * as conversation from '../controllers/conversation.controller.js'
import * as inbox from '../controllers/inbox.controller.js'
import { uploadImage } from '../controllers/upload.controller.js'
import adminRoutes from './admin.routes.js'

const ADMIN = authorize('ADMIN')
const TEACHER = authorize('TEACHER')
const STAFF = authorize('ADMIN', 'TEACHER')
const CHAT = authorize('TEACHER', 'PARENT')

const router = Router()

// ---------- no sign-in needed ----------
router.get('/health', getHealth)
router.get('/settings/public', settings.getPublicSettings)
router.post('/auth/login', auth.login)
router.post('/auth/refresh', auth.refresh)
router.post('/auth/forgot-password', auth.forgotPassword)
router.post('/auth/reset-password', auth.resetPassword)

// ---------- everything below needs a signed-in user ----------
router.use(authenticate)

router.post('/auth/logout', auth.logout)
router.get('/me', account.getProfile)
router.patch('/me', account.updateProfile)
router.put('/me/password', account.changePassword)

router.get('/settings', settings.getSettings)
router.put('/settings', ADMIN, settings.updateSettings)

router.get('/notifications', inbox.list)
router.get('/notifications/unread-count', inbox.unreadCount)
router.post('/notifications/read', inbox.markRead)

// ---------- teacher (Md/API2.md) ----------
router.get('/teacher/class', TEACHER, teacher.getClass)
router.get('/teacher/dashboard', TEACHER, teacher.getDashboard)

router.get('/attendance', STAFF, attendanceSheet.getSheet)
router.put('/attendance', TEACHER, attendanceSheet.saveSheet)

router.get('/journals', TEACHER, journal.list)
router.post('/journals', TEACHER, journal.create)
router.post('/journals/voice-draft', TEACHER, audioUpload.single('audio'), journal.voiceDraft)
router.get('/journals/:id', TEACHER, journal.get)
router.put('/journals/:id', TEACHER, journal.update)
router.post('/journals/:id/approve', TEACHER, journal.approve)
router.post('/journals/:id/publish', TEACHER, journal.publish)
router.post('/journals/:id/recordings', TEACHER, journal.addRecording)

router.post('/uploads', STAFF, imageUpload.single('file'), uploadImage)

// ---------- messages between a teacher and a parent ----------
router.get('/conversations', CHAT, conversation.list)
router.get('/conversations/unread-count', CHAT, conversation.unreadCount)
router.get('/conversations/:peerId/messages', CHAT, conversation.getMessages)
router.post('/conversations/:peerId/messages', CHAT, conversation.send)
router.post('/conversations/:peerId/read', CHAT, conversation.markRead)

// ---------- record-level management, administrators only ----------
router.use('/admin', ADMIN, adminRoutes)

export default router
