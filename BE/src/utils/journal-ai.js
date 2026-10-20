// The one place the backend calls an LLM. The model reads what the teacher said and returns
// structured entries plus anything it is unsure about. It never has the last word: names,
// contradictions and health information are checked again in plain code (journal-review.js),
// and the journal is built from the checked entries (assembleDraft).
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import Groq from 'groq-sdk'
import { z } from 'zod'
import { journalAiModel, journalAiProvider } from '../config/ai.js'
import { HttpError } from './errors.js'
import { ENTRY_STATUSES, SECTION_KEYS } from './journal-constants.js'

const SYSTEM_PROMPT = `You turn a preschool teacher's spoken daily report into structured entries for the class journal. Code checks your answer afterwards and the teacher reviews it, so report what you are unsure about instead of deciding it.

The report is in Vietnamese and comes from speech recognition, so it usually has no punctuation and may contain misheard words. The teacher talks freely: one breath can cover several topics and several groups of children. Read the whole report first, then write one entry per statement.

Each entry has:
- section: the topic.
  meal = eating and drinking.
  learning = lessons, activities, play.
  sleep = nap and rest.
  health = illness, symptoms, injuries, medicine.
  emotion = mood and behaviour.
  note = messages and requests to parents, announcements, and anything that fits none of the others.
- status: how many children the statement is about.
  all = the whole class ("cả lớp", "các con", "các bạn").
  part = some of the class ("một vài bạn", "đa số", "các bạn nam", "hai bạn").
  nobody = a statement that no child did or had something ("không bạn nào bị ốm").
  named = one or more specific children, identified by name.
- mentions: one item per child the statement names, in the order they are said. Empty for all and nobody.
  spoken = the name exactly as it appears in the report, without "bé", "bạn", "con", "em", "cháu". Copy it letter for letter, including missing or wrong tone marks. Never correct, complete or shorten a name.
  student = the id from the class list, only when the spoken name is written exactly like that child's full name, the last two words of it, or the given name (the last word). Otherwise "none".
- text: the statement as one complete Vietnamese sentence that a parent can read, starting with a capital letter. Keep the teacher's meaning and wording, add punctuation, and fix obvious recognition mistakes in ordinary words, but write children's names exactly as spoken. Do not add facts the teacher did not say.

Order: first every statement about the whole class or groups of children, then the statements about each named child.

Who reads what: the entries with status all, part and nobody form the class journal, which every parent of the class reads. A named entry goes into the private note of each child in its mentions, and only that child's parents read it. So every entry must be about the right children, be filed under the right topic, and make sense to a parent who reads it alone, without the rest of the report.

How to follow the report:
- Teachers announce topics: "về ăn uống", "đến giờ ăn trưa", "đến giờ ngủ trưa", "về sức khỏe", "buổi chiều", "cuối cùng". Such a phrase opens the next topic: it decides the section of what follows and is never part of the sentence before it. In "đa số các con tham gia tốt về ăn uống bạn Minh ăn hết suất", "về ăn uống" opens the meal topic; the learning entry is "Đa số các con tham gia tốt."
- A sentence that continues the one before belongs with it, in the same entry, about the same children. It continues when it has no subject of its own, or its subject points back: "bạn ấy", "con", "bé", "hai bạn", or "các bạn" right after named children. In "Phạm Khánh Linh ho vài lần sau khi ngủ dậy hiện tại cô chưa xác định được nguyên nhân", both sentences are one health entry about Linh. In "Lê Gia Huy ngủ khoảng 1 tiếng Phạm Khánh Linh ngủ hơi muộn ban đầu các bạn có nói chuyện với nhau nhưng sau đó ngủ được", "các bạn" are Huy and Linh: the chatting is about their sleep, not about the class.
- A sentence without a name is not automatically about the whole class. Use all only when the teacher speaks of the whole class ("cả lớp", "các con", "tất cả các bạn"), and part when she speaks of some children without names. Never use all or part for a sentence that only makes sense together with a named child.
- The section follows what happened, not the time of day or the words around it: anything during nap time (falling asleep late, talking instead of sleeping, waking up early, waking up crying) is sleep, drinking milk is meal, crying when a parent leaves is emotion, a fall or a cough is health, playing indoors because of the rain is learning, arriving late, being absent or picked up early is note.
- When the teacher corrects what she just said ("à không", "ý cô là", "cô nói nhầm", "không phải"), keep only the corrected version and leave the mistaken one out: "bé An ăn hết suất à không cô nhầm bé ăn được một nửa" is one entry "Bé An ăn được một nửa suất." Only a correction she says herself counts; two different moments of the day ("sáng bé hơi mệt, chiều bé chơi vui") are both kept.
- The report may be a further recording that corrects an earlier one you do not see: the correction words come with nothing before them in this report to correct ("cô nhầm, bé An ăn hết suất"). Then keep the correction words at the start of the entry text: "Cô nhầm, bé An ăn hết suất." Code finds the earlier statement and replaces it.
- Every fact the teacher said appears in exactly one entry. Do not drop a fact, and do not repeat it in a second entry. What the class did and what a named child did within it are two facts: "cả lớp học nặn đất bé Linh với bé Ngọc nặn con gà rất đẹp" is an all entry "Cả lớp học nặn đất." and a named entry about Linh and Ngọc; "trưa các con ăn cơm canh bí đỏ đa số ăn hết suất" keeps the dishes in an all entry. Before answering, check that every activity, dish, time, amount and request the teacher said is in some entry.

How to split:
- A sentence that covers two topics becomes two entries: "các con ăn ngon rồi ngủ trưa chín mươi phút" is one meal entry and one sleep entry.
- A sentence that separates a group from the rest becomes one entry per group: "cả lớp ăn hết suất trừ bé Huy ăn ít" is an all entry "Cả lớp ăn hết suất." and a named entry about Huy.
- An all, part or nobody entry is shown to every parent, so its text never names a child. Whatever concerns a named child goes in a named entry of its own, written so it still makes sense when read alone.
- A named entry is copied into the private note of every child in its mentions, and each child's parents read it. So a sentence that says different things about different children becomes one entry per child: "Lê Gia Huy ngủ khoảng 1 tiếng, Phạm Khánh Linh ngủ hơi muộn" is a named entry "Lê Gia Huy ngủ khoảng 1 tiếng." about Huy and a named entry "Phạm Khánh Linh ngủ hơi muộn." about Linh. Only something the children did together ("bé An và bé Huy cùng xếp hình") is one entry with both children in mentions.
- When the teacher names a child and keeps talking without naming a new subject ("bé Minh khóc lúc đến lớp nhưng sau đó chơi vui"), the following clauses are still about that child.
- Decide which clause a time or place phrase belongs to from the meaning: in "bé An hơi ho về chiều nhờ phụ huynh mai mang áo khoác", "về chiều" belongs to the cough.
- Something that happened between children (one pushes, hits, bites or takes a toy from another) is one entry with every child involved in mentions, written neutrally, without blame. Also report it as an unclear issue: both families will read it, so the teacher should check the wording.

Text:
- Punctuate by meaning, so the actions read right: "các con tô màu tranh con thỏ đọc thơ cùng cô" is "Các con tô màu tranh con thỏ, đọc thơ cùng cô."
- Speech recognition mishears ordinary words. Correct a word when the context leaves only one sensible meaning: "ăn hết suốt" is "ăn hết suất", "quần máu dự phẩm" is "quần áo dự phòng", "sao đó ngủ được" is "sau đó ngủ được", "tôm màu" is "tô màu", "ăn ít hơn 1 ngày" is "ăn ít hơn mọi ngày". When several meanings are possible, keep the words and report an unclear issue. Never change a name, a number, a time, an amount, a temperature or a medicine. Never change a word about the child's body or health (a symptom, an injury, a part of the body): if such a word looks misheard ("bé bị số nhẹ"), keep it as said and report an unclear issue, so the teacher decides.
- Keep how much and how sure, word for word: "ăn gần hết" is not "ăn hết", "khoảng một tiếng" is not "một tiếng", "một tiếng rưỡi" stays "một tiếng rưỡi", "hơi sốt" is not "sốt", "có vẻ mệt" is not "mệt". Never round, strengthen or soften.
- Write as the teacher would to a parent: plain, factual, kind. Do not add praise, blame, feelings or judgements she did not express.
- A named entry starts with the child's name as spoken, so the parent knows who it is about.

Messages to parents:
- A message for the parents of one child ("nhắn mẹ bé Minh mai mang thêm quần áo") is a note entry with status named and that child in mentions.
- A request or announcement for every parent ("nhờ phụ huynh mai mang áo khoác cho các con") is a note entry with status all.
- That a child was absent, came late or went home early ("bé Ngọc hôm nay nghỉ học vì ốm") is a note entry about that child, never a class entry.

Names:
- A Vietnamese name ends with the given name, and teachers call a child by it: "Hoàng Đức Minh" is "bé Minh", "Nguyễn Minh An" is "bé An". A middle name on its own never identifies a child, so "bé Minh" is not "Nguyễn Minh An".
- If the spoken name is close to a child's name but not the same ("Ngoc" for "Ngọc", "Lin" for "Linh", a different surname), or several children could be meant, or the name is not in the class list, set student to "none". Do not pick the closest child.
- If a statement is about one child but no name is given ("có một bạn bị ngã"), use status part with no mentions. Do not guess who it is.
- "các bạn nam" and "các bạn nữ" mean the boys and the girls, not children called Nam or Nữ.
- Speech recognition puts capital letters on ordinary words, so a capital letter never makes a word a name. Decide from the meaning. "mai" (or "Mai") right before an action is "tomorrow": in "nhắn mẹ bé Minh Mai mang thêm quần áo" the child is Minh and Mai means tomorrow; in "nhờ phụ huynh Mai mang áo khoác cho các con" nobody is named, it is a request to every parent for tomorrow.
- A name right after "cô", "thầy", "mẹ", "bố", "phụ huynh", "ông", "bà", "chú", "bác" is an adult (the teacher, a parent), not a child, unless it says whose parent: "mẹ bé Minh" names the child Minh, "cô Mai" names nobody.
- When the teacher corrects or repeats a name, keep only the last, most complete form: "bé Huy Lê Gia Huy" is spoken "Lê Gia Huy"; "bé An à không bé Linh" is about Linh only.

Health: record symptoms, injuries and care exactly as the teacher describes them. Never diagnose, never name an illness the teacher did not name, and never add advice.

Issues: list what the teacher must check, without fixing it yourself. Keep every statement as said.
- contradiction = two statements about the same children disagree, for example a child who "ăn hết suất" and also "bỏ ăn hoàn toàn", or "không bạn nào bị ốm" while a child has a fever.
- unclear = a statement too unclear or incomplete to record as it is: who, what or when is missing, or the words make no sense.
For each issue give the section, the ids of the children involved (empty if none), the exact words it is about in quote, and in message one short English sentence saying what to check.

Leave out filler, false starts, greetings, thanks and sign-offs ("chào các phụ huynh", "cảm ơn các phụ huynh đã theo dõi", "hết rồi", "vậy thôi") and anything that is not about the children's day. Leave out only those words: what is said between a greeting and a sign-off is the report and is kept ("chào các phụ huynh hôm nay các con học hát cảm ơn các phụ huynh" has a learning entry "Hôm nay các con học hát."). If the report contains nothing to record, return empty lists.`

