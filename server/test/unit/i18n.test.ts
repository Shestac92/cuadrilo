import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTranslator, type MessageKey, type Messages } from '@cuadrilo/shared/i18n';
import en from '@cuadrilo/shared/i18n/en';
import es from '@cuadrilo/shared/i18n/es';

/** The translator (shared/src/i18n) and the dictionaries. */
describe('i18n', () => {
  /** All dotted keys of a dictionary. */
  const keys = (messages: object, prefix = ''): string[] =>
    Object.entries(messages).flatMap(([k, v]) =>
      v && typeof v === 'object' && !('other' in v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it('every language has exactly the keys of es', () => {
    assert.deepEqual(keys(en).sort(), keys(es).sort());
  });

  it('no empty texts', () => {
    for (const [name, messages] of Object.entries({ es, en })) {
      const t = createTranslator(messages, name as 'es' | 'en');
      for (const key of keys(messages)) assert.ok(t(key as MessageKey, { count: 1 }).trim(), `${name}: ${key}`);
    }
  });

  it('placeholders, plural forms, unknown keys', () => {
    const messages = {
      ...es,
      test: { hello: 'Hola, {name}', words: { one: '{count} palabra', other: '{count} palabras' } },
    } as unknown as Messages;
    const t = createTranslator(messages, 'es') as (key: string, params?: Record<string, string | number>) => string;
    assert.equal(t('test.hello', { name: 'Ana' }), 'Hola, Ana');
    assert.equal(t('test.hello'), 'Hola, {name}', 'a missing parameter stays visible');
    assert.equal(t('test.words', { count: 1 }), '1 palabra');
    assert.equal(t('test.words', { count: 5 }), '5 palabras');
    assert.equal(t('test.nope'), 'test.nope');
  });
});
