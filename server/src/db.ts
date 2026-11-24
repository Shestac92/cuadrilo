import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { HomeworkStatus } from '@cuadrilo/shared/api';
import type { LessonComments } from '@cuadrilo/shared/comments';
import type { Highlight, LessonHighlights } from '@cuadrilo/shared/highlights';

import { MIGRATIONS, migrate } from './migrations';
import { DATA_DIR } from './paths';

export type Role = 'teacher' | 'student';

export interface Lesson {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  content_rev: number;
}

export interface User {
  id: number;
  login: string;
  role: Role;
  created_at: string;
}

interface UserWithHash extends User {
  password_hash: string;
}

fs.mkdirSync(DATA_DIR, { recursive: true });

// Built-in SQLite (Node >= 22.13): no native module to compile.
// A test (node --test) must never open the real data/lessons.db: tests run on a temporary DATA_DIR.
if (process.env.NODE_TEST_CONTEXT && !process.env.DATA_DIR) {
  throw new Error('db.ts imported by a test without DATA_DIR: tests must not touch data/lessons.db');
}
export const db = new DatabaseSync(path.join(DATA_DIR, 'lessons.db'));

// The baseline schema (see server/src/migrations): free to change until the first release, then frozen.
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  -- content: the lesson document (shared/src/lesson.ts); NULL = an empty lesson.
  CREATE TABLE IF NOT EXISTS lessons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    content    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    -- The order of the lists (the teacher drags the lessons); a new lesson goes last.
    position   INTEGER NOT NULL DEFAULT 0,
    -- Revision of the document: +1 on every save (a save made on an older one is refused).
    content_rev INTEGER NOT NULL DEFAULT 0
  );

  -- Only a login chosen by the teacher and a password hash: no e-mail, name or phone.
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    login         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('teacher', 'student')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    -- Where the student's last solo class stopped (the lesson and its chapter's
    -- id); see student_groups for groups. Students only.
    last_lesson_id  INTEGER REFERENCES lessons (id) ON DELETE SET NULL,
    last_chapter_id TEXT
  );

  -- The cookie holds a random token; only its SHA-256 is stored.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
  -- Expired sessions are cleaned at every sign-in.
  CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

  -- A student sees a lesson only after a teacher granted access. chapter_ids:
  -- JSON array of the chapters open to the student; NULL: the whole lesson.
  CREATE TABLE IF NOT EXISTS lesson_access (
    lesson_id  INTEGER NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    chapter_ids TEXT,
    granted_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (lesson_id, student_id)
  );
  CREATE INDEX IF NOT EXISTS lesson_access_student ON lesson_access (student_id);

  -- Homework: exercises of one lesson a teacher assigned to a student (a
  -- student may have several). Answers are the lesson's (block_states).
  -- status (HomeworkStatus in shared/src/api.ts): assigned → submitted by the
  -- student → needs_work / accepted by the teacher (rules in homework.ts).
  CREATE TABLE IF NOT EXISTS homework (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id    INTEGER NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    student_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    status       TEXT    NOT NULL DEFAULT 'assigned'
                 CHECK (status IN ('assigned', 'submitted', 'needs_work', 'accepted'))
  );
  -- Lists are newest first: a student's, a lesson's and the teacher's (all)
  -- are read in index order, without sorting (the rowid, last in every index,
  -- breaks ties). The student and lesson ones also serve the cascades.
  DROP INDEX IF EXISTS homework_student;
  DROP INDEX IF EXISTS homework_lesson;
  CREATE INDEX IF NOT EXISTS homework_student_created ON homework (student_id, created_at);
  CREATE INDEX IF NOT EXISTS homework_lesson_created ON homework (lesson_id, created_at);
  CREATE INDEX IF NOT EXISTS homework_created ON homework (created_at);

  -- Exercises of a homework: exercise item ids in the lesson document
  -- (shared/src/lesson.ts). No order here: exercises follow the lesson's order and
  -- numbering. An exercise later deleted from the lesson just drops out.
  CREATE TABLE IF NOT EXISTS homework_exercises (
    homework_id INTEGER NOT NULL REFERENCES homework (id) ON DELETE CASCADE,
    exercise_id TEXT    NOT NULL,
    PRIMARY KEY (homework_id, exercise_id)
  );

  -- Latest state of each answer block of a lesson per student (the whole
  -- block state as JSON, sent by the student's page on every change; see
  -- server/src/answers.ts). No history: a new state replaces the old one.
  CREATE TABLE IF NOT EXISTS block_states (
    lesson_id  INTEGER NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    block_id   TEXT    NOT NULL,
    state      TEXT    NOT NULL,
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (lesson_id, user_id, block_id)
  );
  CREATE INDEX IF NOT EXISTS block_states_user ON block_states (user_id);

  -- Class sessions: a teacher's live class with some students. Live events
  -- (answers, positions, "show to the student") stay inside a session, so
  -- several classes on the same lesson and students doing homework don't mix.
  -- The current lesson can change during the class (lesson_id); ended_at is
  -- NULL while the class is on. Kept after the end for statistics.
  CREATE TABLE IF NOT EXISTS class_sessions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lesson_id            INTEGER REFERENCES lessons (id) ON DELETE SET NULL,
    started_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ended_at             TEXT,
    -- Last time the teacher was connected: a class left open is closed after a while.
    teacher_seen_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- Who the class is for: a group, or one student (exactly one of the two for
    -- classes started since; both NULL for older ones). The class keeps where
    -- it stopped in that group / student (last_lesson_id, last_chapter_id).
    group_id             INTEGER REFERENCES student_groups (id) ON DELETE SET NULL,
    solo_student_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
    -- The board the class writes to (a group's or a student's, see boards).
    board_id             INTEGER REFERENCES boards (id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS class_sessions_teacher ON class_sessions (teacher_id, ended_at);
  -- Partial: only classes that are on (a handful), for the check every minute
  -- of classes left without their teacher; ended ones stay in the table forever.
  CREATE INDEX IF NOT EXISTS class_sessions_active ON class_sessions (teacher_seen_at) WHERE ended_at IS NULL;

  -- Students of a class; the list can change during it. removed_at keeps
  -- students taken out of the class in its history.
  CREATE TABLE IF NOT EXISTS class_session_students (
    session_id      INTEGER NOT NULL REFERENCES class_sessions (id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    added_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    removed_at      TEXT,
    -- When the student first opened the class's lesson (NULL: never came).
    first_joined_at TEXT,
    PRIMARY KEY (session_id, student_id)
  );
  CREATE INDEX IF NOT EXISTS class_session_students_student ON class_session_students (student_id, removed_at);

  -- Lessons of a class in the order they were opened (the class may switch lessons).
  CREATE TABLE IF NOT EXISTS class_session_lessons (
    session_id INTEGER NOT NULL REFERENCES class_sessions (id) ON DELETE CASCADE,
    lesson_id  INTEGER NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    opened_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS class_session_lessons_session ON class_session_lessons (session_id);

  -- Boards (pizarra): a flat feed of plain lines that the teacher and the
  -- students write during a class. A board belongs to one group (classes of
  -- the group) or to one student (their solo classes), made when the first class
  -- starts; deleting the group or the student deletes it. Lines are append-only
  -- (no editing, no author, no time): the order is the id.
  CREATE TABLE IF NOT EXISTS boards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER UNIQUE REFERENCES student_groups (id) ON DELETE CASCADE,
    student_id INTEGER UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    CHECK ((group_id IS NULL) != (student_id IS NULL))
  );
  CREATE TABLE IF NOT EXISTS board_entries (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    text     TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 1000)
  );
  CREATE INDEX IF NOT EXISTS board_entries_board ON board_entries (board_id, id);

  -- Parts of a student's essay the teacher coloured (shared/src/highlights.ts):
  -- one JSON list per answer, kept apart from block_states, which the student
  -- overwrites whole. The server moves them as the student edits the text.
  CREATE TABLE IF NOT EXISTS answer_highlights (
    lesson_id  INTEGER NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    block_id   TEXT    NOT NULL,
    highlights TEXT    NOT NULL,
    PRIMARY KEY (lesson_id, student_id, block_id)
  );
  CREATE INDEX IF NOT EXISTS answer_highlights_student ON answer_highlights (student_id);

  -- The teacher's comment under a student's answer (shared/src/comments.ts):
  -- plain text, kept apart from block_states for the same reason. No row = no comment.
  CREATE TABLE IF NOT EXISTS answer_comments (
    lesson_id  INTEGER NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    block_id   TEXT    NOT NULL,
    text       TEXT    NOT NULL CHECK (length(text) > 0),
    PRIMARY KEY (lesson_id, student_id, block_id)
  );
  CREATE INDEX IF NOT EXISTS answer_comments_student ON answer_comments (student_id);

  -- Student groups: a named set of students, a shortcut for choosing several
  -- of them (homework, lesson access) and the audience of a class. Only the
  -- group's board (boards) refers to a group.
  CREATE TABLE IF NOT EXISTS student_groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    -- Where the group's last online class stopped: the lesson and the id of
    -- its chapter (kept up to date during the class; the teacher continues from here).
    last_lesson_id  INTEGER REFERENCES lessons (id) ON DELETE SET NULL,
    last_chapter_id TEXT
  );
  CREATE TABLE IF NOT EXISTS student_group_members (
    group_id   INTEGER NOT NULL REFERENCES student_groups (id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, student_id)
  );
  CREATE INDEX IF NOT EXISTS student_group_members_student ON student_group_members (student_id);

  -- A student's vocabulary: words saved from the lesson's translator. The word
  -- is stored as text (lemma + the translations shown), not as a dictionary
  -- id: the dictionary is rebuilt and its ids change. One entry per lemma;
  -- saving it again only refreshes it.
  CREATE TABLE IF NOT EXISTS vocabulary (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lang        TEXT    NOT NULL,          -- language of the word: 'es'
    lemma       TEXT    NOT NULL,          -- "tener"
    translation TEXT    NOT NULL,          -- what the student saw: "иметь, владеть"
    word        TEXT    NOT NULL,          -- the form clicked: "tengo"
    -- Where it was saved (the lesson may be deleted later).
    lesson_id   INTEGER REFERENCES lessons (id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (student_id, lang, lemma)
  );

  -- The media library: lesson images and audio by the name they were uploaded
  -- with. The file itself is data/media/<sha256>.<ext> (the same content is
  -- stored once, one row per file). Names are unique, ignoring case: the
  -- teacher (and the assistant) refer to files by them.
  CREATE TABLE IF NOT EXISTS media (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    kind        TEXT    NOT NULL CHECK (kind IN ('image', 'audio')),
    bytes       INTEGER NOT NULL,
    uploaded_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- OAuth 2.1 for the MCP server (server/src/oauth): a teacher connects an AI
  -- assistant (ChatGPT, Claude) to their lessons. Tokens and codes are stored
  -- as SHA-256 only. Times in ms since the epoch, like sessions.
  -- Clients that registered themselves (DCR); clients identified by a metadata
  -- document URL (CIMD) are not stored, their document is fetched and cached.
  CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id    TEXT    PRIMARY KEY,
    metadata     TEXT    NOT NULL,          -- the registered client, JSON
    created_at   INTEGER NOT NULL
  );
  -- An authorization waiting for the teacher's consent (a few minutes).
  CREATE TABLE IF NOT EXISTS oauth_requests (
    id             TEXT    PRIMARY KEY,
    client_id      TEXT    NOT NULL,
    client_name    TEXT    NOT NULL,
    redirect_uri   TEXT    NOT NULL,
    code_challenge TEXT    NOT NULL,
    state          TEXT,
    scopes         TEXT    NOT NULL,
    resource       TEXT    NOT NULL,
    expires_at     INTEGER NOT NULL
  );
  -- A one-time authorization code (about a minute).
  CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash      TEXT    PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_id      TEXT    NOT NULL,
    client_name    TEXT    NOT NULL,
    redirect_uri   TEXT    NOT NULL,
    code_challenge TEXT    NOT NULL,
    scopes         TEXT    NOT NULL,
    resource       TEXT    NOT NULL,
    expires_at     INTEGER NOT NULL
  );
  -- A connection: a teacher allowed a client; its current access and refresh
  -- tokens (a refresh replaces both). Deleting it disconnects the client.
  CREATE TABLE IF NOT EXISTS oauth_grants (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_id          TEXT    NOT NULL,
    client_name        TEXT    NOT NULL,
    scopes             TEXT    NOT NULL,
    resource           TEXT    NOT NULL,
    access_hash        TEXT    NOT NULL UNIQUE,
    access_expires_at  INTEGER NOT NULL,
    refresh_hash       TEXT    NOT NULL UNIQUE,
    refresh_expires_at INTEGER NOT NULL,
    created_at         INTEGER NOT NULL,
    last_used_at       INTEGER
  );
  CREATE INDEX IF NOT EXISTS oauth_grants_user ON oauth_grants (user_id);
  -- The platform's settings, the same for everyone (settings.ts): one row per setting.
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migrations (server/src/migrations; none yet) are applied on top of the schema above, which is the baseline: once the
// app is released this schema is frozen and every change goes into a migration.
migrate(db, MIGRATIONS);

