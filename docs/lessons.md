# Lessons and the editor

## The format

A lesson is a JSON document in `lessons.content`. Types and helpers: `shared/src/lesson.ts`; validation (zod): `shared/src/lessonSchema.ts`.

```
lesson
└─ chapters (pages; the title is optional)
   └─ exercises (numbered across the lesson; a task and blocks)
      └─ blocks (21 types)
```

Chapters, exercises and blocks have stable `id`s: answers, homework and "show to the student" refer to them. Exercise numbers are not stored; they follow the position.

### Material blocks (nothing is answered)

- `text`: Markdown with GFM tables and coloured words `:red[words]` (palette in `shared/src/textColors.ts`; any other `:name` stays plain text; raw HTML is not rendered). The editor has a "Color del texto" button.
- `image`: `scale` is `s`, `m`, `l` (200, 360, 560 px) or `original`. A block without `scale` is `original`; new blocks get `m`.
- `compare`: two library pictures (`before`, `after`) with a slider; `orientation` is `vertical` (default) or `horizontal`; `scale` as for an image; `caption` optional.
- `audio`: a library file, with a slow mode.
- `video`: YouTube only (`youtubeId`), the link in any form; its start time is kept.
- `genially`: `{geniallyId, ratio?}` (`16:9` default, `4:3`, `1:1`, `3:4`). The editor takes the link or the embed code and keeps the 24-character id. The student presses a button first (Genially gets their IP, so the click is the consent). What the student does inside is not saved or graded. The app page has no CSP; if one is added it needs `frame-src https://view.genially.com`.
- `wheel`: 2 to 12 items (up to 80 characters each) in a fixed order. See [Classes](classes.md#the-wheel).

### Answer blocks (the student's state is saved)

- `essay`: a free answer, not checked.
- `gaps`, `drag-gaps`: gaps written `*answer*`, variants `*a|b*`.
- `dropdown-gaps`: `yo {*tengo*|tienes|tiene} un gato` (right option between asterisks; at least two options).
- `build-word`: `words: [{text, hint?}]`, up to 20, each up to 30 characters. Letters are shuffled; the student fills one cell per letter.
- `match`: pairs.
- `sort`: at least two groups with their words.
- `order`: `{text, hint?}` sentences; the student orders the words.
- `sequence`: at least two sentences or dialogue lines to put in order.
- `choice`: questions with options, the right ones `correct: true`; with several right ones the student picks all.
- `true-false`: statements.
- `dictation`: `{sentences: [{src, text}]}`, up to 30 (`src` is a library audio). Each sentence has its own check button. Words are compared whole, case-insensitively, accents and punctuation count (`shared/src/dictation.ts`). A missed word shows as a dashed "…", the right word is never shown. State: `{answers: string[], checked: boolean[]}`.
- `wordsearch`: 5 to 30 words (up to 20 letters each). The grid (8 to 20 cells) is generated once and stored (`shared/src/wordsearch.ts`), so every student gets the same one; `placements` say where each word lies. The teacher can edit letters that are not part of a word and shuffle again. State: `{found: [words]}`.
- `hotspots`: a picture with up to 30 zones (circles and rectangles, as fractions of the picture; `shared/src/hotspots.ts`). The student clicks the zones; state: `{found: [{id, x, y}]}`. The zones are drawn in the editor (`HotspotsEditor.tsx`). Assistants cannot draw zones: they leave a text block as a reminder.

A rule is a `text` block and a picture is an `image` block, placed in the exercise they belong to; there is no separate theory page.

## Saving

- `PUT /api/lessons/:id/content` validates the document, including the uniqueness of `id`s. A new lesson has one empty chapter.
- **Revision.** The document has a `rev` that grows on every save. A save names the revision it was made on; if the lesson changed meanwhile (another window, an assistant), the answer is 409 `lesson_changed`, and the editor rereads and saves again (up to twice). Nothing is merged: the newest edit wins. Lesson versions are not kept.
- Students who may open the lesson get `lessonUpdated { lessonId, rev }`: an open page keeps its old version and shows "La lección ha cambiado · Recargar".
- **Incomplete content is allowed**, since the editor saves every change. The player (`toPlayableBlock`) skips empty blocks and half-filled rows.

## Media

Files are in `data/media`, named by the SHA-256 of the content: `/media/<hash>.<ext>`. `image` and `audio` blocks accept only such links.

- **Upload:** `POST /api/media?name=<name>` (teacher). Images JPG, PNG, WebP, GIF up to 40 MB; audio MP3, M4A, OGG, WAV up to 30 MB; no SVG. The same file is stored once.
- **Compression** (`server/src/imageCompress.ts`, `sharp`): pictures become WebP quality 80, scaled to 1800 px on the longest side, transparency becomes white. Stored as they came: GIF, animated WebP, anything `sharp` cannot read, and files that would not get lighter. `sharp` has a prebuilt binary per system: run `npm ci` on the server, do not copy `node_modules`.
- **Library** ("Archivos", `/files`; `server/src/mediaLibrary.ts`): every file has a unique name (case-insensitive) that the editor and assistants use. A taken name is 409 `name_taken`; the same content under another name returns the existing entry. A file used by a lesson cannot be deleted (409 `media_in_use`). Files that no lesson uses are not removed automatically.
- **Serving:** `GET /media/<file>` to any signed-in user, with audio seeking and a forever cache.

## The editor

`/lessons/:id/edit/:chapter` (`client/src/pages/LessonEditor.tsx`, `client/src/editor/`).

- "Nueva lección" creates a lesson and opens the editor. A lesson is closed to students until the teacher grants access.
- Chapters are tabs. "+ Bloque" opens a dialog with a tile for each block type (`ExerciseForms.tsx`). Every chapter, exercise, block, pair and sentence has a 🗑.
- Exercises are reordered by their ⠿ handle (mouse or keyboard; `components/Sortable.tsx`) and moved to another chapter from their menu. Ids do not change, so answers and homework stay. A student who does not have the target chapter open loses access to the moved exercise until it is opened.
- "Editar / Vista previa" shows the forms or the exercise as the student sees it (answers are not saved).
- Images and audio upload as soon as a file is chosen; "Elegir de Archivos" picks one already uploaded.
- "Hacer hueco" wraps the selected words in `*…*`.
- **Autosave:** the document 0.8 s after the last edit, the title separately. One request at a time, retried with a growing pause. The header shows "Guardando… / Guardado / No se ha guardado · Reintentar". Closing a tab with unsaved changes asks first.

## The lesson page

`/lessons/:id/:chapter`: chapters are tabs with "Anterior / Siguiente"; the chapter is in the address, so it survives a reload.