const TIMEOUT_MS = 60_000

const unavailable = (detail) =>
  new HttpError(502, 'AI_UNAVAILABLE', `We couldn't process the recording. ${detail} Please try again, or write the journal manually.`)

// Both SDKs share these error class names, so one translation serves both providers.
function translate(err, Sdk, keyName) {
  if (err instanceof HttpError) return err
  if (err instanceof Sdk.AuthenticationError) {
    console.error(`[ai] ${keyName} is missing or not valid.`)
    return unavailable('The AI service is not set up correctly.')
  }
  if (err instanceof Sdk.RateLimitError) return unavailable('The AI service is busy right now.')
  if (err instanceof Sdk.APIConnectionError) return unavailable('The AI service could not be reached.')
  if (err instanceof Sdk.APIError) {
    console.error(`[ai] request failed (${err.status}): ${err.message}`)
    return unavailable('The AI service returned an error.')
  }
  return err
}

// ---------- the answer both providers must give ----------
// `student` may be "none": the model is never forced to pick a child it is not sure about.

const ISSUE_KINDS = ['contradiction', 'unclear']

const reportSchema = (aliases) => {
  const child = aliases.length ? z.enum(aliases) : z.string()
  return z.object({
    entries: z.array(
      z.object({
        section: z.enum(SECTION_KEYS),
        status: z.enum(ENTRY_STATUSES),
        mentions: z.array(z.object({ spoken: z.string(), student: z.union([child, z.literal('none')]) })),
        text: z.string(),
      }),
    ),
    issues: z.array(
      z.object({
        type: z.enum(ISSUE_KINDS),
        section: z.enum(SECTION_KEYS),
        students: z.array(child),
        quote: z.string(),
        message: z.string(),
      }),
    ),
  })
}

