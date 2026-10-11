import app from './app.js'
import { jwtSecret } from './config/auth.js'
import { connectDatabase } from './config/database.js'
import './models/index.js'

const port = process.env.PORT || 3000

try {
  jwtSecret()
  await connectDatabase()
} catch (err) {
  console.error(`Cannot start: ${err.message}`)
  process.exit(1)
}

app.listen(port, () => {
  console.log(`KinderLog API listening on http://localhost:${port}`)
})
