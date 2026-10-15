import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { RosterEntry } from './journal-draft.schema';

export interface Transcription {
  text: string;
  engine: string;
}

/** ASR step: Whisper (live) or a scripted demo transcript built from the real class roster (mock). */
@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly language: string;

  constructor(config: ConfigService) {
    const live = config.get('ai.mode') === 'live';
    const key = config.get<string>('ai.openaiApiKey');
    this.openai = live && key ? new OpenAI({ apiKey: key }) : null;
    this.model = config.get<string>('ai.whisperModel')!;
    this.language = config.get<string>('ai.whisperLanguage')!;
  }

  async transcribe(audio: Express.Multer.File, roster: RosterEntry[]): Promise<Transcription> {
    if (!this.openai) return { text: demoTranscript(roster), engine: 'mock' };

    // The roster as a prompt helps Whisper spell Vietnamese names correctly.
    const prompt = `Nhật ký lớp mầm non. Tên các bé: ${roster.map((s) => s.fullName).join(', ')}.`.slice(
      0,
      800,
    );
    try {
      const res = await this.openai.audio.transcriptions.create({
        file: await toFile(audio.buffer, audio.originalname || 'recording.webm', { type: audio.mimetype }),
        model: this.model,
        language: this.language,
        prompt,
      });
      const text = res.text.trim();
      if (!text) throw new BadGatewayException('No speech was detected in the recording. Please try again.');
      return { text, engine: this.model };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      if (err instanceof OpenAI.APIConnectionError) {
        throw new ServiceUnavailableException(
          'Cannot reach the speech-to-text service. Check the internet connection.',
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

/** A realistic end-of-day summary that singles out three real children of the class. */
function demoTranscript(roster: RosterEntry[]): string {
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
