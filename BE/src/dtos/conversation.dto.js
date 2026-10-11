import { FieldError } from '../utils/errors.js'
import { toMillis } from '../utils/text.js'

const MAX_TEXT = 2000
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export const toMessageResponse = (message) => ({
  id: String(message._id),
  parentId: String(message.parentId),
  teacherId: String(message.teacherId),
  from: message.senderRole.toLowerCase(),
  text: message.content,
  at: toMillis(message.sentAt),
  read: message.isRead,
})

const toLastMessage = (message) =>
  message ? { id: String(message._id), from: message.senderRole.toLowerCase(), text: message.content, at: toMillis(message.sentAt) } : null

// `peer` is the other person of the conversation; `sub` says who they are to the reader.
export const toConversationResponse = (peer, { last, unread } = {}) => ({
  peerId: peer.id,
  name: peer.name,
  sub: peer.sub,
  unread: unread || 0,
  last: toLastMessage(last),
})

export function toSendMessageDto(body) {
  const { text } = body ?? {}
  if (typeof text !== 'string' || !text.trim()) throw new FieldError('text', 'Type a message.')
  if (text.trim().length > MAX_TEXT) throw new FieldError('text', `Keep the message under ${MAX_TEXT} characters.`)
  return { text: text.trim() }
}

// `before` (epoch milliseconds) pages back through older messages.
export function toMessagesQueryDto(query) {
  const { before, limit } = query ?? {}
  const dto = { limit: Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT)) }
  if (before !== undefined) {
    const at = Number(before)
    if (!Number.isFinite(at) || at <= 0) throw new FieldError('before', 'Use a timestamp in milliseconds.')
    dto.before = new Date(at)
  }
  return dto
}
