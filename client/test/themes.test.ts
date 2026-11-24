import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_THEME, THEME_IDS } from '@cuadrilo/shared/themes';
import { themes } from '../src/themes';
import { pickTheme } from '../src/themes/choice';

describe('pickTheme', () => {
  it('the server wins; before it answers, the one seen last time; then the default', () => {
    assert.equal(pickTheme('blush', 'classic'), 'blush');
    assert.equal(pickTheme(undefined, 'blush'), 'blush');
    assert.equal(pickTheme(undefined, null), DEFAULT_THEME);
  });

  it('an id that is not known (a removed theme, a damaged storage) is skipped', () => {
    assert.equal(pickTheme('gone', 'blush'), 'blush');
    assert.equal(pickTheme('gone', 'also-gone'), DEFAULT_THEME);
    assert.equal(pickTheme(7, {}), DEFAULT_THEME);
  });
});

describe('themes', () => {
  it('every id has a definition with a three-colour swatch, and no other exists', () => {
    assert.deepEqual(Object.keys(themes).sort(), [...THEME_IDS].sort());
    for (const id of THEME_IDS) assert.equal(themes[id].swatch.length, 3, id);
  });

  it('the default theme has a dark variant (the student chooses light or dark)', () => {
    assert.notEqual(themes[DEFAULT_THEME].lightOnly, true);
  });
});