/**
 * A row the caller knows is there (just inserted, or checked earlier in the
 * same request). Throws, instead of going on with undefined, if it is not.
 */
export function existing<T>(row: T | undefined, what: string): T {
  if (row === undefined) throw new Error(`${what} not found`);
  return row;
}

// ----- lessons -----

// Without content: lists and checks don't need the (possibly large) document.
const LESSON_COLUMNS = 'id, title, created_at, updated_at, content_rev';

export function listLessons(): Lesson[] {
  return db.prepare(`SELECT ${LESSON_COLUMNS} FROM lessons ORDER BY position, id`).all() as unknown as Lesson[];
}

export function listLessonsForStudent(studentId: number): Lesson[] {
  return db
    .prepare(
      `SELECT l.id, l.title, l.created_at, l.updated_at, l.content_rev FROM lessons l
       JOIN lesson_access a ON a.lesson_id = l.id AND a.student_id = ?
       ORDER BY l.position, l.id`,
    )
    .all(studentId) as unknown as Lesson[];
}

export function getLesson(id: number): Lesson | undefined {
  return db.prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = ?`).get(id) as unknown as Lesson | undefined;
}

export function createLesson(title: string, content: string): Lesson {
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO lessons (title, content, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM lessons))',
    )
    .run(title, content);
  return existing(getLesson(Number(lastInsertRowid)), 'New lesson');
}

/** The lesson document as stored (JSON), or null. */
export function getLessonContent(id: number): string | null {
  const row = db.prepare('SELECT content FROM lessons WHERE id = ?').get(id) as { content: string | null } | undefined;
  return row?.content ?? null;
}

/**
 * Saves the document if it was made on the current revision (`expectedRev`).
 * → the new revision, or null if the lesson was saved meanwhile.
 */
export function setLessonContent(id: number, content: string, expectedRev: number): number | null {
  const row = db
    .prepare(
      `UPDATE lessons SET content = ?, content_rev = content_rev + 1, updated_at = datetime('now')
       WHERE id = ? AND content_rev = ? RETURNING content_rev`,
    )
    .get(content, id, expectedRev) as { content_rev: number } | undefined;
  return row?.content_rev ?? null;
}

export function renameLesson(id: number, title: string): Lesson | undefined {
  db.prepare(`UPDATE lessons SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(title, id);
  return getLesson(id);
}

