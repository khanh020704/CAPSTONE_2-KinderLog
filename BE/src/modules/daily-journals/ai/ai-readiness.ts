import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiStepStatus = 'ready' | 'missing-key' | 'offline';
export type SttProvider = 'groq' | 'openai' | 'mock' | null;
export type ExtractionProvider = 'groq' | 'claude' | 'keywords' | 'mock';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export interface AiReadiness {
  mode: 'live' | 'mock';
  /** Whisper on Groq (GROQ_API_KEY) or OpenAI (OPENAI_API_KEY); without it the browser's transcript is used. */
  speechToText: AiStepStatus;
  speechToTextProvider: SttProvider;
  /** The LLM that sorts the transcript into the journal; the keyword rules need no key. */
  extraction: AiStepStatus;
  extractionProvider: ExtractionProvider;
}

/** Speech-to-text: Groq first (as in the reference flow), then OpenAI. */
export function sttProvider(config: ConfigService): SttProvider {
  if (config.get('ai.mode') === 'mock') return 'mock';
  if (config.get<string>('ai.groqApiKey')) return 'groq';
  if (config.get<string>('ai.openaiApiKey')) return 'openai';
  return null;
}

/** JOURNAL_AI_PROVIDER picks one; otherwise the first provider with a key, else the keyword rules. */
export function extractionProvider(config: ConfigService): ExtractionProvider {
  if (config.get('ai.mode') === 'mock') return 'mock';
  const chosen = config.get<string>('ai.provider');
  const hasGroq = !!config.get<string>('ai.groqApiKey');
  const hasClaude = !!config.get<string>('ai.anthropicApiKey');
  if (chosen === 'keywords') return 'keywords';
  if (chosen === 'groq' && hasGroq) return 'groq';
  if (chosen === 'claude' && hasClaude) return 'claude';
  return hasGroq ? 'groq' : hasClaude ? 'claude' : 'keywords';
}

/** What the AI pipeline can do with the current configuration. `offline` = AI_MODE=mock (automated tests only). */
export function aiReadiness(config: ConfigService): AiReadiness {
  const mode = config.get<'live' | 'mock'>('ai.mode') ?? 'live';
  const stt = sttProvider(config);
  return {
    mode,
    speechToText: mode === 'mock' ? 'offline' : stt ? 'ready' : 'missing-key',
    speechToTextProvider: stt,
    extraction: mode === 'mock' ? 'offline' : 'ready',
    extractionProvider: extractionProvider(config),
  };
}

/** 503 with a message the FE shows as is, when a recording must be transcribed but no key is configured. */
export function assertSpeechToText(config: ConfigService) {
  if (!sttProvider(config)) {
    throw new ServiceUnavailableException(
      'Speech-to-text is not set up yet: the system administrator must add GROQ_API_KEY (or OPENAI_API_KEY) to the backend .env and restart it. In Chrome or Edge the browser can transcribe the recording instead.',
    );
  }
}
