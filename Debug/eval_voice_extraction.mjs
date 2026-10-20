// Measures how well a spoken report is turned into the journal: the real AI (GROQ_API_KEY in BE/.env),
// then the checks in code, exactly as POST /journals/voice-draft does after speech-to-text.
// No server and no database are needed.
//
//   node --env-file=BE/.env Debug/eval_voice_extraction.mjs            every case
//   node --env-file=BE/.env Debug/eval_voice_extraction.mjs 7 9 20     only these cases
//
// Each case is a transcript as speech recognition writes it (no punctuation) and what must hold afterwards.
// The class has the traps of a real class: two children called Huy, a child called Mai (and "mai" also
// means "tomorrow"), and a child with a nickname.
import { extractJournalEntries } from '../BE/src/utils/journal-ai.js'
import { assembleDraft, reviewDraft } from '../BE/src/utils/journal-review.js'

const CLASS = [
  ['an', 'Nguyễn Minh An'],
  ['ngoc', 'Trần Bảo Ngọc'],
  ['huyLe', 'Lê Gia Huy'],
  ['huyPham', 'Phạm Quang Huy'],
  ['linh', 'Phạm Khánh Linh'],
  ['minh', 'Hoàng Đức Minh'],
  ['diep', 'Vũ Ngọc Diệp'],
  ['hung', 'Đỗ Gia Hưng'],
  ['mai', 'Lê Ngọc Mai'],
  ['bao', 'Trần Gia Bảo', 'Bin'],
].map(([id, fullName, nickname]) => ({ id, fullName, ...(nickname && { nickname }) }))

// ---------- what a result may be asked ----------
const words = (text) => String(text || '').toLowerCase()
const has = (text, ...parts) => parts.every((p) => words(text).includes(p))
const classText = (r) => Object.values(r.sections).join(' ')
const noteOf = (r, id) => r.personal[id] || ''
const held = (r, type) => r.issues.filter((i) => i.held && (!type || i.type === type))
const issuesOf = (r, type) => r.issues.filter((i) => i.type === type)
const noNotesExcept = (r, ...ids) => Object.keys(r.personal).every((id) => ids.includes(id))

