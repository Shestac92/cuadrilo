import type { Messages } from './es';

/**
 * Interface texts in one language per installation: APP_LANG at build time
 * (client) and at start (server), es by default. es.ts is the reference; every
 * other language must have exactly the same keys (a type error otherwise).
 * Lesson content does not depend on it. Error codes of the API stay English.
 *
 * A text may have {name} placeholders and plural forms ({ one, other },
 * chosen by the `count` parameter with the language's plural rules).
 */
export type { Messages } from './es';

export const LANGS = ['es', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const isLang = (value: unknown): value is Lang => (LANGS as readonly unknown[]).includes(value);

export interface Plural {
  one: string;
  other: string;
}

/** Dotted keys of the texts: 'login.title', 'errors.lessonNotFound'. */
export type MessageKey<T = Messages, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : MessageKey<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** t('key', params) for one language; an unknown key comes back as is (visible, not a crash). */
export function createTranslator(messages: Messages, lang: Lang): Translate {
  const plurals = new Intl.PluralRules(lang);
  return (key, params = {}) => {
    let value: unknown = messages;
    for (const part of key.split('.')) value = (value as Record<string, unknown> | undefined)?.[part];
    if (value && typeof value === 'object' && 'other' in value) {
      const forms = value as Plural;
      value = plurals.select(Number(params.count ?? 0)) === 'one' ? forms.one : forms.other;
    }
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
  };
}

/** Validation messages in the shared request schemas are keys; the server translates them. */
export const messageKey = (key: MessageKey) => key;
