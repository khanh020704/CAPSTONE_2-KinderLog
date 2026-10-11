// The one place the backend calls an LLM. The model turns what the teacher said into
// structured entries and nothing else; building the journal from those entries is
// plain code (assembleDraft in journal-draft.js).
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import Groq from 'groq-sdk'
import { z } from 'zod'
import { journalAiModel, journalAiProvider } from '../config/ai.js'
import { HttpError } from './errors.js'
import { ENTRY_STATUSES, SECTION_KEYS } from './journal-draft.js'

const SYSTEM_PROMPT = `You turn a preschool teacher's spoken daily report into structured entries for the class journal.

The report is in Vietnamese and comes from speech recognition, so it usually has no punctuation and may contain misheard words. The teacher talks freely: one breath can cover several topics and several groups of children. Read the whole report first, then write one entry per statement.

Each entry has:
- section: the topic.
  meal = eating and drinking.
  learning = lessons, activities, play.
  sleep = nap and rest.
  health = illness, symptoms, injuries, medicine.
  emotion = mood and behaviour.
  note = reminders and requests to parents, and anything that fits none of the others.
- status: how many children the statement is about.
  all = the whole class ("cả lớp", "các con", "các bạn").
  part = some of the class ("một vài bạn", "đa số", "các bạn nam", "hai bạn").
  nobody = a statement that no child did or had something ("không bạn nào bị ốm").
  named = one or more specific children, identified by name.
- students: the ids of the children the statement is about, taken from the class list. Required for named. For part, list the children only when the teacher names them, otherwise leave it empty. Always empty for all and nobody.
- text: the statement as one complete Vietnamese sentence that a parent can read. Keep the teacher's meaning and wording, fix obvious recognition mistakes, and add punctuation. Do not add facts the teacher did not say.

How to split:
- A sentence that covers two topics becomes two entries: "các con ăn ngon rồi ngủ trưa chín mươi phút" is one meal entry and one sleep entry.
- A sentence that separates a group from the rest becomes one entry per group: "cả lớp ăn hết suất trừ bé Huy ăn ít" is an all entry about the class and a named entry about Huy.
- A statement about a named child goes in a named entry of its own, written so it still makes sense when read alone.

Who a statement is about:
- When the teacher names a child and keeps talking without naming a new subject ("bé Minh khóc lúc đến lớp nhưng sau đó chơi vui"), the following clauses are still about that child.
- A named entry holds only what was said about that child. A reminder or request addressed to parents ("nhờ phụ huynh mang áo khoác cho các con") is a note entry with status all, even when it comes right after a sentence about one child.
- Decide which clause a time or place phrase belongs to from the meaning: in "bé An hơi ho về chiều nhờ phụ huynh mai mang áo khoác", "về chiều" belongs to the cough.

Names:
- A Vietnamese name ends with the given name, and teachers call a child by it: "Hoàng Đức Minh" is "bé Minh", "Nguyễn Minh An" is "bé An". A middle name on its own never identifies a child, so "bé Minh" is not "Nguyễn Minh An".
- Match a child by full name, by the last two words of the name ("Minh An"), or by the given name with or without "bé", "bạn", "con", "em". If two children share the given name and the report does not make clear which is meant, do not guess: use status part with no students and keep the name in the text.
- A name that is not in the class list is not a student id. Keep the statement, with the name in the text, as status part with no students.
- "các bạn nam" and "các bạn nữ" mean the boys and the girls, not children called Nam or Nữ.

Leave out filler, false starts and anything that is not about the children's day. If the report contains nothing to record, return an empty list.`

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

const reportSchema = (aliases) =>
  z.object({
    entries: z.array(
      z.object({
        section: z.enum(SECTION_KEYS),
        status: z.enum(ENTRY_STATUSES),
        students: z.array(aliases.length ? z.enum(aliases) : z.string()),
        text: z.string(),
      }),
    ),
  })

// The same shape as plain JSON Schema, for providers that take one directly.
const reportJsonSchema = (aliases) => ({
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: SECTION_KEYS },
          status: { type: 'string', enum: ENTRY_STATUSES },
          students: { type: 'array', items: aliases.length ? { type: 'string', enum: aliases } : { type: 'string' } },
          text: { type: 'string' },
        },
        required: ['section', 'status', 'students', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
})

// ---------- providers ----------
// Each takes the user message and the aliases, and resolves to { entries } already checked against the schema.
// Clients are created on first use, so the server starts without credentials for a provider it does not use.

let groq
let anthropic

async function askGroq(content, aliases, model) {
  groq ||= new Groq({ timeout: TIMEOUT_MS, maxRetries: 1 })
  let completion
  try {
    completion = await groq.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      // The answer is constrained to the schema, so it is always valid JSON with known sections, statuses and ids.
      response_format: { type: 'json_schema', json_schema: { name: 'journal_report', strict: true, schema: reportJsonSchema(aliases) } },
      // A teacher is waiting on the result and the task is extraction, not open-ended reasoning.
      reasoning_effort: 'low',
      temperature: 0,
      max_completion_tokens: 8000,
    })
  } catch (err) {
    throw translate(err, Groq, 'GROQ_API_KEY')
  }

  const choice = completion.choices[0]
  if (choice?.finish_reason === 'length') throw unavailable('The AI service returned an incomplete answer.')
  let parsed
  try {
    parsed = reportSchema(aliases).parse(JSON.parse(choice?.message?.content ?? ''))
  } catch {
    throw unavailable('The AI service returned an answer that could not be read.')
  }
  return parsed
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
 * @param {{ id: string, fullName: string }[]} students active students of the class
 * @returns {Promise<{ section: string, status: string, students: string[], text: string }[]>} entries with real student ids
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
  const roster = students.map((student, index) => `${aliases[index]}: ${student.fullName}`).join('\n')
  const content = `Class list (id: name):\n${roster || '(no students)'}\n\nThe teacher's report:\n${transcript}`

  const { entries } = await ask(content, aliases, journalAiModel())
  return entries.map((entry) => ({
    ...entry,
    students: [...new Set(entry.students.map((alias) => idByAlias.get(alias)).filter(Boolean))],
  }))
}
