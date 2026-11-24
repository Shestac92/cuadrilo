import { AUDIO_TYPES, IMAGE_TYPES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, type MediaKind } from '@cuadrilo/shared/api';
import { DICTATION_MAX_SENTENCES, DICTATION_TEXT_MAX } from '@cuadrilo/shared/dictation';
import { geniallyEmbedUrl, parseGeniallyLink } from '@cuadrilo/shared/genially';
import {
  type Block,
  type BlockOf,
  BUILD_WORD_MAX_LENGTH,
  BUILD_WORD_MAX_WORDS,
  type CompareOrientation,
  DEFAULT_IMAGE_SCALE,
  DROPDOWN_MARKUP,
  GAP_MARKUP,
  GENIALLY_RATIOS,
  type GeniallyRatio,
  type ImageScale,
  imageScaleOf,
  newId,
  parseDropdown,
} from '@cuadrilo/shared/lesson';
import { WHEEL_ITEM_MAX, WHEEL_MAX_ITEMS } from '@cuadrilo/shared/lessonSchema';
import { TEXT_COLORS, type TextColor } from '@cuadrilo/shared/textColors';
import {
  generateWordsearch,
  gridRows,
  isGridCurrent,
  lockedCells,
  usableWords,
  WORDSEARCH_INPUT_MAX,
  WORDSEARCH_MAX_WORDS,
  WORDSEARCH_MIN_WORDS,
  WORDSEARCH_WORD_MAX,
} from '@cuadrilo/shared/wordsearch';
import { formatTime, parseTime, parseYoutubeLink } from '@cuadrilo/shared/youtube';
import {
  ActionIcon,
  Button,
  Checkbox,
  ColorSwatch,
  FileButton,
  Group,
  Paper,
  Popover,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import { IconColorSwatchOff, IconFolder, IconPalette, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api';
import { t } from '../i18n';
import { makeGap } from './fields';
import { HotspotsEditor } from './HotspotsEditor';
import { MediaPicker } from './MediaPicker';
import { colorText, type Edit, uncolorText } from './textColor';

type BlockChanges = Partial<Block>;

interface FormProps<T extends Block['type']> {
  block: BlockOf<T>;
  onChange: (changes: Partial<BlockOf<T>>) => void;
  /** Just added: the first field gets the focus. */
  autoFocus?: boolean;
}

/** A new block of the type, empty (the player shows it once it is filled in). */
export function newBlock(type: Block['type']): Block {
  const id = newId();
  switch (type) {
    case 'text':
      return { id, type, markdown: '' };
    case 'image':
      return { id, type, src: '', scale: DEFAULT_IMAGE_SCALE };
    case 'compare':
      return { id, type, before: '', after: '', scale: 'l' };
    case 'hotspots':
      return { id, type, src: '', hotspots: [], scale: 'l' };
    case 'video':
      return { id, type, youtubeId: '', title: '' };
    case 'genially':
      return { id, type, geniallyId: '' };
    case 'dictation':
      return { id, type, sentences: [] };
    case 'wordsearch':
      return { id, type, words: [], grid: [], placements: [] };
    case 'audio':
      return { id, type, src: '' };
    case 'essay':
      return { id, type };
    case 'gaps':
      return { id, type, text: '' };
    case 'drag-gaps':
      return { id, type, text: '', distractors: [] };
    case 'dropdown-gaps':
      return { id, type, text: '' };
    case 'build-word':
      return { id, type, words: [{ text: '' }] };
    case 'match':
      return { id, type, pairs: [{ left: '', right: '' }] };
    case 'sort':
      return {
        id,
        type,
        groups: [
          { title: '', items: [] },
          { title: '', items: [] },
        ],
      };
    case 'order':
      return { id, type, sentences: [{ text: '' }] };
    case 'choice':
      return { id, type, questions: [{ question: '', options: [{ text: '' }, { text: '' }] }] };
    case 'true-false':
      return { id, type, statements: [{ text: '', true: true }] };
    case 'sequence':
      return { id, type, items: ['', ''] };
    case 'wheel':
      return { id, type, items: ['', ''] };
  }
}

/** The fields of a block; every edit goes out as the changed fields of the block. */
export function BlockForm({
  block,
  onChange,
  autoFocus,
}: {
  block: Block;
  onChange: (changes: BlockChanges) => void;
  autoFocus?: boolean;
}) {
  switch (block.type) {
    case 'text':
      return <TextForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'image':
      return <ImageForm block={block} onChange={onChange} />;
    case 'compare':
      return <CompareForm block={block} onChange={onChange} />;
    case 'hotspots':
      return <HotspotsForm block={block} onChange={onChange} />;
    case 'video':
      return <VideoForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'genially':
      return <GeniallyForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'dictation':
      return <DictationForm block={block} onChange={onChange} />;
    case 'wordsearch':
      return <WordsearchForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'audio':
      return <AudioForm block={block} onChange={onChange} />;
    case 'essay':
      return <EssayForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'gaps':
    case 'drag-gaps':
      return <GapsForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'build-word':
      return <BuildWordForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'dropdown-gaps':
      return <DropdownGapsForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'match':
      return <MatchForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'sort':
      return <SortForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'order':
      return <OrderForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'choice':
      return <ChoiceForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'true-false':
      return <TrueFalseForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'sequence':
      return <SequenceForm block={block} onChange={onChange} autoFocus={autoFocus} />;
    case 'wheel':
      return <WheelForm block={block} onChange={onChange} autoFocus={autoFocus} />;
  }
}

function TextForm({ block, onChange, autoFocus }: FormProps<'text'>) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  /** Puts the change in the text and the selection where the teacher left it (the words stay selected). */
  const apply = (edit: Edit) => {
    onChange({ markdown: edit.text });
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(edit.start, edit.end);
    });
  };
  const selection = () => ({ start: textarea.current?.selectionStart ?? 0, end: textarea.current?.selectionEnd ?? 0 });

  return (
    <Stack gap="xs">
      <Textarea
        ref={textarea}
        aria-label={t('editor.text.label')}
        description={t('editor.text.hint')}
        value={block.markdown}
        onChange={(e) => onChange({ markdown: e.currentTarget.value })}
        autosize
        minRows={3}
        maxLength={20_000}
        autoFocus={autoFocus}
      />
      <TextColorButton
        onPick={(color) => {
          const { start, end } = selection();
          apply(colorText(block.markdown, start, end, color, t('editor.text.colorPlaceholder')));
        }}
        onClear={() => {
          const { start, end } = selection();
          const edit = uncolorText(block.markdown, start, end);
          if (edit) apply(edit);
        }}
      />
    </Stack>
  );
}

