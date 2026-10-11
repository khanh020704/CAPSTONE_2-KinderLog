import { pick, toResponse } from './helpers.js'

const INPUT_FIELDS = [
  'userId',
  'audioUrl',
  'rawTranscript',
  'extractedJson',
  'asrProvider',
  'llmModel',
  'processingMs',
  'isSuccess',
  'errorMessage',
]
const RESPONSE_FIELDS = [...INPUT_FIELDS, 'createdAt']

export const toCreateAiProcessingLogDto = (body) => pick(body, INPUT_FIELDS)
export const toUpdateAiProcessingLogDto = (body) => pick(body, INPUT_FIELDS)
export const toAiProcessingLogResponse = (doc) => toResponse(doc, RESPONSE_FIELDS)
