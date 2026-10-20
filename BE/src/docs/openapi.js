// The OpenAPI description behind the Swagger page (/api/docs) and /api/docs.json.
// Teacher, messaging and account endpoints are written out below. The /admin record
// endpoints are generated from the table definitions (src/models) and DTOs, so they cannot drift from the code.
import * as models from '../models/index.js'
import * as dtos from '../dtos/index.js'
import { DEFAULT_SETTINGS } from '../dtos/settings.dto.js'

// ---------- small builders ----------

const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema) => ({ 'application/json': { schema } })
const str = (description, extra = {}) => ({ type: 'string', ...(description && { description }), ...extra })
const int = (description, extra = {}) => ({ type: 'integer', ...(description && { description }), ...extra })
const bool = (description) => ({ type: 'boolean', ...(description && { description }) })
const nullable = (schema) => ({ ...schema, nullable: true })
const list = (items) => ({ type: 'array', items })
const obj = (properties, required) => ({ type: 'object', properties, ...(required && { required }) })
const oneOf = (values, description) => ({ type: 'string', enum: values, ...(description && { description }) })

const id = str('Record id: the row number in SQL Server, as a string', { example: '12' })
const day = str('Calendar date', { format: 'date', example: '2026-10-11' })
const millis = int('Epoch milliseconds', { format: 'int64', example: 1791700000000 })

const ERROR_TEXT = {
  400: 'A field is missing or invalid (`VALIDATION_ERROR`).',
  401: 'No valid access token (`UNAUTHENTICATED`).',
  403: 'The signed-in role may not do this (`FORBIDDEN`).',
  404: 'The record does not exist, or belongs to another class (`NOT_FOUND`).',
  409: 'Conflicts with an existing record.',
  422: 'Not allowed in the current state (`INVALID_STATE`).',
  502: 'An AI service is not available (`AI_UNAVAILABLE`).',
}

// Error responses by status; pass [status, 'text'] to describe one more precisely.
const errors = (...statuses) =>
  Object.fromEntries(
    statuses.map((entry) => {
      const [status, description] = Array.isArray(entry) ? entry : [entry, ERROR_TEXT[entry]]
      return [status, { description, content: json(ref('Error')) }]
    }),
  )

const ok = (description, schema) => ({ 200: { description, ...(schema && { content: json(schema) }) } })
const created = (description, schema) => ({ 201: { description, content: json(schema) } })
const noContent = (description) => ({ 204: { description } })

const body = (schema, required = true) => ({ required, content: json(schema) })
const pathId = (name, description) => ({ name, in: 'path', required: true, description, schema: id })
const query = (name, schema, description) => ({ name, in: 'query', required: false, description, schema })

const ROLE_TEXT = { ADMIN: 'administrators', TEACHER: 'teachers', PARENT: 'parents' }

// One operation. `roles` empty = any signed-in user; `open` = no sign-in.
function op(tag, summary, { roles = [], open = false, description, parameters, requestBody, responses }) {
  const access = open ? 'No sign-in needed.' : roles.length ? `For ${roles.map((r) => ROLE_TEXT[r]).join(' and ')}.` : 'For any signed-in user.'
  return {
    tags: [tag],
    summary,
    description: [access, description].filter(Boolean).join('\n\n'),
    ...(open ? { security: [] } : {}),
    ...(parameters && { parameters }),
    ...(requestBody && { requestBody }),
    responses: { ...responses, ...(open ? {} : errors(401, ...(roles.length ? [403] : []))) },
  }
}

// ---------- schemas written by hand ----------

const sections = obj({
  meal: str('Meals'),
  learning: str('Learning activities'),
  sleep: str('Nap'),
  health: str('Health'),
  emotion: str('Mood'),
  note: str('Note for every parent of the class'),
})
const personal = {
  type: 'object',
  description: 'Notes about individual children, keyed by student id. Each is visible only to that child\'s parents.',
  additionalProperties: { type: 'string' },
  example: { '12': 'Bé An hơi ho, trưa ăn ít hơn mọi ngày.' },
}
const attendanceStatus = oneOf(['present', 'absent', 'late', 'excused'])
const journalStatus = oneOf(['draft', 'review', 'approved', 'published'], 'draft (manual) or review (voice) -> approved -> published')
const classRef = obj({ id, name: str('', { example: 'Mặt Trời 1' }) })
const attendanceCounts = obj({
  total: int('Active students of the class'),
  present: int('Present or late'),
  absent: int('Absent or excused'),
  unrecorded: int(),
  recorded: bool('false when nothing was saved for that day'),
})
const journalListItem = {
  id,
  date: day,
  status: journalStatus,
  source: oneOf(['manual', 'voice']),
  updatedAt: millis,
  publishedAt: nullable({ ...millis, description: 'When the journal was first published' }),
  unpublishedChanges: bool('true: edited after publishing; parents still see the published version until the change is published'),
}