const CASES = [
  // whole class, groups, nobody
  { say: 'hôm nay cả lớp ăn hết suất cơm', expect: (r) => [[has(r.sections.meal, 'hết suất'), 'meal for the class'], [noNotesExcept(r), 'no personal note'], [!held(r).length, 'nothing held']] },
  { say: 'các con ăn ngon ngủ trưa chín mươi phút buổi chiều học hát', expect: (r) => [[!!r.sections.meal, 'meal'], [!!r.sections.sleep, 'sleep'], [has(r.sections.learning, 'hát'), 'learning'], [noNotesExcept(r), 'no personal note']] },
  { say: 'một vài bạn chưa tự xúc cơm được', expect: (r) => [[has(r.sections.meal, 'xúc'), 'meal, part of the class'], [noNotesExcept(r), 'no personal note'], [!held(r).length, 'nothing held']] },
  { say: 'các bạn nam chơi đá bóng còn các bạn nữ chơi nấu ăn', expect: (r) => [[has(classText(r), 'đá bóng'), 'boys in the class text'], [noNotesExcept(r), 'no child called Nam'], [!held(r).length, 'nothing held']] },
  { say: 'không bạn nào bị ốm cả', expect: (r) => [[!!r.sections.health, 'health: nobody ill'], [!r.issues.length, 'no issue']] },
  { say: 'ừ thì à hôm nay ờ các con vui vẻ', expect: (r) => [[!!r.sections.emotion, 'emotion for the class'], [!has(classText(r), 'ừ thì'), 'filler left out']] },

  // the class with exceptions
  { say: 'cả lớp ăn ngon trừ bé An ăn ít', expect: (r) => [[has(r.sections.meal, 'ngon'), 'class meal'], [!has(classText(r), 'an ăn ít'), 'An not in the class text'], [has(noteOf(r, 'an'), 'ít'), "An's note"]] },
  { say: 'cả lớp ngủ trưa ngon trừ bé Hưng và bé Diệp khó ngủ', expect: (r) => [[!!r.sections.sleep, 'class sleep'], [has(noteOf(r, 'hung'), 'khó ngủ'), "Hưng's note"], [has(noteOf(r, 'diep'), 'khó ngủ'), "Diệp's note"], [!has(classText(r), 'hưng') && !has(classText(r), 'diệp'), 'no names in the class text']] },
  { say: 'cả lớp học vẽ bạn An vẽ đẹp nhất được cô khen', expect: (r) => [[has(r.sections.learning, 'vẽ'), 'class learning'], [!has(classText(r), ' an '), 'An not in the class text'], [has(noteOf(r, 'an'), 'khen'), "An's note"]] },

  // named children
  { say: 'bé An và bé Ngọc ngủ không ngon', expect: (r) => [[has(noteOf(r, 'an'), 'ngủ'), "An's note"], [has(noteOf(r, 'ngoc'), 'ngủ'), "Ngọc's note"], [!r.sections.sleep, 'not in the class text']] },
  { say: 'ba bạn An Ngọc và Linh được cô khen vì tự dọn đồ chơi', expect: (r) => [[['an', 'ngoc', 'linh'].every((id) => has(noteOf(r, id), 'khen')), 'a note for each of the three'], [noNotesExcept(r, 'an', 'ngoc', 'linh'), 'nobody else']] },
  { say: 'bé Diệp khóc lúc mẹ về nhưng sau đó chơi vui với các bạn', expect: (r) => [[has(noteOf(r, 'diep'), 'khóc') && has(noteOf(r, 'diep'), 'vui'), "both parts in Diệp's note"], [!has(classText(r), 'diệp'), 'Diệp not in the class text']] },
  { say: 'bé Minh hôm nay đến lớp muộn con khóc một lúc rồi chơi ngoan', expect: (r) => [[has(noteOf(r, 'minh'), 'muộn') && has(noteOf(r, 'minh'), 'khóc'), "Minh's note has the whole story"], [noNotesExcept(r, 'minh'), 'nobody else']] },
  { say: 'bé Lê Gia Huy hôm nay vẽ tranh rất đẹp', expect: (r) => [[has(noteOf(r, 'huyLe'), 'vẽ'), "Lê Gia Huy's note"], [!noteOf(r, 'huyPham'), 'not the other Huy']] },
  { say: 'bé Bin hôm nay ăn hết hai bát cơm', expect: (r) => [[has(noteOf(r, 'bao'), 'hai bát'), 'nickname Bin -> Trần Gia Bảo'], [!held(r).length, 'nothing held']] },
  { say: 'bé Mai hôm nay hơi buồn không muốn chơi', expect: (r) => [[has(noteOf(r, 'mai'), 'buồn'), "Mai's note"], [!r.sections.emotion, 'not in the class text']] },

  // messages to parents
  { say: 'nhắn mẹ bé Minh mai mang thêm quần áo cho con', expect: (r) => [[has(noteOf(r, 'minh'), 'quần áo'), "message in Minh's note"], [!noteOf(r, 'mai'), '"mai" = tomorrow, not the child Mai'], [!held(r).length, 'nothing held']] },
  { say: 'nhờ phụ huynh mai mang áo mưa cho các con', expect: (r) => [[has(r.sections.note, 'áo mưa'), 'note to every parent'], [!noteOf(r, 'mai'), '"mai" = tomorrow, not the child Mai'], [!held(r).length, 'nothing held']] },
  { say: 'nhắn bố bé Hưng chiều nay đón con sớm lúc bốn giờ', expect: (r) => [[has(noteOf(r, 'hung'), 'bốn giờ'), "message in Hưng's note"], [!r.sections.note, 'not sent to every parent']] },
  { say: 'cô Mai nhắc các con rửa tay trước khi ăn', expect: (r) => [[!noteOf(r, 'mai'), 'cô Mai is the teacher, not the child Mai'], [has(classText(r), 'rửa tay'), 'in the class text']] },

  // names that must wait for the teacher
  { say: 'bé Huy hôm nay bị sốt nhẹ', expect: (r) => [[held(r, 'ambiguous_student').length === 1, 'two Huy: held as ambiguous'], [!noteOf(r, 'huyLe') && !noteOf(r, 'huyPham'), 'given to neither Huy'], [!has(classText(r), 'sốt'), 'not shown to every parent']] },
  { say: 'bé Ngoc hôm nay ngủ ngon', expect: (r) => [[held(r, 'name_mismatch').length === 1, 'missing tone mark: held'], [!noteOf(r, 'ngoc'), 'not given to Ngọc yet']] },
  { say: 'bé Tùng hôm nay đi học muộn', expect: (r) => [[held(r, 'unknown_student').length === 1, 'not in the class: held'], [noNotesExcept(r), 'no note']] },
  { say: 'có một bạn bị ngã trầy đầu gối lúc ra chơi', expect: (r) => [[held(r).length >= 1, 'an unnamed child: held'], [!has(classText(r), 'ngã'), 'not shown to every parent']] },
  { say: 'bé An à không bé Linh hôm nay bị ho', expect: (r) => [[has(noteOf(r, 'linh'), 'ho'), 'the corrected child, Linh'], [!has(noteOf(r, 'an'), 'ho'), 'not An']] },

  // contradictions and health
  { say: 'bé An ăn hết suất cơm lát sau cô thấy bé An không ăn gì cả', expect: (r) => [[issuesOf(r, 'contradiction').length >= 1, 'contradiction reported']] },
  { say: 'không bạn nào bị ốm bé Hưng bị sốt ba mươi tám độ', expect: (r) => [[issuesOf(r, 'contradiction').length >= 1, 'contradiction reported'], [has(noteOf(r, 'hung'), 'sốt'), "fever in Hưng's note"], [issuesOf(r, 'health_alert').length >= 1, 'health to check']] },
  { say: 'bé Linh uống thuốc lúc mười một giờ theo dặn của mẹ', expect: (r) => [[has(noteOf(r, 'linh'), 'thuốc'), "Linh's note"], [!has(noteOf(r, 'linh'), 'cảm') && !has(noteOf(r, 'linh'), 'viêm'), 'no illness added']] },
  { say: 'hai bạn bị ho nhẹ cô đã báo phụ huynh', expect: (r) => [[noNotesExcept(r), 'no child guessed'], [has(classText(r), 'ho') || held(r).length > 0, 'recorded for the class or held']] },
  { say: 'alo alo một hai ba', expect: (r) => [[!classText(r).trim() && noNotesExcept(r), 'nothing recorded']] },

  // what Whisper really writes: capital letters where the teacher meant "mai" = tomorrow, misheard words
  { say: 'Nhắn mẹ bé Minh Mai mang thêm quần áo cho con.', expect: (r) => [[has(noteOf(r, 'minh'), 'quần áo'), "message in Minh's note"], [!noteOf(r, 'mai'), 'not the child Mai'], [!held(r).length, 'nothing held']] },
  { say: 'Nhờ phụ huynh Mai mang áo khoác cho các con.', expect: (r) => [[has(r.sections.note, 'áo khoác'), 'note to every parent'], [!noteOf(r, 'mai'), 'not the child Mai']] },
  { say: 'Hôm nay cả lớp ăn hết suốt trừ bé Huy ăn ít.', expect: (r) => [[has(r.sections.meal, 'hết suất'), '"suốt" corrected to "suất" in the class meal'], [held(r, 'ambiguous_student').length === 1, 'which Huy: held']] },

  // a whole day in one breath, as teachers really report it
  {
    say: 'hôm nay các con đến lớp đầy đủ buổi sáng cả lớp học nặn đất bé Linh với bé Ngọc nặn con gà rất đẹp trưa các con ăn cơm canh bí đỏ đa số ăn hết suất riêng bé Hưng ăn được nửa bát ngủ trưa các con ngủ ngon bé Diệp hơi khó ngủ cô phải vỗ một lúc chiều bé An bị ho nhẹ cô đã cho uống nước ấm nhắn phụ huynh mai mang áo khoác cho các con vì trời lạnh',
    expect: (r) => [
      [has(r.sections.learning, 'nặn'), 'class learning'],
      [has(r.sections.meal, 'bí đỏ'), 'class meal'],
      [!!r.sections.sleep, 'class sleep'],
      [has(r.sections.note, 'áo khoác'), 'note to every parent'],
      [has(noteOf(r, 'linh'), 'gà') && has(noteOf(r, 'ngoc'), 'gà'), 'Linh and Ngọc praised'],
      [has(noteOf(r, 'hung'), 'nửa bát'), 'Hưng ate half'],
      [has(noteOf(r, 'diep'), 'khó ngủ'), 'Diệp slept badly'],
      [has(noteOf(r, 'an'), 'ho'), 'An coughs'],
      [!noteOf(r, 'mai'), '"mai" = tomorrow'],
      [!/linh|ngọc|hưng|diệp|\ban\b/.test(words(classText(r))), 'no child named in the class text'],
    ],
  },
  {
    say: 'sáng nay bé Bin đến muộn khóc nhè một lúc rồi vào chơi với các bạn giờ ăn trưa cả lớp ăn ngon không bạn nào bỏ dở chiều các con tập thể dục và chơi cầu trượt bạn Minh bị ngã nhẹ ở cầu trượt không chảy máu cô đã kiểm tra nhắn bố mẹ bé Minh để ý thêm tối nay',
    expect: (r) => [
      [has(noteOf(r, 'bao'), 'muộn'), 'Bin (Trần Gia Bảo) came late'],
      [has(r.sections.meal, 'ngon'), 'class meal'],
      [has(r.sections.learning, 'thể dục') || has(r.sections.learning, 'cầu trượt'), 'class activity'],
      [has(noteOf(r, 'minh'), 'ngã'), "the fall is in Minh's note"],
      [!has(classText(r), 'ngã'), 'the fall is not shown to every parent'],
      [issuesOf(r, 'health_alert').length >= 1, 'injury to check'],
    ],
  },
  {
    say: 'các con hôm nay rất ngoan à quên bé Huy Lê Gia Huy hôm nay hơi mệt ăn ít cô theo dõi thấy bé không sốt bé Mai thì vui vẻ múa cho các bạn xem',
    expect: (r) => [
      [has(r.sections.emotion, 'ngoan'), 'class mood'],
      [has(noteOf(r, 'huyLe'), 'mệt'), 'Lê Gia Huy, named in full after the slip'],
      [!noteOf(r, 'huyPham'), 'not the other Huy'],
      [has(noteOf(r, 'mai'), 'múa'), "Mai's note"],
    ],
  },
  // a real report (log 16): topic openers, sentences that continue a child, two children in one sentence
  {
    say: 'Hôm nay lớp mình học về các con vật. Buổi sáng các con tôm màu, tranh con thỏ đọc thơ cùng cô. Đa số các con tham gia tốt, về ăn uống. Bạn Minh ăn hết suốt sáng nhưng bữa trưa chỉ ăn khoảng một nửa. Trần Bảo Ngọc hôm nay ăn ít hơn 1 ngày, cô nhắc vài lần mới chịu ăn tiếp. Đến giờ ngủ trưa, Lê Gia Huy ngủ khoảng 1 tiếng, Phạm Khánh Linh ngủ hơi muộn. Ban đầu các bạn có nói chuyện với nhau nhưng sao ngủ được. Về sức khỏe, Phạm Khánh Linh ho vài lần sau khi ngủ dậy. Hiện tại cô chưa xác định được nguyên nhân. Buổi chiều trời mưa nên cả lớp ở trong phòng học xếp hình. Cả lớp hôm nay được uống sữa sau khi ngủ dậy. Cuối cùng, cô nhắc phụ huynh ngày mai chuẩn bị thêm quần máu dự phẩm cho con.',
    expect: (r) => [
      [!has(r.sections.learning, 'ăn uống'), '"về ăn uống" opens the meal topic'],
      [!has(classText(r), 'nguyên nhân'), 'the cause sentence is not sent to every parent'],
      [has(noteOf(r, 'linh'), 'ho') && has(noteOf(r, 'linh'), 'nguyên nhân'), "the cough and its follow-up in Linh's note"],
      [!has(classText(r), 'nói chuyện'), 'the chatting is about Huy and Linh, not the class'],
      [!has(noteOf(r, 'huyLe'), 'linh') && !has(noteOf(r, 'linh'), 'huy ngủ'), 'Huy and Linh do not read about each other'],
      [has(noteOf(r, 'minh'), 'một nửa'), "Minh's meal"],
      [has(r.sections.meal, 'sữa'), 'milk for the class'],
      [has(r.sections.note, 'quần áo'), '"quần máu" corrected'],
      [has(r.sections.learning, 'tô màu'), '"tôm màu" corrected'],
    ],
  },
  {
    say: 'giờ ra chơi bé An đẩy bé Hưng ngã cô đã kiểm tra bé Hưng không bị sao',
    expect: (r) => [[has(noteOf(r, 'an'), 'đẩy') && has(noteOf(r, 'hung'), 'ngã'), 'in both notes'], [!has(classText(r), 'đẩy'), 'not sent to every parent'], [issuesOf(r, 'unclear').length >= 1, 'teacher asked to check the wording']],
  },
  { say: 'bé Ngọc hôm nay nghỉ học vì ốm', expect: (r) => [[has(noteOf(r, 'ngoc'), 'nghỉ'), "Ngọc's note"], [!classText(r).trim(), 'nothing for every parent']] },
  // the teacher corrects herself, degrees and amounts, greetings, a health word that may be misheard
  { say: 'bé An hôm nay ăn hết suất à không cô nhầm bé ăn được một nửa thôi', expect: (r) => [[has(noteOf(r, 'an'), 'một nửa'), 'the corrected amount'], [!has(noteOf(r, 'an'), 'hết suất'), 'the mistaken amount left out'], [!issuesOf(r, 'contradiction').length, 'no contradiction for a correction']] },
  { say: 'sáng bé Hưng hơi mệt chiều bé chơi vui với các bạn', expect: (r) => [[has(noteOf(r, 'hung'), 'mệt') && has(noteOf(r, 'hung'), 'vui'), 'two moments of the day, both kept']] },
  { say: 'bé Huy Lê Gia Huy ngủ được một tiếng rưỡi bé Linh ăn gần hết suất bé Diệp có vẻ hơi sốt', expect: (r) => [[has(noteOf(r, 'huyLe'), 'một tiếng rưỡi'), '"một tiếng rưỡi" kept'], [has(noteOf(r, 'linh'), 'gần hết'), '"gần hết" kept'], [has(noteOf(r, 'diep'), 'có vẻ') && has(noteOf(r, 'diep'), 'hơi sốt'), '"có vẻ hơi sốt" kept']] },
  { say: 'chào các phụ huynh hôm nay các con học hát bài cả nhà thương nhau cảm ơn các phụ huynh đã theo dõi', expect: (r) => [[has(r.sections.learning, 'hát'), 'learning'], [!has(classText(r), 'cảm ơn') && !has(classText(r), 'chào'), 'greeting and thanks left out']] },
  { say: 'bé Ngọc hôm nay bị số nhẹ cô đã báo mẹ', expect: (r) => [[has(noteOf(r, 'ngoc'), 'số'), 'the word kept as said'], [!has(noteOf(r, 'ngoc'), 'sốt') && !has(noteOf(r, 'ngoc'), 'sổ mũi'), 'not turned into a symptom'], [issuesOf(r, 'unclear').length >= 1, 'the teacher is asked']] },
  { say: 'cả lớp ngủ trưa ngon có hai bạn dậy sớm nói chuyện với nhau', expect: (r) => [[has(r.sections.sleep, 'ngon'), 'class sleep'], [has(r.sections.sleep, 'hai bạn'), 'the two children, unnamed, in the class sleep'], [noNotesExcept(r), 'no child guessed']] },
]

