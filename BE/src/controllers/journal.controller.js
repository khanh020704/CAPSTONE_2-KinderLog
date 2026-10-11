import { journalService } from '../services/index.js'
import { publicUrl } from '../config/upload.js'
import {
  toCreateJournalDto,
  toJournalListQueryDto,
  toRecordingDto,
  toUpdateJournalDto,
  toVoiceDraftDto,
} from '../dtos/journal.dto.js'

export async function list(req, res) {
  res.json(await journalService.list(req.user, toJournalListQueryDto(req.query)))
}

export async function get(req, res) {
  res.json(await journalService.get(req.user, req.params.id))
}

export async function create(req, res) {
  res.status(201).json(await journalService.create(req.user, toCreateJournalDto(req.body)))
}

export async function update(req, res) {
  res.json(await journalService.update(req.user, req.params.id, toUpdateJournalDto(req.body)))
}

export async function approve(req, res) {
  res.json(await journalService.approve(req.user, req.params.id))
}

export async function publish(req, res) {
  res.json(await journalService.publish(req.user, req.params.id))
}

export async function addRecording(req, res) {
  res.json(await journalService.addRecording(req.user, req.params.id, toRecordingDto(req.body)))
}

// Takes multipart/form-data (an `audio` file and a `transcript` field) or JSON with `transcript`.
export async function voiceDraft(req, res) {
  const audioUrl = req.file ? publicUrl(req, req.file.filename) : undefined
  res.json(await journalService.voiceDraft(req.user, toVoiceDraftDto(req.body, audioUrl)))
}
