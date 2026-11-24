import { Badge, Button, Group, Tabs, Text, TextInput } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconLock } from '@tabler/icons-react';
import { type ReactNode, useEffect, useMemo } from 'react';

import { BlockComment } from '../comments/comments';
import { BuildWordBlock } from '../exercises/BuildWordBlock';
import { ChoiceBlock } from '../exercises/ChoiceBlock';
import { DictationBlock } from '../exercises/DictationBlock';
import { DragGapsBlock } from '../exercises/DragGapsBlock';
import { EssayBlock } from '../exercises/EssayBlock';
import { Exercise } from '../exercises/Exercise';
import '../exercises/exercises.css';
import {
  type Block,
  type Chapter,
  exerciseNumbers,
  isAnswerType,
  type LessonContent,
  type Exercise as LessonExercise,
  toPlayableBlock,
} from '@cuadrilo/shared/lesson';
import { blockEditing, ExerciseForms } from '../editor/ExerciseForms';
import { DropdownGapsBlock } from '../exercises/DropdownGapsBlock';
import { GapsBlock } from '../exercises/GapsBlock';
import { HotspotsBlock } from '../exercises/HotspotsBlock';
import { MatchBlock } from '../exercises/MatchBlock';
import { AudioBlock, CompareBlock, GeniallyBlock, ImageBlock, VideoBlock } from '../exercises/MediaBlocks';
import { OrderBlock } from '../exercises/OrderBlock';
import { SequenceBlock } from '../exercises/SequenceBlock';
import { SortBlock } from '../exercises/SortBlock';
import { TrueFalseBlock } from '../exercises/TrueFalseBlock';
import { WheelBlock } from '../exercises/WheelBlock';
import { WordsearchBlock } from '../exercises/WordsearchBlock';
import { chapterTitle, t } from '../i18n';
import { ExerciseModeScope, ExerciseModeSwitch, useExerciseMode } from './exerciseModes';
import { Markdown } from './Markdown';

/**
 * One widget of the lesson. Answer blocks keep their state by block id
 * (useBlockState). Nothing for a block not filled in yet (the editor saves
 * half-filled lessons); half-filled pairs and sentences are left out.
 */
export function BlockView({ block: source }: { block: Block }) {
  // Once per block, so the widgets get the same arrays on every render (their memos hold).
  const block = useMemo(() => toPlayableBlock(source), [source]);
  if (!block) return null;
  return (
    <>
      <BlockBody block={block} />
      {isAnswerType(block.type) && <BlockComment blockId={block.id} />}
    </>
  );
}

function BlockBody({ block }: { block: NonNullable<ReturnType<typeof toPlayableBlock>> }) {
  switch (block.type) {
    case 'text':
      return <Markdown source={block.markdown} />;
    case 'image':
      return <ImageBlock src={block.src} alt={block.alt} caption={block.caption} scale={block.scale} />;
    case 'compare':
      return (
        <CompareBlock
          before={block.before}
          after={block.after}
          orientation={block.orientation}
          caption={block.caption}
          scale={block.scale}
        />
      );
    case 'hotspots':
      return (
        <HotspotsBlock
          id={block.id}
          src={block.src}
          hotspots={block.hotspots}
          caption={block.caption}
          scale={block.scale}
        />
      );
    case 'video':
      return <VideoBlock youtubeId={block.youtubeId} title={block.title} start={block.start} />;
    case 'genially':
      return <GeniallyBlock geniallyId={block.geniallyId} ratio={block.ratio} />;
    case 'audio':
      return <AudioBlock src={block.src} title={block.title} />;
    case 'essay':
      return <EssayBlock id={block.id} placeholder={block.placeholder} />;
    case 'gaps':
      return <GapsBlock id={block.id} text={block.text} />;
    case 'dictation':
      return <DictationBlock id={block.id} sentences={block.sentences} />;
    case 'wordsearch':
      return <WordsearchBlock id={block.id} grid={block.grid} placements={block.placements} />;
    case 'drag-gaps':
      return <DragGapsBlock id={block.id} text={block.text} distractors={block.distractors} />;
    case 'dropdown-gaps':
      return <DropdownGapsBlock id={block.id} text={block.text} />;
    case 'build-word':
      return <BuildWordBlock id={block.id} words={block.words} />;
    case 'match':
      return <MatchBlock id={block.id} pairs={block.pairs} distractors={block.distractors} />;
    case 'sort':
      return <SortBlock id={block.id} groups={block.groups} />;
    case 'order':
      return <OrderBlock id={block.id} sentences={block.sentences} />;
    case 'choice':
      return <ChoiceBlock id={block.id} questions={block.questions} />;
    case 'true-false':
      return <TrueFalseBlock id={block.id} statements={block.statements} />;
    case 'sequence':
      return <SequenceBlock id={block.id} items={block.items} />;
    case 'wheel':
      return <WheelBlock id={block.id} items={block.items} />;
  }
}

interface Props {
  content: LessonContent;
  chapterIndex: number;
  onChapterChange: (index: number) => void;
  /** Extra controls next to a chapter tab (teacher: where the student is). */
  chapterLabel?: (chapter: Chapter, index: number) => ReactNode;
  /** Extra controls in an exercise header (teacher: "show to the student"). */
  itemActions?: (chapter: Chapter, exercise: LessonExercise) => ReactNode;
  /** The whole lesson, when `content` is a part of it: the numbers stay those of the lesson. */
  numberedFrom?: LessonContent;
  /** Highlighted exercise (the teacher showed it to the student). */
  flashItemId?: string;
  /** Exercises of the student's homework: marked "Tarea". */
  homeworkItemIds?: ReadonlySet<string>;
  /** Outlined exercises (teacher: chosen for a homework). */
  highlightItemIds?: ReadonlySet<string>;
  /** Teacher: changes an exercise of the document (the exercises can be switched to the editor's forms). */
  editing?: LessonEditing;
}