/** "A": a palette to colour the selected words (the Markdown is written by colorText). */
function TextColorButton({ onPick, onClear }: { onPick: (color: TextColor) => void; onClear: () => void }) {
  const theme = useMantineTheme();
  const [opened, setOpened] = useState(false);
  return (
    <Group gap="sm">
      <Popover opened={opened} onChange={setOpened} position="bottom-start" withArrow shadow="md">
        <Popover.Target>
          {/* mousedown would take the focus (and the selection) away from the text */}
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPalette size={16} />}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpened((o) => !o)}
          >
            {t('editor.text.color')}
          </Button>
        </Popover.Target>
        <Popover.Dropdown onMouseDown={(e) => e.preventDefault()}>
          <SimpleGrid cols={6} spacing={6}>
            {TEXT_COLORS.map((color) => (
              <Tooltip key={color} label={t(`editor.text.colors.${color}`)}>
                <ColorSwatch
                  component="button"
                  type="button"
                  color={theme.colors[color][6]}
                  size={26}
                  aria-label={t(`editor.text.colors.${color}`)}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    onPick(color);
                    setOpened(false);
                  }}
                />
              </Tooltip>
            ))}
          </SimpleGrid>
          <Button
            mt="xs"
            size="compact-xs"
            variant="subtle"
            fullWidth
            leftSection={<IconColorSwatchOff size={14} />}
            onClick={() => {
              onClear();
              setOpened(false);
            }}
          >
            {t('editor.text.noColor')}
          </Button>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}

const MEDIA = {
  image: {
    accept: Object.values(IMAGE_TYPES).join(','),
    maxBytes: MAX_IMAGE_BYTES,
    formats: 'editor.upload.imageFormats',
    wrongKind: 'editor.upload.wrongKind',
  },
  audio: {
    accept: Object.values(AUDIO_TYPES).join(','),
    maxBytes: MAX_AUDIO_BYTES,
    formats: 'editor.upload.audioFormats',
    wrongKind: 'editor.upload.wrongKindAudio',
  },
} as const;

/**
 * Upload of an image or audio file: the button or a drop on the area. The file
 * goes to POST /api/media at once; the block keeps its /media/… URL.
 */
