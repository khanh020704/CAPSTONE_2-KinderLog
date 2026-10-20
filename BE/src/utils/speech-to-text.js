// Vietnamese speech-to-text on the server with Whisper (Groq), when GROQ_API_KEY is set.
//
// The browser's own recognition does not know the children of the class and often mishears
// their names. Whisper is given the class list as a hint, which makes it far more likely to
// write "Trần Bảo Ngọc" than "Trần Bảo Ngoc". The browser transcript stays as a fallback.
import { createReadStream } from 'node:fs'
import Groq from 'groq-sdk'

const MODEL = process.env.SPEECH_TO_TEXT_MODEL || 'whisper-large-v3'
// Whisper reads at most 224 tokens of hint; a class list of about 40 names fits.
const MAX_HINT_LENGTH = 600

let client

export const speechToTextAvailable = () => !!process.env.GROQ_API_KEY && process.env.SPEECH_TO_TEXT !== 'off'

// Whisper sometimes writes stock phrases from video subtitles when it hears silence or noise.
const SILENCE_PHRASES = ['subscribe', 'đăng ký kênh', 'cảm ơn các bạn đã theo dõi', 'cảm ơn các bạn đã xem', 'hẹn gặp lại các bạn', 'ghiền mì gõ', 'like và share']
const isSilencePhrase = (text) => {
  const lower = text.toLowerCase()
  return SILENCE_PHRASES.some((phrase) => lower.includes(phrase))
}

/**
 * @param {string} filePath the uploaded recording
 * @param {{ fullName: string, nickname?: string }[]} students active students of the class, used as a spelling hint
 * @returns {Promise<string>} the transcript, or '' when nothing was said
 */
export async function transcribe(filePath, students) {
  client ||= new Groq({ timeout: 60_000, maxRetries: 1 })
  const names = students.flatMap((s) => [s.fullName, s.nickname].filter(Boolean)).join(', ')
  const prompt = `Báo cáo cuối ngày của cô giáo mầm non. Tên các bé trong lớp: ${names}.`.slice(0, MAX_HINT_LENGTH)

  const result = await client.audio.transcriptions.create({
    file: createReadStream(filePath),
    model: MODEL,
    language: 'vi',
    prompt,
    temperature: 0,
    response_format: 'json',
  })
  const text = String(result.text ?? '').trim()
  // On silence Whisper may also repeat the hint itself.
  return isSilencePhrase(text) || text.includes('Tên các bé trong lớp') || text.startsWith('Báo cáo cuối ngày') ? '' : text
}
