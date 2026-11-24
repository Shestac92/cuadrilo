import { geniallyEmbedUrl } from '@cuadrilo/shared/genially';
import { type CompareOrientation, type GeniallyRatio, type ImageScale, imageScaleOf } from '@cuadrilo/shared/lesson';
import { ActionIcon, Button, Text } from '@mantine/core';
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconX } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { createPortal } from 'react-dom';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';
import AudioPlayer, { RHAP_UI } from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

import { t } from '../i18n';

/** A picture at the size the teacher chose (`scale`, see IMAGE_SCALES); none: its own size, as before the setting existed. */
export function ImageBlock({
  src,
  alt,
  caption,
  scale,
}: {
  src: string;
  alt?: string;
  caption?: string;
  scale?: ImageScale;
}) {
  return (
    <figure className={`ex-image ex-image-${imageScaleOf({ scale })}`}>
      <img src={src} alt={alt ?? ''} loading="lazy" />
      {caption && (
        <Text component="figcaption" size="sm" c="dimmed">
          {caption}
        </Text>
      )}
    </figure>
  );
}

/** Two pictures with a slider between them (before / after), at the size the teacher chose. Nothing is answered. */
export function CompareBlock({
  before,
  after,
  orientation,
  caption,
  scale,
}: {
  before: string;
  after: string;
  orientation?: CompareOrientation;
  caption?: string;
  scale?: ImageScale;
}) {
  return (
    <figure className={`ex-image ex-compare ex-image-${imageScaleOf({ scale })}`}>
      <div className="ex-compare-frame">
        <ReactCompareSlider
          // 'horizontal' is a horizontal line, the slider moves up and down: the library calls that portrait.
          portrait={orientation === 'horizontal'}
          itemOne={<ReactCompareSliderImage src={before} alt="" />}
          itemTwo={<ReactCompareSliderImage src={after} alt="" />}
        />
      </div>
      {caption && (
        <Text component="figcaption" size="sm" c="dimmed">
          {caption}
        </Text>
      )}
    </figure>
  );
}

/**
 * YouTube in privacy-enhanced mode (youtube-nocookie.com): a thumbnail first,
 * the player is loaded only when the student presses play.
 */
export function VideoBlock({ youtubeId, title, start }: { youtubeId: string; title: string; start?: number }) {
  return (
    <div className="ex-video">
      <LiteYouTubeEmbed id={youtubeId} title={title} cookie={false} params={start ? { start } : undefined} />
    </div>
  );
}

/**
 * A Genially in a frame, loaded only after the student presses the button: Genially gets the
 * student's IP and sets its own cookies, so the click is the consent. The exercise is played inside it (what the student does there is not
 * saved here); only view.genially.com is ever embedded. The frame is a sandbox: the Genially
 * keeps its scripts, forms, pop-ups and fullscreen, and nothing else.
 */
export function GeniallyBlock({ geniallyId, ratio }: { geniallyId: string; ratio?: GeniallyRatio }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="ex-genially" style={{ aspectRatio: (ratio ?? '16:9').replace(':', ' / ') }}>
      {loaded ? (
        <iframe
          src={geniallyEmbedUrl(geniallyId)}
          title="Genially"
          allow="fullscreen; autoplay; clipboard-write"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        />
      ) : (
        <div className="ex-genially-consent">
          <Text size="sm" c="dimmed">
            {t('exercise.geniallyNotice')}
          </Text>
          <Button onClick={() => setLoaded(true)}>{t('exercise.geniallyLoad')}</Button>
        </div>
      )}
    </div>
  );
}

/** How far the jump buttons move, in seconds; the buttons' labels show it. */
const JUMP_SECONDS = 5;

/** Speed of the slow mode (🐢) for listening practice. */
export const SLOW_RATE = 0.75;

/**
 * The audio the mini player shows: the one started last. The mini player stays
 * until the student closes it — pausing is not the end of listening.
 */
