import { teacherService } from '../services/index.js'

export async function getClass(req, res) {
  res.json(await teacherService.getClass(req.user))
}

export async function getDashboard(req, res) {
  res.json(await teacherService.getDashboard(req.user))
}