const pick = process.argv.slice(2).map(Number).filter(Boolean)
const chosen = CASES.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => !pick.length || pick.includes(c.n))

let passed = 0
let total = 0
const failures = []
for (const c of chosen) {
  let result
  try {
    // The free Groq plan limits tokens per minute: wait and try again instead of counting a failure.
    let answer
    for (let attempt = 1; !answer; attempt++) {
      try {
        answer = await extractJournalEntries(c.say, CLASS)
      } catch (err) {
        if (!/busy/.test(err.message) || attempt === 4) throw err
        await new Promise((r) => setTimeout(r, 30000))
      }
    }
    const { entries, reported } = answer
    const reviewed = reviewDraft({ entries, students: CLASS, transcript: c.say, reported })
    result = { ...assembleDraft(reviewed.entries, CLASS), issues: reviewed.issues, entries }
  } catch (err) {
    console.log(`#${c.n} ERROR ${err.message}`)
    failures.push(c.n)
    continue
  }
  const checks = c.expect(result)
  const bad = checks.filter(([ok]) => !ok)
  passed += checks.length - bad.length
  total += checks.length
  console.log(`#${String(c.n).padStart(2)} ${bad.length ? 'FAIL' : 'ok  '} "${c.say}"`)
  for (const [, label] of bad) console.log(`       x ${label}`)
  if (bad.length) {
    failures.push(c.n)
    const shown = {
      sections: Object.fromEntries(Object.entries(result.sections).filter(([, t]) => t)),
      personal: result.personal,
      issues: result.issues.map((i) => `${i.type}${i.held ? ' (held)' : ''}: ${i.text}`),
      ai: result.entries.map((e) => `${e.section}/${e.status} [${e.mentions.map((m) => `${m.spoken}->${m.studentId}`).join(', ')}] ${e.text}`),
    }
    console.log(`       ${JSON.stringify(shown, null, 0)}`)
  }
}
console.log(`\n${passed}/${total} checks, ${chosen.length - failures.length}/${chosen.length} cases fully right${failures.length ? `; failing: ${failures.join(' ')}` : ''}`)