// The same shape as plain JSON Schema, for providers that take one directly.
function reportJsonSchema(aliases) {
  const child = aliases.length ? { type: 'string', enum: aliases } : { type: 'string' }
  const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
  return object({
    entries: {
      type: 'array',
      items: object({
        section: { type: 'string', enum: SECTION_KEYS },
        status: { type: 'string', enum: ENTRY_STATUSES },
        mentions: {
          type: 'array',
          items: object({ spoken: { type: 'string' }, student: aliases.length ? { type: 'string', enum: [...aliases, 'none'] } : { type: 'string' } }),
        },
        text: { type: 'string' },
      }),
    },
    issues: {
      type: 'array',
      items: object({
        type: { type: 'string', enum: ISSUE_KINDS },
        section: { type: 'string', enum: SECTION_KEYS },
        students: { type: 'array', items: child },
        quote: { type: 'string' },
        message: { type: 'string' },
      }),
    },
  })
}

// ---------- providers ----------
// Each takes the user message and the aliases, and resolves to the answer already checked against the schema.
// Clients are created on first use, so the server starts without credentials for a provider it does not use.

let groq
let anthropic

// Groq checks the answer against the schema and refuses one that does not match (json_validate_failed).
// That is a slip of the model, not of the request, so the same request is tried again.
const SCHEMA_ATTEMPTS = 3
const isSchemaSlip = (err) => err instanceof Groq.BadRequestError && JSON.stringify(err.error ?? err.message).includes('json_validate_failed')

