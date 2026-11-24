import {
  HOTSPOT_MIN_RADIUS,
  HOTSPOT_MIN_SIDE,
  HOTSPOTS_MAX,
  type Hotspot,
  insideHotspot,
} from '@cuadrilo/shared/hotspots';
import { newId } from '@cuadrilo/shared/lesson';
import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type PointerEvent, useRef, useState } from 'react';

import { zoneStyle } from '../exercises/HotspotsBlock';
import { t } from '../i18n';

type Shape = Hotspot['shape'];
interface Point {
  x: number;
  y: number;
}
type Gesture =
  | { kind: 'draw'; shape: Shape; id: string; from: Point }
  | { kind: 'move'; from: Point; orig: Hotspot }
  | { kind: 'resize'; orig: Hotspot };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A press that moves less than this (of the picture's width) is a click, not a drawing. */
const CLICK_DISTANCE = 0.01;
const DEFAULT_RADIUS = 0.06;
const DEFAULT_SIDE = 0.15;
const MAX_RADIUS = 0.5;

/** A zone drawn by dragging from `from` to `to` (a circle: the centre and its edge). */
function drawn(shape: Shape, id: string, from: Point, to: Point, aspect: number): Hotspot {
  if (shape === 'circle') {
    const r = clamp(Math.hypot(to.x - from.x, (to.y - from.y) * aspect), HOTSPOT_MIN_RADIUS, MAX_RADIUS);
    return { id, shape, x: from.x, y: from.y, r };
  }
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return {
    id,
    shape,
    x,
    y,
    w: clamp(Math.abs(to.x - from.x), HOTSPOT_MIN_SIDE, 1 - x),
    h: clamp(Math.abs(to.y - from.y), HOTSPOT_MIN_SIDE, 1 - y),
  };
}

/** The zone a click makes (centred on the click). */
function defaultZone(shape: Shape, id: string, at: Point): Hotspot {
  if (shape === 'circle') return { id, shape, x: at.x, y: at.y, r: DEFAULT_RADIUS };
  return {
    id,
    shape,
    x: clamp(at.x - DEFAULT_SIDE / 2, 0, 1 - DEFAULT_SIDE),
    y: clamp(at.y - DEFAULT_SIDE / 2, 0, 1 - DEFAULT_SIDE),
    w: DEFAULT_SIDE,
    h: DEFAULT_SIDE,
  };
}

function moved(zone: Hotspot, dx: number, dy: number): Hotspot {
  if (zone.shape === 'circle') return { ...zone, x: clamp(zone.x + dx, 0, 1), y: clamp(zone.y + dy, 0, 1) };
  return { ...zone, x: clamp(zone.x + dx, 0, 1 - zone.w), y: clamp(zone.y + dy, 0, 1 - zone.h) };
}

/** The zone with its handle (a circle's edge, a rectangle's bottom right corner) dragged to `to`. */
function resized(zone: Hotspot, to: Point, aspect: number): Hotspot {
  if (zone.shape === 'circle') {
    const r = clamp(Math.hypot(to.x - zone.x, (to.y - zone.y) * aspect), HOTSPOT_MIN_RADIUS, MAX_RADIUS);
    return { ...zone, r };
  }
  return {
    ...zone,
    w: clamp(to.x - zone.x, HOTSPOT_MIN_SIDE, 1 - zone.x),
    h: clamp(to.y - zone.y, HOTSPOT_MIN_SIDE, 1 - zone.y),
  };
}

/** Where a zone's resize handle is. */
const handleAt = (zone: Hotspot): Point =>
  zone.shape === 'circle' ? { x: zone.x + zone.r, y: zone.y } : { x: zone.x + zone.w, y: zone.y + zone.h };

/**
 * The teacher marks the zones on the picture: drag on it to draw one (a circle
 * from its centre, or a rectangle from corner to corner), a click makes a small
 * one; drag a zone to move it, its dot to resize it. The change is saved when
 * the pointer is released.
 */
export function HotspotsEditor({
  src,
  hotspots,
  onChange,
}: {
  src: string;
  hotspots: Hotspot[];
  onChange: (hotspots: Hotspot[]) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState<Shape>('circle');
  const [selected, setSelected] = useState<string>();
  const gesture = useRef<Gesture | undefined>(undefined);
  /** The zones while a drag is under way. */
  const [draft, setDraft] = useState<Hotspot[]>();
  const draftRef = useRef<Hotspot[] | undefined>(undefined);
  const shown = draft ?? hotspots;

  const show = (zones: Hotspot[] | undefined) => {
    draftRef.current = zones;
    setDraft(zones);
  };
  const where = (e: PointerEvent<HTMLElement>) => {
    const box = (stage.current as HTMLDivElement).getBoundingClientRect();
    return {
      x: clamp((e.clientX - box.left) / box.width, 0, 1),
      y: clamp((e.clientY - box.top) / box.height, 0, 1),
      aspect: box.height / box.width,
    };
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const at = where(e);
    const handleOf = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle;
    const resizing = handleOf ? hotspots.find((zone) => zone.id === handleOf) : undefined;
    const hit = [...hotspots].reverse().find((zone) => insideHotspot(zone, at.x, at.y, at.aspect));
    if (resizing) {
      gesture.current = { kind: 'resize', orig: resizing };
      setSelected(resizing.id);
    } else if (hit) {
      gesture.current = { kind: 'move', from: at, orig: hit };
      setSelected(hit.id);
    } else if (hotspots.length < HOTSPOTS_MAX) {
      gesture.current = { kind: 'draw', shape, id: newId(), from: at };
      setSelected(undefined);
    } else {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const at = where(e);
    if (g.kind === 'draw') {
      const far = Math.hypot(at.x - g.from.x, (at.y - g.from.y) * at.aspect) >= CLICK_DISTANCE;
      show(far ? [...hotspots, drawn(g.shape, g.id, g.from, at, at.aspect)] : undefined);
    } else if (g.kind === 'move') {
      const next = moved(g.orig, at.x - g.from.x, at.y - g.from.y);
      show(hotspots.map((zone) => (zone.id === g.orig.id ? next : zone)));
    } else {
      const next = resized(g.orig, at, at.aspect);
      show(hotspots.map((zone) => (zone.id === g.orig.id ? next : zone)));
    }
  };

  const up = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = undefined;
    if (!g) return;
    const result = draftRef.current;
    show(undefined);
    if (result) {
      onChange(result);
      if (g.kind === 'draw') setSelected(g.id);
    } else if (g.kind === 'draw') {
      // A click: a small zone there.
      onChange([...hotspots, defaultZone(g.shape, g.id, where(e))]);
      setSelected(g.id);
    }
  };

  const remove = () => {
    if (!selected) return;
    onChange(hotspots.filter((zone) => zone.id !== selected));
    setSelected(undefined);
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={500}>
            {t('editor.hotspots.shape')}
          </Text>
          <SegmentedControl
            size="xs"
            aria-label={t('editor.hotspots.shape')}
            value={shape}
            onChange={(value) => setShape(value as Shape)}
            data={[
              { value: 'circle', label: t('editor.hotspots.circle') },
              { value: 'rect', label: t('editor.hotspots.rect') },
            ]}
          />
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {t('editor.hotspots.count', { count: hotspots.length, max: HOTSPOTS_MAX })}
          </Text>
          <Button
            size="compact-xs"
            variant="default"
            color="red"
            leftSection={<IconTrash size={14} />}
            disabled={!selected}
            onClick={remove}
          >
            {t('editor.hotspots.delete')}
          </Button>
        </Group>
      </Group>
      <div
        ref={stage}
        className="hotspots-stage hotspots-editing"
        role="application"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={t('editor.hotspots.hint')}
      >
        <img src={src} alt="" draggable={false} />
        {shown.map((zone, index) => (
          <span
            key={zone.id}
            className={`hotspot-zone ${zone.shape} ${zone.id === selected ? 'selected' : ''}`}
            style={zoneStyle(zone)}
          >
            <span className="hotspot-number">{index + 1}</span>
          </span>
        ))}
        {shown
          .filter((zone) => zone.id === selected)
          .map((zone) => {
            const handle = handleAt(zone);
            return (
              <span
                key={zone.id}
                data-handle={zone.id}
                className="hotspot-handle"
                style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%` }}
              />
            );
          })}
      </div>
      <Text size="xs" c="dimmed">
        {t('editor.hotspots.hint')}
      </Text>
    </Stack>
  );
}