const schemas = {
  Error: obj({
    error: obj({
      code: str('Machine-readable code', { example: 'VALIDATION_ERROR' }),
      message: str('Text the frontend shows to the user'),
      fields: { type: 'object', description: 'Message per invalid field', additionalProperties: { type: 'string' } },
    }),
  }),

  Account: obj({
    id,
    role: oneOf(['admin', 'teacher', 'parent']),
    roleLabel: str('', { example: 'Teacher' }),
    username: str(),
    name: str('', { example: 'Nguyễn Thị Mai' }),
    phone: nullable(str('', { example: '0903000001' })),
    email: nullable(str('', { format: 'email' })),
    avatarUrl: nullable(str()),
    status: oneOf(['Active', 'Inactive', 'Locked']),
    createdAt: millis,
    lastLogin: nullable(millis),
    class: nullable({ ...classRef, description: 'Teachers only: the class they lead' }),
    children: list(obj({ id, name: str(), classId: nullable(id), className: nullable(str()), relationship: str('', { example: 'Mother' }) })),
  }),
  LoginRequest: obj(
    {
      phone: str('Phone number of the account', { example: '0903000001' }),
      username: str('Alternative to `phone`'),
      password: str('', { format: 'password' }),
      role: oneOf(['admin', 'teacher', 'parent'], 'Optional. When given, the account must have this role.'),
      remember: bool('true keeps the session for 30 days instead of 1'),
    },
    ['password'],
  ),
  Tokens: obj({ accessToken: str('Send as `Authorization: Bearer <accessToken>`'), refreshToken: str(), expiresIn: int('Seconds until the access token expires', { example: 3600 }) }),
  LoginResponse: { allOf: [ref('Tokens'), obj({ user: ref('Account') })] },
  UpdateProfile: obj({ name: str(), phone: str('10 digits starting with 0', { example: '0903000001' }), email: str('', { format: 'email' }) }, ['name', 'phone', 'email']),
  ChangePassword: obj({ currentPassword: str('', { format: 'password' }), newPassword: str('At least `passwordMin` characters', { format: 'password' }) }, ['currentPassword', 'newPassword']),

  Settings: obj(
    {
      platformName: str(),
      supportEmail: str('', { format: 'email' }),
      sessionTimeout: int('Minutes, at least 5'),
      passwordMin: int('At least 6'),
      aiJournal: bool('false turns off voice drafts'),
      sttLanguage: oneOf(['Vietnamese']),
      maxPhotos: int('Photos per journal, at least 1'),
    },
    ['platformName', 'supportEmail', 'sessionTimeout', 'passwordMin', 'aiJournal', 'maxPhotos'],
  ),
  PublicSettings: obj({ platformName: str(), passwordMin: int() }),

  ClassRoster: obj({
    class: classRef,
    students: list(
      obj({
        id,
        name: str('', { example: 'Nguyễn Minh An' }),
        nickname: nullable(str()),
        dob: day,
        gender: oneOf(['Male', 'Female', 'Other']),
        photo: str('Address of the photo, or an empty string'),
        note: str('Allergies and health notes for the teacher'),
        today: nullable({ ...attendanceStatus, description: 'Attendance today; null when not recorded' }),
        parents: list(obj({ id, name: str(), phone: nullable(str()), relationship: str('', { example: 'Mother' }) })),
      }),
    ),
  }),
  TeacherDashboard: obj({
    date: day,
    class: nullable({ ...classRef, description: 'null when the teacher has no class; the fields below are then absent' }),
    students: int('Active students'),
    attendance: attendanceCounts,
    journal: nullable(obj({ id, status: journalStatus })),
    pendingReviews: int('Journals of the class waiting for review'),
    unreadMessages: int(),
  }),

  AttendanceSheet: obj({
    classId: id,
    date: day,
    savedAt: nullable(millis),
    records: {
      type: 'object',
      description: 'Keyed by student id. A child who was not marked has no entry.',
      additionalProperties: obj({ status: attendanceStatus, note: str() }),
    },
    counts: attendanceCounts,
  }),
  SaveAttendance: obj(
    {
      classId: { ...id, description: 'Optional; must be the teacher\'s own class' },
      date: day,
      records: {
        type: 'object',
        description: 'Replaces the whole sheet of that day. Children left out become "not recorded".',
        additionalProperties: obj({ status: attendanceStatus, note: str('Up to 255 characters') }, ['status']),
        example: { '12': { status: 'absent', note: 'Sốt nhẹ' } },
      },
    },
    ['date', 'records'],
  ),

  JournalListItem: obj(journalListItem),
  Journal: obj({
    ...journalListItem,
    classId: id,
    sections,
    personal,
    photos: list(str('Address returned by POST /uploads')),
    transcript: str('What the teacher said, for voice journals'),
    audio: list(str('Address of a recording')),
    issues: { ...list(ref('JournalIssue')), description: 'Points to confirm. While any is open the journal cannot be approved.' },
    revision: int('How many times it was published: 0 before the first publish, +1 for every published change'),
    editedAt: nullable({ ...millis, description: 'When a change was last published; null while parents see the first version' }),
  }),
  ParentJournalListItem: obj({
    id,
    date: day,
    publishedAt: { ...millis, description: 'When the journal was first published' },
    editedAt: nullable({ ...millis, description: 'When a change was last published' }),
  }),
  ParentJournal: obj({
    id,
    date: day,
    publishedAt: millis,
    editedAt: nullable(millis),
    classId: id,
    sections,
    personalNote: str("The note about this child only; '' when there is none"),
    photos: list(str()),
    attendance: nullable(obj({ status: attendanceStatus, note: str() })),
  }),
  JournalIssue: obj({
    id: str('', { example: 'iss_3f9a1c2b7d4e' }),
    type: oneOf(
      ['unknown_student', 'ambiguous_student', 'name_mismatch', 'missing_student', 'child_named_in_class_text', 'contradiction', 'unclear', 'health_alert', 'unsupported_content', 'attendance_mismatch'],
      'What the teacher must check',
    ),
    section: oneOf(['meal', 'learning', 'sleep', 'health', 'emotion', 'note']),
    text: str('The statement it is about'),
    message: str('What to check, in one sentence'),
    spokenNames: list(str('A name as it was heard')),
    candidates: list({ ...id, description: 'Children the name may mean (never assigned automatically)' }),
    studentIds: list({ ...id, description: 'Children the statement is verifiably about' }),
    held: bool('true: the statement is in neither the class sections nor any note until the teacher decides'),
    status: oneOf(['open', 'resolved']),
    resolution: nullable(oneOf(['assigned', 'class', 'discarded', 'confirmed'], 'Held points: assigned, class or discarded. Other points: confirmed.')),
    assignedTo: list(id),
  }),
  IssueDecision: obj(
    {
      id: str(),
      status: oneOf(['open', 'resolved']),
      resolution: nullable(oneOf(['assigned', 'class', 'discarded', 'confirmed'])),
      assignedTo: list({ ...id, description: 'Required for assigned: children of the class' }),
    },
    ['id', 'status'],
  ),
  CreateJournal: obj(
    {
      date: day,
      source: oneOf(['manual', 'voice'], 'Default manual. A voice journal starts in review.'),
      sections,
      personal,
      transcript: str('Voice only'),
      audio: list(str('Voice only')),
      issues: { ...list(ref('JournalIssue')), description: 'Voice only: the issues of the voice draft, as returned' },
    },
    ['date'],
  ),
  UpdateJournal: obj({ sections, personal, photos: list(str()), issues: { ...list(ref('IssueDecision')), description: "Optional: the teacher's decisions on issues" } }),
  VoiceDraftRequest: obj(
    {
      transcript: str('What the teacher said, as recognised by the browser'),
      journalId: { ...id, description: 'For a further recording: the journal to check it against' },
      date: { ...day, description: "The journal's day (default: the journal's, or today), to check against that day's attendance" },
      audioUrl: str('The recording sent before to /journals/transcribe; `transcript` is then the text the teacher corrected'),
    },
    ['transcript'],
  ),
  VoiceDraft: obj({
    transcript: str(),
    transcriptSource: oneOf(['whisper', 'browser', 'teacher'], 'whisper: the server transcribed the recording; browser: the transcript sent was used; teacher: the text the teacher corrected'),
    sections,
    personal,
    entries: list(ref('JournalEntry')),
    issues: list(ref('JournalIssue')),
    engine: oneOf(['ai', 'keywords'], 'ai: an LLM extracted `entries` and the draft was built from them. keywords: the built-in classifier was used and `entries` is empty.'),
    audioUrl: nullable(str('Address of the uploaded recording')),
  }),
  JournalEntry: obj({
    section: oneOf(['meal', 'learning', 'sleep', 'health', 'emotion', 'note']),
    status: oneOf(['all', 'part', 'nobody', 'named'], 'Who the statement is about: the whole class, some of it, no child, or named children'),
    students: list(id),
    text: str('The statement as one sentence'),
  }),
  Recording: obj({ transcript: str(), sections, personal, audioUrl: nullable(str()), issues: list(ref('JournalIssue')) }),

  Upload: obj({ url: str(), contentType: str('', { example: 'image/jpeg' }), size: int('Bytes') }),

  Message: obj({ id, parentId: id, teacherId: id, from: oneOf(['parent', 'teacher']), text: str(), at: millis, read: bool('Read by the receiver') }),
  Conversation: obj({
    peerId: { ...id, description: 'The other person: a parent for teachers, a teacher for parents' },
    name: str(),
    sub: str('', { example: 'Mother of Nguyễn Minh An' }),
    unread: int(),
    last: nullable(obj({ id, from: oneOf(['parent', 'teacher']), text: str(), at: millis })),
  }),
  SendMessage: obj({ text: str('Up to 2000 characters') }, ['text']),

  NotificationItem: obj({
    id,
    type: oneOf(['journal', 'message', 'system', 'announcement', 'health', 'feedback']),
    title: str(),
    body: str(),
    at: millis,
    read: bool(),
  }),
  MarkNotificationsRead: {
    oneOf: [obj({ ids: list(id) }, ['ids']), obj({ all: { type: 'boolean', enum: [true] } }, ['all'])],
  },
  Count: obj({ count: int() }),
}

