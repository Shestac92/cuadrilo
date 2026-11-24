/** What the lesson_format tool tells the assistant: the format in short, with an example of every block. */
export const LESSON_FORMAT = `# Lesson format

A lesson has chapters (pages the student flips through; title optional). A chapter has exercises, numbered across the lesson. An exercise is a task (title, in the language of the lesson) and blocks, shown in order. There is no separate theory: a rule or a table is a text block in the exercise it belongs to.

Ids are made by the server; leave them out (in update_exercise, a block's id from get_lesson keeps the students' answers to it).

## Blocks
- text — Markdown: **bold**, *italics*, > quote, tables with |; coloured words :red[words] (colours: gray, red, pink, grape, violet, indigo, blue, cyan, teal, green, lime, orange; the brackets hold the words, which may be **bold** too; use a colour to draw the eye to a rule or an ending, not to decorate).
  {"type":"text","markdown":"| | masculino | femenino |\\n|---|---|---|\\n| singular | **un** libro | **una** mesa |"}
- image — a file of the media library by name (list_media); an optional caption; scale is how big it is shown: "s" (200 px wide), "m" (360, the default), "l" (560) or "original" (its own size). Photos and drawings that follow each other: leave the default, so that they look alike; a scan of a textbook page or a diagram that has to stay legible: "original".
  {"type":"image","file":"cocina.png","caption":"La cocina","scale":"m"}
- compare — two images of the media library (before / after) with a slider between them: a picture to explore, with a task or a rule around it; nothing is answered. "before" is shown left (or top), "after" right (or bottom); the second is fitted to the size of the first, so use pictures of the same proportions. orientation: "vertical" (the default: a vertical line, moved left and right) or "horizontal" (moved up and down); scale as for image, "l" by default.
  {"type":"compare","before":"cocina-vacia.png","after":"cocina-llena.png","caption":"La cocina antes y después"}
- hotspots — a picture with zones the student finds by clicking (graded, can be homework). You cannot create it: the zones are drawn by hand in the editor. For a new one, write {"type":"hotspots","description":"find the fruits in the kitchen picture"}: the lesson gets a text block that reminds the teacher to add the real block. A hotspots block that get_lesson shows you stays as it is when you give it back with its id, {"type":"hotspots","id":"<id from get_lesson>"}.
- audio — a media library file.
  {"type":"audio","file":"lucia.m4a","title":"Lucía habla de su día"}
- dictation — the student listens to each sentence (an audio file of the media library) and types it; one button checks all, the typed words are marked right or wrong. Case does not matter, accents and punctuation do. text is the right sentence exactly as it has to be typed. Graded, can be homework.
  {"type":"dictation","sentences":[{"file":"frase1.mp3","text":"Vengo del colegio."},{"file":"frase2.mp3","text":"¿Dónde está la biblioteca?"}]}
- wordsearch — a word search (graded, can be homework): 5 to 30 words (at most 20 letters each, spaces and hyphens inside a word are ignored); the server hides them in a grid, to the right or down, and fills the rest with letters of the words themselves. The student drags over the letters to mark a word. Give only the words; the teacher can reshuffle the grid and change letters in the editor. To keep a grid (and the teacher's letters) when updating, give the block back with its id and the same words.
  {"type":"wordsearch","words":["rojo","azul","verde","amarillo","negro","blanco"]}
- video — YouTube; start optional ("1:30" or seconds).
  {"type":"video","youtube":"https://youtu.be/aqz-KE-bpKQ","title":"Big Buck Bunny","start":"0:15"}
- genially — a Genially (genially.com) shown in a frame, as material: the exercise is played inside it, and what the student does there is NOT saved or graded here. Give the link of the published Genially (view.genially.com/…) or its embed code; ratio "16:9" (the default), "4:3", "1:1" or "3:4".
  {"type":"genially","link":"https://view.genially.com/6720c5563ae8449b359f1fd0"}
- essay — the student writes freely.
  {"type":"essay","placeholder":"En la cocina hay…"}
- gaps — the student types the answers: *answer*; several right answers *va|viene*. Lines break with a newline, paragraphs with an empty line.
  {"type":"gaps","text":"Mi hermano tiene *un* coche y *una* moto."}
- drag-gaps — the same, but the student drags words from a bank; distractors are extra wrong words.
  {"type":"drag-gaps","text":"*El* sol sale por *la* mañana.","distractors":["un","una"]}
- dropdown-gaps — the same as gaps, but the student picks one option from a dropdown: {option|*right option*|option}, the right one between asterisks (at least two options).
  {"type":"dropdown-gaps","text":"Yo {*tengo*|tienes|tiene} un gato."}
- build-word — words to build: each is shown as shuffled letters that the student puts into cells, one per letter; checked with a button. The optional hint (e.g. the word in the students' own language) is above the letters. Up to 20 words, each up to 30 characters (spaces separate the words of a phrase).
  {"type":"build-word","words":[{"text":"gato","hint":"кот"},{"text":"la casa"}]}
- match — pairs to join; distractors are extra options on the right.
  {"type":"match","pairs":[{"left":"libro","right":"el"},{"left":"casas","right":"las"}]}
- sort — words to sort into groups (columns): each group has a title and the words that belong to it; the student gets the words shuffled and drags each into its group. At least two groups.
  {"type":"sort","groups":[{"title":"Singular","items":["el coche","la iglesia"]},{"title":"Plural","items":["los tés","las camisetas"]}]}
- order — sentences in the right order; the student puts the words of each in order.
  {"type":"order","sentences":[{"text":"Tengo un perro y una gata.","hint":"У меня есть собака и кошка."},{"text":"¿Dónde están las llaves?"}]} (hint is optional: a light-grey line under the sentence, e.g. its translation, so the student sees if it is a question and in what order things go)
- choice — a test: questions with options; mark the right one(s) with "correct":true. One right option: the student picks one; several: the student must pick all of them.
  {"type":"choice","questions":[{"question":"En España en verano hace","options":[{"text":"mucho frío"},{"text":"calor","correct":true},{"text":"viento"}]}]}
- true-false — statements the student marks true or false.
  {"type":"true-false","statements":[{"text":"En el sur de España hace mucho frío.","true":false},{"text":"En verano hace calor.","true":true}]}
- sequence — whole sentences or lines of a dialogue in the right order (at least two); the student puts them in order. (order is for the words inside a sentence.)
  {"type":"sequence","items":["¡Uf! ¡Qué calor hace!","En agosto es normal.","Pues en mi país llueve en esta época."]}
- wheel — a wheel of fortune for speaking practice: 2 to 12 short questions or tasks (a few words each) in a fixed order; in a live class anyone spins it and everyone sees the same result. Nothing is answered in writing.
  {"type":"wheel","items":["¿Qué tiempo hace hoy?","¿Prefieres el calor o el frío?","Describe tu estación favorita"]}

## An exercise
{"title":"Lee la regla y completa con «un» o «una».","blocks":[{"type":"text","markdown":"Usamos **un** con masculinos y **una** con femeninos."},{"type":"gaps","text":"Hay *una* mesa y *un* reloj."}]}

## How to work
1. Look first: list_lessons shows what exists (do not create a second copy of a lesson that is already there); get_lesson shows a lesson with the ids you need to change it.
2. Media first: list_media shows the files by name. A picture or a recording you need but the library lacks: if the teacher gives a public https link, add it with upload_media_from_url (a short name with the extension, e.g. "tiempo-lluvia.jpg"); a file attached to the chat cannot reach the platform: ask the teacher to upload it on the Archivos page, then use its name.
3. Create or change in whole exercises. create_lesson takes up to 50 chapters; a chapter up to 200 exercises, an exercise up to 50 blocks. For a long lesson create the first chapters, then add_exercises / add_chapter for the rest. If a call reports problems, nothing was saved: fix exactly what it names and call again.
4. After creating or changing, read the lesson back with get_lesson when it matters, and give the teacher the editor link and a short list of what you made. They check it and give students access themselves: a new lesson is closed to students.

## Care with a lesson students already see
- list_lessons and get_lesson show studentsWithAccess. When it is above zero, every change is seen by those students at once; say so and ask the teacher before you change it.
- update_exercise replaces the exercise whole: first get the exercise with get_lesson, change what is needed and give the other blocks back with their ids, so that the students' answers to them stay. A block given without its id is a new one: its old answers are lost.
- delete_exercise and delete_chapter remove the students' answers too, and cannot be undone: ask the teacher first, name what will go.
- Never rewrite or delete what the teacher did not ask about.

## Choosing blocks
- Material (nothing is answered): text, image, compare, audio, video, genially, wheel. Use them to explain, show and start a conversation.
- Answered by the student: essay, dictation, wordsearch, gaps, drag-gaps, dropdown-gaps, build-word, match, sort, order, choice, true-false, sequence, hotspots. Pick by what is practised:
  - vocabulary: match, sort, build-word, wordsearch, wheel (speaking);
  - grammar and forms: gaps (the student writes the form), dropdown-gaps (a choice between forms), drag-gaps (words from a bank), order (word order in a sentence), sequence (a dialogue in order);
  - reading and listening: text or audio or video + choice, true-false;
  - spelling and listening: dictation;
  - writing and speaking: essay, wheel.
- An exercise is one task: a text with the rule and a short practice block under it work well together. Vary the types inside a lesson.
- A Genially, a video or an image is not graded: what the student does inside it is not saved.

## The shape of a lesson
- A chapter is a page: a rule or a text and the practice on it; 3 to 8 exercises are plenty. A lesson of several chapters goes from easy to hard: recognise (choice, match), then produce (gaps, order), then free writing or speaking (essay, wheel).
- Write the task in the language of the lesson, short and as an instruction ("Completa con «un» o «una».").
- Keep the source's language and wording for texts, tasks and answers when you convert a document; do not translate them or correct the teacher's choices. If something could not be carried over (a game, an animation, a type with no block), say so to the teacher in your answer.
- Texts and answers are for people: check the accents and the special punctuation of the language, and that every gap has its right answer.

## What you cannot do
Delete a whole lesson, give students access, set homework, manage classes and students: the teacher does that in the platform. Draw hotspots zones, move the order of exercises (add and replace instead), upload a file from the chat.
`;
