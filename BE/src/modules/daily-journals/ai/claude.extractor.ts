import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildDraftSchema, JournalDraft, JournalExtractor, RosterEntry } from './journal-draft.schema';

const SYSTEM_PROMPT = `You turn a Vietnamese preschool teacher's spoken end-of-day summary into structured journal data.

The transcript comes from speech-to-text, so expect missing punctuation, homophones and mis-heard names.
- "classDefaults" holds what the teacher says about the whole class ("cả lớp", "các con", "các bạn").
- "exceptions" holds only children the teacher singles out, with only the fields that differ for that child.
  Match names against the roster: teachers often use only the given name ("bé An", "con Huy") or the last two words.
  If a given name is shared by several children and the teacher does not disambiguate, put the name in
  "unrecognizedNames" instead of guessing.
- Use null for anything the teacher did not say. Never invent meals, times, temperatures or activities.
- Write every free-text note in natural, warm Vietnamese suitable for parents, keeping the teacher's meaning.`;

/** LLM step of the pipeline: transcript + class roster → JSON that matches the draft schema. */
@Injectable()
export class ClaudeJournalExtractor implements JournalExtractor {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeJournalExtractor.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.get<string>('ai.anthropicApiKey') || undefined });
    this.model = config.get<string>('ai.anthropicModel')!;
  }

  async extract(transcript: string, roster: RosterEntry[]): Promise<JournalDraft> {
    if (!roster.length) throw new BadGatewayException('The class has no active students');
    const schema = buildDraftSchema(roster.map((s) => s.id) as [string, ...string[]]);
    const rosterText = roster.map((s) => `- ${s.id}: ${s.fullName}`).join('\n');

    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `<roster>\n${rosterText}\n</roster>\n\n<transcript>\n${transcript}\n</transcript>`,
          },
        ],
        // Extraction is a routine task: low effort keeps latency short for the teacher waiting on the draft.
        output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
        // Re-run a safety-declined request on Anthropic's recommended fallback model instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });

      if (response.stop_reason === 'refusal') {
        throw new BadGatewayException(
          'The AI service declined this transcript. Please write the journal manually.',
        );
      }
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
        throw new BadGatewayException('The AI service returned an incomplete draft. Please try again.');
      }
      return response.parsed_output;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      if (err instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException('The AI service is busy. Please try again in a minute.');
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new ServiceUnavailableException('Cannot reach the AI service. Check the internet connection.');
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Claude API error ${err.status}: ${err.message}`);
        throw new BadGatewayException('The AI service failed to process the transcript.');
      }
      throw err;
    }
  }
}
