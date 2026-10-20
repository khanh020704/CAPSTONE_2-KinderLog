import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { UPLOAD_DIR } from './config/upload.js'
import openapi from './docs/openapi.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js'

const app = express()

// Browsers may only call the API from the origins in CORS_ORIGIN (comma-separated). Without it, any page
// served from this computer may, whatever its port: Vite moves to 5174, 5175... when 5173 is taken.
const LOCAL_PAGE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const origins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : [LOCAL_PAGE]

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
