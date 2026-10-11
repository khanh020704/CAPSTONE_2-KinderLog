import { BadRequestError } from '../utils/errors.js'
import { isEmail } from '../utils/text.js'

export const DEFAULT_SETTINGS = {
  platformName: 'KinderLog',
  supportEmail: 'hotro@kinderlog.vn',
  sessionTimeout: 60,
  passwordMin: 6,
  aiJournal: true,
  sttLanguage: 'Vietnamese',
  maxPhotos: 6,
}

const STT_LANGUAGES = ['Vietnamese']

export const toSettingsResponse = (stored) => ({ ...DEFAULT_SETTINGS, ...stored })

// What a page may read before anyone has signed in (the reset-password form needs passwordMin).
export const toPublicSettingsResponse = (settings) => ({ platformName: settings.platformName, passwordMin: settings.passwordMin })

export function toUpdateSettingsDto(body) {
  const b = body ?? {}
  const fields = {}
  const whole = (name, min, message) => {
    const value = Number(b[name])
    if (b[name] === undefined || b[name] === '' || !Number.isInteger(value)) fields[name] = 'Enter a whole number.'
    else if (value < min) fields[name] = message
    return value
  }
  if (typeof b.platformName !== 'string' || !b.platformName.trim()) fields.platformName = 'Platform Name is required.'
  if (!isEmail(b.supportEmail)) fields.supportEmail = 'Enter a valid email address.'
  const sessionTimeout = whole('sessionTimeout', 5, 'Use at least 5 minutes.')
  const passwordMin = whole('passwordMin', 6, 'Use at least 6 characters.')
  const maxPhotos = whole('maxPhotos', 1, 'Allow at least 1 photo.')
  if (typeof b.aiJournal !== 'boolean') fields.aiJournal = 'Choose on or off.'
  const sttLanguage = b.sttLanguage ?? DEFAULT_SETTINGS.sttLanguage
  if (!STT_LANGUAGES.includes(sttLanguage)) fields.sttLanguage = 'Choose a supported language.'
  if (Object.keys(fields).length) throw new BadRequestError('Some fields are invalid.', fields)
  return {
    platformName: b.platformName.trim(),
    supportEmail: b.supportEmail.trim(),
    sessionTimeout,
    passwordMin,
    aiJournal: b.aiJournal,
    sttLanguage,
    maxPhotos,
  }
}