function MediaUpload({
  kind,
  hasFile,
  onUploaded,
}: {
  kind: MediaKind;
  hasFile: boolean;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const media = MEDIA[kind];

  const upload = async (file: File | null | undefined) => {
    if (!file) return;
    setError(undefined);
    // Checked here too, so a big file is not sent for nothing.
    if (file.size > media.maxBytes) return setError(t('errors.mediaTooLarge'));
    setUploading(true);
    try {
      const uploaded = await api.uploadMedia(file);
      if (uploaded.kind === kind) onUploaded(uploaded.url);
      else setError(t(media.wrongKind));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping a file is a mouse shortcut; the button inside is the accessible way to upload.
    <div
      className={`editor-drop ${isDragOver ? 'editor-drop-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        void upload(e.dataTransfer.files[0]);
      }}
    >
      <Group gap="sm">
        <FileButton onChange={(file) => void upload(file)} accept={media.accept}>
          {(props) => (
            <Button {...props} variant="default" size="xs" loading={uploading} leftSection={<IconUpload size={14} />}>
              {hasFile ? t('editor.upload.replace') : t('editor.upload.choose')}
            </Button>
          )}
        </FileButton>
        <Button variant="subtle" size="xs" leftSection={<IconFolder size={14} />} onClick={() => setIsPickerOpen(true)}>
          {t('editor.upload.fromLibrary')}
        </Button>
        <Text size="xs" c="dimmed">
          {uploading ? t('editor.upload.uploading') : `${t('editor.upload.drop')} · ${t(media.formats)}`}
        </Text>
      </Group>
      <MediaPicker
        kind={kind}
        opened={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onPick={(file) => {
          setIsPickerOpen(false);
          setError(undefined);
          onUploaded(file.url);
        }}
      />
      {error && (
        <Text size="sm" c="red" mt={6}>
          {error}
        </Text>
      )}
    </div>
  );
}

function ImageForm({ block, onChange }: FormProps<'image'>) {
  return (
    <Stack gap="sm">
      {block.src && <img src={block.src} alt="" className="editor-image" />}
      <MediaUpload kind="image" hasFile={!!block.src} onUploaded={(src) => onChange({ src })} />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t('editor.image.scale')}
        </Text>
        {/* A block saved before the setting existed has none: it is shown at its own size. */}
        <SegmentedControl
          size="xs"
          aria-label={t('editor.image.scale')}
          value={imageScaleOf(block)}
          onChange={(scale) => onChange({ scale: scale as ImageScale })}
          data={[
            { value: 's', label: t('editor.image.scaleS') },
            { value: 'm', label: t('editor.image.scaleM') },
            { value: 'l', label: t('editor.image.scaleL') },
            { value: 'original', label: t('editor.image.scaleOriginal') },
          ]}
        />
        <Text size="xs" c="dimmed">
          {t('editor.image.scaleHint')}
        </Text>
      </Stack>
      <TextInput
        label={t('editor.image.caption')}
        value={block.caption ?? ''}
        onChange={(e) => onChange({ caption: e.currentTarget.value || undefined })}
        maxLength={500}
      />
    </Stack>
  );
}

function HotspotsForm({ block, onChange }: FormProps<'hotspots'>) {
  return (
    <Stack gap="sm">
      <MediaUpload kind="image" hasFile={!!block.src} onUploaded={(src) => onChange({ src })} />
      {block.src && (
        <HotspotsEditor src={block.src} hotspots={block.hotspots} onChange={(hotspots) => onChange({ hotspots })} />
      )}
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t('editor.image.scale')}
        </Text>
        <SegmentedControl
          size="xs"
          aria-label={t('editor.image.scale')}
          value={imageScaleOf(block)}
          onChange={(scale) => onChange({ scale: scale as ImageScale })}
          data={[
            { value: 's', label: t('editor.image.scaleS') },
            { value: 'm', label: t('editor.image.scaleM') },
            { value: 'l', label: t('editor.image.scaleL') },
            { value: 'original', label: t('editor.image.scaleOriginal') },
          ]}
        />
      </Stack>
      <TextInput
        label={t('editor.image.caption')}
        value={block.caption ?? ''}
        onChange={(e) => onChange({ caption: e.currentTarget.value || undefined })}
        maxLength={500}
      />
    </Stack>
  );
}

function CompareForm({ block, onChange }: FormProps<'compare'>) {
  const pictures = [
    { key: 'before', label: t('editor.compare.first'), src: block.before },
    { key: 'after', label: t('editor.compare.second'), src: block.after },
  ] as const;
  return (
    <Stack gap="sm">
      {pictures.map(({ key, label, src }) => (
        <Stack key={key} gap={4}>
          <Text size="sm" fw={500}>
            {label}
          </Text>
          {src && <img src={src} alt="" className="editor-image" />}
          <MediaUpload kind="image" hasFile={!!src} onUploaded={(url) => onChange({ [key]: url })} />
        </Stack>
      ))}
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t('editor.compare.orientation')}
        </Text>
        <SegmentedControl
          size="xs"
          aria-label={t('editor.compare.orientation')}
          value={block.orientation ?? 'vertical'}
          onChange={(orientation) => onChange({ orientation: orientation as CompareOrientation })}
          data={[
            { value: 'vertical', label: t('editor.compare.vertical') },
            { value: 'horizontal', label: t('editor.compare.horizontal') },
          ]}
        />
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          {t('editor.image.scale')}
        </Text>
        <SegmentedControl
          size="xs"
          aria-label={t('editor.image.scale')}
          value={imageScaleOf(block)}
          onChange={(scale) => onChange({ scale: scale as ImageScale })}
          data={[
            { value: 's', label: t('editor.image.scaleS') },
            { value: 'm', label: t('editor.image.scaleM') },
            { value: 'l', label: t('editor.image.scaleL') },
            { value: 'original', label: t('editor.image.scaleOriginal') },
          ]}
        />
        <Text size="xs" c="dimmed">
          {t('editor.compare.sizeHint')}
        </Text>
      </Stack>
      <TextInput
        label={t('editor.image.caption')}
        value={block.caption ?? ''}
        onChange={(e) => onChange({ caption: e.currentTarget.value || undefined })}
        maxLength={500}
      />
    </Stack>
  );
}

function AudioForm({ block, onChange }: FormProps<'audio'>) {
  return (
    <Stack gap="sm">
      {block.src && (
        // biome-ignore lint/a11y/useMediaCaption: the teacher's preview of the file just uploaded; lesson audio has no captions.
        <audio src={block.src} controls preload="none" className="editor-audio" />
      )}
      <MediaUpload kind="audio" hasFile={!!block.src} onUploaded={(src) => onChange({ src })} />
      <TextInput
        label={t('editor.audio.title')}
        value={block.title ?? ''}
        onChange={(e) => onChange({ title: e.currentTarget.value || undefined })}
        maxLength={300}
      />
    </Stack>
  );
}

function VideoForm({ block, onChange, autoFocus }: FormProps<'video'>) {
  // What the teacher typed: a link that is not YouTube yet stays in the field (the block keeps no id).
  const [link, setLink] = useState(block.youtubeId ? `https://youtu.be/${block.youtubeId}` : '');
  const [start, setStart] = useState(block.start ? formatTime(block.start) : '');
  const linkInvalid = link.trim() !== '' && !parseYoutubeLink(link);
  const startInvalid = parseTime(start) === null;

  return (
    <Stack gap="sm">
      <TextInput
        label={t('editor.video.url')}
        placeholder={t('editor.video.urlPlaceholder')}
        value={link}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setLink(value);
          const parsed = parseYoutubeLink(value);
          // A start time in the link fills the field, unless one is set already.
          if (parsed?.start !== undefined && !start) setStart(formatTime(parsed.start));
          onChange({
            youtubeId: parsed?.id ?? '',
            ...(parsed?.start !== undefined && !start ? { start: parsed.start } : {}),
          });
        }}
        error={linkInvalid && t('editor.video.invalidUrl')}
        autoFocus={autoFocus}
      />
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <TextInput
          label={t('editor.video.title')}
          value={block.title}
          onChange={(e) => onChange({ title: e.currentTarget.value })}
          maxLength={300}
          style={{ flex: 1 }}
        />
        <TextInput
          label={t('editor.video.start')}
          placeholder={t('editor.video.startPlaceholder')}
          value={start}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setStart(value);
            const seconds = parseTime(value);
            if (seconds !== null) onChange({ start: seconds });
          }}
          error={startInvalid && t('editor.video.invalidStart')}
          w={120}
        />
      </Group>
    </Stack>
  );
}

