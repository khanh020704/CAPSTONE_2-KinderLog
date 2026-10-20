// Checks of the voice-to-journal pipeline that need no AI and no database: name matching,
// the review of entries (as an AI or the keyword engine would produce them) and the
// assembly of the journal. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adultWordBefore, matchStudentName, refineSpokenName } from '../src/utils/vietnamese-names.js'
import { assembleDraft, polarity, reviewDraft } from '../src/utils/journal-review.js'
import { draftFromTranscript } from '../src/utils/journal-draft.js'

const CLASS = ['Nguyễn Minh An', 'Trần Bảo Ngọc', 'Lê Gia Huy', 'Phạm Khánh Linh', 'Hoàng Đức Minh', 'Vũ Ngọc Diệp', 'Đỗ Gia Hưng']
const students = CLASS.map((fullName, i) => ({ id: `s${i + 1}`, fullName }))
const id = (fullName) => students.find((s) => s.fullName === fullName).id
const [AN, NGOC, HUY, LINH, MINH, DIEP, HUNG] = CLASS.map(id)

// Runs entries through the same steps as POST /journals/voice-draft.
function draft(entries, { transcript = entries.map((e) => e.text).join(' '), reported = [], existing } = {}) {
  const reviewed = reviewDraft({ entries, students, transcript, reported, existing })
  return { ...assembleDraft(reviewed.entries, students), issues: reviewed.issues }
}
const named = (section, text, ...mentions) => ({ section, status: 'named', text, mentions: mentions.map(([spoken, studentId = null]) => ({ spoken, studentId })) })
const everyone = (section, text, status = 'all') => ({ section, status, text, mentions: [] })
const visibleToAll = (d) => Object.values(d.sections).filter(Boolean).join(' ')
const types = (d) => d.issues.map((i) => i.type).sort()

// ---------- names ----------

test('name: exact forms of a name resolve to that child', () => {
  for (const [spoken, child] of [['Phạm Khánh Linh', LINH], ['Khánh Linh', LINH], ['bé Linh', LINH], ['Minh An', AN], ['bé Minh', MINH], ['Ngọc', NGOC], ['Gia Hưng', HUNG]]) {
    assert.deepEqual(matchStudentName(spoken, students), { match: 'exact', studentId: child }, spoken)
  }
})

test('name: a middle name never identifies a child', () => {
  // "Minh" is the middle name of Nguyễn Minh An and the given name of Hoàng Đức Minh.
  assert.equal(matchStudentName('Minh', students).studentId, MINH)
  // "Đức" is only a middle name.
  assert.equal(matchStudentName('bé Đức', students).match, 'unknown')
})

test('name: one wrong character or tone mark is a mismatch, not a match', () => {
  for (const [spoken, child] of [['Trần Bảo Ngoc', NGOC], ['Phạm Khánh Lin', LINH], ['bé Ân', AN], ['Gia Hung', HUNG]]) {
    const result = matchStudentName(spoken, students)
    assert.equal(result.match, 'mismatch', spoken)
    assert.equal(result.studentId, null, spoken)
    assert.deepEqual(result.candidates, [child], spoken)
  }
})

test('name: a wrong surname is a mismatch', () => {
  const result = matchStudentName('Lê Bảo Ngọc', students)
  assert.equal(result.match, 'mismatch')
  assert.deepEqual(result.candidates, [NGOC])
})

test('name: a name close to another child is never resolved to that child', () => {
  // Hùng is not in the class; Hưng and Huy are.
  const result = matchStudentName('bé Hùng', students)
  assert.equal(result.match, 'mismatch')
  assert.equal(result.studentId, null)
  assert.deepEqual(result.candidates, [HUNG])
})

test('name: two children with the same given name are ambiguous', () => {
  const twins = [...students, { id: 'x1', fullName: 'Đỗ Thu Ngọc' }]
  const result = matchStudentName('bé Ngọc', twins)
  assert.equal(result.match, 'ambiguous')
  assert.deepEqual(result.candidates.sort(), [NGOC, 'x1'].sort())
})

