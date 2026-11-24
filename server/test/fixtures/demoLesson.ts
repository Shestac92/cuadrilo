import path from 'node:path';

import { CONTENT_VERSION, type LessonContent } from '@cuadrilo/shared/lesson';

/**
 * The test lesson «Los artículos»: three chapters, every block type. The tests
 * refer to its block ids (ex-un-una-gaps and the like). Its image and audio are
 * in test/fixtures/media; demoMedia.ts puts them into the media library.
 */
export const DEMO_LESSON_TITLE = 'Los artículos';

export interface DemoMedia {
  /** /media/… of the kitchen picture (png). */
  kitchen: string;
  /** /media/… of the listening exercise (m4a). */
  listening: string;
}

/** The files of the test lesson, put into the media library under these names. */
export const DEMO_MEDIA_DIR = path.join(__dirname, 'media');
export const DEMO_MEDIA_NAMES = { kitchen: 'cocina.png', listening: 'lucia.m4a' } as const;

export const demoLessonContent = (media: DemoMedia): LessonContent => ({
  version: CONTENT_VERSION,
  chapters: [
    {
      id: 'ch-indefinido',
      title: 'El artículo indefinido',
      exercises: [
        {
          id: 'ex-un-una',
          title: 'Lee la regla y completa con «un» o «una».',
          blocks: [
            {
              id: 'ex-un-una-rule',
              type: 'text',
              markdown: `Usamos el **artículo indefinido** cuando hablamos de algo **por primera vez** o de algo **no concreto**.

|            | masculino | femenino |
|------------|-----------|----------|
| singular   | **un** libro | **una** mesa |
| plural     | **unos** libros | **unas** mesas |

> *Tengo **un** perro y **una** gata.*`,
            },
            {
              id: 'ex-un-una-gaps',
              type: 'gaps',
              text: `En mi cocina hay *una* mesa, *un* reloj y *una* ventana grande.
Mi hermano tiene *un* coche y *una* moto.`,
            },
          ],
        },
        {
          id: 'ex-cocina',
          title: 'Mira la imagen y describe la cocina. Usa «un», «una», «unos», «unas».',
          blocks: [
            {
              id: 'ex-cocina-image',
              type: 'image',
              src: media.kitchen,
            },
            { id: 'ex-cocina-essay', type: 'essay', placeholder: 'En la cocina hay…' },
          ],
        },
      ],
    },
    {
      id: 'ch-definido',
      title: 'El artículo definido',
      exercises: [
        {
          id: 'ex-el-la',
          title: 'Lee la regla y arrastra el artículo correcto.',
          blocks: [
            {
              id: 'ex-el-la-rule',
              type: 'text',
              markdown: `Usamos el **artículo definido** cuando hablamos de algo **conocido** o **concreto**.

|            | masculino | femenino |
|------------|-----------|----------|
| singular   | **el** libro | **la** mesa |
| plural     | **los** libros | **las** mesas |

Recuerda: **a + el = al**, **de + el = del**.`,
            },
            {
              id: 'ex-el-la-drag',
              type: 'drag-gaps',
              text: `*El* sol sale por la mañana.
*Las* manzanas están en *la* mesa.
*Los* niños juegan en el parque.`,
              distractors: ['un', 'una'],
            },
          ],
        },
        {
          id: 'ex-escucha',
          title: 'Escucha el audio y completa la transcripción.',
          blocks: [
            { id: 'ex-escucha-audio', type: 'audio', src: media.listening },
            {
              id: 'ex-escucha-gaps',
              type: 'gaps',
              text: 'Me *llamo* Lucía y *vivo* en Madrid. Todas las mañanas tomo un *café* con leche y después voy al trabajo en *metro*. Por la tarde estudio inglés con mi *hermana*.',
            },
          ],
        },
      ],
    },
    {
      id: 'ch-practica',
      title: 'Práctica',
      exercises: [
        {
          id: 'ex-pares',
          title: 'Une cada palabra con su artículo.',
          blocks: [
            {
              id: 'ex-pares-match',
              type: 'match',
              pairs: [
                { left: 'manzana', right: 'la' },
                { left: 'libro', right: 'el' },
                { left: 'niños', right: 'los' },
                { left: 'casas', right: 'las' },
              ],
            },
          ],
        },
        {
          id: 'ex-orden',
          title: 'Ordena las palabras para formar frases.',
          blocks: [
            {
              id: 'ex-orden-order',
              type: 'order',
              sentences: [
                { text: 'Tengo un perro y una gata.', hint: 'У меня есть собака и кошка.' },
                { text: '¿Dónde están las llaves?' },
                { text: 'El libro está en la mesa.' },
              ],
            },
          ],
        },
        {
          id: 'ex-video',
          title: 'Mira el vídeo y escribe cinco frases con artículos.',
          blocks: [
            { id: 'ex-video-video', type: 'video', youtubeId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' },
            { id: 'ex-video-essay', type: 'essay', placeholder: 'En el vídeo hay un conejo…' },
          ],
        },
        {
          id: 'ex-test',
          title: 'Elige la respuesta correcta.',
          blocks: [
            {
              id: 'ex-test-choice',
              type: 'choice',
              questions: [
                {
                  question: '___ agua está fría.',
                  options: [{ text: 'La' }, { text: 'El', correct: true }, { text: 'Los' }],
                },
                {
                  question: '¿Qué palabras son femeninas?',
                  options: [{ text: 'mesa', correct: true }, { text: 'libro' }, { text: 'casa', correct: true }],
                },
              ],
            },
          ],
        },
        {
          id: 'ex-vf',
          title: '¿Verdadero o falso?',
          blocks: [
            {
              id: 'ex-vf-true-false',
              type: 'true-false',
              statements: [
                { text: '«Libro» es una palabra masculina.', true: true },
                { text: 'Decimos «la problema».', true: false },
              ],
            },
          ],
        },
        {
          id: 'ex-dialogo',
          title: 'Ordena el diálogo.',
          blocks: [
            {
              id: 'ex-dialogo-sequence',
              type: 'sequence',
              items: ['Hola, ¿tienes un bolígrafo?', 'Sí, tengo uno. Toma.', '¡Gracias!', 'De nada.'],
            },
          ],
        },
      ],
    },
  ],
});
