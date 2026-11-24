# Classes

The live lesson. REST: `server/src/classes.ts`; socket: `server/src/live.ts` (socket.io namespace `/live`, shared with homework notifications).

## The class

- A class is the teacher's live lesson for a group or for one student (several single students need a group first). A teacher and a student can each have one active class. The lesson can change during the class; students can be removed and brought back, but only members of the class's group can be added.
- **Access.** A student added to a class gets the chapter the class is in; when the lesson changes, all get its first chapter. Every chapter the teacher opens or shows is opened to the class's students. A removed student keeps access.
- **Homework during a class.** The teacher sets one exercise at a time as homework for everybody in the class (`POST /api/classes/:id/homework {exerciseId}`). The first one creates a homework per student (`homework.class_session_id`); the next ones of the same class and lesson join it. A homework already sent or accepted goes back to the student's turn. In the UI, each exercise on the class page has an orange notebook button that asks for confirmation first; a set exercise shows "Tarea". After the class only "Asignar tarea" remains.
- **The `/live` socket** is open on every page while signed in (`client/src/liveConnection.tsx`). When a class starts, the student sees the modal "La clase ha empezado · Entrar a la clase" with a sound, and the tab title blinks (`components/ClassAlert.tsx`). After "Más tarde" a green banner stays until they enter or the class ends. The teacher's "Llamar" shows the modal again.
- **Where the student is.** The lesson page reports the lesson, chapter and the exercises on screen (a quarter of one, at most 150 px). The teacher sees ● on the class's lesson (with the exercise numbers, "ej. 4–5") and ○ in the app elsewhere.
- **Answers** are saved over HTTP ([Answers](answers-and-homework.md#student-answers)); the server forwards to the teacher only those of the students of their active class on the class's lesson.
- **Auto-close.** While the teacher has the app open, the class is extended (`teacher_seen_at`, once a minute). After 30 minutes without the teacher it closes.
- Presence and positions live only in the server's memory; there is no class history.

### The teacher's page `/class`

- With no class: "Nueva clase", the lesson and who it is for (a group or one student). If they had a class, "La última vez" shows where it stopped, with a button to continue there.
- During a class: change the lesson, see the students and their presence, call, remove, add, "Terminar la clase".
- The selected student's lesson is read-only and updates block by block, with "Aquí está" on their exercise.
- "Show to the student" on a chapter or an exercise (`navigate`) opens it on the student's page, scrolls and highlights it.

### Where it stopped

A group (`student_groups.last_lesson_id`, `last_chapter_id`) and a student (the same columns of `users`) keep the lesson and chapter where their last class stopped. The class page reports the chapter it opens (`chapter { lessonId, chapterId }`), so the pointer survives an automatic close. `GET /api/classes/resume?groupId=|studentId=` returns it (`null` if none or the lesson is deleted). Students get the chapter when the class starts or a page loads (`StudentClass.chapterId`); later moves are pushed only by "show to everyone".

## The wheel

The `wheel` block (`client/src/exercises/WheelBlock.tsx`): spin it, and the item under the pointer (at 3 o'clock) is the one to talk about. The system's "reduce motion" setting is ignored on purpose.

- **The spin** is computed in `shared/src/wheel.ts` (`from`, `to`, `startedAt`, `durationMs` and one slowing curve), so every page shows the same turn and a page opened mid-spin joins in place. Every item is equally likely.
- **In a live class** the server decides: anyone sends `wheelSpin { lessonId, blockId }`, the server picks the item and sends `wheel` to the teacher and the students. A spinning wheel is not spun again. A page asks `wheelState` when it opens the exercise and after a reconnect.
- **State** is in memory (`server/src/wheelStore.ts`), one entry per class and wheel; dropped when the class ends or changes lesson, or after 12 hours.
- **Outside a class** the page spins its own wheel.

## The board (pizarra)

A flat feed of one-line plain texts that the teacher and the students write during a class: no author, no date, no editing. Only the teacher deletes a line. Code: `shared/src/board.ts`, `server/src/board/`, `client/src/board/`.

- **Whose.** One board per group or per student (table `boards`, created with the first class); a student in a group who also has solo classes has two. Deleting the group or student deletes the board.
- **Read:** a student reads their own board and their groups' boards (`GET /api/boards`, `/api/boards/:id/entries`), a new group member reads the whole history, a leaver loses access. The teacher reads any.
- **Write:** only during a class, on that class's board: the teacher and the students who are in the class. Otherwise 403. No rate limit.
- **Delete:** the teacher of that class, during it, any line (🗑, no confirmation).
- **Live:** `board { boardId, entry }` and `boardRemoved { boardId, entryId }` on `/live`.
- **Paging:** the latest 50 lines; older ones load in pages of 50 on scrolling up (`?before=<entry id>`).
- **Layout.** On the lesson page the board is in a side column (240 px). Below 990 px (`client/src/layout/viewport.ts`) it becomes a bottom sheet (`components/SideDock.tsx`): closed it is one line (the last entry and a count of new ones), one button opens it to half the screen. The teacher's students become a narrow column at the right edge. New lines glow for about four seconds. The student's "Pizarra" page (`/pizarra`) shows the boards one at a time.
- Text only: no Markdown, HTML or links.