/** How the page behind a LessonView lets its exercises be edited in place. */
export interface LessonEditing {
  editExercise: (exerciseId: string, edit: (exercise: LessonExercise) => void) => void;
  /** The document cannot be saved any more (it changed elsewhere): the forms are read-only. */
  disabled?: boolean;
}

/**
 * A lesson: chapters as tabs (free navigation, plus previous / next at the
 * bottom); in the open chapter its exercises (numbered across the lesson).
 * Answer blocks sync through the surrounding StudentSync / TeacherSync.
 */
export function LessonView({
  content,
  chapterIndex,
  onChapterChange,
  chapterLabel,
  itemActions,
  flashItemId,
  homeworkItemIds,
  highlightItemIds,
  numberedFrom,
  editing,
}: Props) {
  const numbers = useMemo(() => exerciseNumbers(numberedFrom ?? content), [numberedFrom, content]);
  const chapters = content.chapters;
  const chapter = chapters[chapterIndex] ?? chapters[0];
  /** A student who moves on to another chapter starts it from its top, not from where the last one ended. */
  const openChapter = (index: number) => {
    onChapterChange(index);
    window.scrollTo({ top: 0 });
  };
  // Chapters the student may not open (yet) are skipped by the buttons and cannot be picked.
  const open = (index: number) => chapters[index] && !chapters[index].locked;
  const previous = chapterIndex > 0 ? chapters.map((c) => !c.locked).lastIndexOf(true, chapterIndex - 1) : -1;
  const next = chapters.findIndex((c, i) => i > chapterIndex && !c.locked);
  // The first chapter is not open: start from the first one that is.
  useEffect(() => {
    const first = chapters.findIndex((c) => !c.locked);
    if (!open(chapterIndex) && first >= 0) onChapterChange(first);
  });

  return (
    <div className="lesson-view">
      {chapters.length > 1 && (
        <Tabs value={String(chapterIndex)} onChange={(value) => value !== null && openChapter(Number(value))} mb="md">
          <Tabs.List>
            {chapters.map((c, i) => (
              <Tabs.Tab
                key={c.id}
                value={String(i)}
                disabled={c.locked}
                title={c.locked ? t('lesson.chapterLockedTab') : undefined}
                leftSection={c.locked ? <IconLock size={14} /> : undefined}
                rightSection={chapterLabel?.(c, i)}
              >
                {i + 1}. {chapterTitle(c, i)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      {chapter.locked && (
        <Text c="dimmed" ta="center" py="xl">
          {t('lesson.chapterLocked')}
        </Text>
      )}
      {chapter.exercises.map((exercise) => (
        <ExerciseSection
          key={exercise.id}
          exercise={exercise}
          number={numbers.get(exercise.id) ?? 0}
          actions={itemActions?.(chapter, exercise)}
          flash={flashItemId === exercise.id}
          highlighted={highlightItemIds?.has(exercise.id)}
          tag={
            homeworkItemIds?.has(exercise.id) && (
              <Badge variant="light" color="orange" size="sm">
                {t('lesson.homeworkMark')}
              </Badge>
            )
          }
          editing={editing}
        />
      ))}

      {chapters.length > 1 && (
        <Group justify="space-between" mt="md">
          <Button
            variant="default"
            leftSection={<IconChevronLeft size={16} />}
            disabled={previous < 0}
            onClick={() => openChapter(previous)}
          >
            {t('lesson.previous')}
          </Button>
          <Button
            variant="default"
            rightSection={<IconChevronRight size={16} />}
            disabled={next < 0}
            onClick={() => openChapter(next)}
          >
            {t('lesson.next')}
          </Button>
        </Group>
      )}
    </div>
  );
}

/** One exercise: its blocks in the mode chosen for it; in the editing mode the task and the blocks are forms. */
function ExerciseSection({
  exercise,
  number,
  actions,
  flash,
  highlighted,
  tag,
  editing,
}: {
  exercise: LessonExercise;
  number: number;
  actions: ReactNode;
  flash: boolean;
  highlighted: boolean | undefined;
  tag: ReactNode;
  editing: LessonEditing | undefined;
}) {
  const mode = useExerciseMode(exercise.id);
  const edit = (change: (draft: LessonExercise) => void) => editing?.editExercise(exercise.id, change);
  const forms = mode === 'edit' && editing;
  return (
    <Exercise
      itemId={exercise.id}
      number={number}
      title={exercise.title}
      titleEditor={
        forms && (
          <TextInput
            value={exercise.title}
            onChange={(e) => {
              const value = e.currentTarget.value;
              edit((draft) => {
                draft.title = value;
              });
            }}
            placeholder={t('editor.taskPlaceholder')}
            aria-label={t('editor.task')}
            error={!exercise.title.trim() && t('editor.taskMissing')}
            maxLength={500}
            disabled={editing.disabled}
            style={{ flex: 1 }}
          />
        )
      }
      actions={
        <>
          <ExerciseModeSwitch exerciseId={exercise.id} />
          {actions}
        </>
      }
      flash={flash}
      highlighted={highlighted}
      tag={tag}
    >
      {forms ? (
        <fieldset disabled={editing.disabled} className="editor-fieldset">
          <ExerciseForms exercise={exercise} {...blockEditing(edit)} />
        </fieldset>
      ) : (
        <ExerciseModeScope exerciseId={exercise.id}>
          {exercise.blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
        </ExerciseModeScope>
      )}
    </Exercise>
  );
}
