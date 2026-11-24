import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COMPACT_BELOW, MOBILE_BELOW, MOBILE_QUERY, narrowerThan } from '../src/layout/viewport';

/** The largest width (whole pixels) a "max-width" media query matches. */
const widestMatch = (query: string) => Math.floor(Number(/max-width: ([\d.]+)px/.exec(query)?.[1]));

describe('narrowerThan', () => {
  it('matches the widths below the limit and not the limit itself', () => {
    assert.equal(widestMatch(narrowerThan(990)), 989);
    assert.equal(widestMatch(narrowerThan(1200)), 1199);
  });
});

describe('the phone layout query', () => {
  it('is the phone layout on a phone and a tablet held upright, and desktop from the threshold up', () => {
    assert.equal(widestMatch(MOBILE_QUERY), MOBILE_BELOW - 1);
    assert.ok(widestMatch(MOBILE_QUERY) >= 844, 'a landscape phone is still the phone layout');
    assert.ok(MOBILE_BELOW <= 1024, 'a landscape tablet is desktop');
  });

  it('keeps the compact menu wider than the phone layout', () => {
    assert.ok(COMPACT_BELOW > MOBILE_BELOW);
  });
});
