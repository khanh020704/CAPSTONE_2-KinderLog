import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GROQ_BASE_URL } from './ai-readiness';
import {
  aliasRoster,
  ExtractedReport,
  JournalExtractor,
  reportJsonSchema,
  reportSchema,
  RosterEntry,
  SYSTEM_PROMPT,
} from './journal-draft.schema';

const TIMEOUT_MS = 60_000;
// Groq refuses an answer that does not match the schema (json_validate_failed): a slip of the model, tried again.
const SCHEMA_ATTEMPTS = 3;

const unavailable = (detail: string) =>
  new BadGatewayException(
    `We couldn't process the recording. ${detail} Please try again, or write the journal manually.`,
  );

/**
 * Groq (OpenAI-compatible API) with gpt-oss-120b and a strict JSON schema. The model sees short aliases (s1, s2…)
 * instead of database ids, and on a rate limit the next model of GROQ_FALLBACK_MODELS is asked.
 */
@Injectable()
export class GroqJournalExtractor implements JournalExtractor {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqJournalExtractor.name);
  private readonly client: OpenAI;
  private readonly models: string[];

  constructor(config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.get<string>('ai.groqApiKey'),
      baseURL: GROQ_BASE_URL,
      timeout: TIMEOUT_MS,
      maxRetries: 3,
    });
    const main = config.get<string>('ai.groqLlmModel')!;
    const fallbacks = config.get<string[]>('ai.groqFallbackModels') ?? [];
    this.models = [main, ...fallbacks.filter((m) => m !== main)];
  }

  async extract(transcript: string, roster: RosterEntry[]): Promise<ExtractedReport> {
    const { aliases, message, translate } = aliasRoster(roster);
    const content = message(transcript);
    for (const [index, model] of this.models.entries()) {
      try {
        return translate(await this.ask(content, aliases, model));
      } catch (err) {
        if (err instanceof OpenAI.RateLimitError && index < this.models.length - 1) {
          this.logger.warn(`${model} reached a Groq limit; asking ${this.models[index + 1]} instead.`);
          continue;
        }
        throw this.translateError(err);
      }
    }
    throw new ServiceUnavailableException('The AI service is busy. Please try again in a minute.');
  }

  private async ask(content: string, aliases: string[], model: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          temperature: 0,
          // A teacher is waiting on the result, and the task is careful reading rather than open-ended reasoning.
          reasoning_effort: 'medium',
          max_completion_tokens: 12000,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'journal_report', strict: true, schema: reportJsonSchema(aliases) },
          },
        });
        const choice = completion.choices[0];
        if (choice?.finish_reason === 'length')
          throw unavailable('The AI service returned an incomplete answer.');
        const parsed = reportSchema(aliases).safeParse(JSON.parse(choice?.message?.content || 'null'));
        if (!parsed.success) {
          this.logger.warn(`Groq ${model} answered outside the schema: ${parsed.error.message}`);
          throw unavailable('The AI service returned an answer that could not be read.');
        }
        return parsed.data;
      } catch (err) {
        const slip =
          err instanceof OpenAI.BadRequestError &&
          JSON.stringify(err.error ?? err.message).includes('json_validate_failed');
        if (slip && attempt < SCHEMA_ATTEMPTS) {
          this.logger.warn(
            `The answer did not match the schema, trying again (${attempt}/${SCHEMA_ATTEMPTS - 1})`,
          );
          continue;
        }
        throw err;
      }
    }
  }

  private translateError(err: unknown) {
    if (err instanceof BadGatewayException || err instanceof ServiceUnavailableException) return err;
    if (err instanceof SyntaxError)
      return unavailable('The AI service returned an answer that could not be read.');
    if (err instanceof OpenAI.AuthenticationError) {
      this.logger.error('GROQ_API_KEY is missing or not valid.');
      return unavailable('The AI service is not set up correctly.');
    }
    if (err instanceof OpenAI.RateLimitError) {
      return /per day|TPD|RPD/i.test(JSON.stringify(err.error ?? err.message))
        ? unavailable('The AI service has reached its limit for today.')
        : unavailable('The AI service is busy right now.');
    }
    if (err instanceof OpenAI.APIConnectionError) return unavailable('The AI service could not be reached.');
    if (err instanceof OpenAI.APIError) {
      this.logger.error(`Groq API error ${err.status}: ${err.message}`);
      return unavailable('The AI service returned an error.');
    }
    return err;
  }
}
