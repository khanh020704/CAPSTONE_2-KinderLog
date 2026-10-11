// The database stores relationships in Vietnamese; the API uses the frontend's English labels.
const RELATIONSHIP_LABELS = {
  Mẹ: 'Mother',
  Cha: 'Father',
  Bà: 'Grandmother',
  Ông: 'Grandfather',
  'Người giám hộ': 'Guardian',
  Khác: 'Other',
}

export const toRelationshipLabel = (relationship) => RELATIONSHIP_LABELS[relationship] || relationship

export const toClassRef = (cls) => (cls ? { id: String(cls._id), name: cls.className } : null)

// `today` is the child's attendance status for today; `parents` are the active links only.
export const toRosterStudent = (student, today, parents) => ({
  id: String(student._id),
  name: student.fullName,
  nickname: student.nickname ?? null,
  dob: student.dateOfBirth,
  gender: student.gender,
  photo: student.photoUrl || '',
  // One note for the teacher, built from the two health fields the school keeps.
  note: [student.allergyHistory, student.healthNote].filter((text) => text?.trim()).join(' · '),
  today,
  parents,
})

export const toRosterParent = (link, parent) => ({
  id: String(parent._id),
  name: parent.fullName,
  phone: parent.phoneNumber ?? null,
  relationship: toRelationshipLabel(link.relationship),
})

export const toClassRosterResponse = (cls, students) => ({ class: toClassRef(cls), students })

export const toDashboardResponse = ({ date, cls, students, attendance, journal, pendingReviews, unreadMessages }) =>
  cls
    ? { date, class: toClassRef(cls), students, attendance, journal, pendingReviews, unreadMessages }
    : { date, class: null }