// ---------- paths written by hand ----------

const journalId = pathId('id', 'Journal id')
const peerId = pathId('peerId', 'Id of the other person in the conversation')
const itemsOf = (name) => obj({ items: list(ref(name)) })
const T = ['TEACHER']
const CHAT = ['TEACHER', 'PARENT']

const paths = {
  '/health': {
    get: op('System', 'Check that the API and the database are up', { open: true, responses: { ...ok('Up'), 503: { description: 'The database is unreachable' } } }),
  },

  '/auth/login': {
    post: op('Auth', 'Sign in', {
      open: true,
      requestBody: body(ref('LoginRequest')),
      responses: {
        ...ok('Signed in', ref('LoginResponse')),
        ...errors(400, [401, 'Wrong phone number, password or role (`INVALID_CREDENTIALS`).'], [403, 'The account is inactive or locked (`ACCOUNT_INACTIVE`, `ACCOUNT_LOCKED`).']),
      },
    }),
  },
  '/auth/refresh': {
    post: op('Auth', 'Exchange a refresh token for a new pair', {
      open: true,
      description: 'The refresh token sent stops working; use the new one next time.',
      requestBody: body(obj({ refreshToken: str() }, ['refreshToken'])),
      responses: { ...ok('New tokens', ref('Tokens')), ...errors(400, [401, 'The refresh token is unknown, used, or expired.']) },
    }),
  },
  '/auth/logout': {
    post: op('Auth', 'Sign out', {
      description: 'Ends the session of the refresh token sent. Without one, every session of the user is ended.',
      requestBody: body(obj({ refreshToken: str() }), false),
      responses: noContent('Signed out'),
    }),
  },
  '/auth/forgot-password': {
    post: op('Auth', 'Ask for password reset instructions', {
      open: true,
      description: 'No mail server is configured yet: the reset link is written to the server log.',
      requestBody: body(obj({ email: str('', { format: 'email' }) }, ['email'])),
      responses: { ...ok('Sent', obj({ sent: bool() })), ...errors(400, [404, 'No account has this email (`EMAIL_NOT_FOUND`).']) },
    }),
  },
  '/auth/reset-password': {
    post: op('Auth', 'Set a new password with a reset token', {
      open: true,
      requestBody: body(obj({ token: str(), newPassword: str('', { format: 'password' }) }, ['token', 'newPassword'])),
      responses: { ...noContent('Password changed'), ...errors([400, 'The password is too short, or the token is wrong, used or expired (`RESET_TOKEN_INVALID`).']) },
    }),
  },

  '/me': {
    get: op('Account', 'My profile', { responses: ok('The signed-in account', ref('Account')) }),
    patch: op('Account', 'Update my profile', {
      requestBody: body(ref('UpdateProfile')),
      responses: { ...ok('Updated', ref('Account')), ...errors(400, [409, 'The phone number or email belongs to another account (`PHONE_TAKEN`, `EMAIL_TAKEN`).']) },
    }),
  },
  '/me/password': {
    put: op('Account', 'Change my password', {
      description: 'Other devices are signed out.',
      requestBody: body(ref('ChangePassword')),
      responses: { ...noContent('Changed'), ...errors(400) },
    }),
  },

  '/settings/public': {
    get: op('Settings', 'Settings a page may read before sign-in', { open: true, responses: ok('Public settings', ref('PublicSettings')) }),
  },
  '/settings': {
    get: op('Settings', 'Platform settings', { responses: ok('Settings', ref('Settings')) }),
    put: op('Settings', 'Change the platform settings', {
      roles: ['ADMIN'],
      requestBody: body(ref('Settings')),
      responses: { ...ok('Saved', ref('Settings')), ...errors(400) },
    }),
  },

  '/teacher/class': {
    get: op('Teacher', 'My class: students and their parents (PB09)', {
      roles: T,
      description: 'Active students only, each with today\'s attendance and the parents linked to them.',
      responses: { ...ok('Class roster', ref('ClassRoster')), ...errors([404, 'The teacher has no class (`NO_CLASS`).']) },
    }),
  },
  '/teacher/dashboard': {
    get: op('Teacher', 'Numbers for the teacher\'s home screen', { roles: T, responses: ok('Dashboard', ref('TeacherDashboard')) }),
  },

  '/attendance': {
    get: op('Attendance', 'Attendance sheet of a class on one day (PB11)', {
      roles: ['ADMIN', 'TEACHER'],
      parameters: [
        query('classId', id, 'Teachers may leave it out (their own class is used). Required for administrators.'),
        query('date', day, 'Default: today'),
      ],
      responses: { ...ok('The sheet; empty when nothing was recorded', ref('AttendanceSheet')), ...errors(400, 404) },
    }),
    put: op('Attendance', 'Save the attendance sheet of my class (PB11)', {
      roles: T,
      description: 'Replaces the sheet of that day. The date may not be in the future.',
      requestBody: body(ref('SaveAttendance')),
      responses: { ...ok('The saved sheet', ref('AttendanceSheet')), ...errors(400, [404, 'The teacher has no class (`NO_CLASS`).']) },
    }),
  },

  '/journals': {
    get: op('Journal', 'Journal history of my class (PB16)', {
      roles: T,
      parameters: [
        query('status', oneOf(['draft', 'review', 'published']), '`review` also returns approved journals'),
        query('date', day, 'Only the journal of this day'),
      ],
      responses: { ...ok('Newest first', itemsOf('JournalListItem')), ...errors(400, 404) },
    }),
    post: op('Journal', 'Create the journal of a day (PB15)', {
      roles: T,
      description: 'One journal per class per day. For `source: voice`, send the draft returned by `/journals/voice-draft`.',
      requestBody: body(ref('CreateJournal')),
      responses: {
        ...created('Created', ref('Journal')),
        ...errors(400, 404, [409, 'The class already has a journal for that day (`JOURNAL_EXISTS`).']),
        403: { description: 'Not a teacher (`FORBIDDEN`), or voice drafts are turned off (`AI_DISABLED`).', content: json(ref('Error')) },
      },
    }),
  },
  '/journals/transcribe': {
    post: op('Journal', 'Turn a recording into text for the teacher to correct (PB14)', {
      roles: T,
      description:
        'Step 1 of a voice journal: the recording is stored and transcribed with Whisper (when GROQ_API_KEY is set), the class list given as a spelling hint. ' +
        "The teacher reads and corrects the text, then sends it to /journals/voice-draft with the returned audioUrl. The browser's transcript is the fallback.",
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: obj({ audio: str('WebM, OGG, MP3, M4A or WAV, up to 25 MB', { format: 'binary' }), transcript: str("The browser's transcript, used when the server cannot transcribe") }, ['audio']),
          },
        },
      },
      responses: {
        ...ok('The text', obj({ transcript: str(), transcriptSource: oneOf(['whisper', 'browser']), audioUrl: nullable(str()) })),
        ...errors(400, 404, [422, 'Nothing was said (`NO_SPEECH`).'], [502, 'Speech-to-text failed or is not available (`AI_UNAVAILABLE`).']),
        403: { description: 'Not a teacher (`FORBIDDEN`), or voice drafts are turned off (`AI_DISABLED`).', content: json(ref('Error')) },
      },
    }),
  },
  '/journals/voice-draft': {
    post: op('Journal', 'Turn what the teacher said into a draft (PB14)', {
      roles: T,
      description:
        'Nothing is saved. A recording is transcribed with Whisper when GROQ_API_KEY is set, with the class list as a spelling hint. ' +
        'Names, contradictions and health information are then checked in code: a name that is not exactly a child of the class, ' +
        'or a statement about an unnamed child, is held in `issues` and placed nowhere until the teacher decides. ' +
        'With an AI key configured (Groq or Anthropic), an LLM turns the free speech into structured `entries` (topic, who it is about, text) ' +
        'and the draft is built from them in code: an entry that lists students becomes a private note for each of them, every other entry joins its section. ' +
        'Without a key a keyword classifier is used.\n\n' +
        'The server has no speech-to-text service yet, so `transcript` is required; an `audio` file is stored and its address returned.',
      requestBody: {
        required: true,
        content: {
          ...json(ref('VoiceDraftRequest')),
          'multipart/form-data': {
            schema: obj({
              audio: str('WebM, OGG, MP3, M4A or WAV, up to 25 MB. Transcribed with Whisper when GROQ_API_KEY is set.', { format: 'binary' }),
              transcript: str("The browser's transcript, used when the server cannot transcribe"),
              journalId: id,
              date: { ...day, description: "The journal's day (default: the journal's, or today), to check against that day's attendance" },
            }),
          },
        },
      },
      responses: {
        ...ok('The draft', ref('VoiceDraft')),
        ...errors(400, 404, [422, 'The transcript is empty (`NO_SPEECH`).'], [502, 'Audio was sent without a transcript (`AI_UNAVAILABLE`).']),
        403: { description: 'Not a teacher (`FORBIDDEN`), or voice drafts are turned off (`AI_DISABLED`).', content: json(ref('Error')) },
      },
    }),
  },
  '/journals/{id}': {
    get: op('Journal', 'One journal with all its content', { roles: T, parameters: [journalId], responses: { ...ok('Journal', ref('Journal')), ...errors(404) } }),
    put: op('Journal', 'Save the draft (PB12, PB13, PB15)', {
      roles: T,
      parameters: [journalId],
      description:
        'Replaces the sections, the personal notes and the photos as a whole. ' +
        'Changing an approved or published journal sends it back to draft or review. ' +
        'For a published journal, parents keep seeing the published version until the change is approved and published again.',
      requestBody: body(ref('UpdateJournal')),
      responses: { ...ok('Saved', ref('Journal')), ...errors(400, 404) },
    }),
  },
  '/journals/{id}/approve': {
    post: op('Journal', 'Approve the journal (PB16)', {
      roles: T,
      parameters: [journalId],
      responses: { ...ok('Approved', ref('Journal')), ...errors(404, [422, 'The journal is empty, published and unchanged, or has points still open (`REVIEW_PENDING`).']) },
    }),
  },
  '/journals/{id}/publish': {
    post: op('Journal', 'Publish the journal to parents (PB16)', {
      roles: T,
      parameters: [journalId],
      description:
        'Only an approved journal can be published. Parents of the class are notified; a personal note is announced to that child\'s parents only.\n\n' +
        'Publishing a change to a published journal replaces the version parents see (`revision` + 1) and notifies only the parents it concerns: ' +
        'every parent of the class when a class section or the photos changed, a child\'s parents when that child\'s note was added, changed or removed.',
      responses: { ...ok('Published', ref('Journal')), ...errors(404, [422, 'The journal is not approved, or already published.']) },
    }),
  },
  '/journals/{id}/recordings': {
    post: op('Journal', 'Add another recording to the draft (PB14)', {
      roles: T,
      parameters: [journalId],
      description: 'The new text is appended; nothing is replaced. The journal goes back to review, also when it was published.',
      requestBody: body(ref('Recording')),
      responses: { ...ok('Updated', ref('Journal')), ...errors(400, 404, 422) },
    }),
  },

  '/parent/journals': {
    get: op('Parent', 'Published journals of my child\'s class', {
      roles: ['PARENT'],
      description: 'Only journals that were published. An edit the teacher has not published again is not shown.',
      parameters: [
        { name: 'studentId', in: 'query', required: true, description: 'A child linked to the parent', schema: id },
        query('month', str('', { example: '2026-10' }), 'Only this month (YYYY-MM), for the calendar'),
      ],
      responses: { ...ok('Newest first', itemsOf('ParentJournalListItem')), ...errors(400, [403, 'Not a parent, or not your child (`FORBIDDEN`).']) },
    }),
  },
  '/parent/journals/by-date': {
    get: op('Parent', 'The journal of one day, as my child\'s parents see it', {
      roles: ['PARENT'],
      description:
        'The published version: the class sections and photos, the note about this child only, and the child\'s attendance of that day. ' +
        'Other children\'s notes, the transcript and the recordings are never returned.',
      parameters: [
        { name: 'studentId', in: 'query', required: true, description: 'A child linked to the parent', schema: id },
        { name: 'date', in: 'query', required: true, schema: day },
      ],
      responses: { ...ok('The journal', ref('ParentJournal')), ...errors(400, [403, 'Not a parent, or not your child (`FORBIDDEN`).'], [404, 'Nothing was published for that day.']) },
    }),
  },
  '/uploads': {
    post: op('Uploads', 'Upload a photo (PB16)', {
      roles: ['ADMIN', 'TEACHER'],
      description: 'Teachers upload `journal-photo`, administrators `student-photo`. Put the returned address in the journal\'s `photos`.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: obj({ purpose: oneOf(['journal-photo', 'student-photo']), file: str('JPEG, PNG, WebP or GIF, up to 5 MB', { format: 'binary' }) }, ['purpose', 'file']),
          },
        },
      },
      responses: { ...created('Stored', ref('Upload')), ...errors(400) },
    }),
  },

  '/conversations': {
    get: op('Messages', 'People I can message, with the last message (PB17)', {
      roles: CHAT,
      description: 'A teacher sees the parents of the children in their class; a parent sees the teachers of their children\'s classes.',
      parameters: [query('q', str(), 'Search by name; accents are ignored')],
      responses: ok('Most recent conversation first', itemsOf('Conversation')),
    }),
  },
  '/conversations/unread-count': {
    get: op('Messages', 'Number of unread messages', { roles: CHAT, responses: ok('Count', ref('Count')) }),
  },
  '/conversations/{peerId}/messages': {
    get: op('Messages', 'Messages of one conversation', {
      roles: CHAT,
      parameters: [peerId, query('before', millis, 'Only messages older than this'), query('limit', int('', { minimum: 1, maximum: 100, default: 50 }), 'Newest messages to return')],
      responses: { ...ok('Oldest first', itemsOf('Message')), ...errors(400) },
    }),
    post: op('Messages', 'Send a message', {
      roles: CHAT,
      parameters: [peerId],
      description: 'The receiver gets a notification.',
      requestBody: body(ref('SendMessage')),
      responses: { ...created('Sent', ref('Message')), ...errors(400) },
    }),
  },
  '/conversations/{peerId}/read': {
    post: op('Messages', 'Mark the conversation as read', { roles: CHAT, parameters: [peerId], responses: noContent('Marked') }),
  },

  '/notifications': {
    get: op('Notifications', 'My notifications', {
      parameters: [query('unread', oneOf(['true']), 'Only unread ones')],
      responses: ok('Newest first', itemsOf('NotificationItem')),
    }),
  },
  '/notifications/unread-count': {
    get: op('Notifications', 'Number of unread notifications', { responses: ok('Count', ref('Count')) }),
  },
  '/notifications/read': {
    post: op('Notifications', 'Mark notifications as read', {
      requestBody: body(ref('MarkNotificationsRead')),
      responses: { ...noContent('Marked'), ...errors(400) },
    }),
  },
}

