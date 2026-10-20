// Checks the UnitOfWork on a throwaway database (DB_NAME ending in "_debug", already migrated):
// a unit that resolves is committed, a unit that throws leaves nothing behind, and a journal cannot be
// written outside a transaction. Run by Debug/debug_api.py; prints one "ok"/"FAIL" line per check.
import { DB_NAME, connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { UnitOfWork } from '../src/db/unit-of-work.js'
import { newSummary } from '../src/models/journal.js'

let failed = 0
const check = (label, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  -> ${detail}`}`)
}
const tag = `uow${Date.now()}`

try {
  if (!DB_NAME.endsWith('_debug')) throw new Error(`Refusing to use "${DB_NAME}": set DB_NAME to a name ending in "_debug".`)
  await connectDatabase()
  const read = () => UnitOfWork.read()

  // Committed together.
  const school = await UnitOfWork.run(async (uow) => {
    const made = await uow.schools.insert({ schoolCode: `${tag}A`, schoolName: 'Trường thử' })
    await uow.classes.insert({ classCode: tag, className: 'Lớp thử', gradeLevel: 'Mầm', schoolYear: '2026-2027' })
    return made
  })
  check('a unit that resolves is committed', !!(await read().schools.findById(school.id)) && (await read().classes.count({ classCode: tag })) === 1)

  // Rolled back together, also what was written before the failure.
  let thrown
  try {
    await UnitOfWork.run(async (uow) => {
      await uow.schools.insert({ schoolCode: `${tag}B`, schoolName: 'Không được lưu' })
      await uow.schools.updateById(school.id, { schoolName: 'Đổi tên không được lưu' })
      await uow.schools.insert({ schoolCode: `${tag}A`, schoolName: 'Trùng mã' }) // duplicate: fails
    })
  } catch (err) {
    thrown = err
  }
  check('the failure reaches the caller', !!thrown)
  check('a unit that throws leaves no new row', (await read().schools.count({ schoolCode: `${tag}B` })) === 0)
  check('a unit that throws undoes its updates', (await read().schools.findById(school.id))?.schoolName === 'Trường thử')

  // A unit sees its own writes before it commits; others do not.
  await UnitOfWork.run(async (uow) => {
    await uow.schools.updateById(school.id, { address: 'Đang sửa' })
    check('a unit reads its own uncommitted writes', (await uow.schools.findById(school.id)).address === 'Đang sửa')
  })

  // A journal spans several tables, so it is only written inside a transaction.
  let refused
  try {
    await read().journals.save(newSummary({ classId: '1', summaryDate: '2026-10-01' }))
  } catch (err) {
    refused = err
  }
  check('a journal cannot be written without a transaction', /UnitOfWork\.run/.test(refused?.message ?? ''), refused?.message)

  await UnitOfWork.run(async (uow) => {
    await uow.classes.remove({ classCode: tag })
    await uow.schools.removeById(school.id)
  })
} catch (err) {
  check(`run finished (${err.message})`, false)
} finally {
  await disconnectDatabase()
}
process.exitCode = failed ? 1 : 0
