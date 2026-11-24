import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { angleAt, isSpinOver, itemAt, POINTER_ANGLE, planSpin, SPIN_DURATION_MS } from '@cuadrilo/shared/wheel';

/** The arithmetic of the wheel (shared/src/wheel.ts): where it stops, and where it is on the way. */
describe('wheel', () => {
  it('the pointer stops inside the chosen item, never on a line between two', () => {
    for (const count of [2, 3, 7, 12]) {
      for (let item = 0; item < count; item += 1) {
        for (const inside of [0, 0.5, 0.999]) {
          // random() is called twice: which item, then where in it.
          const values = [(item + 0.5) / count, inside];
          const spin = planSpin(123.4, count, 0, () => values.shift() ?? 0);
          assert.equal(itemAt(spin.to, count), item, `${count} items, item ${item}, ${inside}`);
          const segment = 360 / count;
          const into = ((((POINTER_ANGLE - spin.to) % 360) + 360) % 360) - item * segment;
          assert.ok(into >= segment * 0.15 - 1e-9 && into <= segment * 0.85 + 1e-9, 'away from the edges');
        }
      }
    }
  });

  it('always turns forward, several turns, from wherever it rests', () => {
    for (const rest of [0, 90.5, 359.9, 720, 1234.5]) {
      const spin = planSpin(rest, 8, 0, () => 0.3);
      assert.ok(spin.to - rest >= 4 * 360, `from ${rest}`);
      assert.ok(spin.to - rest < 5 * 360 + 1e-9);
      assert.equal(spin.from, rest);
    }
  });

  it('every item is equally likely', () => {
    const count = 5;
    const hits = new Array<number>(count).fill(0);
    for (let i = 0; i < count * 2000; i += 1) hits[planSpin(0, count, 0).item] += 1;
    for (const hit of hits) assert.ok(Math.abs(hit - 2000) < 200, hits.join());
  });

  it('on the way: at the start, slowing down, at the end', () => {
    const spin = planSpin(0, 6, 1000);
    assert.equal(angleAt(spin, 0), 0, 'before it starts');
    assert.equal(angleAt(spin, 1000), 0);
    const quarter = angleAt(spin, 1000 + SPIN_DURATION_MS / 4);
    const half = angleAt(spin, 1000 + SPIN_DURATION_MS / 2);
    assert.ok(quarter > 0 && half > quarter && half < spin.to);
    assert.ok(half - quarter < quarter, 'it slows down: the second quarter turns less than the first');
    assert.equal(angleAt(spin, 1000 + SPIN_DURATION_MS), spin.to);
    assert.equal(angleAt(spin, 1000 + SPIN_DURATION_MS * 3), spin.to, 'and stays there');
    assert.ok(!isSpinOver(spin, 1000 + SPIN_DURATION_MS - 1));
    assert.ok(isSpinOver(spin, 1000 + SPIN_DURATION_MS));
  });

  it('two pages with the same spin and the same time see the same angle (a late one joins in the right place)', () => {
    const spin = planSpin(300, 10, 5000, () => 0.77);
    const copy = JSON.parse(JSON.stringify(spin)) as typeof spin;
    for (const now of [5000, 6200, 8333, 9999, 12000]) assert.equal(angleAt(copy, now), angleAt(spin, now));
  });
});
