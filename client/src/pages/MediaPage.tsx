import type { MediaKind } from '@cuadrilo/shared/api';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconCheck,
  IconDots,
  IconHeadphones,
  IconPencil,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { api, type MediaFile } from '../api';
import { DialogButtons, DialogTitle, ErrorAlert, Hint, PageHeader, Row, RowList } from '../components/ui';
import { formatBytes, formatDate, t } from '../i18n';
import { matchesQuery } from '../search';

type KindFilter = 'all' | MediaKind;

/** One file of the last batch the teacher dropped or chose, and how its upload went. */
interface UploadProgress {
  key: string;
  name: string;
  state: 'uploading' | 'uploaded' | 'existed' | 'failed';
  /** existed: the name it is already there under; failed: why. */
  detail?: string;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav';

/** The list with this file first (new) or in its place (renamed, uploaded again). */
const withFile = (list: MediaFile[] | undefined, file: MediaFile) =>
  list?.some((item) => item.id === file.id)
    ? list.map((item) => (item.id === file.id ? file : item))
    : [file, ...(list ?? [])];

/**
 * Teacher: the media library — images and audio for the lessons, by the
 * names they were uploaded with (the editor and the assistant refer to them).
 * Several files at once; a file a lesson shows cannot be deleted.
 */
export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [renaming, setRenaming] = useState<MediaFile>();
  const [deleting, setDeleting] = useState<MediaFile>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.listMedia().then(setFiles, (e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(
    () =>
      files?.filter((file) => (kindFilter === 'all' || file.kind === kindFilter) && matchesQuery(file.name, query)) ??
      [],
    [files, kindFilter, query],
  );

  /** Uploads the files one after another, each with its own outcome. */
  const uploadFiles = async (chosen: File[]) => {
    const batch = Date.now();
    const keyOf = (index: number) => `${batch}-${index}`;
    setUploads(chosen.map((file, index) => ({ key: keyOf(index), name: file.name, state: 'uploading' })));
    const report = (index: number, progress: Pick<UploadProgress, 'state' | 'detail'>) =>
      setUploads((list) => list.map((item) => (item.key === keyOf(index) ? { ...item, ...progress } : item)));
    for (const [index, file] of chosen.entries()) {
      try {
        const uploaded = await api.uploadMedia(file);
        setFiles((list) => withFile(list, uploaded));
        report(index, uploaded.existed ? { state: 'existed', detail: uploaded.name } : { state: 'uploaded' });
      } catch (e) {
        report(index, { state: 'failed', detail: (e as Error).message });
      }
    }
  };

  return (
    <section>
      <PageHeader title={t('files.title')}>
        {files && files.length > 0 && (
          <>
            <SegmentedControl
              value={kindFilter}
              onChange={(value) => setKindFilter(value as KindFilter)}
              data={[
                { value: 'all', label: t('files.all') },
                { value: 'image', label: t('files.images') },
                { value: 'audio', label: t('files.audio') },
              ]}
            />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={t('files.search')}
              aria-label={t('files.search')}
              leftSection={<IconSearch size={16} />}
              w={240}
            />
          </>
        )}
      </PageHeader>
      <Hint mb="md">{t('files.hint')}</Hint>
      <ErrorAlert error={error} />

      <FileDropZone onFiles={(chosen) => void uploadFiles(chosen)} />
      {uploads.length > 0 && <UploadList uploads={uploads} />}

      {!files && !error && <Hint mt="md">{t('common.loading')}</Hint>}
      {files?.length === 0 && (
        <Text c="dimmed" mt="md">
          {t('files.empty')}
        </Text>
      )}
      {files && files.length > 0 && shown.length === 0 && (
        <Text c="dimmed" mt="md">
          {t('files.noMatches')}
        </Text>
      )}

      <Stack mt="md">
        <RowList>
          {shown.map((file) => (
            <MediaRow key={file.id} file={file} onRename={setRenaming} onDelete={setDeleting} />
          ))}
        </RowList>
      </Stack>

      <RenameDialog
        file={renaming}
        onClose={() => setRenaming(undefined)}
        onRenamed={(renamed) => {
          setFiles((list) => withFile(list, renamed));
          setRenaming(undefined);
        }}
      />
      <DeleteDialog
        file={deleting}
        onClose={() => setDeleting(undefined)}
        onDeleted={(id) => {
          setFiles((list) => list?.filter((item) => item.id !== id));
          setDeleting(undefined);
        }}
      />
    </section>
  );
}

/** Drop several files here, or choose them. */
function FileDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping files is a mouse shortcut; the button inside is the accessible way to choose them.
    <div
      className={`editor-drop media-drop ${isDragOver ? 'editor-drop-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      }}
    >
      <Stack align="center" gap={6}>
        <Text fw={600}>{t('files.drop')}</Text>
        <FileButton multiple accept={ACCEPTED_TYPES} onChange={(chosen) => chosen.length && onFiles(chosen)}>
          {(props) => (
            <Button {...props} variant="default" leftSection={<IconUpload size={16} />}>
              {t('files.choose')}
            </Button>
          )}
        </FileButton>
        <Text size="xs" c="dimmed">
          {t('files.formats')}
        </Text>
      </Stack>
    </div>
  );
}

function UploadList({ uploads }: { uploads: UploadProgress[] }) {
  return (
    <Paper className="card-edge" p="sm" mt="sm">
      <Stack gap={4}>
        {uploads.map((upload) => (
          <Group key={upload.key} gap="xs" wrap="nowrap">
            {upload.state === 'uploading' && <Loader size={14} />}
            {(upload.state === 'uploaded' || upload.state === 'existed') && (
              <IconCheck size={16} color="var(--mantine-primary-color-filled)" />
            )}
            {upload.state === 'failed' && <IconX size={16} color="var(--mantine-color-red-6)" />}
            <Text size="sm" fw={500}>
              {upload.name}
            </Text>
            <Text size="sm" c={upload.state === 'failed' ? 'red' : 'dimmed'}>
              {upload.state === 'uploading' && t('files.uploading')}
              {upload.state === 'uploaded' && t('files.uploaded')}
              {upload.state === 'existed' && t('files.existed', { name: upload.detail ?? '' })}
              {upload.state === 'failed' && upload.detail}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

function MediaRow({
  file,
  onRename,
  onDelete,
}: {
  file: MediaFile;
  onRename: (file: MediaFile) => void;
  onDelete: (file: MediaFile) => void;
}) {
  const isUsed = file.usedIn.length > 0;
  return (
    <Row
      actions={
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="default" size="lg" aria-label={t('files.more')}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => onRename(file)}>
              {t('files.rename')}
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={16} />}
              disabled={isUsed}
              title={isUsed ? t('files.inUse') : undefined}
              onClick={() => onDelete(file)}
            >
              {t('files.delete')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      }
    >
      <Group gap="sm" wrap="nowrap" align="center">
        {file.kind === 'image' ? (
          <img src={file.url} alt="" className="media-thumb" loading="lazy" />
        ) : (
          <span className="media-thumb media-thumb-audio" aria-hidden>
            <IconHeadphones size={22} />
          </span>
        )}
        <div>
          <Text fw={600}>{file.name}</Text>
          <Hint>
            {formatBytes(file.bytes)} · {formatDate(file.uploadedAt)} ·{' '}
            {isUsed
              ? t('files.usedIn', { lessons: file.usedIn.map((lesson) => `«${lesson.title}»`).join(', ') })
              : t('files.unused')}
          </Hint>
          {file.kind === 'audio' && (
            // biome-ignore lint/a11y/useMediaCaption: the teacher's own uploaded audio; lesson audio has no captions.
            <audio src={file.url} controls preload="none" className="media-audio" />
          )}
        </div>
      </Group>
    </Row>
  );
}

function RenameDialog({
  file,
  onClose,
  onRenamed,
}: {
  file: MediaFile | undefined;
  onClose: () => void;
  onRenamed: (file: MediaFile) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(file?.name ?? '');
    setError(undefined);
  }, [file]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    if (name.trim() === file.name) return onClose();
    setSaving(true);
    setError(undefined);
    try {
      onRenamed(await api.renameMedia(file.id, name.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!file} onClose={onClose} title={<DialogTitle>{t('files.renameTitle')}</DialogTitle>} centered>
      <form onSubmit={save}>
        <TextInput
          label={t('files.name')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          error={error}
          data-autofocus
          required
        />
        <DialogButtons onCancel={onClose}>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            {t('files.save')}
          </Button>
        </DialogButtons>
      </form>
    </Modal>
  );
}

function DeleteDialog({
  file,
  onClose,
  onDeleted,
}: {
  file: MediaFile | undefined;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a dialog opened for another file starts without the last error.
  useEffect(() => setError(undefined), [file]);

  const remove = async () => {
    if (!file) return;
    setDeleting(true);
    try {
      await api.deleteMedia(file.id);
      onDeleted(file.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      opened={!!file}
      onClose={onClose}
      title={<DialogTitle>{file && t('files.deleteTitle', { name: file.name })}</DialogTitle>}
      centered
    >
      <Text size="sm">{t('files.deleteText')}</Text>
      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}
      <DialogButtons onCancel={onClose}>
        <Button loading={deleting} onClick={remove}>
          {t('files.delete')}
        </Button>
      </DialogButtons>
    </Modal>
  );
}
