# API

The contract is `shared/src/api.ts`.

**Conventions.**
- JSON under `/api`, fields in camelCase, time in ISO 8601 UTC.
- A resource is returned without a wrapper, lists as arrays. Creation answers 201, deletion 204. Unknown fields in input are ignored.
- Without sign-in only `/api/auth/*` is available. State-changing requests from other sites are rejected.
- Errors: `{error, code, issues?}`. `error` is text for the user, `code` is:

| `code` | Status | When |
|---|---|---|
| `invalid_input` | 400 | a wrong body, JSON or id in the path; `issues` has the details |
| `unauthorized` | 401 | not signed in, or a wrong login/password |
| `forbidden` | 403 | the wrong role or origin |
| `not_found` | 404 | there is no such resource **or no access to it** (the answer is the same) |
| `login_taken` | 409 | the login is taken |
| `invalid_status` | 409 | the action is not available in the current status |
| `class_active` | 409 | the teacher already has a class running |
| `student_busy` | 409 | the student is in another active class |
| `too_large` | 413 | the body is larger than 2 MB |
| `rate_limited` | 429 | too many failed sign-ins |
| `dictionary_unavailable` | 503 | the dictionary is not built on this server |
| `internal` | 500 | a server error (details only in the log) |

The `/live` socket and its events: `shared/src/api.ts` and [Classes](classes.md).