test('name: another first letter is another name, not a near miss', () => {
  // "Tùng" and "Hưng" differ in one letter without tone marks, but they are different names.
  assert.equal(matchStudentName('bé Tùng', students).match, 'unknown')
  assert.equal(matchStudentName('bé Dũng', students).match, 'unknown')
})

test('name: a name said again in full is the full name', () => {
  assert.equal(refineSpokenName('Huy Lê Gia Huy', students), 'lê gia huy')
  assert.equal(matchStudentName(refineSpokenName('Huy Lê Gia Huy', students), students).studentId, HUY)
})

test('name: "mai" (tomorrow) glued to a name by speech recognition is left out', () => {
  assert.equal(refineSpokenName('Minh Mai', students), 'minh')
  // A real name is kept as it is, and so is one that does not become exact.
  const withMai = [...students, { id: 'mai', fullName: 'Lê Ngọc Mai' }]
  assert.equal(refineSpokenName('Ngọc Mai', withMai), 'Ngọc Mai')
  assert.equal(refineSpokenName('Tuấn Mai', students), 'Tuấn Mai')
})

test('name: a name only ever said after a word for an adult is never given to a child', () => {
  const withMai = [...students, { id: 'mai', fullName: 'Lê Ngọc Mai' }]
  const transcript = 'Nhờ phụ huynh Mai mang áo khoác cho các con.'
  const reviewed = reviewDraft({ entries: [named('note', transcript, ['Mai', 'mai'])], students: withMai, transcript })
  const d = { ...assembleDraft(reviewed.entries, withMai), issues: reviewed.issues }
  assert.deepEqual(d.personal, {})
  assert.equal(visibleToAll(d), '')
  assert.equal(d.issues[0].type, 'ambiguous_student')
  assert.ok(d.issues[0].held && d.issues[0].message.includes('"huynh"'))
  assert.deepEqual(d.issues[0].candidates, ['mai'])
  // "mẹ bé Minh": the name comes after "bé", so the message goes to Minh's parents.
  assert.equal(adultWordBefore('Minh', 'nhắn mẹ bé Minh mai mang thêm quần áo'), null)
})

// ---------- attendance ----------

const withAttendance = (entries, attendance) => {
  const transcript = entries.map((e) => e.text).join(' ')
  const reviewed = reviewDraft({ entries, students, transcript, attendance })
  return { ...assembleDraft(reviewed.entries, students), issues: reviewed.issues }
}

test('attendance: a child marked absent who "ate everything" is a point to confirm', () => {
  const d = withAttendance([named('meal', 'Bé An ăn hết suất.', ['An', AN])], { [AN]: { status: 'absent', note: 'Sốt' } })
  const issue = d.issues.find((i) => i.type === 'attendance_mismatch')
  assert.ok(issue && !issue.held && issue.status === 'open')
  assert.deepEqual(issue.studentIds, [AN])
  assert.ok(issue.message.includes('marked absent') && issue.message.includes('Sốt'))
  // Kept in the child's note for the teacher to check, not dropped.
  assert.equal(d.personal[AN], 'Bé An ăn hết suất.')
})

test('attendance: why an absent child is away, and messages to their parents, are fine', () => {
  const away = { [AN]: { status: 'absent' } }
  for (const entry of [named('health', 'Bé An hôm nay nghỉ ốm.', ['An', AN]), named('note', 'Nhắn mẹ bé An mai mang thêm quần áo.', ['An', AN]), named('note', 'Bé An vắng mặt có xin phép.', ['An', AN])]) {
    assert.deepEqual(withAttendance([entry], away).issues.filter((i) => i.type === 'attendance_mismatch'), [], entry.text)
  }
})

