import { clickHotspots, type Hotspot, type HotspotsState } from '@cuadrilo/shared/hotspots';
import { type ImageScale, imageScaleOf } from '@cuadrilo/shared/lesson';
import { Text } from '@mantine/core';
import { IconCircleCheckFilled, IconXboxXFilled } from '@tabler/icons-react';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';

import { t } from '../i18n';
import { Celebration } from './Exercise';
import { useBlockState } from './sync';
import { useViewMode } from './viewMode';

const MISS_FLASH_MS = 700;

/** Where a zone is drawn over the picture (percent): a circle by its centre, a rectangle by its corner. */
export const zoneStyle = (hotspot: Hotspot) =>
  hotspot.shape === 'circle'
    ? { left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%`, width: `${hotspot.r * 200}%` }
    : {
        left: `${hotspot.x * 100}%`,
        top: `${hotspot.y * 100}%`,
        width: `${hotspot.w * 100}%`,
        height: `${hotspot.h * 100}%`,
      };

/**
 * A picture with zones to find. The student clicks the picture: a click in a
 * zone leaves a green tick where it was made, a click outside flashes a red
 * cross (a miss is not saved). The zones are not drawn for the student. The
 * teacher's view shows all the zones as the key, the found ones green.
 */
export function HotspotsBlock({
  id,
  src,
  hotspots,
  caption,
  scale,
}: {
  id: string;
  src: string;
  hotspots: Hotspot[];
  caption?: string;
  scale?: ImageScale;
}) {
  const [state, setState, readOnly] = useBlockState<HotspotsState>(id, () => ({ found: [] }));
  const teacherView = useViewMode() === 'teacher';
  const [miss, setMiss] = useState<{ x: number; y: number; n: number }>();

  // A zone the teacher has deleted since is not counted.
  const found = useMemo(
    () => state.found.filter((mark) => hotspots.some((hotspot) => hotspot.id === mark.id)),
    [state.found, hotspots],
  );
  const foundIds = useMemo(() => new Set(found.map((mark) => mark.id)), [found]);
  const done = found.length >= hotspots.length;

  useEffect(() => {
    if (!miss) return;
    const timer = setTimeout(() => setMiss(undefined), MISS_FLASH_MS);
    return () => clearTimeout(timer);
  }, [miss]);

  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (readOnly || done) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const result = clickHotspots(hotspots, foundIds, x, y, box.height / box.width);
    if (result.kind === 'found') {
      const hotspot = result.hotspot;
      setState((s) => ({ found: [...s.found, { id: hotspot.id, x, y }] }));
    } else if (result.kind === 'miss') {
      setMiss({ x, y, n: Date.now() });
    }
  };

  return (
    <figure className={`ex-image ex-hotspots ex-image-${imageScaleOf({ scale })}`}>
      <Text size="sm" fw={500} mb={6} aria-live="polite">
        {done
          ? t('exercise.hotspotsDone')
          : t('exercise.hotspotsFound', { found: found.length, total: hotspots.length })}
      </Text>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: finding a place on a picture is a pointing task; there is no keyboard way. */}
      <div
        className={`hotspots-stage ex-interactive ${readOnly || done ? '' : 'pointing'}`}
        onClick={click}
        role="img"
        aria-label={t('exercise.hotspotsHint')}
      >
        <img src={src} alt="" draggable={false} loading="lazy" />
        {teacherView &&
          hotspots.map((hotspot) => (
            <span
              key={hotspot.id}
              className={`hotspot-zone ${hotspot.shape} key ${foundIds.has(hotspot.id) ? 'found' : ''}`}
              style={zoneStyle(hotspot)}
              title={t('viewMode.hotspot')}
            />
          ))}
        {found.map((mark) => (
          <IconCircleCheckFilled
            key={mark.id}
            className="hotspot-mark"
            size={28}
            style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
          />
        ))}
        {miss && (
          <IconXboxXFilled
            key={miss.n}
            className="hotspot-miss"
            size={28}
            style={{ left: `${miss.x * 100}%`, top: `${miss.y * 100}%` }}
          />
        )}
        <Celebration active={!readOnly && done} />
      </div>
      {caption && (
        <Text component="figcaption" size="sm" c="dimmed">
          {caption}
        </Text>
      )}
    </figure>
  );
}