| Method | Path | Role | Input → response |
|---|---|---|---|
| POST | `/api/auth/login` | — | `{login, password}` → `CurrentUser`, sets the session cookie |
| POST | `/api/auth/logout` | — | → 204 |
| GET | `/api/auth/me` | all | → `CurrentUser` `{id, login, role}` |
| GET | `/api/students` | teacher | → `Student[]` `{id, login, createdAt}` |
| POST | `/api/students` | teacher | `{login, password}` → 201 `Student` |
| PATCH | `/api/students/:id` | teacher | `{login?, password?}` → `Student`; changing the password signs the student out |
| GET | `/api/students/:id/export` | teacher | → a JSON file (`attachment`, `<login>-data.json`) with all the student's data: account, lesson access, homework, answers, teacher's comments and highlights, vocabulary, groups, classes, their board lines. No password or tokens. |
| DELETE | `/api/students/:id` | teacher | → 204; deletes all the student's data (cascade) |
| GET | `/api/settings` | teacher | → `AppSettings` `{theme}` (the same values come with the public `GET /api/config`) |
| PATCH | `/api/settings` | teacher | `{theme?}` → `AppSettings`; only the fields sent change; an unknown theme is 400. Every open page gets the `settings` event (`/live`) with the new `AppSettings` |
| GET | `/api/groups` | teacher | → `StudentGroup[]` `{id, name, studentIds, createdAt}`, by name |
| POST | `/api/groups` | teacher | `{name, studentIds?}` → 201 `StudentGroup`; a taken name is 409 `name_taken` |
| PATCH | `/api/groups/:id` | teacher | `{name?, studentIds?}` → `StudentGroup`; the members, when given, are replaced as a whole |
| DELETE | `/api/groups/:id` | teacher | → 204; the students stay |
| GET | `/api/lessons` | all | → `LessonSummary[]` in the teacher's order (`lessons.position`): all for a teacher, the open ones for a student |
| PUT | `/api/lessons/order` | teacher | `{ids}` → 204; the lessons in this order, unlisted ones after them |
| GET | `/api/lessons/:id` | all | → `Lesson` (with `content`) |
| POST | `/api/lessons` | teacher | `{title}` → 201 `Lesson` with one empty chapter |
| PATCH | `/api/lessons/:id` | teacher | `{title}` → `LessonSummary` |
| PUT | `/api/lessons/:id/content` | teacher | `{content, rev}` → `{rev, updatedAt}`; 409 `lesson_changed` if `rev` is stale |
| DELETE | `/api/lessons/:id` | teacher | → 204; deletes the lesson's access, answers and homework |
| GET / PUT | `/api/lessons/:id/access` | teacher | → / `{studentIds, chapters?}`; PUT replaces the list. `chapters`: student id → open chapter ids; a student not in it has the whole lesson |
| GET | `/api/lessons/:id/states` | student | → `LessonStates`: their own answers, `{blockId: {state, updatedAt}}` |
| PUT | `/api/lessons/:id/states/:blockId` | student | `{state}` → `{updatedAt}`; only blocks with an answer, up to 16 KB |
| GET | `/api/lessons/:id/students/:studentId/states` | teacher | → the student's `LessonStates` |
| GET | `/api/lessons/:id/highlights` | student | → `{blockId: Highlight[]}`: the teacher's colours on their essays |
| GET | `/api/lessons/:id/students/:studentId/highlights` | teacher | → the same, of one student |
| POST | `/api/lessons/:id/students/:studentId/highlights/:blockId` | teacher | `{paint: …}`, `{format: {start, end, quote, patch}}` or `{erase: …}` → `Highlight[]`; the text changed and the quote is gone: 409 `text_changed` |
| GET | `/api/homework` | all | `?lessonId=&studentId=&status=` → `Homework[]`, newest first; a student gets their own in open lessons |
| PUT | `/api/homework/:id/exercises` | teacher | `{exerciseIds}` (1–500, of the lesson) → `Homework`; adding to a submitted / accepted one resets it to `assigned` (event reason `updated`) |
| GET | `/api/homework/:id` | all | → `Homework`; a student only their own |
| POST | `/api/homework` | teacher | `{lessonId, studentIds, exerciseIds}` → 201 `Homework[]`, one per student; opens the chapters of the exercises to the students |
| POST | `/api/homework/:id/submit` | student | → `Homework` `submitted` (from `assigned`/`needs_work`; from `accepted` it is 409 `invalid_status`) |
| PATCH | `/api/homework/:id` | teacher | `{status}` → `Homework` |
| DELETE | `/api/homework/:id` | teacher | → 204, answers stay |
| GET | `/api/classes/current` | all | for a teacher → `Class \| null`, for a student → `StudentClass \| null` |
| GET | `/api/classes/resume?groupId=\|studentId=` | teacher | → `ClassResume` `{lessonId, lessonTitle, chapterId, chapterTitle}` or `null`: where their last class stopped |
| POST | `/api/classes` | teacher | `{lessonId, groupId, chapterId?}` or `{lessonId, studentId, chapterId?}` → 201 `Class` (with `groupId`, `boardId`); one is already active: 409 `class_active` |
| PATCH | `/api/classes/:id` | teacher | `{lessonId}` → `Class`: change the lesson |
| PUT / DELETE | `/api/classes/:id/students/:studentId` | teacher | → `Class`: add (in another class: 409 `student_busy`) / remove |
| POST | `/api/classes/:id/homework` | teacher | `{exerciseId}` (an exercise of the class's lesson) → `Class`: that exercise as homework for the class's students (see [Homework during a class](answers-and-homework.md#homework)); no students 400, the class has ended 404 |
| POST | `/api/classes/:id/end` | teacher | → 204 |
| GET | `/api/boards` | student | → `BoardInfo[]` `{id, groupName}` (`null`: the student's own board): the boards they can read |
| GET | `/api/boards/:id/entries?before=` | teacher, student of the board | → `BoardPage` `{entries, hasMore}`: 50 lines, the latest or those before the entry `before`, oldest first |
| POST | `/api/boards/:id/entries` | teacher, student | `{text}` → 201 `BoardEntry` `{id, text}`; only in a class on this board, else 403 |
| DELETE | `/api/boards/:id/entries/:entryId` | teacher | → 204; only in a class on this board, else 403; no such line: 404 |
| GET | `/api/dictionary?word=` | all | → `LookupResult[]` `{lemma, translations}`; an unknown word → `[]`; no dictionary → 503 |
| GET | `/api/vocabulary` | student | → `VocabularyEntry[]`, newest first |
| POST | `/api/vocabulary` | student | `{word, lemma, lessonId?}` → 201 new / 200 updated `VocabularyEntry` |
| DELETE | `/api/vocabulary/:id` | student | → 204 |
| GET | `/api/media` | teacher | the media library, newest on top: `MediaFile[]` (`{id, name, kind, url, bytes, uploadedAt, usedIn}`) |
| POST | `/api/media?name=…` | teacher | the file in the body → 201 new / 200 already there (`MediaUploaded`, `existed`); a wrong format is 400, over the limit 413, a taken name 409 `name_taken` |
| PATCH | `/api/media/:id` | teacher | `{name}` → `MediaFile`; a taken name is 409 `name_taken` |
| DELETE | `/api/media/:id` | teacher | 204; a file used in a lesson is 409 `media_in_use` |
| GET | `/media/<file>` | all | the file itself (outside `/api`; Range for audio) |

Tables: `server/src/db.ts`.
