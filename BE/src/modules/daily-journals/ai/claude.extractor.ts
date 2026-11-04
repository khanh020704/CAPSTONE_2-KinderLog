import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  aliasRoster,
  ExtractedReport,
  JournalExtractor,
  reportSchema,
  RosterEntry,
  SYSTEM_PROMPT,
} from './journal-draft.schema';

const unavailable = (detail: string) =>
  new BadGatewayException(
    `We couldn't process the recording. ${detail} Please try again, or write the journal manually.`,
  );

/** Claude structured outputs: the same prompt and answer as the Groq engine. */
@Injectable()
export class ClaudeJournalExtractor implements JournalExtractor {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeJournalExtractor.name);
  private readonly apiKey: string;
  private readonly model: string;
  private client?: Anthropic;

  constructor(config: ConfigService) {
    // The client is created on first use: the API must also start without a key.
    this.apiKey = config.get<string>('ai.anthropicApiKey') ?? '';
    this.model = config.get<string>('ai.anthropicModel')!;
  }

  async extract(transcript: string, roster: RosterEntry[]): Promise<ExtractedReport> {
    const { aliases, message, translate } = aliasRoster(roster);
    try {
      this.client ??= new Anthropic({ apiKey: this.apiKey, timeout: 60_000, maxRetries: 1 });
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message(transcript) }],
        output_config: { effort: 'low', format: betaZodOutputFormat(reportSchema(aliases)) },
        // Re-run a safety-declined request on Anthropic's recommended fallback model instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (response.stop_reason === 'refusal') throw unavailable('The AI service declined this recording.');
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
        throw unavailable('The AI service returned an incomplete answer.');
      }
      return translate(response.parsed_output);
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      if (err instanceof Anthropic.AuthenticationError) {
        this.logger.error('ANTHROPIC_API_KEY is missing or not valid.');
        throw unavailable('The AI service is not set up correctly.');
      }
      if (err instanceof Anthropic.RateLimitError) throw unavailable('The AI service is busy right now.');
      if (err instanceof Anthropic.APIConnectionError)
        throw unavailable('The AI service could not be reached.');
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Claude API error ${err.status}: ${err.message}`);
        throw unavailable('The AI service returned an error.');
      }
      throw err;
    }
  }
}
