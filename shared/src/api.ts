import { z } from 'zod';

import { type Lang, messageKey } from './i18n';
import type { LessonContent } from './lesson';
import { THEME_IDS, type ThemeId } from './themes';

/**
 * The HTTP API contract: request bodies (zod schemas, validated by the server)
 * and response shapes (types). The client imports only types from here.
 *
 * Conventions:
 * - JSON under /api; fields in camelCase; times are ISO 8601 strings in UTC.
 * - A resource is returned as is (no wrapper); lists are arrays. Created → 201,
 *   deleted → 204. Unknown fields in a request body are ignored.
 * - Errors: status + ApiErrorBody. "Missing" and "no access" are the same 404,
 *   so others' data is not revealed.
 */

// ----- errors -----

export type ErrorCode =
  | 'invalid_input' // 400: body, query or path id not valid (issues: what exactly)
  | 'unauthorized' // 401: not signed in, or wrong login / password
  | 'forbidden' // 403: wrong role or origin
  | 'not_found' // 404: missing or not visible to this user
  | 'login_taken' // 409
  | 'invalid_status' // 409: the change is not allowed in the current status
  | 'class_active' // 409: the teacher already has a class on
  | 'student_busy' // 409: the student is in another class that is on
  | 'lesson_changed' // 409: the lesson was saved meanwhile (another window, the assistant): reload it
  | 'name_taken' // 409: another media file or student group already has this name
  | 'media_in_use' // 409: the media file is in a lesson, it cannot be deleted
  | 'text_changed' // 409: the student's text no longer has the part the teacher coloured
  | 'too_large' // 413
  | 'dictionary_unavailable' // 503: the dictionary is not built on this server
  | 'rate_limited' // 429
  | 'internal'; // 500

export interface ApiErrorBody {
  /** Message to show to the user, in the installation's language (APP_LANG). */
  error: string;
  code: ErrorCode;
  /** Validation details for invalid_input (at most 20). */
  issues?: { path: (string | number)[]; message: string }[];
}

// ----- installation -----

/** GET /api/config (no sign-in needed): the installation's language (APP_LANG), its theme and what it has. */
export interface AppConfig extends AppSettings {
  lang: Lang;
  /** The dictionary of the installation's pair of languages is there: without it the translator is off. */
  dictionary: boolean;
}

/**
 * The platform's settings, the same for everyone, kept by the server and changed by any teacher
 * (GET/PATCH /api/settings). The values are public: they come with GET /api/config.
 */
export interface AppSettings {
  theme: ThemeId;
}

/** PATCH /api/settings: only the settings sent change; returns the whole AppSettings. */
export const updateSettingsInput = z.object({ theme: z.enum(THEME_IDS).optional() });
export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;

// ----- users -----

export type Role = 'teacher' | 'student';

/** The signed-in user (GET /api/auth/me, POST /api/auth/login). */
export interface CurrentUser {
  id: number;
  login: string;
  role: Role;
}

export interface Student {
  id: number;
  login: string;
  createdAt: string;
}

export const LOGIN_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

const login = z.string().regex(LOGIN_PATTERN, messageKey('errors.loginFormat'));
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, messageKey('errors.passwordTooShort'))
  .max(PASSWORD_MAX_LENGTH, messageKey('errors.passwordTooLong'));

/** POST /api/auth/login. Not checked against the rules: any wrong pair is just 401. */
export const loginInput = z.object({ login: z.string().max(100), password: z.string().max(PASSWORD_MAX_LENGTH) });

/** POST /api/students */
export const createStudentInput = z.object({ login, password });
/** PATCH /api/students/:id — changing the password signs the student out everywhere. */
export const updateStudentInput = z.object({ login: login.optional(), password: password.optional() });

// ----- student groups -----

/**
 * A named set of students: a shortcut for choosing several of them at once
 * (a class, homework, access to a lesson). A group is not remembered by what
 * it was used for: choosing it just chooses its students at that moment.
 */
export interface StudentGroup {
  id: number;
  name: string;
  /** Ids of the students in it (any number, none included). */
  studentIds: number[];
  createdAt: string;
}

export const GROUP_NAME_MAX = 60;

const groupName = z
  .string()
  .trim()
  .min(1, messageKey('errors.groupNameRequired'))
  .max(GROUP_NAME_MAX, messageKey('errors.groupNameTooLong'));
const groupStudentIds = z.array(z.number().int().positive()).max(200);

/** POST /api/groups */
export const createGroupInput = z.object({ name: groupName, studentIds: groupStudentIds.default([]) });
/** PATCH /api/groups/:id: the members, when given, are replaced as a whole. */
export const updateGroupInput = z.object({ name: groupName.optional(), studentIds: groupStudentIds.optional() });