test('attendance: a child marked present who "stayed home" is a point to confirm; the nap is not an absence', () => {
  const here = { [HUY]: { status: 'present' }, [LINH]: { status: 'late' } }
  const d = withAttendance([named('note', 'Bé Huy hôm nay nghỉ học.', ['Huy', HUY]), named('sleep', 'Bé Linh nghỉ trưa ngon.', ['Linh', LINH])], here)
  const mismatches = d.issues.filter((i) => i.type === 'attendance_mismatch')
  assert.deepEqual(mismatches.map((i) => i.studentIds), [[HUY]])
  assert.ok(mismatches[0].message.includes('marked present'))
})

test('attendance: "the whole class was there" on a day a child is absent is a point to confirm', () => {
  const minhAway = { [MINH]: { status: 'absent', note: 'ốm' }, [AN]: { status: 'present' } }
  for (const said of ['Hôm nay tất cả các bạn đi học đầy đủ.', 'Các bạn đi học đầy đủ.', 'Lớp mình hôm nay đông đủ, các con đều có mặt.', 'Không bạn nào nghỉ học.']) {
    const d = withAttendance([everyone('note', said)], minhAway)
    const issue = d.issues.find((i) => i.type === 'attendance_mismatch')
    assert.ok(issue, said)
    assert.deepEqual(issue.studentIds, [MINH], said)
    assert.ok(issue.message.includes('Hoàng Đức Minh') && issue.message.includes('every parent'), said)
  }
})

test('attendance: class statements that are not about attendance, or a day nobody is absent, are fine', () => {
  const minhAway = { [MINH]: { status: 'absent' } }
  for (const said of ['Các con ăn uống đầy đủ.', 'Cả lớp ăn hết suất.', 'Các con được ra về với mẹ.']) {
    assert.deepEqual(withAttendance([everyone('meal', said)], minhAway).issues, [], said)
  }
  assert.deepEqual(withAttendance([everyone('note', 'Các bạn đi học đầy đủ.')], { [AN]: { status: 'present' } }).issues, [])
  assert.deepEqual(withAttendance([everyone('note', 'Các bạn đi học đầy đủ.')], {}).issues, [])
})

test('attendance: a child not recorded that day is not checked', () => {
  assert.deepEqual(withAttendance([named('meal', 'Bé Ngọc ăn ngon.', ['Ngọc', NGOC])], {}).issues, [])
})

// ---------- review ----------

test('correct name: the statement becomes that child’s private note', () => {
  const d = draft([named('sleep', 'Bé Khánh Linh hôm nay ngủ trưa rất ngon.', ['Khánh Linh', LINH])])
  assert.deepEqual(d.personal, { [LINH]: 'Bé Khánh Linh hôm nay ngủ trưa rất ngon.' })
  assert.equal(visibleToAll(d), '')
  assert.deepEqual(d.issues, [])
})

test('misspelled full name: held for the teacher, even when the AI picked the child', () => {
  const d = draft([
    named('meal', 'Bạn Trần Bảo Ngoc hôm nay ăn ít.', ['Trần Bảo Ngoc', NGOC]),
    named('meal', 'Bé Phạm Khánh Lin tự xúc cơm.', ['Phạm Khánh Lin']),
  ])
  assert.deepEqual(d.personal, {})
  assert.equal(visibleToAll(d), '')
  assert.deepEqual(types(d), ['name_mismatch', 'name_mismatch'])
  assert.ok(d.issues.every((i) => i.held && i.status === 'open'))
  assert.deepEqual(d.issues.map((i) => i.candidates), [[NGOC], [LINH]])
})

test('name close to another child: held with the likely child, never assigned to it', () => {
  const d = draft([named('health', 'Bé Hùng bị ho nhiều buổi chiều.', ['Hùng', HUY])])
  assert.equal(d.personal[HUY], undefined)
  assert.equal(d.personal[HUNG], undefined)
  assert.equal(visibleToAll(d), '')
  const held = d.issues.find((i) => i.held)
  assert.equal(held.type, 'name_mismatch')
  assert.deepEqual(held.spokenNames, ['Hùng'])
  // A cough is unusual health information: it is flagged as well.
  assert.ok(types(d).includes('health_alert'))
})