// ---------- /admin record endpoints, generated ----------

// [route, model, DTO name]
const ADMIN_ENTITIES = [
  ['users', 'User'],
  ['schools', 'School'],
  ['classes', 'Class'],
  ['students', 'Student'],
  ['parent-student-maps', 'ParentStudentMap'],
  ['attendance', 'Attendance'],
  ['class-daily-summaries', 'ClassDailySummary'],
  ['daily-journals', 'DailyJournal'],
  ['journal-photos', 'JournalPhoto'],
  ['feedbacks', 'Feedback'],
  ['notifications', 'Notification'],
  ['ai-processing-logs', 'AiProcessingLog'],
  ['audit-logs', 'AuditLog'],
]

// The OpenAPI schema of a field of a table (src/db/table.js).
function schemaOfField(spec) {
  if (!spec) return str() // not a stored field, e.g. the plain `password` of a user
  switch (spec.type) {
    case 'id':
      return { ...id, description: spec.ref ? `Id of a ${spec.ref}` : 'Id' }
    case 'bool':
      return bool()
    case 'int':
      return int()
    case 'number':
      return { type: 'number' }
    case 'date':
      return str('', { format: 'date', example: '2026-10-11' })
    case 'datetime':
      return str('', { format: 'date-time' })
    case 'json':
      return {}
    default: {
      const schema = { type: 'string' }
      if (spec.enum) schema.enum = spec.enum
      if (spec.max) schema.maxLength = spec.max
      return schema
    }
  }
}

