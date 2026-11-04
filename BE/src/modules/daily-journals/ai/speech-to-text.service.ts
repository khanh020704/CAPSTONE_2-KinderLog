import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { GROQ_BASE_URL, sttProvider } from './ai-readiness';
import { RosterEntry } from './journal-draft.schema';

export interface Transcription {
  text: string;
  engine: string;
}

// Whisper sometimes writes stock phrases from video subtitles when it hears silence or noise.
const SILENCE_PHRASES = [
  'subscribe',
  'đăng ký kênh',
  'cảm ơn các bạn đã theo dõi',
  'cảm ơn các bạn đã xem',
  'hẹn gặp lại các bạn',
  'ghiền mì gõ',
  'like và share',
];
const MAX_HINT_LENGTH = 800;

/**
 * ASR step: Whisper on Groq (whisper-large-v3) or OpenAI, told the children's names so it spells them right.
 * For the automated tests (AI_MODE=mock) a scripted transcript is built from the roster.
 */
@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);
  private readonly client: OpenAI | null;
  private readonly provider: ReturnType<typeof sttProvider>;
  private readonly model: string;
  private readonly language: string;

  constructor(config: ConfigService) {
    this.provider = sttProvider(config);
    this.client =
      this.provider === 'groq'
        ? new OpenAI({ apiKey: config.get<string>('ai.groqApiKey'), baseURL: GROQ_BASE_URL })
        : this.provider === 'openai'
          ? new OpenAI({ apiKey: config.get<string>('ai.openaiApiKey') })
          : null;
    this.model = config.get<string>(this.provider === 'groq' ? 'ai.groqSttModel' : 'ai.whisperModel')!;
    this.language = config.get<string>('ai.whisperLanguage')!;
  }

  get available() {
    return !!this.provider;
  }

  async transcribe(audio: Express.Multer.File, roster: RosterEntry[]): Promise<Transcription> {
    if (this.provider === 'mock') return { text: scriptedTranscript(roster), engine: 'mock' };
    if (!this.client) {
      throw new ServiceUnavailableException('Speech-to-text is not set up (GROQ_API_KEY or OPENAI_API_KEY).');
    }

    // The roster as a prompt helps Whisper spell Vietnamese names correctly.
    const prompt = `Báo cáo cuối ngày của cô giáo mầm non. Tên các bé trong lớp: ${roster
      .map((s) => s.fullName)
      .join(', ')}.`.slice(0, MAX_HINT_LENGTH);
    try {
      const res = await this.client.audio.transcriptions.create({
        file: await toFile(audio.buffer, audio.originalname || 'recording.webm', { type: audio.mimetype }),
        model: this.model,
        language: this.language,
        prompt,
        temperature: 0,
      });
      const text = res.text.trim();
      // On silence Whisper may write a subtitle phrase, or repeat the hint itself.
      if (!text || isSilence(text) || prompt.includes(text)) {
        throw new BadGatewayException('No speech was detected in the recording. Please try again.');
      }
      return { text, engine: `${this.provider}:${this.model}` };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      if (err instanceof OpenAI.APIConnectionError) {
        throw new ServiceUnavailableException(
          'Cannot reach the speech-to-text service. Check the internet connection.',
        );
      }
      if (err instanceof OpenAI.RateLimitError) {
        throw new ServiceUnavailableException(
          'The speech-to-text service is busy. Please try again in a minute.',
        );
      }
      if (err instanceof OpenAI.APIError) {
        this.logger.error(`Whisper error ${err.status}: ${err.message}`);
        throw new BadGatewayException(
          'Speech-to-text failed. Please try again or write the journal manually.',
        );
      }
      throw err;
    }
  }
}

const isSilence = (text: string) => {
  const lower = text.toLowerCase();
  return SILENCE_PHRASES.some((phrase) => lower.includes(phrase));
};

/** Tests only: a realistic end-of-day summary that singles out three real children of the class. */
function scriptedTranscript(roster: RosterEntry[]): string {
  const given = (i: number) => roster[i]?.fullName.split(/\s+/).slice(-2).join(' ');
  const lines = [
    'Hôm nay cả lớp tham gia hoạt động vẽ tranh chủ đề gia đình của bé, các con rất hào hứng',
    'Bữa trưa có cơm, canh bí đỏ và thịt viên sốt cà chua, các con ăn hết suất',
    'Các con ngủ trưa khoảng 90 phút, ngủ ngon',
    'Sức khỏe các con bình thường',
  ];
  if (roster[0])
    lines.push(
      `Riêng bé ${given(0)} hôm nay ăn ít, hơi mệt, cô đo nhiệt độ 37,8 độ, nhờ phụ huynh theo dõi thêm`,
    );
  if (roster[1]) lines.push(`Bé ${given(1)} khó ngủ, chỉ ngủ được khoảng 40 phút`);
  if (roster[2]) lines.push(`Bé ${given(2)} xin nghỉ học vì gia đình có việc`);
  return `${lines.join('. ')}.`;
}