test('name not in the class: held as unknown', () => {
  const d = draft([named('emotion', 'Bé Tuấn Kiệt hôm nay được cô khen.', ['Tuấn Kiệt'])])
  assert.equal(visibleToAll(d), '')
  assert.equal(d.issues[0].type, 'unknown_student')
  assert.ok(d.issues[0].held)
})

test('contradiction about one child: both statements kept and flagged, nothing fixed', () => {
  const d = draft([
    named('meal', 'Bé Huy ăn hết suất cơm buổi trưa.', ['Huy', HUY]),
    named('meal', 'Bé Huy bỏ ăn hoàn toàn.', ['Huy', HUY]),
  ])
  assert.equal(d.personal[HUY], 'Bé Huy ăn hết suất cơm buổi trưa. Bé Huy bỏ ăn hoàn toàn.')
  const contradiction = d.issues.find((i) => i.type === 'contradiction')
  assert.ok(contradiction && !contradiction.held)
  assert.deepEqual(contradiction.studentIds, [HUY])
})

test('contradiction in health: "no child unwell" against a child with a fever', () => {
  const d = draft([everyone('health', 'Không bạn nào bị ốm.', 'nobody'), named('health', 'Bé Diệp bị sốt nhẹ.', ['Diệp', DIEP])])
  assert.ok(types(d).includes('contradiction'))
  assert.ok(types(d).includes('health_alert'))
})

test('contradiction with what the journal already says (a further recording)', () => {
  const d = draft([named('meal', 'Bé An bỏ ăn.', ['An', AN])], { existing: { sections: {}, personal: { [AN]: 'Bé An ăn hết suất.' } } })
  assert.ok(types(d).includes('contradiction'))
})

test('the AI’s own reports are kept, and a duplicate contradiction is not added twice', () => {
  const entries = [named('meal', 'Bé Huy ăn hết suất.', ['Huy', HUY]), named('meal', 'Bé Huy bỏ ăn.', ['Huy', HUY])]
  const reported = [
    { type: 'contradiction', section: 'meal', studentIds: [HUY], text: 'ăn hết suất / bỏ ăn', message: 'Huy both ate everything and refused to eat.' },
    { type: 'unclear', section: 'note', studentIds: [], text: 'mai nhớ cái kia', message: 'It is not clear what parents should bring.' },
  ]
  const d = draft(entries, { reported })
  assert.equal(d.issues.filter((i) => i.type === 'contradiction').length, 1)
  assert.equal(d.issues.filter((i) => i.type === 'unclear').length, 1)
})

test('one child with several problems in several sections', () => {
  const d = draft([
    named('meal', 'Bé An hôm nay ăn ít.', ['An', AN]),
    named('sleep', 'Bé An ngủ không ngon.', ['An', AN]),
    named('health', 'Bé An hơi sốt về chiều.', ['An', AN]),
    named('emotion', 'Bé An quấy khóc nhiều.', ['An', AN]),
  ])
  assert.equal(d.personal[AN], 'Bé An hôm nay ăn ít. Bé An ngủ không ngon. Bé An hơi sốt về chiều. Bé An quấy khóc nhiều.')
  assert.equal(visibleToAll(d), '')
  assert.deepEqual(types(d), ['health_alert'])
})

test('missing name: an incident about one unnamed child is held, a group statement is not', () => {
  const d = draft([
    { section: 'health', status: 'part', text: 'Có một bạn bị ngã trầy đầu gối.', mentions: [] },
    { section: 'meal', status: 'part', text: 'Một vài bạn ăn chậm.', mentions: [] },
    { section: 'health', status: 'named', text: 'Bạn ấy bị nôn sau bữa trưa.', mentions: [] },
  ])
  assert.equal(d.sections.meal, 'Một vài bạn ăn chậm.')
  assert.equal(d.sections.health, '')
  assert.equal(d.issues.filter((i) => i.type === 'missing_student' && i.held).length, 2)
})