// ----- lessons -----

export interface LessonSummary {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson extends LessonSummary {
  content: LessonContent;
  /** Revision of the document: +1 on every save. A save names the revision it was made on (PUT /content). */
  rev: number;
}

export const LESSON_TITLE_MAX = 200;

/** POST /api/lessons, PATCH /api/lessons/:id */
export const lessonTitleInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, messageKey('errors.titleRequired'))
    .max(LESSON_TITLE_MAX, messageKey('errors.titleTooLong')),
});

/** PUT /api/lessons/:id/content → this (the body: saveLessonContentInput in lessonSchema.ts). */
export interface LessonContentSaved {
  rev: number;
  updatedAt: string;
}

/**
 * Socket /live, to the students who may open the lesson: its document was saved.
 * An open page keeps showing the old one (answers stay valid); it tells the
 * student to reload.
 */
export interface LessonUpdatedEvent {
  lessonId: number;
  rev: number;
  /** 'access': the teacher opened chapters (the page loads the lesson again by itself); else the lesson was edited. */
  reason?: 'access';
}

/** GET / PUT /api/lessons/:id/access: the students who may open the lesson. */
export interface LessonAccess {
  studentIds: number[];
  /** Student id → the chapters open to them; a student not listed here may open the whole lesson. */
  chapters: Record<string, string[]>;
}

export const lessonAccessInput = z.object({
  studentIds: z.array(z.number().int().positive()).max(1000),
  chapters: z.record(z.string(), z.array(z.string().max(64)).max(50)).optional(),
});

/** The lessons in the teacher's order (ids; the ones not listed go after them). */
export const lessonOrderInput = z.object({
  ids: z.array(z.number().int().positive()).max(10_000),
});

// ----- answers (block states) -----

/**
 * The whole state of an answer block (its shape belongs to the block's widget).
 * No status: the widget itself shows what is right or wrong, and "done" is
 * declared by the student per homework (an essay's "Enviar" is in its state).
 */
export interface BlockState {
  state: unknown;
  updatedAt: string;
}

/** A student's answers in a lesson: blockId → its state. */
export type LessonStates = Record<string, BlockState>;

/** Largest block state, as JSON. */
export const MAX_BLOCK_STATE_BYTES = 16 * 1024;

/**
 * PUT /api/lessons/:id/states/:blockId (student). The client sends at most one
 * request per block at a time, so states of a block are saved in order.
 */
export const saveBlockStateInput = z.object({
  state: z.unknown().refine((v) => v !== undefined, messageKey('errors.stateMissing')),
});

export interface BlockStateSaved {
  updatedAt: string;
}

// ----- homework -----

/**
 * assigned → submitted (the student: "Enviar al profesor", also from
 * needs_work) → needs_work or accepted (the teacher, who may set any status at
 * any time). Answers are never locked: they are the lesson's (block_states).
 */
