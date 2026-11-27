# Exercises

Components are in `client/src/exercises/`; the lesson is assembled from them in `client/src/lesson/LessonView.tsx`.

| Component | What it does |
|---|---|
| `Exercise` | the number, the task and its elements |
| `ImageBlock`, `TextBlock` | a picture; a text (paragraphs separated by an empty line) |
| `VideoBlock` | YouTube through `youtube-nocookie.com`: a preview first, the player loads on click |
| `AudioBlock` | pause, −5 s / +5 s (buttons and arrow keys), a slow mode 🐢 (0.75×); once started, a mini player stays at the top of the screen until closed |
| `EssayBlock` | a free answer up to 3000 characters (counter from 2700), saved as typed; not checked |
| `GapsBlock` | typed gaps `*answer*`, variants `*goes\|drives*`; checked on Enter or on leaving the field |
| `BuildWordBlock` | words built from shuffled letters; one pool and one check button per word |
| `DropdownGapsBlock` | native dropdowns `{a\|*b*\|c}`, checked at once |
| `DragGapsBlock` | words from a bank into gaps (same text format plus extra words); click works too |
| `MatchBlock` | every left word has a slot, the right words lie in a pile |
| `SortBlock` | words in a pile are dragged into columns; right ones lock green, wrong ones stay red and movable |
| `OrderBlock` | order the words of sentences; one check button per phrase; `¿ ¡` and final punctuation stay in place |
| `ChoiceBlock` | one right option: round buttons, checked on choosing; several: checkboxes ("elige todas las correctas") and a check button |
| `TrueFalseBlock` | statements with "Verdadero / Falso", checked on pressing |
| `SequenceBlock` | order whole sentences or lines by dragging (keyboard works); one check button |

Every answer is checked at once: right turns green and locks, wrong turns red and stays editable. When a whole element is green there is a short pure-CSS celebration (`Celebration` in `exercises/Exercise.tsx`, styles in `exercises.css`): confetti, fireworks, a comic-book word (`exercise.celebrationWords` in the i18n files), sparkles, balloons, falling glitter or a disco ball with beams of light, picked at random and never the same twice in a row. The system's reduced-motion setting is ignored on purpose. The teacher watching a student on the class page sees it too, but only when that student completes the element live (`isLive` of the block store, set by socket answers), not for answers loaded with the page or on switching students. The check runs in the browser (it is not an exam): case and extra spaces do not matter, diacritics do (`esta` ≠ `está`). Attempts are not counted. Dragging uses `exercises/placement.tsx`; the word bank stays pinned under the header while its exercise is on screen.

## View modes

One of three modes per exercise (`client/src/exercises/viewMode.ts`, `client/src/lesson/exerciseModes.tsx`), chosen with a switch in the exercise header (shown only where more than one is allowed) and never saved:

- **student:** as the student sees it. A teacher has it only in the editor's "Vista previa".
- **teacher** ("con respuestas"): read-only; the teacher's default on the class page, in the lesson view and in homework review. Every block shows the key in grey and the student's answer (green / red) if there is one. Nothing is sent or saved (`useBlockState` returns the block read-only; `hasState` says whether there is a student's state).
- **edit:** the exercise's forms (`ExerciseForms`) in the class and the lesson view, saved as in the editor (`useLessonDocument`). Students see the change after a reload and are told by `lessonUpdated`.

The teacher's comment under a block works in every mode.

## Block synchronisation

`client/src/exercises/sync.tsx`: every interactive block keeps its whole state in `useBlockState(id, …)`.

- For a student every change is sent whole ([Student answers](answers-and-homework.md#student-answers)): a gap on Enter or blur, dragging and word order on every move, an essay at most once a second.
- For the teacher on the class page the same components are read-only; a new state redraws only its own block.

## Layout

The phone/desktop decision is made in one place, `client/src/layout/viewport.ts`: code reads `useIsMobile()`, styles read `:root[data-viewport="mobile"]`. A new structural breakpoint goes there, not into a media query. Below 990 px there is a top header with a burger menu; from 990 px a left navbar that can collapse to icons (and does below 1200 px).