// Every Groq model has its own limits; the free plan allows 200,000 tokens a day per model. When the model in
// use has reached a limit, the next one of the list is asked (JOURNAL_AI_FALLBACK_MODELS, comma-separated).
const fallbackModels = () =>
  (process.env.JOURNAL_AI_FALLBACK_MODELS ?? 'openai/gpt-oss-20b')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
const isDailyLimit = (err) => err instanceof Groq.RateLimitError && /per day|TPD|RPD/i.test(JSON.stringify(err.error ?? err.message))

async function askGroq(content, aliases, model) {
  groq ||= new Groq({ timeout: TIMEOUT_MS, maxRetries: 3 }) // retries honour Groq's retry-after on 429
  const models = [model, ...fallbackModels().filter((m) => m !== model)]
  for (const [index, current] of models.entries()) {
    try {
      return await askGroqModel(content, aliases, current)
    } catch (err) {
      if (!(err instanceof Groq.RateLimitError) || index === models.length - 1) {
        if (isDailyLimit(err)) {
          throw unavailable('The AI service has reached its limit for today.')
        }
        throw translate(err, Groq, 'GROQ_API_KEY')
      }
      console.warn(`[ai] ${current} has reached a Groq limit; asking ${models[index + 1]} instead.`)
    }
  }
}

