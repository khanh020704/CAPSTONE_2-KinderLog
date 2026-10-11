import { conversationService } from '../services/index.js'
import { toMessagesQueryDto, toSendMessageDto } from '../dtos/conversation.dto.js'

export async function list(req, res) {
  res.json(await conversationService.list(req.user, { q: req.query.q }))
}

export async function unreadCount(req, res) {
  res.json(await conversationService.unreadCount(req.user))
}

export async function getMessages(req, res) {
  res.json(await conversationService.getMessages(req.user, req.params.peerId, toMessagesQueryDto(req.query)))
}

export async function send(req, res) {
  res.status(201).json(await conversationService.send(req.user, req.params.peerId, toSendMessageDto(req.body)))
}

export async function markRead(req, res) {
  await conversationService.markRead(req.user, req.params.peerId)
  res.status(204).end()
}