function adminEntity(route, name) {
  const Model = models[name]
  const stored = Object.keys(Model.fields)
  // The DTOs decide which fields a client may send and which come back, so ask them.
  const everything = Object.fromEntries([...stored, 'password'].map((field) => [field, true]))
  const inputFields = Object.keys(dtos[`toCreate${name}Dto`](everything))
  const outputFields = Object.keys(dtos[`to${name}Response`]({ ...everything, id: 'x' })).filter((field) => field !== 'id')
  const required = inputFields.filter((field) => {
    const spec = Model.fields[field]
    return field === 'password' || (spec?.required && spec.default === undefined && !spec.auto)
  })

  const fieldSchema = (field) => schemaOfField(Model.fields[field])
  const inputProperties = Object.fromEntries(inputFields.map((f) => [f, fieldSchema(f)]))
  schemas[`${name}Input`] = obj(inputProperties, required.length ? required : undefined)
  schemas[`${name}Update`] = obj(inputProperties)
  schemas[`${name}Record`] = obj({ id, ...Object.fromEntries(outputFields.map((f) => [f, nullable(fieldSchema(f))])) })
  schemas[`${name}Page`] = obj({ items: list(ref(`${name}Record`)), page: int(), size: int(), total: int() })

  const tag = `Admin: ${route}`
  const A = ['ADMIN']
  const recordId = pathId('id', `${name} id`)
  const filters = inputFields.filter((f) => f !== 'password').map((f) => query(f, fieldSchema(f), 'Exact match'))

  paths[`/admin/${route}`] = {
    get: op(tag, `List ${route}`, {
      roles: A,
      parameters: [query('page', int('', { minimum: 1, default: 1 })), query('size', int('', { minimum: 1, maximum: 100, default: 20 })), ...filters],
      responses: { ...ok('One page, newest first', ref(`${name}Page`)), ...errors(400) },
    }),
    post: op(tag, `Create a ${name}`, {
      roles: A,
      requestBody: body(ref(`${name}Input`)),
      responses: { ...created('Created', ref(`${name}Record`)), ...errors(400, 409) },
    }),
  }
  paths[`/admin/${route}/{id}`] = {
    get: op(tag, `Get a ${name}`, { roles: A, parameters: [recordId], responses: { ...ok(name, ref(`${name}Record`)), ...errors(404) } }),
    patch: op(tag, `Update a ${name}`, {
      roles: A,
      parameters: [recordId],
      description: 'Only the fields sent are changed.',
      requestBody: body(ref(`${name}Update`)),
      responses: { ...ok('Updated', ref(`${name}Record`)), ...errors(400, 404, 409) },
    }),
    delete: op(tag, `Delete a ${name}`, { roles: A, parameters: [recordId], responses: { ...noContent('Deleted'), ...errors(404, [409, 'Other records still use it.']) } }),
  }
}

