import { api } from './api'
import { useApi } from './useApi'

// Same values as the backend's DEFAULT_SETTINGS, used until the server answers.
export const DEFAULT_SETTINGS = {
  platformName: 'KinderLog',
  supportEmail: 'hotro@kinderlog.vn',
  sessionTimeout: 60,
  passwordMin: 6,
  sttLanguage: 'Vietnamese',
  maxPhotos: 6,
  aiJournal: true,
}

/** The platform settings saved by the System Admin on the server (System Settings page). */
export function useSettings() {
  const q = useApi(() => api.system.settings(), [])
  return { ...q, settings: { ...DEFAULT_SETTINGS, ...(q.data || {}) } }
}