test('class and individual cases together: the class is shared, each child private', () => {
  const d = draft([
    everyone('meal', 'Cả lớp ăn hết suất.'),
    named('meal', 'Bé Huy ăn ít.', ['Huy', HUY]),
    everyone('sleep', 'Các con ngủ trưa ngon.'),
    named('note', 'Nhắn mẹ bé Minh mai mang thêm quần áo.', ['Minh', MINH]),
    everyone('note', 'Nhờ phụ huynh mai mang áo khoác cho các con.'),
  ])
  assert.deepEqual(d.sections, { meal: 'Cả lớp ăn hết suất.', learning: '', sleep: 'Các con ngủ trưa ngon.', health: '', emotion: '', note: 'Nhờ phụ huynh mai mang áo khoác cho các con.' })
  assert.deepEqual(d.personal, { [HUY]: 'Bé Huy ăn ít.', [MINH]: 'Nhắn mẹ bé Minh mai mang thêm quần áo.' })
  assert.deepEqual(d.issues, [])
  // Class entries come first, then each child.
  assert.deepEqual(d.entries.map((e) => e.status), ['all', 'all', 'all', 'named', 'named'])
})

test('a class statement that names a child is held instead of being shown to every parent', () => {
  const d = draft([everyone('meal', 'Cả lớp ăn hết suất, trừ bé Huy ăn ít.')])
  assert.equal(visibleToAll(d), '')
  assert.equal(d.issues[0].type, 'child_named_in_class_text')
  assert.deepEqual(d.issues[0].candidates, [HUY])
})

test('medical words the teacher did not say are flagged, never kept silently', () => {
  const d = draft([named('health', 'Bé An bị viêm họng.', ['An', AN])], { transcript: 'bé An bị đau họng' })
  assert.ok(types(d).includes('unsupported_content'))
})

test('negated symptoms are not unusual health information', () => {
  for (const text of ['Không bạn nào bị ốm.', 'Bé An không sốt.', 'Bé An đã hết ho.']) assert.notEqual(polarity('health', text), 'bad', text)
  assert.equal(polarity('health', 'Bé An bị sốt nhẹ.'), 'bad')
  const d = draft([named('health', 'Bé An không sốt, sức khỏe bình thường.', ['An', AN])])
  assert.deepEqual(d.issues, [])
})

test('every issue has what the confirmation screen needs', () => {
  const d = draft([named('health', 'Bé Hùng bị ho.', ['Hùng'])])
  for (const issue of d.issues) {
    assert.match(issue.id, /^iss_[0-9a-f]+$/)
    assert.equal(issue.status, 'open')
    assert.ok(issue.message.length > 10)
    for (const key of ['spokenNames', 'candidates', 'studentIds', 'assignedTo']) assert.ok(Array.isArray(issue[key]), key)
  }
})

// ---------- keyword engine (no AI configured) ----------

test('keyword engine: unpunctuated speech is split at children and topics', () => {
  const d = draftFromTranscript('cả lớp ăn hết suất trừ bé Huy ăn ít các con ngủ trưa ngon nhắn mẹ bé Minh mai mang thêm quần áo', students)
  assert.equal(d.sections.meal, 'Cả lớp ăn hết suất.')
  assert.equal(d.sections.sleep, 'Các con ngủ trưa ngon.')
  assert.ok(d.personal[HUY].includes('Huy ăn ít'))
  assert.ok(d.personal[MINH].includes('mẹ bé Minh'))
  assert.ok(!visibleToAll(d).includes('Huy') && !visibleToAll(d).includes('Minh'))
})

test('keyword engine: a misspelled or unknown name is held, not guessed', () => {
  const d = draftFromTranscript('bạn Trần Bảo Ngoc hôm nay ăn ít còn bé Phúc rất ngoan', students)
  assert.deepEqual(d.personal, {})
  assert.equal(visibleToAll(d), '')
  assert.deepEqual(types(d), ['name_mismatch', 'unknown_student'])
})

// ---------- several children in one statement ----------

