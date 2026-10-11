// Creates the first ADMIN account, which is needed to sign in and create everyone else.
//   npm run create-admin -- <username> <password> ["Full Name"]
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { userService } from '../src/services/index.js'

const [username, password, fullName = 'System Admin'] = process.argv.slice(2)

if (!username || !password) {
  console.error('Usage: npm run create-admin -- <username> <password> ["Full Name"]')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Use a password of at least 8 characters.')
  process.exit(1)
}

try {
  await connectDatabase()
  const user = await userService.create({ username, password, fullName, role: 'ADMIN' })
  console.log(`Created admin "${user.username}" (${user.id}).`)
} catch (err) {
  console.error(err.code === 11000 ? `The username "${username}" is already taken.` : `Failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
