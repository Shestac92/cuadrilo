import type {
  ApiErrorBody,
  AppSettings,
  AssistantAccessDecision,
  AssistantAccessRequest,
  AssistantConnection,
  BlockStateSaved,
  Class,
  ClassResume,
  CurrentUser,
  ErrorCode,
  Homework,
  HomeworkStatus,
  Lesson,
  LessonAccess,
  LessonContentSaved,
  LessonStates,
  LessonSummary,
  LookupResult,
  MediaFile,
  MediaUploaded,
  Student,
  StudentClass,
  StudentGroup,
  UpdateSettingsInput,
  VocabularyEntry,
} from '@cuadrilo/shared/api';
import type { BoardEntry, BoardInfo, BoardPage } from '@cuadrilo/shared/board';
import type { LessonComments } from '@cuadrilo/shared/comments';
import type { EditHighlightsInput, Highlight, LessonHighlights } from '@cuadrilo/shared/highlights';
import type { LessonContent } from '@cuadrilo/shared/lesson';

export type {
  AssistantConnection,
  Class,
  CurrentUser,
  Homework,
  HomeworkStatus,
  Lesson,
  LessonSummary,
  LookupResult,
  MediaFile,
  Role,
  Student,
  StudentGroup,
  VocabularyEntry,
} from '@cuadrilo/shared/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** From the error body; undefined if the response was not an API error (proxy down, …). */
    public code?: ErrorCode,
  ) {
    super(message);
  }
}

/** Called on any 401 (session expired or revoked); set by AuthProvider. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

/**
 * A request that has not been answered by then is given up (and tried again where the caller retries: answers, autosave).
 * A connection that went stale (a laptop woke up, the network changed) would otherwise leave the request hanging for
 * minutes, and everything queued behind it (one request per answer block at a time) would wait with it.
 */