async function askGroqModel(content, aliases, model) {
  let completion
  for (let attempt = 1; !completion; attempt++) {
    try {
      completion = await createGroqCompletion(content, aliases, model)
    } catch (err) {
      if (isSchemaSlip(err) && attempt < SCHEMA_ATTEMPTS) {
        console.warn(`[ai] the answer did not match the schema, trying again (${attempt}/${SCHEMA_ATTEMPTS - 1})`)
        continue
      }
      throw err
    }
  }
  return readGroqAnswer(completion, aliases)
}

function createGroqCompletion(content, aliases, model) {
  return groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    // Groq refuses answers outside the schema, so what arrives has known sections, statuses and ids.
    response_format: { type: 'json_schema', json_schema: { name: 'journal_report', strict: true, schema: reportJsonSchema(aliases) } },
    // A teacher is waiting on the result, and the task is careful reading rather than open-ended reasoning.
    reasoning_effort: 'medium',
    temperature: 0,
    max_completion_tokens: 12000,
  })
}

function readGroqAnswer(completion, aliases) {
  const choice = completion.choices[0]
  if (choice?.finish_reason === 'length') throw unavailable('The AI service returned an incomplete answer.')
  try {
    return reportSchema(aliases).parse(JSON.parse(choice?.message?.content ?? ''))
  } catch {
    throw unavailable('The AI service returned an answer that could not be read.')
  }
}

async function askClaude(content, aliases, model) {
  anthropic ||= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 })
  let response
  try {
    response = await anthropic.beta.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(reportSchema(aliases)) },
      // If the model declines the request, the API re-runs it on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    throw translate(err, Anthropic, 'ANTHROPIC_API_KEY')
  }
  if (response.stop_reason === 'refusal') throw unavailable('The AI service declined this recording.')
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw unavailable('The AI service returned an incomplete answer.')
  return response.parsed_output
}

const PROVIDERS = { groq: askGroq, claude: askClaude }

/**
 * @param {string} transcript what the teacher said
 * @param {{ id: string, fullName: string, nickname?: string }[]} students active students of the class
 * @returns {Promise<{ entries: { section, status, text, mentions: { spoken, studentId }[] }[],
 *                     reported: { type, section, studentIds, text, message }[] }>}
 *   the model's reading, with ids translated back; reviewDraft checks it before anyone relies on it
 */
export async function extractJournalEntries(transcript, students) {
  const ask = PROVIDERS[journalAiProvider()]
  if (!ask) {
    console.error('[ai] no AI provider is configured: set GROQ_API_KEY or ANTHROPIC_API_KEY.')
    throw unavailable('The AI service is not set up.')
  }

  // The model sees short aliases instead of database ids: they are easier to copy
  // correctly, and the schema then only accepts children of this class.
  const aliases = students.map((_, index) => `s${index + 1}`)
  const idByAlias = new Map(aliases.map((alias, index) => [alias, students[index].id]))
  const toId = (alias) => idByAlias.get(alias) ?? null
  const roster = students.map((s, i) => `${aliases[i]}: ${s.fullName}${s.nickname ? ` (nickname ${s.nickname})` : ''}`).join('\n')
  const content = `Class list (id: name):\n${roster || '(no students)'}\n\nThe teacher's report:\n${transcript}`

  const answer = await ask(content, aliases, journalAiModel())
  return {
    entries: answer.entries.map((entry) => ({
      section: entry.section,
      status: entry.status,
      text: entry.text,
      mentions: entry.mentions.map((m) => ({ spoken: m.spoken, studentId: toId(m.student) })),
    })),
    reported: answer.issues.map((issue) => ({
      type: issue.type,
      section: issue.section,
      studentIds: issue.students.map(toId).filter(Boolean),
      text: issue.quote,
      message: issue.message,
    })),
  }
}
