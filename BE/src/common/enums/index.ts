export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  PRINCIPAL = 'PRINCIPAL',
  TEACHER = 'TEACHER',
  PARENT = 'PARENT',
}

export enum RecordStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOCKED = 'LOCKED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum Relationship {
  MOTHER = 'MOTHER',
  FATHER = 'FATHER',
  GRANDMOTHER = 'GRANDMOTHER',
  GRANDFATHER = 'GRANDFATHER',
  GUARDIAN = 'GUARDIAN',
}

/** AI output and teacher edits are always DRAFT; only APPROVED entries reach parents. */
export enum JournalStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
}

export enum JournalSource {
  MANUAL = 'MANUAL',
  BULK = 'BULK',
  VOICE = 'VOICE',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
}

/** How much of the meal the child ate – drives the nutrition dashboard. */
export enum MealLevel {
  ALL = 'ALL',
  MOST = 'MOST',
  HALF = 'HALF',
  LITTLE = 'LITTLE',
  NONE = 'NONE',
}

export enum SleepQuality {
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  NONE = 'NONE',
}

export enum HealthStatus {
  NORMAL = 'NORMAL',
  MONITOR = 'MONITOR',
  SICK = 'SICK',
}

export enum Mood {
  HAPPY = 'HAPPY',
  CALM = 'CALM',
  TIRED = 'TIRED',
  SAD = 'SAD',
}
