import messages from '@cuadrilo/messages';
import { createTranslator, type Lang } from '@cuadrilo/shared/i18n';
import type { Chapter } from '@cuadrilo/shared/lesson';

/**
 * Interface texts of the language this client was built with (APP_LANG,
 * vite.config.ts): t('login.submit'). Only that language is in the bundle.
 */
// Outside a Vite build (unit tests run by tsx) the constant is not defined: Spanish.
export const lang: Lang = typeof __APP_LANG__ === 'undefined' ? 'es' : __APP_LANG__;

export const t = createTranslator(messages, lang);

/** "El artículo indefinido", or "Capítulo 2" for a chapter without a title. */
export const chapterTitle = (chapter: Chapter, index: number) => chapter.title || t('lesson.chapter', { n: index + 1 });

/** Dates and times in the interface language. */
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(lang);
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString(lang);

/** A file size: "43 B", "85 kB", "1,2 MB". */
export function formatBytes(bytes: number): string {
  const [value, unit] =
    bytes < 1024
      ? [bytes, 'byte']
      : bytes < 1024 * 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes / (1024 * 1024), 'megabyte'];
  return new Intl.NumberFormat(lang, { style: 'unit', unit, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}