test('several children: different things about each go to each child only', () => {
  const d = draft([named('sleep', 'Lê Gia Huy ngủ khoảng 1 tiếng, Phạm Khánh Linh ngủ hơi muộn.', ['Lê Gia Huy', HUY], ['Phạm Khánh Linh', LINH])])
  assert.equal(d.personal[HUY], 'Lê Gia Huy ngủ khoảng 1 tiếng.')
  assert.equal(d.personal[LINH], 'Phạm Khánh Linh ngủ hơi muộn.')
})

test('several children: "còn" and a clause without a name stay with the child before', () => {
  const d = draft([named('meal', 'Bé An ăn hết suất, còn bé Ngọc ăn ít, cô phải nhắc.', ['An', AN], ['Ngọc', NGOC])])
  assert.equal(d.personal[AN], 'Bé An ăn hết suất.')
  assert.equal(d.personal[NGOC], 'Bé Ngọc ăn ít, cô phải nhắc.')
})

test('several children: something done together stays whole for both', () => {
  const d = draft([named('learning', 'Bé An và bé Huy cùng xếp một ngôi nhà rất đẹp.', ['An', AN], ['Huy', HUY])])
  assert.equal(d.personal[AN], 'Bé An và bé Huy cùng xếp một ngôi nhà rất đẹp.')
  assert.equal(d.personal[HUY], d.personal[AN])
})

test('several children: each piece is checked against its own child', () => {
  const reviewed = reviewDraft({
    entries: [named('meal', 'Bé An ăn hết suất, bé Minh ăn được nửa bát.', ['An', AN], ['Minh', MINH])],
    students,
    transcript: 'Bé An ăn hết suất, bé Minh ăn được nửa bát.',
    attendance: { [AN]: { status: 'present' }, [MINH]: { status: 'absent' } },
  })
  const mismatch = reviewed.issues.filter((i) => i.type === 'attendance_mismatch')
  assert.deepEqual(mismatch.map((i) => [i.studentIds, i.text]), [[[MINH], 'Bé Minh ăn được nửa bát.']])
})

// ---------- corrections between recordings ----------

// A further recording, checked against what the journal already says.
function again(entries, existing, transcript = entries.map((e) => e.text).join(' ')) {
  return reviewDraft({ entries, students, transcript, existing: { sections: {}, personal: {}, ...existing } })
}
const corrections = (r) => r.issues.filter((i) => i.type === 'correction')

test('correction: "cô nhầm" about the same child and topic replaces the earlier statement', () => {
  const r = again([named('meal', 'Cô nhầm, bé An ăn hết suất.', ['An', AN])], { personal: { [AN]: 'Bé An hôm nay ăn nửa suất cơm.' } })
  const [fix] = corrections(r)
  assert.equal(fix.previousText, 'Bé An hôm nay ăn nửa suất cơm.')
  assert.equal(fix.text, 'Bé An ăn hết suất.')
  assert.deepEqual(fix.studentIds, [AN])
  assert.equal(fix.held, false)
  assert.equal(r.entries[0].text, 'Bé An ăn hết suất.', 'the correction words are not shown to parents')
  assert.ok(!r.issues.some((i) => i.type === 'contradiction'), 'a correction is not a contradiction')
})

test('correction: found from the transcript when the AI left the correction words out', () => {
  const r = again([named('meal', 'Bé An ăn hết suất.', ['An', AN])], { personal: { [AN]: 'Bé An hôm nay ăn nửa suất cơm.' } }, 'Cô nhầm, bé An ăn hết suất.')
  assert.equal(corrections(r)[0]?.previousText, 'Bé An hôm nay ăn nửa suất cơm.')
})

test('correction: health, only the statement of that topic is replaced', () => {
  const r = again([named('health', 'Cô giáo nhầm rồi, sáng nay bé Minh không bị ốm.', ['Minh', MINH])], { personal: { [MINH]: 'Sáng nay bé Minh bị ốm. Bé Minh ăn hết suất.' } })
  const [fix] = corrections(r)
  assert.equal(fix.previousText, 'Sáng nay bé Minh bị ốm.')
  assert.equal(fix.text, 'Sáng nay bé Minh không bị ốm.')
})