type MiniTarget = { audio: HTMLAudioElement; title?: string };
let mini: MiniTarget | null = null;
const miniListeners = new Set<() => void>();
const setMini = (target: MiniTarget | null) => {
  mini = target;
  for (const listener of miniListeners) listener();
};
const subscribeMini = (listener: () => void) => {
  miniListeners.add(listener);
  return () => miniListeners.delete(listener);
};

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** Pinned to the top of the screen: pause and ∓JUMP_SECONDS without scrolling back to the player. */
function MiniPlayer({ audio, title }: MiniTarget) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const events = ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange'] as const;
    const update = () => redraw((n) => n + 1);
    for (const name of events) audio.addEventListener(name, update);
    return () => {
      for (const name of events) audio.removeEventListener(name, update);
    };
  }, [audio]);

  // Things pinned to the top (the word banks) start below the mini player.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const root = document.documentElement.style;
    const place = () => root.setProperty('--ex-pinned-top', `${element.getBoundingClientRect().bottom + 8}px`);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.removeProperty('--ex-pinned-top');
    };
  }, []);

  const jump = (seconds: number) => {
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), audio.duration || Number.MAX_VALUE);
  };
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

  return createPortal(
    <div className="ex-mini-player" ref={box}>
      <ActionIcon
        variant="filled"
        radius="xl"
        size="lg"
        onClick={() => (audio.paused ? audio.play() : audio.pause())}
        aria-label={audio.paused ? t('exercise.playAudio') : t('exercise.pauseAudio')}
      >
        {audio.paused ? <IconPlayerPlayFilled size={18} /> : <IconPlayerPauseFilled size={18} />}
      </ActionIcon>
      <button type="button" className="ex-audio-jump-button" onClick={() => jump(-JUMP_SECONDS)}>
        <span className="ex-audio-jump">−{JUMP_SECONDS} s</span>
      </button>
      <div className="ex-mini-player-body">
        {title && (
          <Text size="xs" c="dimmed" truncate>
            {title}
          </Text>
        )}
        <input
          type="range"
          className="ex-mini-player-seek"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(audio.currentTime, duration)}
          onChange={(event) => {
            audio.currentTime = Number(event.target.value);
          }}
          aria-label={`${clock(audio.currentTime)} / ${clock(duration)}`}
        />
      </div>
      <button type="button" className="ex-audio-jump-button" onClick={() => jump(JUMP_SECONDS)}>
        <span className="ex-audio-jump">+{JUMP_SECONDS} s</span>
      </button>
      <Text size="xs" c="dimmed" className="ex-mini-player-time">
        {clock(audio.currentTime)} / {clock(duration)}
      </Text>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={() => setMini(null)}
        aria-label={t('exercise.closeMiniPlayer')}
      >
        <IconX size={18} />
      </ActionIcon>
    </div>,
    document.body,
  );
}

/** Audio with pause, ±JUMP_SECONDS jumps (buttons and ←/→ keys) and a slow mode (🐢, 0.75×) for listening practice. */
export function AudioBlock({ src, title }: { src: string; title?: string }) {
  const player = useRef<AudioPlayer>(null);
  const [slow, setSlow] = useState(false);
  const rate = slow ? SLOW_RATE : 1;
  const current = useSyncExternalStore(subscribeMini, () => mini);
  const audioElement = player.current?.audio.current;

  // A block that goes away takes its audio with it.
  useEffect(() => {
    const audio = player.current?.audio.current;
    return () => {
      if (audio && mini?.audio === audio) setMini(null);
    };
  }, []);

  const toggleSlow = () => {
    const audio = player.current?.audio.current;
    if (audio) audio.playbackRate = slow ? 1 : SLOW_RATE;
    setSlow(!slow);
  };

  return (
    <div className="ex-audio">
      {title && (
        <Text size="sm" c="dimmed">
          {title}
        </Text>
      )}
      <AudioPlayer
        ref={player}
        src={src}
        preload="metadata"
        autoPlayAfterSrcChange={false}
        progressJumpSteps={{ backward: JUMP_SECONDS * 1000, forward: JUMP_SECONDS * 1000 }}
        showJumpControls
        i18nAriaLabels={{ rewind: `−${JUMP_SECONDS} s`, forward: `+${JUMP_SECONDS} s` }}
        customIcons={{
          rewind: <span className="ex-audio-jump">−{JUMP_SECONDS} s</span>,
          forward: <span className="ex-audio-jump">+{JUMP_SECONDS} s</span>,
        }}
        customAdditionalControls={[
          <button
            key="slow"
            type="button"
            className={`ex-audio-slow ${slow ? 'active' : ''}`}
            onClick={toggleSlow}
            title={slow ? t('exercise.normalSpeed') : t('exercise.slower')}
            aria-label={t('exercise.slower')}
            aria-pressed={slow}
          >
            🐢
          </button>,
        ]}
        onPlay={() => {
          const audio = player.current?.audio.current;
          if (audio) setMini({ audio, title });
        }}
        customVolumeControls={[RHAP_UI.VOLUME]}
        // The browser resets the rate when a new source loads.
        onLoadedMetaData={() => {
          const audio = player.current?.audio.current;
          if (audio) audio.playbackRate = rate;
        }}
      />
      {audioElement && current?.audio === audioElement && <MiniPlayer audio={audioElement} title={title} />}
    </div>
  );
}
