import { UnitOfWork } from '../../db/unit-of-work.js'
import { toConversationResponse, toMessageResponse } from '../../dtos/conversation.dto.js'
import { toRelationshipLabel } from '../../dtos/teacher.dto.js'
import { ForbiddenError } from '../../utils/errors.js'
import { normalize, truncate } from '../../utils/text.js'
import ConversationService from '../conversation.service.js'
import { activeParentLinksOf, activeStudentsOf, findTeacherClass, notifyUsers } from './scope.js'

const PREVIEW_LENGTH = 70

// Which side of a conversation the user is on.
const sideOf = (user) =>
  user.role === 'TEACHER'
    ? { mine: 'teacherId', theirs: 'parentId', role: 'TEACHER', otherRole: 'PARENT' }
    : { mine: 'parentId', theirs: 'teacherId', role: 'PARENT', otherRole: 'TEACHER' }

// A teacher may talk to the parents of the children in their class.
async function parentsOfTeacher(uow, user) {
  const cls = await findTeacherClass(uow, user.id)
  if (!cls) return []
  const students = await activeStudentsOf(uow, cls.id)
  const links = await activeParentLinksOf(uow, students.map((s) => s.id))
  const peers = new Map()
  for (const student of students) {
    for (const link of links.filter((l) => l.studentId === student.id)) {
      const id = link.parentId
      if (!peers.has(id)) peers.set(id, { id, name: link.parent.fullName, sub: `${toRelationshipLabel(link.relationship)} of ${student.fullName}` })
    }
  }
  return [...peers.values()]
}

// A parent may talk to the teachers who lead their children's classes.
async function teachersOfParent(uow, user) {
  const links = await uow.parentLinks.find({ parentId: user.id, isActive: true }, { orderBy: [['id', 'ASC']] })
  const students = links.length ? await uow.students.find({ id: links.map((l) => l.studentId), isActive: true }) : []
  const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))]
  const classes = classIds.length ? await uow.classes.find({ id: classIds, isActive: true, teacherId: { $ne: null } }, { orderBy: [['id', 'ASC']] }) : []
  const teachers = classes.length ? await uow.users.find({ id: classes.map((c) => c.teacherId), isActive: true }) : []
  const peers = new Map()
  for (const cls of classes) {
    const teacher = teachers.find((t) => t.id === cls.teacherId)
    if (teacher && !peers.has(teacher.id)) peers.set(teacher.id, { id: teacher.id, name: teacher.fullName, sub: `Teacher · ${cls.className}` })
  }
  return [...peers.values()]
}

const peersOf = (uow, user) => (user.role === 'TEACHER' ? parentsOfTeacher(uow, user) : teachersOfParent(uow, user))

async function requirePeer(uow, user, peerId) {
  const peer = (await peersOf(uow, user)).find((p) => p.id === peerId)
  if (!peer) throw new ForbiddenError('You cannot message this person.')
  const side = sideOf(user)
  return { peer, side, pair: { [side.mine]: user.id, [side.theirs]: peerId } }
}

class ConversationServiceImpl extends ConversationService {
  async list(user, { q } = {}) {
    const uow = UnitOfWork.read()
    const side = sideOf(user)
    const peers = await peersOf(uow, user)
    // Per peer: the newest message and how many of theirs are unread.
    const byPeer = await uow.messages.conversationsOf(user.id, side, peers.map((p) => p.id))
    const needle = normalize(typeof q === 'string' ? q : '')

    const items = peers
      .filter((peer) => normalize(`${peer.name} ${peer.sub}`).includes(needle))
      .map((peer) => toConversationResponse(peer, byPeer.get(peer.id)))
      .sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0))
    return { items }
  }

  async unreadCount(user) {
    const side = sideOf(user)
    return { count: await UnitOfWork.read().messages.count({ [side.mine]: user.id, senderRole: side.otherRole, isRead: false }) }
  }

  async getMessages(user, peerId, { before, limit }) {
    const uow = UnitOfWork.read()
    const { pair } = await requirePeer(uow, user, peerId)
    const filter = before ? { ...pair, sentAt: { $lt: before } } : pair
    const newestFirst = await uow.messages.find(filter, { orderBy: [['sentAt', 'DESC'], ['id', 'DESC']], limit })
    return { items: newestFirst.reverse().map(toMessageResponse) }
  }

  async send(user, peerId, { text }) {
    const message = await UnitOfWork.run(async (uow) => {
      const { pair, side } = await requirePeer(uow, user, peerId)
      return uow.messages.insert({ ...pair, senderRole: side.role, content: text })
    })
    await notifyUsers([peerId], { type: 'MESSAGE', title: `Message from ${user.fullName}`, content: truncate(text, PREVIEW_LENGTH) })
    return toMessageResponse(message)
  }

  async markRead(user, peerId) {
    await UnitOfWork.run(async (uow) => {
      const { pair, side } = await requirePeer(uow, user, peerId)
      await uow.messages.update({ ...pair, senderRole: side.otherRole, isRead: false }, { isRead: true, readAt: new Date() })
    })
  }
}

export default new ConversationServiceImpl()
