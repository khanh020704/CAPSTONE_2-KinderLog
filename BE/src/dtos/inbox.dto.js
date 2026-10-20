import { isId } from '../db/table.js'
import { FieldError } from '../utils/errors.js'
import { toMillis } from '../utils/text.js'

// Stored type -> the type the frontend routes on when a notification is clicked.
const TYPE_LABELS = {
  JOURNAL_NEW: 'journal',
  MESSAGE: 'message',
  SYSTEM: 'system',
  ANNOUNCEMENT: 'announcement',
  HEALTH_ALERT: 'health',
  FEEDBACK: 'feedback',
}

export const toInboxItem = (notification) => ({
  id: String(notification.id),
  type: TYPE_LABELS[notification.type] || 'system',
  title: notification.title,
  body: notification.content || '',
  at: toMillis(notification.sentAt),
  read: notification.isRead,
})

export const toInboxQueryDto = (query) => ({ unreadOnly: query?.unread === 'true' })

// { "ids": [...] } marks those notifications, { "all": true } marks every one.
export function toMarkReadDto(body) {
  if (body?.all === true) return { all: true }
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !isId(id))) {
    throw new FieldError('ids', 'Send the ids to mark as read, or { "all": true }.')
  }
  return { ids }
}
