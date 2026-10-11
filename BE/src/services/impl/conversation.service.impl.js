import mongoose from 'mongoose'
import { Class, Message, ParentStudentMap, User } from '../../models/index.js'
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
async function parentsOfTeacher(user) {
  const cls = await findTeacherClass(user.id)
  if (!cls) return []
  const students = await activeStudentsOf(cls._id)
  const links = await activeParentLinksOf(students.map((s) => s._id))
  const peers = new Map()
  for (const student of students) {
    for (const link of links.filter((l) => l.studentId.equals(student._id))) {
      const id = String(link.parentId)
      if (!peers.has(id)) peers.set(id, { id, name: link.parent.fullName, sub: `${toRelationshipLabel(link.relationship)} of ${student.fullName}` })
    }
  }
  return [...peers.values()]
}

// A parent may talk to the teachers who lead their children's classes.
async function teachersOfParent(user) {
  const links = await ParentStudentMap.find({ parentId: user.id, isActive: true }).populate('student')
  const classIds = links.filter((l) => l.student?.isActive && l.student.classId).map((l) => l.student.classId)
  const classes = await Class.find({ _id: { $in: classIds }, isActive: true, teacherId: { $ne: null } })
  const teachers = await User.find({ _id: { $in: classes.map((c) => c.teacherId) }, isActive: true })
  const peers = new Map()
  for (const cls of classes) {
    const teacher = teachers.find((t) => t._id.equals(cls.teacherId))
    if (teacher && !peers.has(teacher.id)) peers.set(teacher.id, { id: teacher.id, name: teacher.fullName, sub: `Teacher · ${cls.className}` })
  }
  return [...peers.values()]
}

const peersOf = (user) => (user.role === 'TEACHER' ? parentsOfTeacher(user) : teachersOfParent(user))

async function requirePeer(user, peerId) {
  const peer = (await peersOf(user)).find((p) => p.id === peerId)
  if (!peer) throw new ForbiddenError('You cannot message this person.')
  const side = sideOf(user)
  return { peer, side, pair: { [side.mine]: user.id, [side.theirs]: peerId } }
}

class ConversationServiceImpl extends ConversationService {
  async list(user, { q } = {}) {
    const side = sideOf(user)
    const peers = await peersOf(user)
    const me = new mongoose.Types.ObjectId(user.id)
    const stats = await Message.aggregate([
      { $match: { [side.mine]: me, [side.theirs]: { $in: peers.map((p) => new mongoose.Types.ObjectId(p.id)) } } },
      { $sort: { sentAt: 1 } },
      {
        $group: {
          _id: `$${side.theirs}`,
          last: { $last: '$$ROOT' },
          unread: { $sum: { $cond: [{ $and: [{ $eq: ['$senderRole', side.otherRole] }, { $eq: ['$isRead', false] }] }, 1, 0] } },
        },
      },
    ])
    const byPeer = new Map(stats.map((s) => [String(s._id), s]))
    const needle = normalize(typeof q === 'string' ? q : '')

    const items = peers
      .filter((peer) => normalize(`${peer.name} ${peer.sub}`).includes(needle))
      .map((peer) => toConversationResponse(peer, byPeer.get(peer.id)))
      .sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0))
    return { items }
  }

  async unreadCount(user) {
    const side = sideOf(user)
    return { count: await Message.countDocuments({ [side.mine]: user.id, senderRole: side.otherRole, isRead: false }) }
  }

  async getMessages(user, peerId, { before, limit }) {
    const { pair } = await requirePeer(user, peerId)
    const filter = before ? { ...pair, sentAt: { $lt: before } } : pair
    const newestFirst = await Message.find(filter).sort({ sentAt: -1 }).limit(limit)
    return { items: newestFirst.reverse().map(toMessageResponse) }
  }

  async send(user, peerId, { text }) {
    const { pair, side } = await requirePeer(user, peerId)
    const message = await Message.create({ ...pair, senderRole: side.role, content: text })
    await notifyUsers([peerId], { type: 'MESSAGE', title: `Message from ${user.fullName}`, content: truncate(text, PREVIEW_LENGTH) })
    return toMessageResponse(message)
  }

  async markRead(user, peerId) {
    const { pair, side } = await requirePeer(user, peerId)
    await Message.updateMany({ ...pair, senderRole: side.otherRole, isRead: false }, { isRead: true, readAt: new Date() })
  }
}

export default new ConversationServiceImpl()