for (const [route, name] of ADMIN_ENTITIES) adminEntity(route, name)

// ---------- document ----------

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'KinderLog API',
    version: '0.1.0',
    description:
      'Preschool daily journal and reporting.\n\n' +
      '**To try an endpoint:** call `POST /auth/login`, copy `accessToken`, press **Authorize** and paste it.\n\n' +
      'Timestamps are epoch milliseconds, calendar dates are `YYYY-MM-DD`, ids are SQL Server row ids sent as strings. ' +
      'Every error has the shape `{ "error": { "code", "message", "fields" } }`.\n\n' +
      `Default settings: \`${JSON.stringify(DEFAULT_SETTINGS)}\``,
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Auth', description: 'Sign in, tokens, forgotten passwords' },
    { name: 'Account', description: 'The signed-in user\'s own profile' },
    { name: 'Teacher', description: 'The class a teacher leads' },
    { name: 'Attendance', description: 'Daily attendance sheet of a class' },
    { name: 'Journal', description: 'Class journal: draft or review -> approved -> published' },
    { name: 'Parent', description: 'What a parent sees of the class journal' },
    { name: 'Uploads' },
    { name: 'Messages', description: 'One conversation per teacher-parent pair, text only' },
    { name: 'Notifications' },
    { name: 'Settings' },
    { name: 'System' },
    ...ADMIN_ENTITIES.map(([route]) => ({ name: `Admin: ${route}`, description: 'Record-level management, administrators only' })),
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas,
  },
  paths,
}

export default openapi