export const HOMEWORK_STATUSES = ['assigned', 'submitted', 'needs_work', 'accepted'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

/** The student's turn: to do or to correct (and they may send it). */
export const isWaitingForStudent = (status: HomeworkStatus) => status === 'assigned' || status === 'needs_work';

/** The teacher's turn: sent by the student, to review. */
export const isWaitingForTeacher = (status: HomeworkStatus) => status === 'submitted';

export interface HomeworkExercise {
  /** Item id in the lesson document. */
  id: string;
  /** Number in the lesson (1-based, across chapters). */
  number: number;
  title: string;
}

export interface Homework {
  id: number;
  lessonId: number;
  lessonTitle: string;
  studentId: number;
  studentLogin: string;
  status: HomeworkStatus;
  /** When it was assigned. */
  createdAt: string;
  /** In lesson order; exercises deleted from the lesson are left out. */
  exercises: HomeworkExercise[];
}

/**
 * Socket /live: a homework was assigned or changed. The reason says what to
 * notify about; null — nothing to say, just refresh (the user's own change in
 * another tab, a status set back by the teacher).
 *   student: assigned, updated (exercises were added), needs_work, accepted · teachers: submitted
 */
export type HomeworkChange = 'assigned' | 'updated' | 'submitted' | 'needs_work' | 'accepted';
export interface HomeworkEvent {
  homework: Homework;
  reason: HomeworkChange | null;
}

/** Socket /live: a homework was deleted. */
export interface HomeworkDeletedEvent {
  id: number;
}

const positiveId = z.coerce.number().int().positive();

/** GET /api/homework query (all optional; a student gets only their own). Newest first. */
export const homeworkListQuery = z.object({
  lessonId: positiveId.optional(),
  studentId: positiveId.optional(),
  status: z.enum(HOMEWORK_STATUSES).optional(),
});

/** POST /api/homework: one homework per student; students get access to the lesson. */
export const createHomeworkInput = z.object({
  lessonId: z.number().int().positive(),
  studentIds: z.array(z.number().int().positive()).min(1, messageKey('errors.chooseStudent')).max(200),
  exerciseIds: z.array(z.string().max(64)).min(1, messageKey('errors.chooseExercise')).max(500),
});

/** PUT /api/homework/:id/exercises (teacher): the exercises the homework has from now on (of its lesson). */
export const setHomeworkExercisesInput = z.object({
  exerciseIds: z.array(z.string().max(64)).min(1, messageKey('errors.chooseExercise')).max(500),
});

/** PATCH /api/homework/:id (teacher). */
export const updateHomeworkInput = z.object({ status: z.enum(HOMEWORK_STATUSES) });

// ----- classes (live lessons) -----

/**
 * A teacher's live class with some students. The lesson and the students can
 * change during it; a student added to the class (or present when the lesson
 * changes) gets access to the lesson. A class ends when the teacher ends it,
 * or by itself 30 minutes after the teacher was last connected.
 *
 * State changes go over HTTP; instant commands ("call", "navigate") and what
 * the teacher watches (presence, answers) over the socket namespace /class.
 */

export interface ClassStudent {
  id: number;
  login: string;
  /** When the student first opened the class's lesson; null: not yet. */
  joinedAt: string | null;
}

/** The teacher's class that is on (GET /api/classes/current). */
export interface Class {
  id: number;
  /** null if the lesson was deleted during the class. */
  lessonId: number | null;
  lessonTitle: string | null;
  startedAt: string;
  students: ClassStudent[];
  /** The group the class was started for; null: for one student. */
  groupId: number | null;
  /** The board the class writes to (board.ts); null: a class started before boards were bound to classes. */
  boardId: number | null;
  /** The chapter the class is in (where the teacher is; where it started, until they move); null: none known. */
  chapterId: string | null;
  /** Exercises of the class's lesson already set as homework in this class (POST /api/classes/:id/homework). */
  homeworkExerciseIds: string[];
}

/** POST /api/classes/:id/homework (teacher): one exercise of the class's lesson as homework for the class's students. */
export const classHomeworkInput = z.object({ exerciseId: z.string().min(1).max(64) });

/** What a student knows of their class: "a class is on, in this lesson". */
export interface StudentClass {
  id: number;
  lessonId: number | null;
  lessonTitle: string | null;
  boardId: number | null;
  /** The chapter the teacher is in: the student opens the lesson there. */
  chapterId: string | null;
}

/**
 * POST /api/classes: for a group (its students at the start) or for one student;
 * several single students at once are not a class: make a group first.
 */
export const createClassInput = z
  .object({
    lessonId: z.number().int().positive(),
    groupId: z.number().int().positive().optional(),
    studentId: z.number().int().positive().optional(),
    /** The chapter to start in (one that is not in the lesson: the first). */
    chapterId: z.string().max(64).optional(),
  })
  .refine((input) => (input.groupId === undefined) !== (input.studentId === undefined), {
    message: messageKey('errors.classAudience'),
  });

/** GET /api/classes/resume?groupId= or ?studentId=: where their last class stopped. */
export const classResumeQuery = z
  .object({
    groupId: z.coerce.number().int().positive().optional(),
    studentId: z.coerce.number().int().positive().optional(),
  })
  .refine((query) => (query.groupId === undefined) !== (query.studentId === undefined), {
    message: messageKey('errors.classAudience'),
  });

/** The lesson and chapter where the last class of a group / student stopped ("continue"). */
export interface ClassResume {
  lessonId: number;
  lessonTitle: string;
  /** null: no chapter to open (it is not in the lesson any more): the first one. */
  chapterId: string | null;
  chapterTitle: string | null;
}

/** PATCH /api/classes/:id: another lesson. */
export const updateClassInput = z.object({ lessonId: z.number().int().positive() });

// ----- socket namespace /class -----

/** Where a student is in a lesson: chapter and the items in view (a screen can hold several). */
export interface LessonPosition {
  chapterId: string | null;
  /** The first item in view (what older pages send alone). */
  itemId: string | null;
  /** All the items in view, in lesson order. */
  itemIds: string[];
}

/** Student → server `position`: on a lesson page (lessonId) or not (null). */
export type PositionEvent =
  | ({ lessonId: number } & Omit<LessonPosition, 'itemIds'> & { itemIds?: string[] })
  | { lessonId: null };

/** A student of the class (server → teacher `presence`; ack of the teacher's `presence`). */
export interface Presence extends LessonPosition {
  studentId: number;
  login: string;
  /** Has the app open (any page). */
  online: boolean;
  /** Has the class's lesson open; chapterId / itemId say where. */
  inLesson: boolean;
}

/** Server → teacher `answer`: a student saved an answer in the class's lesson. */
export interface AnswerEvent {
  studentId: number;
  blockId: string;
  state: unknown;
}

/** Teacher → server `navigate` (soft anchor) and server → student `navigate`. */
export interface NavigateEvent {
  studentId: number;
  chapterId: string;
  itemId?: string | null;
}

/** Teacher → server `call`: "come to the lesson"; server → student `call` { lessonId }. */
export interface CallEvent {
  studentId: number;
}

// ----- translator and vocabulary -----

/**
 * The translator: a word of a lesson in any form → its lemma(s) with plain
 * translations into the students' own language (`TRANSLATION_LANG`), from the offline
 * dictionary of the installation's pair of languages (Wiktionary, CC BY-SA: show the
 * source). For everyone signed in.
 */
export interface LookupResult {
  /** "tener" for "tengo". */
  lemma: string;
  /** Best first, at most 10. */
  translations: string[];
}

export const DICTIONARY_SOURCE = 'Wiktionary (CC BY-SA 4.0)';

/** One word as written in a lesson: letters, maybe one hyphen. */
const lessonWord = z
  .string()
  .trim()
  .max(64, messageKey('errors.wordTooLong'))
  .regex(/^\p{L}+(?:-\p{L}+)?$/u, messageKey('errors.oneWord'));

/** GET /api/dictionary?word= */
export const lookupQuery = z.object({ word: lessonWord });

/** A student's saved word (one per lemma). */
export interface VocabularyEntry {
  id: number;
  lemma: string;
  /** The form that was clicked: "tengo". */
  word: string;
  /** The first translations, as the student saw them: "име́ть, владе́ть, облада́ть". */
  translation: string;
  /** Where it was saved; null if not in a lesson, or the lesson was deleted. */
  lessonId: number | null;
  lessonTitle: string | null;
  createdAt: string;
}

/** Translations kept in a saved word. */
export const VOCABULARY_TRANSLATIONS = 5;

/**
 * POST /api/vocabulary (student). The server looks the word up itself: the
 * lemma must be one of its results, and the translation is the dictionary's.
 */
export const saveVocabularyInput = z.object({
  word: lessonWord,
  lemma: z.string().max(100),
  lessonId: z.number().int().positive().optional(),
});

// ----- media (lesson images and audio) -----

/**
 * Files of lessons, stored by the server in data/media and served at
 * /media/<sha256>.<ext> to anyone signed in. The name is the hash of the
 * content: the same file is stored once and never changes. Lesson blocks
 * refer to these URLs only (lessonSchema.ts); videos are YouTube ids.
 */
export const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as const;
export const AUDIO_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav' } as const;
export type MediaKind = 'image' | 'audio';

/** The largest picture accepted; the server scales it down and compresses it on the way in (imageCompress.ts). */
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

/** A file of the media library (GET /api/media, teacher). */
export interface MediaFile {
  id: number;
  /** As uploaded ("cocina.png"); unique, ignoring case. */
  name: string;
  kind: MediaKind;
  /** /media/<sha256>.<ext>: what lesson blocks hold. */
  url: string;
  bytes: number;
  uploadedAt: string;
  /** Lessons that show it (it cannot be deleted while there are any). */
  usedIn: { lessonId: number; title: string }[];
}

/**
 * POST /api/media?name=… (teacher): the file as the request body → this.
 * 201 new; 200 with existed: the same content was already there (under its
 * own name). A name taken by another file: 409 name_taken.
 */
export interface MediaUploaded extends MediaFile {
  existed: boolean;
}

export const MEDIA_NAME_MAX = 200;

/** ?name= of POST /api/media, and PATCH /api/media/:id (rename). */
export const mediaNameInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, messageKey('errors.mediaNameRequired'))
    .max(MEDIA_NAME_MAX, messageKey('errors.mediaNameTooLong')),
});

// ----- AI assistants (OAuth for the MCP server) -----

/** GET /api/oauth/requests/:id: an assistant asks for the teacher's consent. */
export interface AssistantAccessRequest {
  /** As the client calls itself ("ChatGPT", "Claude"). */
  clientName: string;
  /** Where the browser goes back to (chatgpt.com, claude.ai). */
  redirectHost: string;
  scopes: string[];
}

/** POST /api/oauth/requests/:id/approve | deny → where the browser goes back to the assistant. */
export interface AssistantAccessDecision {
  redirectTo: string;
}

/** GET /api/oauth/connections (teacher): an assistant connected to their lessons. */
export interface AssistantConnection {
  id: number;
  clientName: string;
  connectedAt: string;
  /** Last request of the assistant (null: none yet). */
  lastUsedAt: string | null;
}
