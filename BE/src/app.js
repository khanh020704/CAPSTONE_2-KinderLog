import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { UPLOAD_DIR } from './config/upload.js'
import openapi from './docs/openapi.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js'

const app = express()

// Browsers may only call the API from these origins (the Vite dev server by default).
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim())

app.use(cors({ origin: origins }))
app.use(express.json())
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny' }))

// Swagger: the page at /api/docs, the raw description at /api/docs.json.
app.get('/api/docs.json', (req, res) => res.json(openapi))
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'KinderLog API', swaggerOptions: { persistAuthorization: true } }))

app.use('/api/v1', routes)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
