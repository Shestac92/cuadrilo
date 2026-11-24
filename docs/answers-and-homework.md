# Answers and homework

## Student answers

`server/src/answers.ts`, table `block_states`: the latest state of every answer block, per student and block. No history.

- **Sending.** Every change is the block's full state: `PUT /api/lessons/:id/states/:blockId`. An essay draft goes at most once a second. The server forwards the answer to the teacher (socket), then saves it.
- **Order** is kept by the client (`client/src/exercises/sync.tsx`): one request in flight per block, a newer state replaces a waiting one. Network errors, 5xx and 429 are retried with a growing pause. Requests are `keepalive`; when a page closes, waiting drafts go out at once.
- **No statuses.** The widget shows right answers green and wrong ones red; the teacher looks at it. The student declares "done" only for homework, by submitting it. The initial state is saved too (the teacher sees, for example, the shuffled word bank).
- After a reload answers are restored (`GET /api/lessons/:id/states`).

There are no results pages: the teacher watches answers live on the class page.

## Homework

`server/src/homework.ts`. A homework is exercises of one lesson for one student, plus a status. Answers are shared with the lesson (`block_states`) and never locked.

- **Assigning:** the "Tarea" button in the lesson list. The teacher picks exercises and students; each student gets their own homework, and the chapters of the exercises are opened to them.
- **Statuses:** `assigned` → the student's "Enviar al profesor" → `submitted` → `needs_work` (the student can send again) or `accepted`. The teacher can set any status at any time. Empty exercises do not block sending.
- **The student** sees pending homework on the dashboard and the full list on `/homework` ("Mis tareas"). A homework opens at `/lessons/:id?homework=:homeworkId`: the lesson with only the assigned exercises on one page, numbers unchanged (`homeworkContent` in `shared/src/lesson.ts`). "Enviar al profesor" is below the last exercise. If the homework no longer exists, the whole lesson opens. The ordinary lesson page marks assigned exercises with "Tarea".
- **The teacher** sees all homework on "Tareas", filters by student and status, newest first, and changes statuses.
- A deleted exercise just disappears from the homework.
- **Editing** (`PUT /api/homework/:id/exercises`, page `/homework/:id/edit`): the teacher changes one student's exercise set in place, so a student never has two homework items for one lesson. At least one exercise stays; answers are never touched. Adding exercises opens their chapters and puts a `submitted` or `accepted` homework back to `assigned` (reason `updated`); removing changes no status.
- **Live updates** (`/live`): after every change the student and all teachers get `homework { homework, reason }`, after a deletion `homeworkDeleted { id }`. `reason` is what to notify about: the student gets `assigned`, `updated`, `needs_work`, `accepted`; teachers get `submitted`; `null` means update silently. The list is loaded once per app (`liveConnection.tsx`, `homeworkList.ts`) and updated from events.
- **Notifications** (`components/LiveNotices.tsx`) appear at the bottom right, one per homework, until closed or followed; not on the page they lead to, and not restored after a reload. The menu counter on "Tareas" shows what waits: for a student "Pendiente" + "Por corregir", for a teacher what waits for review.

## Highlights in essays

The teacher marks parts of an `essay` answer: a colour (green, red, yellow, blue), a line through, a straight or wavy underline, combinable. Code: `shared/src/highlights.ts`, `server/src/answers.ts`, table `answer_highlights`.

- A highlight is `{start, end, color?, strike?, underline?}` (character positions; `underline` is `line` or `wave`), stored as one JSON list per answer, at most 200. Marks never change the text's shape (no bold or italics). They are kept apart from `block_states`, which the student overwrites on every save.
- **Marking:** `POST /api/lessons/:id/students/:studentId/highlights/:blockId` (teacher) with `{paint}`, `{format}` or `{erase}`, each with `start`, `end` and the selected `quote`. A colour replaces the old one in the part; neighbouring parts with the same marks join. If the student changed the text meanwhile, the nearest occurrence of the quote is used, else 409 `text_changed`.
- **Moving with edits:** on every save the server compares the old and new text as one replaced part (`rebaseHighlights`): marks before it stay, after it shift, inside it stay, over its edge are cut, over all of it removed. Two separate edits between saves lose the marks between them.
- **The teacher's tool** sits under the essay wherever the teacher reads an answer: four colours, three line toggles and an eraser (`exercises/highlights.tsx`). The student sees the marks in a layer over the textarea (`HighlightLayer`).
- **Live:** `highlights { lessonId, studentId, blockId, highlights, reason }` (`teacher` or `edit`). Load: `GET /api/lessons/:id/highlights` (student) and `GET /api/lessons/:id/students/:studentId/highlights` (teacher).

## Teacher's comments

Under any answer block the teacher can leave a comment, at any time, even before the student answers. Code: `shared/src/comments.ts`, `server/src/comments.ts`, `client/src/comments/`, table `answer_comments`.

- One plain text (up to 2000 characters) per lesson, student and block, kept apart from `block_states`. Only the teacher changes it; an empty text removes it.
- The teacher has a textarea under each answer block in the class page and the homework review; it saves shortly after typing stops and on blur. Blocks that are only shown have none.
- The student sees it read-only as "Comentario del profesor", with no notification.
- API: `PUT /api/lessons/:id/students/:studentId/comments/:blockId {text}` and `GET .../comments` (teacher), `GET /api/lessons/:id/comments` (student). Live: `comment { lessonId, studentId, blockId, text }`.
