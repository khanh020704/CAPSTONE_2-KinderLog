// The System Settings form is the only data still kept in the browser; everything else comes from the backend.
export const LOCAL_DATA_VERSION = 6

export function emptyLocalData() {
  return {
    version: LOCAL_DATA_VERSION,
    settings: {
      platformName: 'KinderLog',
      supportEmail: '',
      sessionTimeout: '60',
      passwordMin: '6',
      aiJournal: true,
      sttLanguage: 'Vietnamese',
      maxPhotos: '6',
    },
  }
}
