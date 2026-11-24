import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { forgetSolution } from '../src/exercises/savedState';
import { createSender, type SendState } from '../src/exercises/sync';

/**
 * The student's answer sender (src/exercises/sync.tsx): at most one request
 * per block in flight, the newest state goes next, intermediate ones are
 * skipped; failures are retried, rejections are not.
 */

type Result = Awaited<ReturnType<SendState>>;

/** A fake transport: records calls and lets the test answer each one. */
function fakeTransport() {
  const calls: { blockId: string; state: unknown; answer: (r: Result) => void }[] = [];
  const send: SendState = (blockId, state) => new Promise((answer) => calls.push({ blockId, state, answer }));
  return { calls, send };
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('answer sender', () => {
  it('sends a state right away', async () => {
    const { calls, send } = fakeTransport();
    const report = createSender(send);
    report('b1', { v: 1 }, 0);
    await tick();
    assert.deepEqual(
      calls.map((c) => c.state),
      [{ v: 1 }],
    );
  });

  it('one request per block in flight; the newest state goes next, intermediate ones are skipped', async () => {
    const { calls, send } = fakeTransport();
    const report = createSender(send);
    report('b1', 1, 0);
    await tick();
    report('b1', 2, 0);
    report('b1', 3, 0);
    await tick();
    assert.equal(calls.length, 1, 'waits for the first one');
    calls[0].answer('saved');
    await tick();
    assert.deepEqual(
      calls.map((c) => c.state),
      [1, 3],
    );
  });

  it('blocks do not wait for each other', async () => {
    const { calls, send } = fakeTransport();
    const report = createSender(send);
    report('b1', 'a', 0);
    report('b2', 'b', 0);
    await tick();
    assert.deepEqual(calls.map((c) => c.blockId).sort(), ['b1', 'b2']);
  });

  it('retries a failed state, unless a newer one is waiting', async () => {
    const { calls, send } = fakeTransport();
    const report = createSender(send, { retryMs: 10, maxRetryMs: 10 });
    report('b1', 1, 0);
    await tick();
    calls[0].answer('retry');
    await tick(30);
    assert.deepEqual(
      calls.map((c) => c.state),
      [1, 1],
      'the same state again',
    );

    report('b1', 2, 0);
    calls[1].answer('retry');
    await tick(30);
    assert.deepEqual(
      calls.map((c) => c.state),
      [1, 1, 2],
      'the newer state instead of the failed one',
    );
  });

  it('does not retry a rejected state', async () => {
    const { calls, send } = fakeTransport();
    const report = createSender(send, { retryMs: 10 });
    report('b1', 1, 0);
    await tick();
    calls[0].answer('rejected');
    await tick(40);
    assert.equal(calls.length, 1);
  });

  it('throttles drafts; flushAll sends what is waiting at once', async () => {
    const { calls, send } = fakeTransport();
    const sender = createSender(send);
    sender('essay', 'H', 1000);
    await tick();
    calls[0].answer('saved');
    sender('essay', 'Hola', 1000);
    await tick(20);
    assert.equal(calls.length, 1, 'the next draft waits for the throttle');
    sender.flushAll();
    await tick();
    assert.deepEqual(
      calls.map((c) => c.state),
      ['H', 'Hola'],
    );
  });
});

describe('answers saved with "Mostrar solución"', () => {
  it('the filled-in ones are unchecked, the rest stays as saved', () => {
    assert.deepEqual(forgetSolution({ values: ['a', 'b'], states: ['ok', 'solution'] }), {
      values: ['a', 'b'],
      states: ['ok', null],
    });
    assert.deepEqual(forgetSolution({ order: ['1', '0'], state: 'solution' }), { order: ['1', '0'], state: null });
    assert.deepEqual(forgetSolution({ words: [], placed: ['w1'], solution: true }), { words: [], placed: ['w1'] });
    assert.deepEqual(forgetSolution({ text: 'Hola', sent: false }), { text: 'Hola', sent: false });
    assert.equal(forgetSolution(null), null);
  });
});