test('correction: the class section', () => {
  const r = again([everyone('meal', 'Cô nhầm, cả lớp ăn được khoảng một nửa suất.')], { sections: { meal: 'Cả lớp ăn hết suất.' } })
  assert.equal(corrections(r)[0]?.previousText, 'Cả lớp ăn hết suất.')
  assert.deepEqual(corrections(r)[0].studentIds, [])
})

test('new information, not a correction: both kept, nothing replaced', () => {
  const r = again([named('meal', 'Bé An uống hết sữa.', ['An', AN])], { personal: { [AN]: 'Bé An hôm nay ăn nửa suất cơm.' } })
  assert.deepEqual(r.issues, [])
})

test('a denial without correction words is a contradiction to confirm, not a replacement', () => {
  const r = again([named('health', 'Bé Minh không bị ốm.', ['Minh', MINH])], { personal: { [MINH]: 'Sáng nay bé Minh bị ốm.' } })
  assert.deepEqual(types(r), ['contradiction'])
})

test('correction about another child than the earlier statement: nothing replaced, the teacher is asked', () => {
  const r = again([named('meal', 'Cô nhầm, bé Linh ăn hết suất.', ['Linh', LINH])], { personal: { [AN]: 'Bé An hôm nay ăn nửa suất cơm.' } })
  const [fix] = corrections(r)
  assert.ok(fix && !fix.previousText, 'a correction point without a replacement')
})

test('correction with several earlier statements it could be about: nothing replaced', () => {
  const r = again([named('meal', 'Cô nhầm, bé An ăn hết.', ['An', AN])], { personal: { [AN]: 'Bé An ăn nửa suất cơm trưa. Bé An ăn ít cơm chiều.' } })
  const [fix] = corrections(r)
  assert.ok(fix && !fix.previousText)
})

test('correction about a name that is not clear: held for the name, nothing replaced', () => {
  const r = again([named('meal', 'Cô nhầm, bé Tùng ăn hết suất.', ['Tùng'])], { personal: { [AN]: 'Bé An hôm nay ăn nửa suất cơm.' } })
  assert.deepEqual(types(r), ['unknown_student'])
})

test('"nhầm" in something that happened is not a correction', () => {
  const r = again([named('emotion', 'Bé An đi nhầm dép của bạn nên hơi buồn.', ['An', AN])], { personal: { [AN]: 'Bé An hôm nay rất vui.' } })
  assert.equal(corrections(r).length, 0)
})

test('the first recording of a journal has nothing to correct', () => {
  const r = reviewDraft({ entries: [named('meal', 'Cô nhầm, bé An ăn hết suất.', ['An', AN])], students, transcript: 'Cô nhầm, bé An ăn hết suất.' })
  assert.equal(corrections(r).length, 0)
})

test('correction in a long recording without punctuation: only the child next to the correction words', () => {
  const said = 'cô nhầm bé An ăn hết suất cơm bé Minh ngủ ngon'
  const r = again([named('meal', 'Bé An ăn hết suất cơm.', ['An', AN]), named('sleep', 'Bé Minh ngủ ngon.', ['Minh', MINH])], { personal: { [AN]: 'Bé An ăn nửa suất cơm.', [MINH]: 'Bé Minh ngủ ít.' } }, said)
  assert.deepEqual(corrections(r).map((i) => [i.studentIds, i.previousText]), [[[AN], 'Bé An ăn nửa suất cơm.']])
  const back = again([named('sleep', 'Bé Minh ngủ ngon.', ['Minh', MINH]), named('meal', 'Bé An ăn hết suất.', ['An', AN])], { personal: { [AN]: 'Bé An ăn nửa suất cơm.', [MINH]: 'Bé Minh ngủ ít.' } }, 'bé An ăn hết suất bé Minh ngủ ngon cô nhầm rồi')
  assert.deepEqual(corrections(back).map((i) => i.studentIds), [[MINH]])
})
