# Roles and access

| | Teacher | Student |
|---|---|---|
| Lessons | creates, renames, deletes, sees all | sees only those opened to them |
| Access | grants it on the lesson's "Acceso" page | none by default |
| Students | list, add, change login or password, delete | none |
| Answers and homework | all students' | only their own |

Permissions are checked on the server: `requireUser` / `requireTeacher` (`server/src/auth.ts`) and the lesson access check in the routers. A student without access gets 404 for a lesson, not 403, so they cannot tell it exists.

## Access by chapters

A student has access to a lesson (`lesson_access`) and to some of its chapters (`chapter_ids`, a JSON array; `NULL` means the whole lesson, later chapters included). The teacher sets it in the "Acceso" dialog, a table of students and chapters; a newly added student starts with the first chapter. Chapters open by themselves (a class in a chapter, a shown exercise, homework) and are closed only by the teacher; answers stay.

The server enforces it (`server/src/chapterAccess.ts`): `GET /api/lessons/:id` sends a closed chapter as empty with `locked: true` and `exerciseCount` (the title stays, the exercises never leave the server), and answers to its blocks get 404. When a student's chapters change they get `lessonUpdated` with `reason: 'access'` and their page reloads the lesson at once.

## Sign-in and sessions

`server/src/auth.ts`:

- passwords are hashed with `scrypt` (`node:crypto`);
- a session is a random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production); only its SHA-256 is stored; it lives 30 days;
- changing a password or deleting a student ends all their sessions;
- after 10 failed sign-ins the pair "IP + login" is blocked for 15 minutes (per pair, so one student cannot lock out a class behind a shared school IP).

## Student groups

`server/src/groups.ts`, tables `student_groups` and `student_group_members`. A group is a named set of students: a shortcut for choosing several at once and the audience of a class (which gives it a board). Teachers manage groups at `/api/groups`; students do not see them.

- Choosing a group chooses its students at that moment. A class, homework and access hold students, so later changes of the group affect none of them, and every student has their own homework and answers.
- A student may be in several groups; a group may be empty. Names are unique, case-insensitively (409 `name_taken`). Deleting a student removes them from groups; deleting a group keeps its students.
- Students are chosen everywhere (a class, homework, access) with `client/src/components/StudentPicker.tsx`: search by group or login, groups with a three-state checkbox, then students.
- Groups live in `lessons.db`, not in a lesson.
