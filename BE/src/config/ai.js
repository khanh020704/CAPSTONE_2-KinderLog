// How a spoken report is turned into a journal draft:
//   ai       - an LLM reads the transcript and returns structured entries
//   keywords - the built-in keyword classifier, no network call
// JOURNAL_DRAFT_ENGINE picks one explicitly; otherwise AI is used whenever a provider key is configured.

const PROVIDERS = {
  groq: { key: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b' },
  claude: { key: 'ANTHROPIC_API_KEY', model: 'claude-opus-5-5' },
}

// JOURNAL_AI_PROVIDER (groq | claude) picks the provider; otherwise the first one with a key is used.
export function journalAiProvider() {
  const chosen = process.env.JOURNAL_AI_PROVIDER
  if (chosen in PROVIDERS) return chosen
  return Object.keys(PROVIDERS).find((name) => process.env[PROVIDERS[name].key]) || null
}

export function journalAiModel() {
  const provider = journalAiProvider()
  return process.env.JOURNAL_AI_MODEL || (provider ? PROVIDERS[provider].model : null)
}

export function journalDraftEngine() {
  const chosen = process.env.JOURNAL_DRAFT_ENGINE
  if (chosen === 'ai' || chosen === 'keywords') return chosen
  return journalAiProvider() ? 'ai' : 'keywords'
}
