import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
  APP_TIMEZONE: Joi.string().default('Asia/Ho_Chi_Minh'),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(1433),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SYNC: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  REDIS_URL: Joi.string().allow('').default(''),
  CACHE_TTL_SECONDS: Joi.number().default(60),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  BCRYPT_ROUNDS: Joi.number().min(4).max(15).default(10),
  DEFAULT_PASSWORD: Joi.string().min(6).default('123456'),

  UPLOAD_DIR: Joi.string().default('uploads'),
  MAX_UPLOAD_MB: Joi.number().default(25),

  AI_MODE: Joi.string().valid('mock', 'live').default('mock'),
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  WHISPER_MODEL: Joi.string().default('whisper-1'),
  WHISPER_LANGUAGE: Joi.string().default('vi'),
  ANTHROPIC_API_KEY: Joi.string().allow('').default(''),
  ANTHROPIC_MODEL: Joi.string().default('claude-opus-5-5'),
});

export default () => ({
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
  redisUrl: process.env.REDIS_URL ?? '',
  cacheTtl: Number(process.env.CACHE_TTL_SECONDS ?? 60),
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  defaultPassword: process.env.DEFAULT_PASSWORD ?? '123456',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  ai: {
    mode: (process.env.AI_MODE ?? 'mock') as 'mock' | 'live',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    whisperModel: process.env.WHISPER_MODEL ?? 'whisper-1',
    whisperLanguage: process.env.WHISPER_LANGUAGE ?? 'vi',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  },
});
