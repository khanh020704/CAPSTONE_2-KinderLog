import { parentJournalService } from '../services/index.js'
import { toParentJournalByDateQueryDto, toParentJournalListQueryDto } from '../dtos/parent-journal.dto.js'

export async function list(req, res) {
  res.json(await parentJournalService.list(req.user, toParentJournalListQueryDto(req.query)))
}

export async function byDate(req, res) {
  res.json(await parentJournalService.byDate(req.user, toParentJournalByDateQueryDto(req.query)))
}
