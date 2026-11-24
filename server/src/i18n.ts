import { createTranslator, isLang, type Lang } from '@cuadrilo/shared/i18n';
import en from '@cuadrilo/shared/i18n/en';
import es from '@cuadrilo/shared/i18n/es';

/**
 * The installation's language (APP_LANG, es by default): the language of
 * the API's messages. The client is built with the same variable.
 */
const requested = process.env.APP_LANG ?? 'es';
if (!isLang(requested)) throw new Error(`APP_LANG=${requested}: expected es or en`);

export const LANG: Lang = requested;
export const t = createTranslator({ es, en }[LANG], LANG);
