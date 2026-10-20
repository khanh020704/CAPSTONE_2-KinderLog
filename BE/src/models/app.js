// Tables added for the teacher and parent APIs (migration 002): messages, settings and sign-in tokens.
import { all, list, raw, run, sql } from '../db/sql.js'
import { defineTable } from '../db/table.js'
import { created } from './helpers.js'

export const SENDER_ROLES = ['PARENT', 'TEACHER']

// One conversation is one (parentId, teacherId) pair. Text only.
export const Message = defineTable({
  name: 'Message',
  table: 'Messages',
  key: 'MessageID',
  fields: {
    parentId: { type: 'id', ref: 'User', required: true },
    teacherId: { type: 'id', ref: 'User', required: true },
    senderRole: { type: 'string', enum: SENDER_ROLES, required: true },
    content: { type: 'string', max: 2000, required: true },
    // Read by the receiving side.
    isRead: { type: 'bool', required: true, default: false },
    readAt: { type: 'datetime' },
    sentAt: created('SentAt'),
  },
})

// The message repository: the table's operations plus a summary per conversation.
export function messageRepository(executor) {
  const repo = Message.repository(executor)
  return {
    ...repo,
    // For `userId` on side `mine` ('teacherId' or 'parentId'): per peer, the newest message and how many
    // messages from `otherRole` are unread. Resolves to Map(peerId -> { last, unread }).
    async conversationsOf(userId, { mine, theirs, otherRole }, peerIds) {
      if (!peerIds.length) return new Map()
      const column = (field) => raw(field === 'teacherId' ? 'TeacherID' : 'ParentID')
      const rows = await all(
        sql`
          SELECT m.*, s.PeerID, s.Unread FROM (
            SELECT ${column(theirs)} AS PeerID,
              SUM(CASE WHEN SenderRole = ${otherRole} AND IsRead = 0 THEN 1 ELSE 0 END) AS Unread,
              MAX(MessageID) AS LastID
            FROM dbo.Messages WHERE ${column(mine)} = ${Number(userId)} AND ${column(theirs)} IN ${list(peerIds.map(Number))}
            GROUP BY ${column(theirs)}) s
          JOIN dbo.Messages m ON m.MessageID = s.LastID`,
        executor,
      )
      return new Map(rows.map((row) => [String(row.PeerID), { last: Message.toRow(row), unread: row.Unread }]))
    },
  }
}

// System_Settings: one row per setting, the value as JSON text. Its key is text, not a row number,
// so it has a repository of its own instead of a table definition.
export function settingsRepository(executor) {
  return {
    async all() {
      const rows = await all(sql`SELECT SettingKey, SettingValue FROM dbo.System_Settings`, executor)
      return Object.fromEntries(rows.map((row) => [row.SettingKey, JSON.parse(row.SettingValue)]))
    },

    async set(key, value) {
      const json = JSON.stringify(value)
      const now = new Date()
      const changed = await run(sql`UPDATE dbo.System_Settings SET SettingValue = ${json}, UpdatedAt = ${now} WHERE SettingKey = ${key}`, executor)
      if (!changed) await run(sql`INSERT dbo.System_Settings (SettingKey, SettingValue, UpdatedAt) VALUES (${key}, ${json}, ${now})`, executor)
    },
  }
}

// Only the SHA-256 hash of a token is stored, never the token itself.
const token = (name, table, usedField) =>
  defineTable({
    name,
    table,
    key: 'TokenID',
    fields: {
      userId: { type: 'id', ref: 'User', required: true },
      tokenHash: { type: 'string', max: 128, required: true },
      expiresAt: { type: 'datetime', required: true },
      [usedField]: { type: 'datetime' },
      createdAt: created(),
    },
  })

export const RefreshToken = token('RefreshToken', 'Refresh_Tokens', 'revokedAt')
export const PasswordResetToken = token('PasswordResetToken', 'Password_Reset_Tokens', 'usedAt')
