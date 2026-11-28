/**
 * The demo lesson «Home, sweet home» (English, A2): three chapters, every kind of block once at least, so the
 * demo shows all of them. Its pictures and audio are in demo/media (pictures already passed through the
 * server's compression, server/src/imageCompress.ts, and the seed adds them through the media library, which
 * compresses again like any upload). The audio is recorded: the monologue and the three dictation sentences.
 */
import path from 'node:path';

import { CONTENT_VERSION, type LessonContent } from '@cuadrilo/shared/lesson';
import { generateWordsearch } from '@cuadrilo/shared/wordsearch';

export const DEMO_LESSON_TITLE = 'Home, sweet home';

export const DEMO_MEDIA_DIR = path.join(__dirname, 'media');
/** The files of the lesson, by what they are for. */
export const DEMO_MEDIA_FILES = {
  livingRoom: 'living-room.webp',
  kitchen: 'kitchen.webp',
  roomBefore: 'room-before.webp',
  roomAfter: 'room-after.webp',
  monologue: 'monologue.mp3',
  dictation1: 'dictation-1.mp3',
  dictation2: 'dictation-2.mp3',
  dictation3: 'dictation-3.mp3',
} as const;
/** /media/… of each file once it is in the media library. */
export type DemoMedia = Record<keyof typeof DEMO_MEDIA_FILES, string>;