const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // A file upload takes as long as it takes.
  const signal = init?.signal ?? (init?.body instanceof Blob ? undefined : AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  // Never from the browser's cache: answers and lists change all the time (Safari caches a GET without cache headers).
  const res = await fetch(url, { cache: 'no-store', ...init, signal });
  if (!res.ok) {
    let body: Partial<ApiErrorBody> | undefined;
    try {
      body = await res.json();
    } catch {
      // not JSON
    }
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized();
    throw new ApiError(body?.error ?? `${res.status} ${res.statusText}`, res.status, body?.code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  me: () => request<CurrentUser>('/api/auth/me'),
  login: (login: string, password: string) =>
    request<CurrentUser>('/api/auth/login', json('POST', { login, password })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  /** Teacher: change the platform's settings (the theme); only the fields sent change. */
  updateSettings: (input: UpdateSettingsInput) => request<AppSettings>('/api/settings', json('PATCH', input)),

  listLessons: () => request<LessonSummary[]>('/api/lessons'),
  /** The lessons in the new order (all their ids). */
  setLessonOrder: (ids: number[]) => request<void>('/api/lessons/order', json('PUT', { ids })),
  getLesson: (id: number) => request<Lesson>(`/api/lessons/${id}`),
  createLesson: (title: string) => request<Lesson>('/api/lessons', json('POST', { title })),
  renameLesson: (id: number, title: string) => request<LessonSummary>(`/api/lessons/${id}`, json('PATCH', { title })),
  /**
   * Editor: the whole document on every change, made on revision `rev`;
   * 409 lesson_changed if the lesson was saved meanwhile.
   */
  saveLessonContent: (id: number, content: LessonContent, rev: number) =>
    request<LessonContentSaved>(`/api/lessons/${id}/content`, json('PUT', { content, rev })),
  /** Teacher: an image or audio file for a lesson → its /media/… URL. */
  /** The consent page: an assistant asks for access (404 once it expired or was answered). */
  getAssistantAccessRequest: (requestId: string) =>
    request<AssistantAccessRequest>(`/api/oauth/requests/${encodeURIComponent(requestId)}`),
  /** Teacher allows / anyone refuses → where the browser goes back to the assistant. */
  approveAssistantAccess: (requestId: string) =>
    request<AssistantAccessDecision>(`/api/oauth/requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
    }),
  denyAssistantAccess: (requestId: string) =>
    request<AssistantAccessDecision>(`/api/oauth/requests/${encodeURIComponent(requestId)}/deny`, { method: 'POST' }),
  /** Teacher: the assistants connected to their lessons. */
  listAssistantConnections: () => request<AssistantConnection[]>('/api/oauth/connections'),
  disconnectAssistant: (id: number) => request<void>(`/api/oauth/connections/${id}`, { method: 'DELETE' }),
  /** Teacher: the media library, newest first. */
  listMedia: () => request<MediaFile[]>('/api/media'),
  /** Teacher: a file into the media library under its name; 409 name_taken if another file has it. */
  uploadMedia: (file: File, name = file.name) =>
    request<MediaUploaded>(`/api/media?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    }),
  renameMedia: (id: number, name: string) => request<MediaFile>(`/api/media/${id}`, json('PATCH', { name })),
  /** 409 media_in_use while a lesson shows it. */
  deleteMedia: (id: number) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),
  deleteLesson: (id: number) => request<void>(`/api/lessons/${id}`, { method: 'DELETE' }),
  getLessonAccess: (id: number) => request<LessonAccess>(`/api/lessons/${id}/access`),
  setLessonAccess: (id: number, studentIds: number[], chapters?: Record<string, string[]>) =>
    request<LessonAccess>(`/api/lessons/${id}/access`, json('PUT', { studentIds, chapters })),

  listStudents: () => request<Student[]>('/api/students'),
  createStudent: (login: string, password: string) =>
    request<Student>('/api/students', json('POST', { login, password })),
  updateStudent: (id: number, changes: { login?: string; password?: string }) =>
    request<Student>(`/api/students/${id}`, json('PATCH', changes)),
  deleteStudent: (id: number) => request<void>(`/api/students/${id}`, { method: 'DELETE' }),

  listGroups: () => request<StudentGroup[]>('/api/groups'),
  /** 409 name_taken. */
  createGroup: (name: string, studentIds: number[]) =>
    request<StudentGroup>('/api/groups', json('POST', { name, studentIds })),
  updateGroup: (id: number, changes: { name?: string; studentIds?: number[] }) =>
    request<StudentGroup>(`/api/groups/${id}`, json('PATCH', changes)),
  deleteGroup: (id: number) => request<void>(`/api/groups/${id}`, { method: 'DELETE' }),

  /** Teacher: all homework (optionally filtered); student: their own. Newest first. */
  listHomework: (filter: { lessonId?: number; studentId?: number; status?: HomeworkStatus } = {}) => {
    const query = new URLSearchParams();
    if (filter.lessonId) query.set('lessonId', String(filter.lessonId));
    if (filter.studentId) query.set('studentId', String(filter.studentId));
    if (filter.status) query.set('status', filter.status);
    const qs = query.toString();
    return request<Homework[]>(`/api/homework${qs ? `?${qs}` : ''}`);
  },
  getHomework: (id: number) => request<Homework>(`/api/homework/${id}`),
  /** Teacher: the same exercises to each student (they get access to the lesson). */
  createHomework: (lessonId: number, studentIds: number[], exerciseIds: string[]) =>
    request<Homework[]>('/api/homework', json('POST', { lessonId, studentIds, exerciseIds })),
  /** Student: "Enviar al profesor". */
  submitHomework: (id: number) => request<Homework>(`/api/homework/${id}/submit`, { method: 'POST' }),
  /** Teacher: any status. */
  setHomeworkStatus: (id: number, status: HomeworkStatus) =>
    request<Homework>(`/api/homework/${id}`, json('PATCH', { status })),
  /** Teacher: the exercises a homework has from now on (the lesson's, lesson order). */
  setHomeworkExercises: (id: number, exerciseIds: string[]) =>
    request<Homework>(`/api/homework/${id}/exercises`, json('PUT', { exerciseIds })),
  /** Teacher: their class that is on (or null). */
  getCurrentClass: () => request<Class | null>('/api/classes/current'),
  /** Student: the class they are in (or null). */
  getMyClass: () => request<StudentClass | null>('/api/classes/current'),
  /** For a group (`groupId`) or one student (`studentId`). */
  startClass: (lessonId: number, audience: { groupId: number } | { studentId: number }, chapterId?: string | null) =>
    request<Class>('/api/classes', json('POST', { lessonId, ...audience, chapterId: chapterId ?? undefined })),
  /** Teacher: where the last class of a group / of one student stopped (null: no class yet). */
  getClassResume: (audience: { groupId: number } | { studentId: number }) => {
    const query = new URLSearchParams(Object.entries(audience).map(([key, id]) => [key, String(id)]));
    return request<ClassResume | null>(`/api/classes/resume?${query}`);
  },
  changeClassLesson: (classId: number, lessonId: number) =>
    request<Class>(`/api/classes/${classId}`, json('PATCH', { lessonId })),
  addClassStudent: (classId: number, studentId: number) =>
    request<Class>(`/api/classes/${classId}/students/${studentId}`, { method: 'PUT' }),
  /** One exercise of the class's lesson as homework for the class's students (only while the class is on). */
  setClassHomework: (classId: number, exerciseId: string) =>
    request<Class>(`/api/classes/${classId}/homework`, json('POST', { exerciseId })),
  removeClassStudent: (classId: number, studentId: number) =>
    request<Class>(`/api/classes/${classId}/students/${studentId}`, { method: 'DELETE' }),
  /** A word in any form → its lemmas with translations ([] if unknown). */
  lookupWord: (word: string) => request<LookupResult[]>(`/api/dictionary?word=${encodeURIComponent(word)}`),
  /** Student: their saved words, newest first. */
  listVocabulary: () => request<VocabularyEntry[]>('/api/vocabulary'),
  /** Student: saves a word (the server takes the translation from the dictionary). */
  saveWord: (word: string, lemma: string, lessonId?: number) =>
    request<VocabularyEntry>('/api/vocabulary', json('POST', { word, lemma, lessonId })),
  deleteWord: (id: number) => request<void>(`/api/vocabulary/${id}`, { method: 'DELETE' }),
  /** Student: the boards they can read (their own and their groups'). */
  listBoards: () => request<BoardInfo[]>('/api/boards'),
  /** A page of a board's lines: the latest, or those before the entry `before`. */
  getBoardPage: (boardId: number, before?: number) =>
    request<BoardPage>(`/api/boards/${boardId}/entries${before ? `?before=${before}` : ''}`),
  /** A new line on the board of the class going on (one line of plain text). */
  writeBoard: (boardId: number, text: string) =>
    request<BoardEntry>(`/api/boards/${boardId}/entries`, json('POST', { text })),
  /** The teacher deletes a line of the board of the class going on. */
  deleteBoardEntry: (boardId: number, entryId: number) =>
    request<void>(`/api/boards/${boardId}/entries/${entryId}`, { method: 'DELETE' }),
  endClass: (classId: number) => request<void>(`/api/classes/${classId}/end`, { method: 'POST' }),
  deleteHomework: (id: number) => request<void>(`/api/homework/${id}`, { method: 'DELETE' }),
  /** Student: own answers in a lesson. */
  getLessonStates: (lessonId: number) => request<LessonStates>(`/api/lessons/${lessonId}/states`),
  /** Student: the teacher's colours on their essays in a lesson. */
  getLessonHighlights: (lessonId: number) => request<LessonHighlights>(`/api/lessons/${lessonId}/highlights`),
  /** Student: saves one answer block (exercises/sync.tsx sends one per block at a time). */
  saveBlockState: (lessonId: number, blockId: string, state: unknown) =>
    request<BlockStateSaved>(`/api/lessons/${lessonId}/states/${encodeURIComponent(blockId)}`, {
      ...json('PUT', { state }),
      keepalive: true,
    }),
  /** Teacher: one student's answers in a lesson. */
  /** Teacher: the colours on one student's essays in a lesson. */
  getStudentHighlights: (lessonId: number, studentId: number) =>
    request<LessonHighlights>(`/api/lessons/${lessonId}/students/${studentId}/highlights`),
  /** Teacher: colour or uncolour a part of a student's essay; the answer is the essay's highlights. 409 text_changed. */
  editHighlights: (lessonId: number, studentId: number, blockId: string, edit: EditHighlightsInput) =>
    request<Highlight[]>(
      `/api/lessons/${lessonId}/students/${studentId}/highlights/${encodeURIComponent(blockId)}`,
      json('POST', edit),
    ),
  /** Student: the teacher's comments under their answers in a lesson. */
  getLessonComments: (lessonId: number) => request<LessonComments>(`/api/lessons/${lessonId}/comments`),
  /** Teacher: the comments to one student in a lesson. */
  getStudentComments: (lessonId: number, studentId: number) =>
    request<LessonComments>(`/api/lessons/${lessonId}/students/${studentId}/comments`),
  /** Teacher: the comment under a student's answer (an empty text removes it). */
  saveComment: (lessonId: number, studentId: number, blockId: string, text: string) =>
    request<{ text: string }>(
      `/api/lessons/${lessonId}/students/${studentId}/comments/${encodeURIComponent(blockId)}`,
      json('PUT', { text }),
    ),
  getStudentLessonStates: (lessonId: number, studentId: number) =>
    request<LessonStates>(`/api/lessons/${lessonId}/students/${studentId}/states`),
};
