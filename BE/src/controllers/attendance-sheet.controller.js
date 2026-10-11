import { attendanceSheetService } from '../services/index.js'
import { toSaveSheetDto, toSheetQueryDto } from '../dtos/attendance-sheet.dto.js'

export async function getSheet(req, res) {
  res.json(await attendanceSheetService.getSheet(req.user, toSheetQueryDto(req.query)))
}

export async function saveSheet(req, res) {
  res.json(await attendanceSheetService.saveSheet(req.user, toSaveSheetDto(req.body)))
}