function GeniallyForm({ block, onChange, autoFocus }: FormProps<'genially'>) {
  // What the teacher pasted: a link that is not a Genially yet stays in the field (the block keeps no id).
  const [link, setLink] = useState(block.geniallyId ? geniallyEmbedUrl(block.geniallyId) : '');
  const linkInvalid = link.trim() !== '' && !parseGeniallyLink(link);

  return (
    <Stack gap="sm">
      <TextInput
        label={t('editor.genially.url')}
        description={t('editor.genially.urlHint')}
        placeholder={t('editor.genially.urlPlaceholder')}
        value={link}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setLink(value);
          onChange({ geniallyId: parseGeniallyLink(value) ?? '' });
        }}
        error={linkInvalid && t('editor.genially.invalidUrl')}
        autoFocus={autoFocus}
      />
      <Select
        label={t('editor.genially.ratio')}
        data={GENIALLY_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
        value={block.ratio ?? '16:9'}
        onChange={(value) => onChange({ ratio: (value as GeniallyRatio | null) ?? undefined })}
        allowDeselect={false}
        w={110}
      />
      <Text size="xs" c="dimmed">
        {t('editor.genially.note')}
      </Text>
    </Stack>
  );
}

function EssayForm({ block, onChange, autoFocus }: FormProps<'essay'>) {
  return (
    <TextInput
      label={t('editor.essay.placeholder')}
      description={t('editor.essay.placeholderHint')}
      value={block.placeholder ?? ''}
      onChange={(e) => onChange({ placeholder: e.currentTarget.value || undefined })}
      maxLength={300}
      autoFocus={autoFocus}
    />
  );
}

/** Fill-in gaps and drag-into-gaps: the text with `*answer*`; drag-gaps also has extra words. */
function GapsForm({
  block,
  onChange,
  autoFocus,
}: {
  block: BlockOf<'gaps'> | BlockOf<'drag-gaps'>;
  /** Both kinds have `text`; only drag-gaps has `distractors` (its field shows for it only). */
  onChange: (changes: Partial<BlockOf<'drag-gaps'>>) => void;
  autoFocus?: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const gapCount = useMemo(() => block.text.match(GAP_MARKUP)?.length ?? 0, [block.text]);

  const makeGapOfSelection = () => {
    const field = textarea.current;
    if (!field) return;
    const next = makeGap(block.text, field.selectionStart, field.selectionEnd);
    onChange({ text: next.text });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.cursor, next.cursor);
    });
  };

  return (
    <Stack gap="sm">
      <Textarea
        ref={textarea}
        label={t('editor.gaps.text')}
        description={t('editor.gaps.hint')}
        value={block.text}
        onChange={(e) => onChange({ text: e.currentTarget.value })}
        autosize
        minRows={3}
        maxLength={20_000}
        autoFocus={autoFocus}
      />
      <Group gap="sm">
        {/* mousedown would take the focus (and the selection) away from the text. */}
        <Button size="xs" variant="light" onMouseDown={(e) => e.preventDefault()} onClick={makeGapOfSelection}>
          {t('editor.gaps.makeGap')}
        </Button>
        <Text size="xs" c="dimmed">
          {t('editor.gaps.count', { count: gapCount })}
        </Text>
      </Group>
      {block.type === 'drag-gaps' && (
        <TagsInput
          label={t('editor.gaps.distractors')}
          description={t('editor.gaps.distractorsHint')}
          value={block.distractors ?? []}
          onChange={(distractors) => onChange({ distractors })}
          maxTags={50}
          clearable
        />
      )}
    </Stack>
  );
}

type BuildWord = BlockOf<'build-word'>['words'][number];