/** A seeded random (mulberry32): the word-search grid comes out the same on every build. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDSEARCH_WORDS = ['sofa', 'lamp', 'shelf', 'table', 'chair', 'mirror', 'carpet', 'pillow'];

function wordsearch() {
  const result = generateWordsearch(WORDSEARCH_WORDS, seeded(2026));
  if (!result.ok) throw new Error(`the word search does not fit (${result.reason})`);
  return { words: WORDSEARCH_WORDS, grid: result.grid, placements: result.placements };
}

export const demoLessonContent = (media: DemoMedia): LessonContent => ({
  version: CONTENT_VERSION,
  chapters: [
    {
      id: 'ch-words',
      title: 'Words for the home',
      exercises: [
        {
          id: 'ex-sit',
          title: 'Find everything in the room you can sit on.',
          blocks: [
            {
              id: 'ex-sit-hotspots',
              type: 'hotspots',
              src: media.livingRoom,
              scale: 'l',
              hotspots: [
                { id: 'sofa-left', shape: 'rect', x: 0.223, y: 0.444, w: 0.127, h: 0.326 },
                { id: 'sofa-right', shape: 'rect', x: 0.657, y: 0.452, w: 0.118, h: 0.321 },
                { id: 'piano-bench', shape: 'rect', x: 0.215, y: 0.422, w: 0.075, h: 0.089 },
                { id: 'pouf', shape: 'rect', x: 0.563, y: 0.548, w: 0.077, h: 0.107 },
                { id: 'stool', shape: 'rect', x: 0.136, y: 0.793, w: 0.068, h: 0.111 },
              ],
            },
          ],
        },
        {
          id: 'ex-what',
          title: 'Match each word with what it does.',
          blocks: [
            {
              id: 'ex-what-match',
              type: 'match',
              pairs: [
                { left: 'fridge', right: 'It keeps food cold.' },
                { left: 'wardrobe', right: 'You keep your clothes in it.' },
                { left: 'mirror', right: 'You look at yourself in it.' },
                { left: 'oven', right: 'You cook food in it.' },
                { left: 'sofa', right: 'Two or three people can sit on it.' },
              ],
              distractors: ['You wash your hands in it.'],
            },
          ],
        },
        {
          id: 'ex-build',
          title: 'Read the hint and build the word.',
          blocks: [
            {
              id: 'ex-build-words',
              type: 'build-word',
              words: [
                { text: 'kitchen', hint: 'You cook in this room.' },
                { text: 'pillow', hint: 'You put your head on it at night.' },
                { text: 'armchair', hint: 'A soft chair for one person.' },
                { text: 'shower', hint: 'You stand in it and wash.' },
                { text: 'curtains', hint: 'You close them when it gets dark.' },
              ],
            },
          ],
        },
        {
          id: 'ex-find',
          title: 'Find eight things in the living room.',
          blocks: [{ id: 'ex-find-wordsearch', type: 'wordsearch', ...wordsearch() }],
        },
        {
          id: 'ex-rooms',
          title: 'Which room is it in? Put each thing in its room.',
          blocks: [
            {
              id: 'ex-rooms-sort',
              type: 'sort',
              groups: [
                { title: 'Kitchen', items: ['fridge', 'oven', 'dishwasher', 'kettle'] },
                { title: 'Bedroom', items: ['bed', 'wardrobe', 'pillow', 'alarm clock'] },
                { title: 'Bathroom', items: ['shower', 'bath', 'toilet', 'towel'] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'ch-where',
      title: 'Where is it?',
      exercises: [
        {
          id: 'ex-there',
          title: 'Read the rule and choose the right words.',
          blocks: [
            {
              id: 'ex-there-rule',
              type: 'text',
              markdown: `We use **there is** and **there are** to say what is in a place.

|          | one thing | two or more things |
|----------|-----------|--------------------|
| **+**    | There **is** a lamp. | There **are** two chairs. |
| **−**    | There **isn't** a TV. | There **aren't** any plants. |
| **?**    | **Is there** a sofa? | **Are there** any books? |

Where is it? **in** · **on** · **under** · **next to** · **between** · **behind** · **in front of**

> *There is a cat **on** the sofa and there are two books **under** the table.*`,
            },
            {
              id: 'ex-there-dropdown',
              type: 'dropdown-gaps',
              text: `In my living room there {*is*|are} a big sofa and there {is|*are*} two armchairs.
There {*isn't*|aren't} a TV, but there {is|*are*} a lot of books.
{Is|*Are*} there any plants? Yes, there {*are*|is}.`,
            },
          ],
        },
        {
          id: 'ex-prepositions',
          title: 'Where is the cat? Drag the right word.',
          blocks: [
            {
              id: 'ex-prepositions-drag',
              type: 'drag-gaps',
              text: `In the morning the cat sleeps *on* the bed.
Then it hides *under* the table.
At lunch it sits *next to* its bowl in the kitchen.
In the evening it lies *between* the two armchairs, *in front of* the fireplace.`,
              distractors: ['behind', 'above'],
            },
          ],
        },
        {
          id: 'ex-my-room',
          title: 'Write the missing words: is, are, isn’t or aren’t.',
          blocks: [
            {
              id: 'ex-my-room-gaps',
              type: 'gaps',
              text: `My bedroom is small. There *is* a bed and there *are* two windows.
There *isn't|is not* a desk, so I do my homework in the kitchen.
There *aren't|are not* any pictures on the walls yet.`,
            },
          ],
        },
        {
          id: 'ex-kitchen',
          title: 'Look at the kitchen and describe it. What is there? Where is it?',
          blocks: [
            { id: 'ex-kitchen-image', type: 'image', src: media.kitchen, alt: 'A big modern kitchen', scale: 'l' },
            { id: 'ex-kitchen-essay', type: 'essay', placeholder: 'There is a big fridge next to…' },
          ],
        },
        {
          id: 'ex-look',
          title: 'Look at the living room again. True or false?',
          blocks: [
            { id: 'ex-look-image', type: 'image', src: media.livingRoom, alt: 'A cosy living room', scale: 'm' },
            {
              id: 'ex-look-true-false',
              type: 'true-false',
              statements: [
                { text: 'There is a piano in the room.', true: true },
                { text: 'There are three sofas.', true: false },
                { text: 'There isn’t a TV.', true: true },
                { text: 'The teapot is on the table.', true: true },
                { text: 'There is a cat on the sofa.', true: false },
              ],
            },
          ],
        },
        {
          id: 'ex-grammar',
          title: 'Choose the right answer.',
          blocks: [
            {
              id: 'ex-grammar-choice',
              type: 'choice',
              questions: [
                {
                  question: 'There ___ some cups on the shelf.',
                  options: [{ text: 'is' }, { text: 'are', correct: true }, { text: 'be' }],
                },
                {
                  question: '___ there a bathroom upstairs?',
                  options: [{ text: 'Is', correct: true }, { text: 'Are' }, { text: 'Has' }],
                },
                {
                  question: 'The lamp is ___ the table — you can see it on top.',
                  options: [{ text: 'under' }, { text: 'on', correct: true }, { text: 'behind' }],
                },
                {
                  question: 'Which of these are rooms?',
                  options: [
                    { text: 'hall', correct: true },
                    { text: 'shelf' },
                    { text: 'bedroom', correct: true },
                    { text: 'carpet' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'ex-order',
          title: 'Put the words in order.',
          blocks: [
            {
              id: 'ex-order-sentences',
              type: 'order',
              sentences: [
                { text: 'There is a lamp next to the bed.' },
                { text: 'Are there any chairs in the kitchen?' },
                { text: 'My keys are under the sofa.', hint: 'Where are the keys?' },
              ],
            },
          ],
        },
        {
          id: 'ex-bedroom',
          title: 'Practise more: where are the things in this bedroom?',
          blocks: [{ id: 'ex-bedroom-genially', type: 'genially', geniallyId: '648e8db7eb7be60017190678' }],
        },
      ],
    },
    {
      id: 'ch-moving',
      title: 'Moving house',
      exercises: [
        {
          id: 'ex-anna',
          title: 'Listen to Anna and answer the questions.',
          blocks: [
            { id: 'ex-anna-audio', type: 'audio', src: media.monologue, title: 'Anna’s new flat' },
            {
              id: 'ex-anna-choice',
              type: 'choice',
              questions: [
                {
                  question: 'How many rooms are there in Anna’s flat?',
                  options: [{ text: 'one' }, { text: 'two', correct: true }, { text: 'three' }],
                },
                {
                  question: 'Where does the cat sleep?',
                  options: [{ text: 'on the bed' }, { text: 'on the balcony' }, { text: 'on the sofa', correct: true }],
                },
                {
                  question: 'What is Anna’s favourite place?',
                  options: [{ text: 'the kitchen' }, { text: 'the balcony', correct: true }, { text: 'the park' }],
                },
                {
                  question: 'What is the problem with the flat?',
                  options: [
                    { text: 'It is very dark.' },
                    { text: 'There isn’t a shower.' },
                    { text: 'There isn’t a lift.', correct: true },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'ex-dictation',
          title: 'Listen and write what Anna says.',
          blocks: [
            {
              id: 'ex-dictation-sentences',
              type: 'dictation',
              sentences: [
                { src: media.dictation1, text: 'Last month I moved to a new flat.' },
                { src: media.dictation2, text: 'There is a big window in the kitchen.' },
                { src: media.dictation3, text: 'My cat sleeps on the sofa all day.' },
              ],
            },
          ],
        },
        {
          id: 'ex-steps',
          title: 'Moving house: put the steps in order.',
          blocks: [
            {
              id: 'ex-steps-sequence',
              type: 'sequence',
              items: [
                'Find a new flat.',
                'Put your things in boxes.',
                'Carry the boxes to the van.',
                'Open the boxes in your new home.',
                'Invite your friends to a party.',
              ],
            },
          ],
        },
        {
          id: 'ex-new-look',
          title: 'Move the slider. What is different now? Write three sentences.',
          blocks: [
            {
              id: 'ex-new-look-compare',
              type: 'compare',
              before: media.roomBefore,
              after: media.roomAfter,
              caption: 'The same living room, before and after',
              scale: 'l',
            },
            { id: 'ex-new-look-essay', type: 'essay', placeholder: 'Now there is a sofa in front of…' },
          ],
        },
        {
          id: 'ex-video',
          title: 'Watch people describe their homes. Whose home is most like yours? Why?',
          blocks: [
            {
              id: 'ex-video-video',
              type: 'video',
              youtubeId: 'Te-UyphkKRk',
              title: 'Describing your home: Easy English Conversations (BBC Learning English)',
            },
            { id: 'ex-video-essay', type: 'essay', placeholder: 'My home is like… because…' },
          ],
        },
        {
          id: 'ex-talk',
          title: 'Spin the wheel and talk for one minute.',
          blocks: [
            {
              id: 'ex-talk-wheel',
              type: 'wheel',
              items: [
                'Your bedroom',
                'Your kitchen',
                'Your best room',
                'Your dream house',
                'Your street',
                'Your old home',
              ],
            },
          ],
        },
      ],
    },
  ],
});
