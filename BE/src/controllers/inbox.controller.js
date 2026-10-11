import { inboxService } from '../services/index.js'
import { toInboxQueryDto, toMarkReadDto } from '../dtos/inbox.dto.js'

export async function list(req, res) {
  res.json(await inboxService.list(req.user, toInboxQueryDto(req.query)))
}

export async function unreadCount(req, res) {
  res.json(await inboxService.unreadCount(req.user))
}

export async function markRead(req, res) {
  await inboxService.markRead(req.user, toMarkReadDto(req.body))
  res.status(204).end()
}
