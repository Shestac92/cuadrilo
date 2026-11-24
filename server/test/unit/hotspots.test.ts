import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clickHotspots, type Hotspot, insideHotspot } from '@cuadrilo/shared/hotspots';
import { isAnswerType, toPlayableBlock } from '@cuadrilo/shared/lesson';
import { lessonContentSchema } from '@cuadrilo/shared/lessonSchema';

const circle: Hotspot = { id: 'c', shape: 'circle', x: 0.5, y: 0.5, r: 0.1 };
const rect: Hotspot = { id: 'r', shape: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 };

describe('hotspots', () => {
  it('a circle stays round on a wide picture: its radius is a fraction of the width', () => {
    // A picture twice as wide as it is tall (height / width = 0.5): 0.1 of the width is 0.2 of the height.
    assert.ok(insideHotspot(circle, 0.5, 0.5 + 0.19, 0.5));
    assert.ok(!insideHotspot(circle, 0.5, 0.5 + 0.21, 0.5));
    assert.ok(insideHotspot(circle, 0.5 + 0.09, 0.5, 0.5));
    assert.ok(!insideHotspot(circle, 0.5 + 0.11, 0.5, 0.5));
    assert.ok(!insideHotspot(circle, 0.58, 0.58, 1), 'the corner of its square is outside the circle');
  });

  it('a rectangle is its box, edges included', () => {
    assert.ok(insideHotspot(rect, 0.1, 0.1, 1));
    assert.ok(insideHotspot(rect, 0.3, 0.2, 1));
    assert.ok(!insideHotspot(rect, 0.31, 0.15, 1));
    assert.ok(!insideHotspot(rect, 0.2, 0.21, 1));
  });

  it('a click finds a zone, lands on a found one again, or misses', () => {
    const zones = [circle, rect];
    assert.deepEqual(clickHotspots(zones, new Set(), 0.5, 0.5, 1), { kind: 'found', hotspot: circle });
    assert.deepEqual(clickHotspots(zones, new Set(['c']), 0.5, 0.5, 1), { kind: 'again' });
    assert.deepEqual(clickHotspots(zones, new Set(['c']), 0.2, 0.15, 1), { kind: 'found', hotspot: rect });
    assert.deepEqual(clickHotspots(zones, new Set(), 0.9, 0.9, 1), { kind: 'miss' });
  });

  it('overlapping zones: a click finds the first one that was not found yet', () => {
    const under: Hotspot = { id: 'u', shape: 'circle', x: 0.5, y: 0.5, r: 0.2 };
    assert.deepEqual(clickHotspots([circle, under], new Set(), 0.5, 0.5, 1), { kind: 'found', hotspot: circle });
    assert.deepEqual(clickHotspots([circle, under], new Set(['c']), 0.5, 0.5, 1), { kind: 'found', hotspot: under });
  });

  it('is an answer block, shown with a picture and at least one zone', () => {
    assert.ok(isAnswerType('hotspots'));
    const block = (src: string, hotspots: Hotspot[]) => ({ id: 'h', type: 'hotspots' as const, src, hotspots });
    const src = `/media/${'a'.repeat(64)}.png`;
    assert.ok(toPlayableBlock(block(src, [circle])));
    assert.equal(toPlayableBlock(block(src, [])), null, 'no zones: nothing to find');
    assert.equal(toPlayableBlock(block('', [circle])), null, 'no picture');
  });

  it('the document schema takes zones inside the picture and nothing odd', () => {
    const src = `/media/${'a'.repeat(64)}.png`;
    const lesson = (hotspots: unknown[]) => ({
      version: 2,
      chapters: [
        { id: 'c1', exercises: [{ id: 'e1', title: 't', blocks: [{ id: 'b1', type: 'hotspots', src, hotspots }] }] },
      ],
    });
    assert.ok(lessonContentSchema.safeParse(lesson([circle, rect])).success);
    assert.ok(!lessonContentSchema.safeParse(lesson([{ ...circle, x: 1.2 }])).success, 'outside the picture');
    assert.ok(!lessonContentSchema.safeParse(lesson([{ ...circle, r: 0.001 }])).success, 'too small to hit');
    assert.ok(!lessonContentSchema.safeParse(lesson([{ id: 'x', shape: 'star', x: 0.5, y: 0.5 }])).success);
    const many = Array.from({ length: 31 }, (_, i) => ({ ...circle, id: `z${i}` }));
    assert.ok(!lessonContentSchema.safeParse(lesson(many)).success, 'more than 30 zones');
  });
});
