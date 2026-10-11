// Plain create/read/update/delete on every collection, mounted under /admin.
// These endpoints see all schools and classes, so only administrators may use them.
import { Router } from 'express'
import userController from '../controllers/user.controller.js'
import schoolController from '../controllers/school.controller.js'
import classController from '../controllers/class.controller.js'
import studentController from '../controllers/student.controller.js'
import parentStudentMapController from '../controllers/parent-student-map.controller.js'
import attendanceController from '../controllers/attendance.controller.js'
import classDailySummaryController from '../controllers/class-daily-summary.controller.js'
import dailyJournalController from '../controllers/daily-journal.controller.js'
import journalPhotoController from '../controllers/journal-photo.controller.js'
import feedbackController from '../controllers/feedback.controller.js'
import notificationController from '../controllers/notification.controller.js'
import aiProcessingLogController from '../controllers/ai-processing-log.controller.js'
import auditLogController from '../controllers/audit-log.controller.js'

function crudRoutes(controller) {
  const router = Router()
  router.get('/', controller.list)
  router.get('/:id', controller.get)
  router.post('/', controller.create)
  router.patch('/:id', controller.update)
  router.delete('/:id', controller.remove)
  return router
}

const router = Router()

router.use('/users', crudRoutes(userController))
router.use('/schools', crudRoutes(schoolController))
router.use('/classes', crudRoutes(classController))
router.use('/students', crudRoutes(studentController))
router.use('/parent-student-maps', crudRoutes(parentStudentMapController))
router.use('/attendance', crudRoutes(attendanceController))
router.use('/class-daily-summaries', crudRoutes(classDailySummaryController))
router.use('/daily-journals', crudRoutes(dailyJournalController))
router.use('/journal-photos', crudRoutes(journalPhotoController))
router.use('/feedbacks', crudRoutes(feedbackController))
router.use('/notifications', crudRoutes(notificationController))
router.use('/ai-processing-logs', crudRoutes(aiProcessingLogController))
router.use('/audit-logs', crudRoutes(auditLogController))

export default router