/**
 * Puts the lessons in the given order (the ones listed first, the rest after
 * them in their current order: a lesson made in another tab meanwhile is not lost).
 */
export function setLessonOrder(ids: number[]): void {
  const current = (db.prepare('SELECT id FROM lessons ORDER BY position, id').all() as unknown as { id: number }[]).map(
    (row) => row.id,
  );
  const known = new Set(current);
  const first = [...new Set(ids)].filter((id) => known.has(id));
  const listed = new Set(first);
  const order = [...first, ...current.filter((id) => !listed.has(id))];
  const update = db.prepare('UPDATE lessons SET position = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    order.forEach((id, position) => {
      update.run(position, id);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function deleteLesson(id: number): void {
  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
}

// ----- lesson access -----

export function hasLessonAccess(lessonId: number, studentId: number): boolean {
  return !!db.prepare('SELECT 1 FROM lesson_access WHERE lesson_id = ? AND student_id = ?').get(lessonId, studentId);
}

export function listLessonAccess(lessonId: number): number[] {
  const rows = db.prepare('SELECT student_id FROM lesson_access WHERE lesson_id = ?').all(lessonId) as unknown as {
    student_id: number;
  }[];
  return rows.map((r) => r.student_id);
}

/** The chapters open to the student (null: the whole lesson); undefined: no access to the lesson. */
export function getChapterAccess(lessonId: number, studentId: number): string[] | null | undefined {
  const row = db
    .prepare('SELECT chapter_ids FROM lesson_access WHERE lesson_id = ? AND student_id = ?')
    .get(lessonId, studentId) as unknown as { chapter_ids: string | null } | undefined;
  if (!row) return undefined;
  return row.chapter_ids === null ? null : (JSON.parse(row.chapter_ids) as string[]);
}

/** Student id → the chapters open to them, for the students that do not have the whole lesson. */
export function listChapterAccess(lessonId: number): Record<string, string[]> {
  const rows = db
    .prepare('SELECT student_id, chapter_ids FROM lesson_access WHERE lesson_id = ? AND chapter_ids IS NOT NULL')
    .all(lessonId) as unknown as { student_id: number; chapter_ids: string }[];
  return Object.fromEntries(rows.map((r) => [r.student_id, JSON.parse(r.chapter_ids) as string[]]));
}

/**
 * Opens chapters of the lesson to students: a student without access gets
 * exactly these, one with some chapters gets these too (never fewer), one with
 * the whole lesson keeps it. Ids of non-students are ignored.
 * → the students whose access grew.
 */
export function openChapters(lessonId: number, studentIds: number[], chapterIds: string[]): number[] {
  const select = db.prepare('SELECT chapter_ids FROM lesson_access WHERE lesson_id = ? AND student_id = ?');
  const insert = db.prepare(
    `INSERT INTO lesson_access (lesson_id, student_id, chapter_ids)
     SELECT ?, id, ? FROM users WHERE id = ? AND role = 'student'`,
  );
  const update = db.prepare('UPDATE lesson_access SET chapter_ids = ? WHERE lesson_id = ? AND student_id = ?');
  const grown: number[] = [];
  for (const studentId of new Set(studentIds)) {
    const row = select.get(lessonId, studentId) as unknown as { chapter_ids: string | null } | undefined;
    if (!row) {
      if (Number(insert.run(lessonId, JSON.stringify(chapterIds), studentId).changes) > 0) grown.push(studentId);
    } else if (row.chapter_ids !== null) {
      const have = JSON.parse(row.chapter_ids) as string[];
      const next = [...new Set([...have, ...chapterIds])];
      if (next.length === have.length) continue;
      update.run(JSON.stringify(next), lessonId, studentId);
      grown.push(studentId);
    }
  }
  return grown;
}

/**
 * Replaces who may open the lesson. `chapters`: student id → the open chapters;
 * a student not in it has the whole lesson.
 */
export function setLessonAccess(lessonId: number, studentIds: number[], chapters: Record<string, string[]> = {}): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM lesson_access WHERE lesson_id = ?').run(lessonId);
    const insert = db.prepare(
      `INSERT INTO lesson_access (lesson_id, student_id, chapter_ids)
       SELECT ?, id, ? FROM users WHERE id = ? AND role = 'student'`,
    );
    for (const studentId of new Set(studentIds)) {
      const open = chapters[String(studentId)];
      insert.run(lessonId, open ? JSON.stringify([...new Set(open)]) : null, studentId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ----- users -----

const USER_COLUMNS = 'id, login, role, created_at';

export function getUser(id: number): User | undefined {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as unknown as User | undefined;
}

export function getUserWithHashByLogin(login: string): UserWithHash | undefined {
  return db.prepare('SELECT * FROM users WHERE login = ?').get(login) as unknown as UserWithHash | undefined;
}

export function listUsers(role: Role): User[] {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE role = ? ORDER BY login`).all(role) as unknown as User[];
}

export function createUser(login: string, passwordHash: string, role: Role): User {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (login, password_hash, role) VALUES (?, ?, ?)')
    .run(login, passwordHash, role);
  return existing(getUser(Number(lastInsertRowid)), 'New user');
}

export function updateUserLogin(id: number, login: string): void {
  db.prepare('UPDATE users SET login = ? WHERE id = ?').run(login, id);
}

export function updateUserPassword(id: number, passwordHash: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

/** Cascades to sessions, lesson access, answers (block_states), homework and classes. */
export function deleteUser(id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/** Everything stored about a student, as rows (the export of their data, see students.ts). */
export interface StudentData {
  user: User & { last_lesson_title: string | null; last_chapter_id: string | null };
  lessonAccess: { lesson_id: number; lesson_title: string; chapter_ids: string | null; granted_at: string }[];
  homework: {
    id: number;
    lesson_id: number;
    lesson_title: string;
    status: string;
    created_at: string;
    exercise_ids: string;
  }[];
  answers: { lesson_id: number; lesson_title: string; block_id: string; state: string; updated_at: string }[];
  comments: { lesson_id: number; lesson_title: string; block_id: string; text: string }[];
  highlights: { lesson_id: number; lesson_title: string; block_id: string; highlights: string }[];
  vocabulary: VocabularyRow[];
  groups: { name: string }[];
  classes: {
    id: number;
    lesson_title: string | null;
    started_at: string;
    ended_at: string | null;
    added_at: string;
    removed_at: string | null;
    first_joined_at: string | null;
  }[];
  boardLines: string[];
}

export function collectStudentData(studentId: number): StudentData | undefined {
  const user = db
    .prepare(
      `SELECT u.id, u.login, u.role, u.created_at, u.last_chapter_id, l.title AS last_lesson_title
       FROM users u LEFT JOIN lessons l ON l.id = u.last_lesson_id WHERE u.id = ?`,
    )
    .get(studentId) as unknown as StudentData['user'] | undefined;
  if (!user) return undefined;
  const all = <T>(sql: string) => db.prepare(sql).all(studentId) as unknown as T[];
  return {
    user,
    lessonAccess: all(
      `SELECT a.lesson_id, l.title AS lesson_title, a.chapter_ids, a.granted_at
       FROM lesson_access a JOIN lessons l ON l.id = a.lesson_id WHERE a.student_id = ? ORDER BY a.granted_at, a.lesson_id`,
    ),
    homework: all(
      `SELECT h.id, h.lesson_id, l.title AS lesson_title, h.status, h.created_at,
              COALESCE((SELECT json_group_array(exercise_id) FROM homework_exercises WHERE homework_id = h.id), '[]') AS exercise_ids
       FROM homework h JOIN lessons l ON l.id = h.lesson_id WHERE h.student_id = ? ORDER BY h.created_at, h.id`,
    ),
    answers: all(
      `SELECT b.lesson_id, l.title AS lesson_title, b.block_id, b.state, b.updated_at
       FROM block_states b JOIN lessons l ON l.id = b.lesson_id WHERE b.user_id = ? ORDER BY b.lesson_id, b.block_id`,
    ),
    comments: all(
      `SELECT c.lesson_id, l.title AS lesson_title, c.block_id, c.text
       FROM answer_comments c JOIN lessons l ON l.id = c.lesson_id WHERE c.student_id = ? ORDER BY c.lesson_id, c.block_id`,
    ),
    highlights: all(
      `SELECT h.lesson_id, l.title AS lesson_title, h.block_id, h.highlights
       FROM answer_highlights h JOIN lessons l ON l.id = h.lesson_id WHERE h.student_id = ? ORDER BY h.lesson_id, h.block_id`,
    ),
    vocabulary: listVocabulary(studentId),
    groups: all(
      `SELECT g.name FROM student_group_members m JOIN student_groups g ON g.id = m.group_id WHERE m.student_id = ? ORDER BY g.name`,
    ),
    classes: all(
      `SELECT c.id, l.title AS lesson_title, c.started_at, c.ended_at, s.added_at, s.removed_at, s.first_joined_at
       FROM class_session_students s JOIN class_sessions c ON c.id = s.session_id
       LEFT JOIN lessons l ON l.id = c.lesson_id WHERE s.student_id = ? ORDER BY c.started_at, c.id`,
    ),
    boardLines: all<{ text: string }>(
      `SELECT e.text FROM board_entries e JOIN boards b ON b.id = e.board_id WHERE b.student_id = ? ORDER BY e.id`,
    ).map((row) => row.text),
  };
}

export function isLoginTaken(login: string, exceptUserId?: number): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE login = ? AND id != ?').get(login, exceptUserId ?? -1);
}

// ----- student groups -----

export interface StudentGroup {
  id: number;
  name: string;
  created_at: string;
  studentIds: number[];
}

/** All groups, by name, with their students (by login). */
export function listGroups(): StudentGroup[] {
  const groups = db.prepare('SELECT id, name, created_at FROM student_groups ORDER BY name').all() as unknown as Omit<
    StudentGroup,
    'studentIds'
  >[];
  const members = db
    .prepare(
      `SELECT m.group_id, m.student_id FROM student_group_members m
       JOIN users u ON u.id = m.student_id ORDER BY u.login`,
    )
    .all() as unknown as { group_id: number; student_id: number }[];
  const byGroup = new Map<number, number[]>();
  for (const { group_id, student_id } of members) {
    const list = byGroup.get(group_id) ?? [];
    list.push(student_id);
    byGroup.set(group_id, list);
  }
  return groups.map((group) => ({ ...group, studentIds: byGroup.get(group.id) ?? [] }));
}

export function getGroup(id: number): StudentGroup | undefined {
  return listGroups().find((group) => group.id === id);
}

export function isGroupNameTaken(name: string, exceptGroupId?: number): boolean {
  return !!db.prepare('SELECT 1 FROM student_groups WHERE name = ? AND id != ?').get(name, exceptGroupId ?? -1);
}

function setGroupMembers(groupId: number, studentIds: number[]): void {
  db.prepare('DELETE FROM student_group_members WHERE group_id = ?').run(groupId);
  const insert = db.prepare(
    `INSERT INTO student_group_members (group_id, student_id)
     SELECT ?, id FROM users WHERE id = ? AND role = 'student'`,
  );
  for (const studentId of new Set(studentIds)) insert.run(groupId, studentId);
}

export function createGroup(name: string, studentIds: number[]): StudentGroup {
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO student_groups (name) VALUES (?)').run(name);
    setGroupMembers(Number(lastInsertRowid), studentIds);
    db.exec('COMMIT');
    return existing(getGroup(Number(lastInsertRowid)), 'New group');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Renames and/or replaces the members (whatever is given). */
export function updateGroup(id: number, changes: { name?: string; studentIds?: number[] }): void {
  db.exec('BEGIN');
  try {
    if (changes.name !== undefined) db.prepare('UPDATE student_groups SET name = ? WHERE id = ?').run(changes.name, id);
    if (changes.studentIds !== undefined) setGroupMembers(id, changes.studentIds);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Only the group: its students stay. */
export function deleteGroup(id: number): void {
  db.prepare('DELETE FROM student_groups WHERE id = ?').run(id);
}

// ----- sessions -----

export function createSession(tokenHash: string, userId: number, expiresAt: number): void {
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    userId,
    expiresAt,
  );
}

export function getSessionUser(tokenHash: string, now: number): User | undefined {
  return db
    .prepare(
      `SELECT u.id, u.login, u.role, u.created_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, now) as unknown as User | undefined;
}

export function deleteSession(tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/** Signs the user out everywhere: their sessions and their assistants' connections (OAuth grants). */
export function deleteUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM oauth_grants WHERE user_id = ?').run(userId);
}

export function deleteExpiredSessions(now: number): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

// ----- homework -----

export interface Homework {
  id: number;
  lesson_id: number;
  lesson_title: string;
  student_id: number;
  student_login: string;
  created_at: string;
  status: HomeworkStatus;
  /** The class it was set in (see addClassHomework); null: from "Asignar tarea". */
  class_session_id: number | null;
  /** Exercise item ids in the lesson document (any order; show them in lesson order). */
  exercise_ids: string[];
}

interface HomeworkRow extends Omit<Homework, 'exercise_ids'> {
  exercise_ids: string;
}

const HOMEWORK_SELECT = `
  SELECT h.id, h.lesson_id, l.title AS lesson_title, h.student_id, u.login AS student_login,
         h.created_at, h.status, h.class_session_id,
         (SELECT json_group_array(exercise_id) FROM homework_exercises e WHERE e.homework_id = h.id) AS exercise_ids
  FROM homework h
  JOIN lessons l ON l.id = h.lesson_id
  JOIN users u ON u.id = h.student_id`;

const toHomework = (row: HomeworkRow): Homework => ({
  ...row,
  exercise_ids: JSON.parse(row.exercise_ids) as string[],
});

/**
 * One homework per student, all with the same exercises of the lesson; the
 * students also get access to the lesson. Returns the new ids.
 */
export function createHomework(
  lessonId: number,
  studentIds: number[],
  exerciseIds: string[],
  /** The chapters of these exercises: opened to the students. */
  chapterIds: string[],
): number[] {
  const insertHomework = db.prepare('INSERT INTO homework (lesson_id, student_id) VALUES (?, ?)');
  const insertExercise = db.prepare(
    'INSERT OR IGNORE INTO homework_exercises (homework_id, exercise_id) VALUES (?, ?)',
  );
  db.exec('BEGIN');
  try {
    openChapters(lessonId, studentIds, chapterIds);
    const ids = studentIds.map((studentId) => {
      const id = Number(insertHomework.run(lessonId, studentId).lastInsertRowid);
      for (const exerciseId of exerciseIds) insertExercise.run(id, exerciseId);
      return id;
    });
    db.exec('COMMIT');
    return ids;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** What addClassHomework did for one student. */
export interface ClassHomeworkResult {
  studentId: number;
  homeworkId: number;
  /** A new homework (the class's first exercise for this student in this lesson); false: it joined the one made earlier. */
  created: boolean;
  /** The exercise was not in the homework yet (false: it was set before, nothing changed). */
  added: boolean;
}

/**
 * One exercise set as homework during a class, for the given students (the class's list).
 * The first exercise in a lesson makes a new homework for each student; the next ones of the
 * same class and lesson join it. Another lesson of the same class is a new homework again
 * (a homework belongs to one lesson). A homework already sent or accepted becomes the
 * student's turn again when it gets an exercise. The chapter is opened to the students.
 */
export function addClassHomework(
  classId: number,
  lessonId: number,
  studentIds: number[],
  exerciseId: string,
  chapterId: string,
): ClassHomeworkResult[] {
  const find = db.prepare(
    'SELECT id, status FROM homework WHERE class_session_id = ? AND lesson_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1',
  );
  const insertHomework = db.prepare('INSERT INTO homework (lesson_id, student_id, class_session_id) VALUES (?, ?, ?)');
  const insertExercise = db.prepare(
    'INSERT OR IGNORE INTO homework_exercises (homework_id, exercise_id) VALUES (?, ?)',
  );
  db.exec('BEGIN');
  try {
    openChapters(lessonId, studentIds, [chapterId]);
    const results = [...new Set(studentIds)].map((studentId): ClassHomeworkResult => {
      const existing = find.get(classId, lessonId, studentId) as unknown as
        | { id: number; status: HomeworkStatus }
        | undefined;
      const homeworkId = existing?.id ?? Number(insertHomework.run(lessonId, studentId, classId).lastInsertRowid);
      const added = Number(insertExercise.run(homeworkId, exerciseId).changes) > 0;
      if (existing && added && existing.status !== 'assigned') setHomeworkStatus(homeworkId, 'assigned');
      return { studentId, homeworkId, created: !existing, added };
    });
    db.exec('COMMIT');
    return results;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** The exercises of `lessonId` set as homework in the class (for any of its students), in no order. */
export function listClassHomeworkExerciseIds(classId: number, lessonId: number): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT e.exercise_id FROM homework h
       JOIN homework_exercises e ON e.homework_id = h.id
       WHERE h.class_session_id = ? AND h.lesson_id = ?`,
    )
    .all(classId, lessonId) as unknown as { exercise_id: string }[];
  return rows.map((row) => row.exercise_id);
}

export function getHomework(id: number): Homework | undefined {
  const row = db.prepare(`${HOMEWORK_SELECT} WHERE h.id = ?`).get(id) as unknown as HomeworkRow | undefined;
  return row && toHomework(row);
}

export interface HomeworkFilter {
  lessonId?: number;
  studentId?: number;
  status?: HomeworkStatus;
  /** Only lessons the student (studentId) still has access to. */
  withAccess?: boolean;
}

/**
 * Homework matching the filter; newest first. Only the given filters go into
 * the WHERE: "? IS NULL OR column = ?" would keep SQLite from using the indexes
 * (a full scan and a sort for every student's list).
 */
export function listHomework(filter: HomeworkFilter): Homework[] {
  const where: string[] = [];
  const params: (number | string)[] = [];
  if (filter.lessonId !== undefined) {
    where.push('h.lesson_id = ?');
    params.push(filter.lessonId);
  }
  if (filter.studentId !== undefined) {
    where.push('h.student_id = ?');
    params.push(filter.studentId);
  }
  if (filter.status !== undefined) {
    where.push('h.status = ?');
    params.push(filter.status);
  }
  if (filter.withAccess) {
    where.push(
      'EXISTS (SELECT 1 FROM lesson_access a WHERE a.lesson_id = h.lesson_id AND a.student_id = h.student_id)',
    );
  }
  const rows = db
    .prepare(
      `${HOMEWORK_SELECT}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY h.created_at DESC, h.id DESC`,
    )
    .all(...params) as unknown as HomeworkRow[];
  return rows.map(toHomework);
}

export function setHomeworkStatus(id: number, status: HomeworkStatus): void {
  db.prepare('UPDATE homework SET status = ? WHERE id = ?').run(status, id);
}

/**
 * Replaces the exercises of a homework (all in one transaction). The chapters of
 * the exercises are open to the student, as when it was assigned; with `backToStudent`
 * a homework already sent or accepted is the student's turn again (assigned).
 */
export function setHomeworkExercises(
  homework: { id: number; lessonId: number; studentId: number },
  exerciseIds: string[],
  chapterIds: string[],
  backToStudent: boolean,
): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM homework_exercises WHERE homework_id = ?').run(homework.id);
    const insert = db.prepare('INSERT INTO homework_exercises (homework_id, exercise_id) VALUES (?, ?)');
    for (const exerciseId of exerciseIds) insert.run(homework.id, exerciseId);
    openChapters(homework.lessonId, [homework.studentId], chapterIds);
    if (backToStudent) setHomeworkStatus(homework.id, 'assigned');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function deleteHomework(id: number): boolean {
  return db.prepare('DELETE FROM homework WHERE id = ?').run(id).changes > 0;
}

// ----- block states (students' answers, see answers.ts) -----

export interface BlockStateRow {
  user_id: number;
  block_id: string;
  /** JSON */
  state: string;
  updated_at: string;
}

/** Saves (replaces) the state; returns its updated_at. */
export function saveBlockState(lessonId: number, userId: number, blockId: string, state: string): string {
  const row = db
    .prepare(
      `INSERT INTO block_states (lesson_id, user_id, block_id, state) VALUES (?, ?, ?, ?)
       ON CONFLICT (lesson_id, user_id, block_id) DO UPDATE SET
         state = excluded.state, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING updated_at`,
    )
    .get(lessonId, userId, blockId, state) as { updated_at: string };
  return row.updated_at;
}

/** The state of one block (undefined: nothing saved yet). */
export function getBlockState(lessonId: number, userId: number, blockId: string): unknown {
  const row = db
    .prepare('SELECT state FROM block_states WHERE lesson_id = ? AND user_id = ? AND block_id = ?')
    .get(lessonId, userId, blockId) as { state: string } | undefined;
  return row ? JSON.parse(row.state) : undefined;
}

/** Block states in a lesson: of one student, or of all students (userId omitted). */
export function listBlockStates(lessonId: number, userId?: number): BlockStateRow[] {
  return (userId === undefined
    ? db.prepare('SELECT user_id, block_id, state, updated_at FROM block_states WHERE lesson_id = ?').all(lessonId)
    : db
        .prepare('SELECT user_id, block_id, state, updated_at FROM block_states WHERE lesson_id = ? AND user_id = ?')
        .all(lessonId, userId)) as unknown as BlockStateRow[];
}

// ----- answer comments -----

/** Sets the teacher's comment under an answer; an empty text removes it. */
export function setComment(lessonId: number, studentId: number, blockId: string, text: string): void {
  if (text === '') {
    db.prepare('DELETE FROM answer_comments WHERE lesson_id = ? AND student_id = ? AND block_id = ?').run(
      lessonId,
      studentId,
      blockId,
    );
    return;
  }
  db.prepare(
    `INSERT INTO answer_comments (lesson_id, student_id, block_id, text) VALUES (?, ?, ?, ?)
     ON CONFLICT (lesson_id, student_id, block_id) DO UPDATE SET text = excluded.text`,
  ).run(lessonId, studentId, blockId, text);
}

/** All comments to a student in a lesson, by block id. */
export function listComments(lessonId: number, studentId: number): LessonComments {
  const rows = db
    .prepare('SELECT block_id, text FROM answer_comments WHERE lesson_id = ? AND student_id = ?')
    .all(lessonId, studentId) as unknown as { block_id: string; text: string }[];
  return Object.fromEntries(rows.map((r) => [r.block_id, r.text]));
}

// ----- answer highlights -----

/** The highlights of an answer ([] when there are none). */
export function getHighlights(lessonId: number, studentId: number, blockId: string): Highlight[] {
  const row = db
    .prepare('SELECT highlights FROM answer_highlights WHERE lesson_id = ? AND student_id = ? AND block_id = ?')
    .get(lessonId, studentId, blockId) as { highlights: string } | undefined;
  return row ? (JSON.parse(row.highlights) as Highlight[]) : [];
}

/** Replaces the highlights of an answer; an empty list removes the row. */
export function setHighlights(lessonId: number, studentId: number, blockId: string, highlights: Highlight[]): void {
  if (highlights.length === 0) {
    db.prepare('DELETE FROM answer_highlights WHERE lesson_id = ? AND student_id = ? AND block_id = ?').run(
      lessonId,
      studentId,
      blockId,
    );
    return;
  }
  db.prepare(
    `INSERT INTO answer_highlights (lesson_id, student_id, block_id, highlights) VALUES (?, ?, ?, ?)
     ON CONFLICT (lesson_id, student_id, block_id) DO UPDATE SET highlights = excluded.highlights`,
  ).run(lessonId, studentId, blockId, JSON.stringify(highlights));
}

/** All highlights of a student in a lesson, by block id. */
export function listHighlights(lessonId: number, studentId: number): LessonHighlights {
  const rows = db
    .prepare('SELECT block_id, highlights FROM answer_highlights WHERE lesson_id = ? AND student_id = ?')
    .all(lessonId, studentId) as unknown as { block_id: string; highlights: string }[];
  return Object.fromEntries(rows.map((r) => [r.block_id, JSON.parse(r.highlights) as Highlight[]]));
}

// ----- class sessions: live classes (rules in classes.ts) -----

export interface ClassSession {
  id: number;
  teacher_id: number;
  /** Current lesson; null if it was deleted. */
  lesson_id: number | null;
  started_at: string;
  ended_at: string | null;
  teacher_seen_at: string;
  /** Who the class is for: a group, or one student; both null for a class from before this was recorded. */
  group_id: number | null;
  solo_student_id: number | null;
  /** The board the class writes to; null: a class from before boards were bound to classes. */
  board_id: number | null;
}

export interface ClassStudent {
  student_id: number;
  login: string;
  added_at: string;
  removed_at: string | null;
  first_joined_at: string | null;
}

const now = () => new Date().toISOString();

/** Who a class is for, and its board. */
export interface ClassAudience {
  groupId: number | null;
  soloStudentId: number | null;
  boardId: number;
}

/** Starts a class with its first lesson, students and audience. */
export function createClass(
  teacherId: number,
  lessonId: number,
  studentIds: number[],
  audience: ClassAudience,
): ClassSession {
  db.exec('BEGIN');
  try {
    const id = Number(
      db
        .prepare(
          'INSERT INTO class_sessions (teacher_id, lesson_id, group_id, solo_student_id, board_id) VALUES (?, ?, ?, ?, ?)',
        )
        .run(teacherId, lessonId, audience.groupId, audience.soloStudentId, audience.boardId).lastInsertRowid,
    );
    db.prepare('INSERT INTO class_session_lessons (session_id, lesson_id) VALUES (?, ?)').run(id, lessonId);
    const add = db.prepare('INSERT INTO class_session_students (session_id, student_id) VALUES (?, ?)');
    for (const studentId of studentIds) add.run(id, studentId);
    db.exec('COMMIT');
    return existing(getClass(id), 'New class');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getClass(id: number): ClassSession | undefined {
  return db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(id) as unknown as ClassSession | undefined;
}

/** The teacher's class that is on now, if any. */
export function getActiveClassOfTeacher(teacherId: number): ClassSession | undefined {
  return db
    .prepare('SELECT * FROM class_sessions WHERE teacher_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(teacherId) as unknown as ClassSession | undefined;
}

/** The class a student is in now (not removed from it), if any. */
export function getActiveClassOfStudent(studentId: number): ClassSession | undefined {
  return db
    .prepare(
      `SELECT s.* FROM class_sessions s
       JOIN class_session_students st ON st.session_id = s.id
       WHERE st.student_id = ? AND st.removed_at IS NULL AND s.ended_at IS NULL
       ORDER BY s.id DESC LIMIT 1`,
    )
    .get(studentId) as unknown as ClassSession | undefined;
}

/** Students of a class: current ones, or with removed ones too (history). */
export function listClassStudents(sessionId: number, withRemoved = false): ClassStudent[] {
  return db
    .prepare(
      `SELECT st.student_id, u.login, st.added_at, st.removed_at, st.first_joined_at
       FROM class_session_students st JOIN users u ON u.id = st.student_id
       WHERE st.session_id = ? ${withRemoved ? '' : 'AND st.removed_at IS NULL'}
       ORDER BY u.login`,
    )
    .all(sessionId) as unknown as ClassStudent[];
}

/** Adds a student to a class, or brings back one who was removed. */
export function addClassStudent(sessionId: number, studentId: number): void {
  db.prepare(
    `INSERT INTO class_session_students (session_id, student_id) VALUES (?, ?)
     ON CONFLICT (session_id, student_id) DO UPDATE SET removed_at = NULL`,
  ).run(sessionId, studentId);
}

export function removeClassStudent(sessionId: number, studentId: number): void {
  db.prepare(
    'UPDATE class_session_students SET removed_at = ? WHERE session_id = ? AND student_id = ? AND removed_at IS NULL',
  ).run(now(), sessionId, studentId);
}

/** The student opened the class's lesson (only the first time is recorded). */
export function markClassStudentJoined(sessionId: number, studentId: number): void {
  db.prepare(
    `UPDATE class_session_students SET first_joined_at = ?
     WHERE session_id = ? AND student_id = ? AND first_joined_at IS NULL`,
  ).run(now(), sessionId, studentId);
}

/** Switches the class to another lesson (and records it in the class's lessons). */
export function setClassLesson(sessionId: number, lessonId: number): void {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE class_sessions SET lesson_id = ? WHERE id = ?').run(lessonId, sessionId);
    db.prepare('INSERT INTO class_session_lessons (session_id, lesson_id) VALUES (?, ?)').run(sessionId, lessonId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Lesson ids of a class in the order they were opened. */
export function listClassLessons(sessionId: number): { lesson_id: number; opened_at: string }[] {
  return db
    .prepare('SELECT lesson_id, opened_at FROM class_session_lessons WHERE session_id = ? ORDER BY opened_at')
    .all(sessionId) as unknown as { lesson_id: number; opened_at: string }[];
}

/** Where a group's or a student's last class stopped. */
export interface ClassPosition {
  lessonId: number;
  /** null: no chapter recorded. */
  chapterId: string | null;
}

/** Where the last online class of a group / of one student (their solo classes) stopped; undefined if none or its lesson is gone. */
export function getClassPosition(of: { groupId: number } | { studentId: number }): ClassPosition | undefined {
  const row = (
    'groupId' in of
      ? db.prepare('SELECT last_lesson_id, last_chapter_id FROM student_groups WHERE id = ?').get(of.groupId)
      : db.prepare('SELECT last_lesson_id, last_chapter_id FROM users WHERE id = ?').get(of.studentId)
  ) as { last_lesson_id: number | null; last_chapter_id: string | null } | undefined;
  return row?.last_lesson_id ? { lessonId: row.last_lesson_id, chapterId: row.last_chapter_id } : undefined;
}

/** The class's own position: where its group / student's last class stopped, if it is still in the class's lesson. */
export function getPositionOfClass(cls: ClassSession): ClassPosition | undefined {
  const position =
    cls.group_id !== null
      ? getClassPosition({ groupId: cls.group_id })
      : cls.solo_student_id !== null
        ? getClassPosition({ studentId: cls.solo_student_id })
        : undefined;
  return position?.lessonId === cls.lesson_id ? position : undefined;
}

/** Records where the class is (its lesson and chapter) in the group / student it is for. */
export function saveClassPosition(cls: ClassSession, lessonId: number, chapterId: string | null): void {
  if (cls.group_id !== null) {
    db.prepare('UPDATE student_groups SET last_lesson_id = ?, last_chapter_id = ? WHERE id = ?').run(
      lessonId,
      chapterId,
      cls.group_id,
    );
  } else if (cls.solo_student_id !== null) {
    db.prepare('UPDATE users SET last_lesson_id = ?, last_chapter_id = ? WHERE id = ?').run(
      lessonId,
      chapterId,
      cls.solo_student_id,
    );
  }
}

export function touchClassTeacher(sessionId: number): void {
  db.prepare('UPDATE class_sessions SET teacher_seen_at = ? WHERE id = ?').run(now(), sessionId);
}

export function endClass(sessionId: number): void {
  db.prepare('UPDATE class_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(now(), sessionId);
}

/** Classes that are on but whose teacher was last seen before `before` (ISO time). */
export function listStaleClasses(before: string): ClassSession[] {
  return db
    .prepare('SELECT * FROM class_sessions WHERE ended_at IS NULL AND teacher_seen_at < ?')
    .all(before) as unknown as ClassSession[];
}

/** A teacher's classes, newest first (history and statistics). */
export function listClassesOfTeacher(teacherId: number, limit = 100): ClassSession[] {
  return db
    .prepare('SELECT * FROM class_sessions WHERE teacher_id = ? ORDER BY id DESC LIMIT ?')
    .all(teacherId, limit) as unknown as ClassSession[];
}

// ----- vocabulary (a student's saved words) -----

export interface VocabularyEntry {
  id: number;
  student_id: number;
  lang: string;
  lemma: string;
  translation: string;
  word: string;
  lesson_id: number | null;
  created_at: string;
}

export type NewVocabularyEntry = Omit<VocabularyEntry, 'id' | 'created_at'>;

/** Saves a word; the same lemma saved again is refreshed, not duplicated. */
export function saveVocabularyEntry(entry: NewVocabularyEntry): VocabularyEntry {
  return db
    .prepare(
      `INSERT INTO vocabulary (student_id, lang, lemma, translation, word, lesson_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (student_id, lang, lemma) DO UPDATE SET
         translation = excluded.translation, word = excluded.word, lesson_id = excluded.lesson_id
       RETURNING *`,
    )
    .get(
      entry.student_id,
      entry.lang,
      entry.lemma,
      entry.translation,
      entry.word,
      entry.lesson_id,
    ) as unknown as VocabularyEntry;
}

export type VocabularyRow = VocabularyEntry & { lesson_title: string | null };

const VOCABULARY_SELECT = `SELECT v.*, l.title AS lesson_title FROM vocabulary v LEFT JOIN lessons l ON l.id = v.lesson_id`;

/** A student's words, newest first. */
export function listVocabulary(studentId: number): VocabularyRow[] {
  return db
    .prepare(`${VOCABULARY_SELECT} WHERE v.student_id = ? ORDER BY v.created_at DESC, v.id DESC`)
    .all(studentId) as unknown as VocabularyRow[];
}

export function getVocabularyEntry(id: number): VocabularyRow | undefined {
  return db.prepare(`${VOCABULARY_SELECT} WHERE v.id = ?`).get(id) as unknown as VocabularyRow | undefined;
}

/** Whether the student has already saved this lemma. */
export function hasVocabularyLemma(studentId: number, lang: string, lemma: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM vocabulary WHERE student_id = ? AND lang = ? AND lemma = ?')
    .get(studentId, lang, lemma);
}

/** Removes one of the student's own words; false if there was none. */
export function deleteVocabularyEntry(studentId: number, id: number): boolean {
  return db.prepare('DELETE FROM vocabulary WHERE id = ? AND student_id = ?').run(id, studentId).changes > 0;
}

// ----- media library (files: mediaStore.ts; rules: mediaLibrary.ts) -----

export interface Media {
  id: number;
  /** <sha256>.<ext> in data/media. */
  file: string;
  name: string;
  kind: 'image' | 'audio';
  bytes: number;
  uploaded_at: string;
}

/** Newest first. */
export function listMedia(): Media[] {
  return db.prepare('SELECT * FROM media ORDER BY uploaded_at DESC, id DESC').all() as unknown as Media[];
}

export function getMedia(id: number): Media | undefined {
  return db.prepare('SELECT * FROM media WHERE id = ?').get(id) as unknown as Media | undefined;
}

export function getMediaByFile(file: string): Media | undefined {
  return db.prepare('SELECT * FROM media WHERE file = ?').get(file) as unknown as Media | undefined;
}

/** Whether another file already has this name (ignoring case). */
export function isMediaNameTaken(name: string, exceptId = -1): boolean {
  return !!db.prepare('SELECT 1 FROM media WHERE name = ? AND id != ?').get(name, exceptId);
}

export function insertMedia(media: Omit<Media, 'id' | 'uploaded_at'>): Media {
  return db
    .prepare('INSERT INTO media (file, name, kind, bytes) VALUES (?, ?, ?, ?) RETURNING *')
    .get(media.file, media.name, media.kind, media.bytes) as unknown as Media;
}

export function renameMedia(id: number, name: string): void {
  db.prepare('UPDATE media SET name = ? WHERE id = ?').run(name, id);
}

export function deleteMedia(id: number): void {
  db.prepare('DELETE FROM media WHERE id = ?').run(id);
}

/** Every lesson's title and stored document (to find where a file is used). */
export function listLessonDocuments(): { id: number; title: string; content: string | null }[] {
  return db.prepare('SELECT id, title, content FROM lessons ORDER BY id').all() as unknown as {
    id: number;
    title: string;
    content: string | null;
  }[];
}

// ----- OAuth for the MCP server (rules: oauth/provider.ts) -----

export function getOAuthClient(clientId: string): string | undefined {
  const row = db.prepare('SELECT metadata FROM oauth_clients WHERE client_id = ?').get(clientId) as
    | { metadata: string }
    | undefined;
  return row?.metadata;
}

export function insertOAuthClient(clientId: string, metadata: string, now: number): void {
  db.prepare('INSERT INTO oauth_clients (client_id, metadata, created_at) VALUES (?, ?, ?)').run(
    clientId,
    metadata,
    now,
  );
}

export interface OAuthRequest {
  id: string;
  client_id: string;
  client_name: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
  /** Space-separated. */
  scopes: string;
  resource: string;
  expires_at: number;
}

export function insertOAuthRequest(request: OAuthRequest): void {
  db.prepare(
    `INSERT INTO oauth_requests (id, client_id, client_name, redirect_uri, code_challenge, state, scopes, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    request.id,
    request.client_id,
    request.client_name,
    request.redirect_uri,
    request.code_challenge,
    request.state,
    request.scopes,
    request.resource,
    request.expires_at,
  );
}

/** A request still waiting for consent (not expired). */
export function getOAuthRequest(id: string, now: number): OAuthRequest | undefined {
  return db.prepare('SELECT * FROM oauth_requests WHERE id = ? AND expires_at > ?').get(id, now) as unknown as
    | OAuthRequest
    | undefined;
}

export function deleteOAuthRequest(id: string): void {
  db.prepare('DELETE FROM oauth_requests WHERE id = ?').run(id);
}

export interface OAuthCode {
  code_hash: string;
  user_id: number;
  client_id: string;
  client_name: string;
  redirect_uri: string;
  code_challenge: string;
  scopes: string;
  resource: string;
  expires_at: number;
}

export function insertOAuthCode(code: OAuthCode): void {
  db.prepare(
    `INSERT INTO oauth_codes (code_hash, user_id, client_id, client_name, redirect_uri, code_challenge, scopes, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code.code_hash,
    code.user_id,
    code.client_id,
    code.client_name,
    code.redirect_uri,
    code.code_challenge,
    code.scopes,
    code.resource,
    code.expires_at,
  );
}

export function getOAuthCode(codeHash: string): OAuthCode | undefined {
  return db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(codeHash) as unknown as OAuthCode | undefined;
}

/** Takes the code for good: → whether it was there (a code is used once). */
export function deleteOAuthCode(codeHash: string): boolean {
  return db.prepare('DELETE FROM oauth_codes WHERE code_hash = ?').run(codeHash).changes > 0;
}

export interface OAuthGrant {
  id: number;
  user_id: number;
  client_id: string;
  client_name: string;
  scopes: string;
  resource: string;
  access_hash: string;
  access_expires_at: number;
  refresh_hash: string;
  refresh_expires_at: number;
  created_at: number;
  last_used_at: number | null;
}

export function insertOAuthGrant(grant: Omit<OAuthGrant, 'id' | 'last_used_at'>): void {
  db.prepare(
    `INSERT INTO oauth_grants (user_id, client_id, client_name, scopes, resource, access_hash, access_expires_at,
                               refresh_hash, refresh_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    grant.user_id,
    grant.client_id,
    grant.client_name,
    grant.scopes,
    grant.resource,
    grant.access_hash,
    grant.access_expires_at,
    grant.refresh_hash,
    grant.refresh_expires_at,
    grant.created_at,
  );
}

export function getOAuthGrantByAccess(accessHash: string): OAuthGrant | undefined {
  return db.prepare('SELECT * FROM oauth_grants WHERE access_hash = ?').get(accessHash) as unknown as
    | OAuthGrant
    | undefined;
}

export function getOAuthGrantByRefresh(refreshHash: string): OAuthGrant | undefined {
  return db.prepare('SELECT * FROM oauth_grants WHERE refresh_hash = ?').get(refreshHash) as unknown as
    | OAuthGrant
    | undefined;
}

/** New tokens for the connection (the old ones stop working). */
export function replaceOAuthGrantTokens(
  id: number,
  tokens: Pick<OAuthGrant, 'access_hash' | 'access_expires_at' | 'refresh_hash' | 'refresh_expires_at'>,
  now: number,
): void {
  db.prepare(
    `UPDATE oauth_grants SET access_hash = ?, access_expires_at = ?, refresh_hash = ?, refresh_expires_at = ?, last_used_at = ?
     WHERE id = ?`,
  ).run(tokens.access_hash, tokens.access_expires_at, tokens.refresh_hash, tokens.refresh_expires_at, now, id);
}

export function touchOAuthGrant(id: number, now: number): void {
  db.prepare('UPDATE oauth_grants SET last_used_at = ? WHERE id = ?').run(now, id);
}

/** A teacher's connections, newest first. */
export function listOAuthGrants(userId: number): OAuthGrant[] {
  return db
    .prepare('SELECT * FROM oauth_grants WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(userId) as unknown as OAuthGrant[];
}

/** Disconnects one of the teacher's connections: → whether it was theirs. */
export function deleteOAuthGrant(id: number, userId: number): boolean {
  return db.prepare('DELETE FROM oauth_grants WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** Revocation by a client: the connection whose access or refresh token this is. */
export function deleteOAuthGrantByToken(tokenHash: string, clientId: string): void {
  db.prepare('DELETE FROM oauth_grants WHERE (access_hash = ? OR refresh_hash = ?) AND client_id = ?').run(
    tokenHash,
    tokenHash,
    clientId,
  );
}

/**
 * Drops what expired: waiting requests, codes, connections whose refresh token
 * expired, and self-registered clients that never got connected within a day.
 */
export function deleteExpiredOAuthData(now: number, unusedClientBefore: number): void {
  db.prepare('DELETE FROM oauth_requests WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM oauth_codes WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM oauth_grants WHERE refresh_expires_at <= ?').run(now);
  db.prepare(
    `DELETE FROM oauth_clients WHERE created_at <= ?
       AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = oauth_clients.client_id)`,
  ).run(unusedClientBefore);
}

// ----- app settings (rules: settings.ts) -----

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