/** Words to build from letters: a row per word, with an optional hint under it. */
function BuildWordForm({ block, onChange, autoFocus }: FormProps<'build-word'>) {
  const setWord = (index: number, word: BuildWord) => onChange({ words: replaceAt(block.words, index, word) });
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t('editor.buildWord.hint')}
      </Text>
      <RowsEditor
        addLabel={t('editor.buildWord.addWord')}
        onAdd={() => onChange({ words: [...block.words, { text: '' }] })}
        canAdd={block.words.length < BUILD_WORD_MAX_WORDS}
      >
        {block.words.map((word, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Stack gap={4} style={{ flex: 1 }}>
              <TextInput
                placeholder={t('editor.buildWord.word', { n: i + 1 })}
                aria-label={t('editor.buildWord.word', { n: i + 1 })}
                value={word.text}
                onChange={(e) => setWord(i, { ...word, text: e.currentTarget.value })}
                maxLength={BUILD_WORD_MAX_LENGTH}
                autoFocus={autoFocus && i === 0}
              />
              <TextInput
                size="xs"
                placeholder={t('editor.buildWord.hintPlaceholder')}
                aria-label={t('editor.buildWord.hintLabel', { n: i + 1 })}
                value={word.hint ?? ''}
                onChange={(e) => setWord(i, { ...word, hint: e.currentTarget.value || undefined })}
                maxLength={500}
              />
            </Stack>
            <DeleteRow
              label={t('editor.buildWord.deleteWord', { n: i + 1 })}
              onClick={() => onChange({ words: removeAt(block.words, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
    </Stack>
  );
}

/** Gaps with a dropdown: the text with `{tengo|*tienes*|tiene}`. */
function DropdownGapsForm({ block, onChange, autoFocus }: FormProps<'dropdown-gaps'>) {
  const gapCount = useMemo(
    () =>
      [...block.text.matchAll(DROPDOWN_MARKUP)].filter(([, body]) => {
        const { options, answers } = parseDropdown(body);
        return options.length >= 2 && answers.length > 0;
      }).length,
    [block.text],
  );
  return (
    <Stack gap="sm">
      <Textarea
        label={t('editor.dropdownGaps.text')}
        description={t('editor.dropdownGaps.hint')}
        value={block.text}
        onChange={(e) => onChange({ text: e.currentTarget.value })}
        autosize
        minRows={3}
        maxLength={20_000}
        autoFocus={autoFocus}
      />
      <Text size="xs" c="dimmed">
        {t('editor.gaps.count', { count: gapCount })}
      </Text>
    </Stack>
  );
}

/** The list with the item at `index` replaced. */
const replaceAt = <T,>(list: T[], index: number, item: T) => list.map((current, i) => (i === index ? item : current));
/** The list without the item at `index`. */
const removeAt = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index);

/** A list of rows (pairs, sentences) with a delete button each and "+ add" below. */
function RowsEditor({
  children,
  addLabel,
  onAdd,
  canAdd = true,
}: {
  children: ReactNode;
  addLabel: string;
  onAdd: () => void;
  canAdd?: boolean;
}) {
  return (
    <Stack gap="xs">
      {children}
      <div>
        <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={onAdd} disabled={!canAdd}>
          {addLabel}
        </Button>
      </div>
    </Stack>
  );
}

function DeleteRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ActionIcon variant="subtle" color="gray" aria-label={label} onClick={onClick} mt={4}>
      <IconTrash size={16} />
    </ActionIcon>
  );
}

function MatchForm({ block, onChange, autoFocus }: FormProps<'match'>) {
  const setPairSide = (index: number, side: 'left' | 'right', value: string) =>
    onChange({ pairs: replaceAt(block.pairs, index, { ...block.pairs[index], [side]: value }) });

  return (
    <Stack gap="sm">
      <RowsEditor
        addLabel={t('editor.match.addPair')}
        onAdd={() => onChange({ pairs: [...block.pairs, { left: '', right: '' }] })}
      >
        {block.pairs.map((pair, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              placeholder={t('editor.match.left')}
              aria-label={`${t('editor.match.left')} ${i + 1}`}
              value={pair.left}
              onChange={(e) => setPairSide(i, 'left', e.currentTarget.value)}
              maxLength={300}
              autoFocus={autoFocus && i === 0}
              style={{ flex: 1 }}
            />
            <Text c="dimmed" mt={6}>
              —
            </Text>
            <TextInput
              placeholder={t('editor.match.right')}
              aria-label={`${t('editor.match.right')} ${i + 1}`}
              value={pair.right}
              onChange={(e) => setPairSide(i, 'right', e.currentTarget.value)}
              maxLength={300}
              style={{ flex: 1 }}
            />
            <DeleteRow
              label={t('editor.match.deletePair', { n: i + 1 })}
              onClick={() => onChange({ pairs: removeAt(block.pairs, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
      <TagsInput
        label={t('editor.match.distractors')}
        description={t('editor.match.distractorsHint')}
        value={block.distractors ?? []}
        onChange={(distractors) => onChange({ distractors })}
        maxTags={50}
        clearable
      />
    </Stack>
  );
}

function DictationForm({ block, onChange }: FormProps<'dictation'>) {
  type DictationSentence = BlockOf<'dictation'>['sentences'][number];
  const setSentence = (index: number, sentence: Partial<DictationSentence>) =>
    onChange({ sentences: replaceAt(block.sentences, index, { ...block.sentences[index], ...sentence }) });

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        {t('editor.dictation.hint')}
      </Text>
      <RowsEditor
        addLabel={t('editor.dictation.addSentence')}
        canAdd={block.sentences.length < DICTATION_MAX_SENTENCES}
        onAdd={() => onChange({ sentences: [...block.sentences, { src: '', text: '' }] })}
      >
        {block.sentences.map((sentence, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Stack gap={6} style={{ flex: 1 }}>
              <TextInput
                placeholder={t('editor.dictation.text')}
                aria-label={t('editor.dictation.textOf', { n: i + 1 })}
                value={sentence.text}
                onChange={(e) => setSentence(i, { text: e.currentTarget.value })}
                maxLength={DICTATION_TEXT_MAX}
              />
              {sentence.src && (
                // biome-ignore lint/a11y/useMediaCaption: the teacher's preview of the file just uploaded; lesson audio has no captions.
                <audio src={sentence.src} controls preload="none" className="editor-audio" />
              )}
              <MediaUpload kind="audio" hasFile={!!sentence.src} onUploaded={(src) => setSentence(i, { src })} />
            </Stack>
            <DeleteRow
              label={t('editor.dictation.deleteSentence', { n: i + 1 })}
              onClick={() => onChange({ sentences: removeAt(block.sentences, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
    </Stack>
  );
}

function SortForm({ block, onChange, autoFocus }: FormProps<'sort'>) {
  type SortGroup = BlockOf<'sort'>['groups'][number];
  const setGroup = (index: number, group: SortGroup) => onChange({ groups: replaceAt(block.groups, index, group) });

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        {t('editor.sort.hint')}
      </Text>
      <RowsEditor
        addLabel={t('editor.sort.addGroup')}
        onAdd={() => onChange({ groups: [...block.groups, { title: '', items: [] }] })}
      >
        {block.groups.map((group, g) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Paper key={g} withBorder p="xs">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <TextInput
                placeholder={t('editor.sort.groupTitle', { n: g + 1 })}
                aria-label={t('editor.sort.groupTitle', { n: g + 1 })}
                value={group.title}
                onChange={(e) => setGroup(g, { ...group, title: e.currentTarget.value })}
                maxLength={300}
                autoFocus={autoFocus && g === 0}
                style={{ flex: 1 }}
              />
              <DeleteRow
                label={t('editor.sort.deleteGroup', { n: g + 1 })}
                onClick={() => onChange({ groups: removeAt(block.groups, g) })}
              />
            </Group>
            <Textarea
              mt={6}
              size="xs"
              aria-label={t('editor.sort.items', { n: g + 1 })}
              placeholder={t('editor.sort.itemsHint')}
              value={group.items.join('\n')}
              onChange={(e) => setGroup(g, { ...group, items: e.currentTarget.value.split('\n').slice(0, 50) })}
              autosize
              minRows={2}
            />
          </Paper>
        ))}
      </RowsEditor>
    </Stack>
  );
}

type Sentence = BlockOf<'order'>['sentences'][number];

function OrderForm({ block, onChange, autoFocus }: FormProps<'order'>) {
  const setSentence = (index: number, sentence: Sentence) =>
    onChange({ sentences: replaceAt(block.sentences, index, sentence) });

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t('editor.order.hint')}
      </Text>
      <RowsEditor
        addLabel={t('editor.order.addSentence')}
        onAdd={() => onChange({ sentences: [...block.sentences, { text: '' }] })}
      >
        {block.sentences.map((sentence, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Stack gap={4} style={{ flex: 1 }}>
              <TextInput
                placeholder={t('editor.order.sentence', { n: i + 1 })}
                aria-label={t('editor.order.sentence', { n: i + 1 })}
                value={sentence.text}
                onChange={(e) => setSentence(i, { ...sentence, text: e.currentTarget.value })}
                maxLength={500}
                autoFocus={autoFocus && i === 0}
              />
              <TextInput
                size="xs"
                placeholder={t('editor.order.hintPlaceholder')}
                aria-label={t('editor.order.hintLabel', { n: i + 1 })}
                value={sentence.hint ?? ''}
                onChange={(e) => setSentence(i, { ...sentence, hint: e.currentTarget.value || undefined })}
                maxLength={500}
              />
            </Stack>
            <DeleteRow
              label={t('editor.order.deleteSentence', { n: i + 1 })}
              onClick={() => onChange({ sentences: removeAt(block.sentences, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
    </Stack>
  );
}

type Question = BlockOf<'choice'>['questions'][number];

/**
 * A test: questions, each with its options; the ticked ones are right. One
 * right option: the student picks one; several: the student must pick all.
 */
function ChoiceForm({ block, onChange, autoFocus }: FormProps<'choice'>) {
  const setQuestion = (index: number, question: Question) =>
    onChange({ questions: replaceAt(block.questions, index, question) });

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        {t('editor.choice.hint')}
      </Text>
      <RowsEditor
        addLabel={t('editor.choice.addQuestion')}
        onAdd={() =>
          onChange({ questions: [...block.questions, { question: '', options: [{ text: '' }, { text: '' }] }] })
        }
      >
        {block.questions.map((question, q) => {
          const setOptions = (options: Question['options']) => setQuestion(q, { ...question, options });
          const needsRight =
            question.question.trim() !== '' &&
            question.options.some((option) => option.text.trim() !== '') &&
            !question.options.some((option) => option.correct);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
            <Paper key={q} withBorder p="xs">
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <TextInput
                  placeholder={t('editor.choice.question', { n: q + 1 })}
                  aria-label={t('editor.choice.question', { n: q + 1 })}
                  value={question.question}
                  onChange={(e) => setQuestion(q, { ...question, question: e.currentTarget.value })}
                  maxLength={500}
                  autoFocus={autoFocus && q === 0}
                  style={{ flex: 1 }}
                />
                <DeleteRow
                  label={t('editor.choice.deleteQuestion', { n: q + 1 })}
                  onClick={() => onChange({ questions: removeAt(block.questions, q) })}
                />
              </Group>
              <Stack gap={6} pl="lg" mt={6}>
                {question.options.map((option, o) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as above.
                  <Group key={o} gap="xs" wrap="nowrap" align="center">
                    <Checkbox
                      aria-label={t('editor.choice.right', { n: o + 1 })}
                      title={t('editor.choice.rightHint')}
                      checked={option.correct === true}
                      onChange={(e) => {
                        const correct = e.currentTarget.checked;
                        setOptions(replaceAt(question.options, o, { text: option.text, ...(correct && { correct }) }));
                      }}
                    />
                    <TextInput
                      size="xs"
                      placeholder={t('editor.choice.option', { n: o + 1 })}
                      aria-label={t('editor.choice.option', { n: o + 1 })}
                      value={option.text}
                      onChange={(e) =>
                        setOptions(replaceAt(question.options, o, { ...option, text: e.currentTarget.value }))
                      }
                      maxLength={300}
                      style={{ flex: 1 }}
                    />
                    <DeleteRow
                      label={t('editor.choice.deleteOption', { n: o + 1 })}
                      onClick={() => setOptions(removeAt(question.options, o))}
                    />
                  </Group>
                ))}
                <Group gap="sm">
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => setOptions([...question.options, { text: '' }])}
                    disabled={question.options.length >= 20}
                  >
                    {t('editor.choice.addOption')}
                  </Button>
                  {needsRight && (
                    <Text size="xs" c="orange">
                      {t('editor.choice.noRight')}
                    </Text>
                  )}
                </Group>
              </Stack>
            </Paper>
          );
        })}
      </RowsEditor>
    </Stack>
  );
}

function TrueFalseForm({ block, onChange, autoFocus }: FormProps<'true-false'>) {
  const setStatement = (index: number, statement: BlockOf<'true-false'>['statements'][number]) =>
    onChange({ statements: replaceAt(block.statements, index, statement) });

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t('editor.trueFalse.hint')}
      </Text>
      <RowsEditor
        addLabel={t('editor.trueFalse.addStatement')}
        onAdd={() => onChange({ statements: [...block.statements, { text: '', true: true }] })}
      >
        {block.statements.map((statement, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              placeholder={t('editor.trueFalse.statement', { n: i + 1 })}
              aria-label={t('editor.trueFalse.statement', { n: i + 1 })}
              value={statement.text}
              onChange={(e) => setStatement(i, { ...statement, text: e.currentTarget.value })}
              maxLength={500}
              autoFocus={autoFocus && i === 0}
              style={{ flex: 1 }}
            />
            <SegmentedControl
              aria-label={t('editor.trueFalse.answer', { n: i + 1 })}
              data={[
                { value: 'true', label: t('exercise.true') },
                { value: 'false', label: t('exercise.false') },
              ]}
              value={String(statement.true)}
              onChange={(value) => setStatement(i, { ...statement, true: value === 'true' })}
            />
            <DeleteRow
              label={t('editor.trueFalse.deleteStatement', { n: i + 1 })}
              onClick={() => onChange({ statements: removeAt(block.statements, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
    </Stack>
  );
}

function SequenceForm({ block, onChange, autoFocus }: FormProps<'sequence'>) {
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t('editor.sequence.hint')}
      </Text>
      <RowsEditor addLabel={t('editor.sequence.addItem')} onAdd={() => onChange({ items: [...block.items, ''] })}>
        {block.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Text c="dimmed" mt={6} w={20} ta="right">
              {i + 1}.
            </Text>
            <Textarea
              placeholder={t('editor.sequence.item', { n: i + 1 })}
              aria-label={t('editor.sequence.item', { n: i + 1 })}
              value={item}
              onChange={(e) => {
                const value = e.currentTarget.value;
                onChange({ items: replaceAt(block.items, i, value) });
              }}
              autosize
              minRows={1}
              maxLength={1000}
              autoFocus={autoFocus && i === 0}
              style={{ flex: 1 }}
            />
            <DeleteRow
              label={t('editor.sequence.deleteItem', { n: i + 1 })}
              onClick={() => onChange({ items: removeAt(block.items, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
    </Stack>
  );
}

/**
 * Word search: the words (one per line) and the grid they are hidden in. The grid is made by the button
 * (and once by itself when the fifth word is typed) and stays as it is while the words are edited; the
 * letters that are not part of a word can be changed by hand, the letters of the words cannot.
 */
function WordsearchForm({ block, onChange, autoFocus }: FormProps<'wordsearch'>) {
  const rows = useMemo(() => gridRows(block.grid), [block.grid]);
  const locked = useMemo(() => lockedCells(block.placements), [block.placements]);
  const usable = useMemo(() => usableWords(block.words), [block.words]);
  const current = block.grid.length > 0 && isGridCurrent(block.words, block.placements);
  const [problem, setProblem] = useState<string>();
  // Letters changed by hand in this editing session: making a new grid would lose them, so it asks first.
  const [edited, setEdited] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const generate = () => {
    const result = generateWordsearch(block.words);
    if (!result.ok) {
      setProblem(
        result.reason === 'tooFew'
          ? t('editor.wordsearch.tooFew', { min: WORDSEARCH_MIN_WORDS })
          : t(result.reason === 'tooLong' ? 'editor.wordsearch.tooLong' : 'editor.wordsearch.noRoom', {
              word: result.word ?? '',
              max: WORDSEARCH_WORD_MAX,
            }),
      );
      return;
    }
    setProblem(undefined);
    setEdited(false);
    setConfirming(false);
    onChange({ grid: result.grid, placements: result.placements });
  };

  // The first grid comes by itself as soon as there are enough words.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the arrival of the fifth word (not every later keystroke) starts it.
  useEffect(() => {
    if (block.grid.length === 0 && usable.length >= WORDSEARCH_MIN_WORDS) generate();
  }, [block.grid.length, usable.length >= WORDSEARCH_MIN_WORDS]);

  const setLetter = (row: number, col: number, value: string) => {
    // One letter per cell: the one typed last; an emptied cell keeps its letter.
    const letter = [...value].pop()?.toLocaleUpperCase();
    if (!letter || letter === rows[row][col]) return;
    const next = rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? letter : cell)) : cells));
    setEdited(true);
    onChange({ grid: next.map((cells) => cells.join('')) });
  };

  return (
    <Stack gap="xs">
      <Textarea
        label={t('editor.wordsearch.words')}
        description={t('editor.wordsearch.hint', { min: WORDSEARCH_MIN_WORDS, max: WORDSEARCH_MAX_WORDS })}
        value={block.words.join('\n')}
        onChange={(e) => onChange({ words: e.currentTarget.value.split('\n').slice(0, WORDSEARCH_MAX_WORDS) })}
        autosize
        minRows={5}
        autoFocus={autoFocus}
        inputMode="text"
        spellCheck={false}
        maxLength={WORDSEARCH_MAX_WORDS * (WORDSEARCH_INPUT_MAX + 1)}
      />
      <Group gap="sm">
        <Button
          size="xs"
          variant={current ? 'light' : 'filled'}
          color={confirming ? 'red' : undefined}
          disabled={usable.length < WORDSEARCH_MIN_WORDS}
          onClick={() => {
            if (current && edited && !confirming) return setConfirming(true);
            generate();
          }}
        >
          {confirming
            ? t('editor.wordsearch.confirmShuffle')
            : current
              ? t('editor.wordsearch.shuffle')
              : t('editor.wordsearch.generate')}
        </Button>
        <Text size="xs" c="dimmed">
          {t('editor.wordsearch.count', { count: usable.length })}
        </Text>
      </Group>
      {problem && (
        <Text size="sm" c="red">
          {problem}
        </Text>
      )}
      {block.grid.length > 0 && !current && (
        <Text size="sm" c="orange">
          {t('editor.wordsearch.stale')}
        </Text>
      )}
      {block.grid.length > 0 && (
        <>
          <Text size="xs" c="dimmed">
            {t('editor.wordsearch.cellsHint')}
          </Text>
          <div className="wordsearch-grid wordsearch-edit" style={{ '--n': rows.length } as CSSProperties}>
            {rows.map((cells, r) =>
              cells.map((letter, c) => {
                const key = `${r},${c}`;
                return locked.has(key) ? (
                  <div key={key} className="wordsearch-cell key">
                    {letter}
                  </div>
                ) : (
                  <div key={key} className="wordsearch-cell">
                    <input
                      value={letter}
                      aria-label={t('editor.wordsearch.cell', { row: r + 1, col: c + 1 })}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setLetter(r, c, e.currentTarget.value)}
                    />
                  </div>
                );
              }),
            )}
          </div>
        </>
      )}
    </Stack>
  );
}

/** The items of a wheel, one short line each; at most WHEEL_MAX_ITEMS (like the hours on a clock). */
function WheelForm({ block, onChange, autoFocus }: FormProps<'wheel'>) {
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t('editor.wheel.hint', { max: WHEEL_MAX_ITEMS })}
      </Text>
      <RowsEditor
        addLabel={t('editor.wheel.addItem')}
        onAdd={() => onChange({ items: [...block.items, ''] })}
        canAdd={block.items.length < WHEEL_MAX_ITEMS}
      >
        {block.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no ids; their inputs are controlled, so deleting a row never moves its value into another.
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Text c="dimmed" mt={6} w={20} ta="right">
              {i + 1}.
            </Text>
            <TextInput
              placeholder={t('editor.wheel.item', { n: i + 1 })}
              aria-label={t('editor.wheel.item', { n: i + 1 })}
              value={item}
              onChange={(e) => onChange({ items: replaceAt(block.items, i, e.currentTarget.value) })}
              maxLength={WHEEL_ITEM_MAX}
              autoFocus={autoFocus && i === 0}
              style={{ flex: 1 }}
            />
            <DeleteRow
              label={t('editor.wheel.deleteItem', { n: i + 1 })}
              onClick={() => onChange({ items: removeAt(block.items, i) })}
            />
          </Group>
        ))}
      </RowsEditor>
    </Stack>
  );
}
