import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { itemAt, SPIN_DURATION_MS } from '@cuadrilo/shared/wheel';

import { WheelStore } from '../../src/wheelStore';

/** The wheels of live classes in memory (src/wheelStore.ts), with a clock the test moves. */
describe('wheel store', () => {
  const make = () => {
    let now = 1_000_000;
    const store = new WheelStore(() => now, 60_000);
    return { store, advance: (ms: number) => (now += ms), now: () => now };
  };

  it('nothing before the first spin; then the latest spin of that class and block', () => {
    const { store } = make();
    assert.equal(store.get(1, 'w'), undefined);
    const { started, state } = store.spin(1, 'w', 8);
    assert.ok(started);
    assert.equal(state.seq, 1);
    assert.equal(store.get(1, 'w'), state);
    assert.equal(store.get(2, 'w'), undefined, 'another class has its own wheel');
    assert.equal(store.get(1, 'other'), undefined, 'another block too');
  });

  it('a wheel that is turning is not spun again: the call gets the spin in progress', () => {
    const { store, advance } = make();
    const first = store.spin(1, 'w', 8);
    advance(SPIN_DURATION_MS - 1);
    const second = store.spin(1, 'w', 8);
    assert.equal(second.started, false);
    assert.equal(second.state, first.state);
    advance(1);
    const third = store.spin(1, 'w', 8);
    assert.ok(third.started, 'when it has stopped it can be spun');
    assert.equal(third.state.seq, 2);
  });

  it('the next spin starts where the wheel rests, and the numbers stay small', () => {
    const { store, advance } = make();
    let rest = 0;
    for (let i = 0; i < 20; i += 1) {
      const { state } = store.spin(1, 'w', 12);
      assert.ok(Math.abs(state.spin.from - rest) < 1e-9, 'from where it stopped');
      assert.ok(state.spin.from >= 0 && state.spin.from < 360, 'kept under one turn');
      rest = ((state.spin.to % 360) + 360) % 360;
      assert.ok(itemAt(state.spin.to, 12) >= 0);
      advance(SPIN_DURATION_MS);
    }
  });

  it("forgetClass puts that class's wheels back at their start, and only its own", () => {
    const { store } = make();
    store.spin(1, 'a', 4);
    store.spin(1, 'b', 4);
    store.spin(2, 'a', 4);
    store.forgetClass(1);
    assert.equal(store.get(1, 'a'), undefined);
    assert.equal(store.get(1, 'b'), undefined);
    assert.ok(store.get(2, 'a'));
    assert.equal(store.size, 1);
  });

  it('what nobody touched for the time to live is dropped', () => {
    const { store, advance } = make();
    store.spin(1, 'w', 4);
    advance(59_000);
    assert.ok(store.get(1, 'w'));
    advance(2_000);
    assert.equal(store.get(1, 'w'), undefined);
    assert.equal(store.size, 0);
  });
});
