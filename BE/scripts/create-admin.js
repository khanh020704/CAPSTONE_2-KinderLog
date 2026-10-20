// Creates the first ADMIN account, which is needed to sign in and create everyone else.
//   npm run create-admin -- <username> <password> ["Full Name"]
// With --reset-password it sets the password of an existing admin instead, e.g. the "admin" of the school's
// backup, whose stored password is only a placeholder.
//   npm run create-admin -- admin <password> --reset-password
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { isDuplicate } from '../src/db/errors.js'
import { UnitOfWork } from '../src/db/unit-of-work.js'
import { userService } from '../src/services/index.js'
import { hashPassword } from '../src/utils/password.js'

const args = process.argv.slice(2)
const reset = args.includes('--reset-password')
const [username, password, fullName = 'System Admin'] = args.filter((a) => a !== '--reset-password')

if (!username || !password) {
  console.error('Usage: npm run create-admin -- <username> <password> ["Full Name"] [--reset-password]')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Use a password of at least 8 characters.')
  process.exit(1)
}

try {
  await connectDatabase()
  if (reset) {
    const passwordHash = await hashPassword(password)
    const [admin] = await UnitOfWork.run((uow) => uow.users.update({ username, role: 'ADMIN' }, { passwordHash, isActive: true, isLocked: false }))
    if (!admin) throw new Error(`There is no admin called "${username}".`)
    console.log(`Password of admin "${admin.username}" (${admin.id}) set.`)
  } else {
    const user = await userService.create({ username, password, fullName, role: 'ADMIN' })
    console.log(`Created admin "${user.username}" (${user.id}).`)
  }
} catch (err) {
  console.error(isDuplicate(err) ? `The username "${username}" is already taken. Use --reset-password to set its password.` : `Failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
