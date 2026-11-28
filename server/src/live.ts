import type {
  AnswerEvent,
  CallEvent,
  NavigateEvent,
  PositionEvent,
  Presence,
  StudentClass,
} from '@cuadrilo/shared/api';
import type { CommentEvent } from '@cuadrilo/shared/comments';
import type { HighlightsEvent } from '@cuadrilo/shared/highlights';
import { hasChapter, hasExercise, playableWheelItems } from '@cuadrilo/shared/lesson';
import type { WheelRequest, WheelUpdate } from '@cuadrilo/shared/wheel';
import type { Namespace, Server, Socket } from 'socket.io';

import { type AppUser, userFromCookies } from './auth';
import { openChaptersFor } from './chapterAccess';
import { lessonContent } from './content';
import * as db from './db';
import { wheelStore } from './wheelStore';

/**
 * The live connection: socket.io namespace /live (types in @cuadrilo/shared/api).
 * Everyone signed in is connected on every page, so they learn about their
 * class, the teacher's "call" and homework changes wherever they are.
 *
 * Rooms: student:<id>, teacher:<id>, and teachers (all of them: homework is
 * shared by the teachers).
 *
 * Classes
 *
 * Student → server:  position { lessonId, chapterId, itemId, itemIds } | { lessonId: null }
 * Teacher → server:  presence (ack: Presence[]), navigate { studentId, chapterId, itemId? } (ack),
 *                    call { studentId } (ack), chapter { lessonId, chapterId } (the chapter the teacher
 *                    has open: kept as where the class stopped)
 * Server → teacher:  presence Presence, answer AnswerEvent
 * Server → student:  class StudentClass | null, navigate { chapterId, itemId }, call { lessonId }
 * Server → both:     board BoardEvent (a new line on the class's board, see board/router.ts),
 *                    boardRemoved BoardRemovedEvent (the teacher deleted a line)
 *
 * The wheel of a class (a `wheel` block; the state is in wheelStore.ts)
 * Teacher or student → server:  wheelState { lessonId, blockId } (ack: WheelUpdate | null),
 *                               wheelSpin { lessonId, blockId } (ack: WheelUpdate | null)
 * Server → the class (teacher and students):  wheel WheelUpdate
 *
 * Homework (sent by the API after a change, see homework.ts)
 * Server → student / teachers:  homework HomeworkEvent, homeworkDeleted { id }
 *
 * The platform's settings (sent by the API after a teacher changed them, see settings.ts)
 * Server → everyone:  settings AppSettings (the theme then changes on every open page, without a reload)
 *
 * Presence lives in memory only; everything else is in the database.
 */

/** A class is closed this long after its teacher was last connected. */
const STALE_CLASS_MS = 30 * 60 * 1000;
/** How often classes are kept alive / closed; shorter in the tests. */
const HOUSEKEEPING_MS = Number(process.env.HOUSEKEEPING_MS) || 60 * 1000;

const teacherRoom = (teacherId: number) => `teacher:${teacherId}`;
const studentRoom = (studentId: number) => `student:${studentId}`;
const TEACHERS_ROOM = 'teachers';

let namespace: Namespace | undefined;

/** Per student: their open sockets with the position each one reported (the latest last). */
const studentSockets = new Map<number, Map<string, PositionEvent>>();

// ----- what the API layer calls -----

/** An event to all the open pages of a student. */
export function emitToStudent(studentId: number, event: string, payload: unknown): void {
  namespace?.to(studentRoom(studentId)).emit(event, payload);
}

/** An event to all the open pages of every teacher. */
export function emitToTeachers(event: string, payload: unknown): void {
  namespace?.to(TEACHERS_ROOM).emit(event, payload);
}

/** An event to every open page of everyone signed in. */
export function emitToEveryone(event: string, payload: unknown): void {
  namespace?.emit(event, payload);
}

/** What a student is told about their class. */
export function studentClassOf(studentId: number): StudentClass | null {
  const cls = db.getActiveClassOfStudent(studentId);
  if (!cls) return null;
  const lesson = cls.lesson_id === null ? undefined : db.getLesson(cls.lesson_id);
  return {
    id: cls.id,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title ?? null,
    boardId: cls.board_id,
    chapterId: db.getPositionOfClass(cls)?.chapterId ?? null,
  };
}

/** Tells these students their class state (after a change in the class) and their teacher where they are. */
export function sendClassStateToStudents(studentIds: number[]): void {
  for (const studentId of studentIds) {
    namespace?.to(studentRoom(studentId)).emit('class', studentClassOf(studentId));
    sendPresenceToTeacher(studentId);
  }
}

/** A student saved an answer: shown live to the teacher if it is in their class's lesson. */
export function relayAnswer(lessonId: number, studentId: number, blockId: string, state: unknown): void {
  const cls = db.getActiveClassOfStudent(studentId);
  if (!cls || cls.lesson_id !== lessonId) return;
  const event: AnswerEvent = { studentId, blockId, state };
  namespace?.to(teacherRoom(cls.teacher_id)).emit('answer', event);
}

/** The highlights of a student's answer changed: to the student's pages and every teacher's. */
export function sendHighlights(event: HighlightsEvent): void {
  emitToStudent(event.studentId, 'highlights', event);
  emitToTeachers('highlights', event);
}

/** The teacher's comment under a student's answer changed: to the student's pages and every teacher's. */
export function sendComment(event: CommentEvent): void {
  emitToStudent(event.studentId, 'comment', event);
  emitToTeachers('comment', event);
}

/** An event to the class: the teacher's open pages and the students currently in it. */
export function emitToClass(cls: db.ClassSession, event: string, payload: unknown): void {
  const rooms = [teacherRoom(cls.teacher_id), ...db.listClassStudents(cls.id).map((s) => studentRoom(s.student_id))];
  namespace?.to(rooms).emit(event, payload);
}

// ----- the wheel of a class -----

/** A teacher's or a student's call about a wheel, checked: their class is on this lesson and the block is a wheel. */
function wheelOf(
  payload: unknown,
  classOf: () => db.ClassSession | undefined,
): { cls: db.ClassSession; request: WheelRequest; count: number } | undefined {
  const { lessonId, blockId } = (payload ?? {}) as Partial<WheelRequest>;
  if (typeof lessonId !== 'number' || typeof blockId !== 'string' || blockId.length > 64) return undefined;
  const cls = classOf();
  if (!cls || cls.lesson_id !== lessonId) return undefined;
  const content = lessonContent(lessonId);
  const items = content ? playableWheelItems(content, blockId) : undefined;
  if (!items || items.length < 2) return undefined;
  return { cls, request: { lessonId, blockId }, count: items.length };
}

const wheelUpdate = (request: WheelRequest, state: WheelUpdate['state'], started?: boolean): WheelUpdate => ({
  ...request,
  state,
  serverNow: Date.now(),
  ...(started === undefined ? {} : { started }),
});

/** Everyone in the class gets a spin: the teacher's open pages and the students'. */
function sendWheel(cls: db.ClassSession, update: WheelUpdate): void {
  emitToClass(cls, 'wheel', update);
}

/** The wheel's events for one connected user (teacher or student of a class). */
function onWheel(socket: Socket, classOf: () => db.ClassSession | undefined): void {
  // Where the wheel is now (a page that opened the exercise later, or reconnected).
  socket.on('wheelState', (payload: unknown, ack?: (update: WheelUpdate | null) => void) => {
    const call = wheelOf(payload, classOf);
    if (typeof ack === 'function')
      ack(call ? wheelUpdate(call.request, wheelStore.get(call.cls.id, call.request.blockId) ?? null) : null);
  });

  // Anyone in the class may spin; a wheel that is turning is not spun again.
  socket.on('wheelSpin', (payload: unknown, ack?: (update: WheelUpdate | null) => void) => {
    const call = wheelOf(payload, classOf);
    if (!call) {
      if (typeof ack === 'function') ack(null);
      return;
    }
    const { started, state } = wheelStore.spin(call.cls.id, call.request.blockId, call.count);
    const update = wheelUpdate(call.request, state, started);
    if (started) sendWheel(call.cls, update);
    if (typeof ack === 'function') ack(update);
  });
}

/** The class is over or has another lesson now: its wheels start again. */
export function forgetClassWheels(classId: number): void {
  wheelStore.forgetClass(classId);
}

// ----- presence -----

function presenceOf(studentId: number, login: string, cls: db.ClassSession): Presence {
  const sockets = studentSockets.get(studentId);
  // The latest position reported in the class's lesson (Map keeps insertion order; updates re-insert).
  let last: Extract<PositionEvent, { lessonId: number }> | undefined;
  for (const position of sockets?.values() ?? []) {
    if (position.lessonId !== null && position.lessonId === cls.lesson_id) last = position;
  }
  return {
    studentId,
    login,
    online: !!sockets?.size,
    inLesson: !!last,
    chapterId: last?.chapterId ?? null,
    itemId: last?.itemId ?? null,
    itemIds: last?.itemIds ?? (last?.itemId ? [last.itemId] : []),
  };
}

/** Sends the student's presence to the teacher of their class, if they are in one (the class is looked up unless given). */
function sendPresenceToTeacher(studentId: number, cls = db.getActiveClassOfStudent(studentId)): void {
  const login = db.getUser(studentId)?.login;
  if (!cls || !login) return;
  namespace?.to(teacherRoom(cls.teacher_id)).emit('presence', presenceOf(studentId, login, cls));
}

// ----- connections -----

export function attachLive(io: Server): void {
  const live = io.of('/live');
  namespace = live;

  // Signed in. Same-origin is checked by the server (allowRequest).
  live.use((socket, next) => {
    const user = userFromCookies(socket.request.headers.cookie);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  live.on('connection', (socket) => {
    const user = socket.data.user as AppUser;
    // A session ended elsewhere (logout, password change) does not close an
    // open socket by itself; re-check periodically.
    const recheck = setInterval(() => {
      if (!userFromCookies(socket.request.headers.cookie)) socket.disconnect(true);
    }, 60_000);
    socket.on('disconnect', () => clearInterval(recheck));

    if (user.role === 'teacher') onTeacher(socket, user.dbId);
    else onStudent(socket, user.dbId);
  });

  const housekeeping = setInterval(() => {
    // Teachers with the class page open keep their class alive.
    for (const room of live.adapter.rooms.keys()) {
      if (!room.startsWith('teacher:')) continue;
      const cls = db.getActiveClassOfTeacher(Number(room.slice('teacher:'.length)));
      if (cls) db.touchClassTeacher(cls.id);
    }
    // A class left open without its teacher ends by itself.
    for (const cls of db.listStaleClasses(new Date(Date.now() - STALE_CLASS_MS).toISOString())) {
      const studentIds = db.listClassStudents(cls.id).map((s) => s.student_id);
      db.endClass(cls.id);
      forgetClassWheels(cls.id);
      sendClassStateToStudents(studentIds);
    }
  }, HOUSEKEEPING_MS);
  housekeeping.unref();
}

function onTeacher(socket: Socket, teacherId: number): void {
  void socket.join([teacherRoom(teacherId), TEACHERS_ROOM]);
  const active = db.getActiveClassOfTeacher(teacherId);
  if (active) db.touchClassTeacher(active.id);
  onWheel(socket, () => db.getActiveClassOfTeacher(teacherId));

  /** The teacher's class with this student in it, if any. */
  const classWith = (studentId: number) => {
    const cls = db.getActiveClassOfTeacher(teacherId);
    if (!cls) return undefined;
    return db.listClassStudents(cls.id).some((s) => s.student_id === studentId) ? cls : undefined;
  };

  socket.on('presence', (ack?: (list: Presence[]) => void) => {
    if (typeof ack !== 'function') return;
    const cls = db.getActiveClassOfTeacher(teacherId);
    ack(cls ? db.listClassStudents(cls.id).map((s) => presenceOf(s.student_id, s.login, cls)) : []);
  });

  // Soft anchor: the student's page opens the chapter and scrolls to the item.
  socket.on('navigate', (payload: unknown, ack?: (ok: boolean) => void) => {
    const { studentId, chapterId, itemId } = (payload ?? {}) as Partial<NavigateEvent>;
    if (typeof studentId !== 'number') {
      reply(ack, false);
      return;
    }
    const cls = classWith(studentId);
    const content = cls?.lesson_id ? lessonContent(cls.lesson_id) : undefined;
    const ok =
      !!content &&
      typeof chapterId === 'string' &&
      hasChapter(content, chapterId) &&
      (itemId == null || (typeof itemId === 'string' && hasExercise(content, chapterId, itemId)));
    if (ok) {
      // A chapter the teacher shows is open to the student (their page loads it, then follows).
      if (cls?.lesson_id) openChaptersFor(cls.lesson_id, [studentId], [chapterId as string]);
      namespace?.to(studentRoom(studentId)).emit('navigate', { chapterId, itemId: itemId ?? null });
    }
    reply(ack, ok);
  });

  // The teacher opened a chapter of the class's lesson: that is where the group / student stopped.
  socket.on('chapter', (payload: unknown) => {
    const { lessonId, chapterId } = (payload ?? {}) as { lessonId?: unknown; chapterId?: unknown };
    const cls = db.getActiveClassOfTeacher(teacherId);
    if (!cls || typeof chapterId !== 'string' || lessonId !== cls.lesson_id || cls.lesson_id === null) return;
    const content = lessonContent(cls.lesson_id);
    if (!content || !hasChapter(content, chapterId)) return;
    db.saveClassPosition(cls, cls.lesson_id, chapterId);
    // The class is in this chapter: it is open to the students of the class.
    openChaptersFor(
      cls.lesson_id,
      db.listClassStudents(cls.id).map((s) => s.student_id),
      [chapterId],
    );
  });

  // "Come to the lesson": the student sees a banner with a link (no redirect).
  socket.on('call', (payload: unknown, ack?: (ok: boolean) => void) => {
    const { studentId } = (payload ?? {}) as Partial<CallEvent>;
    if (typeof studentId !== 'number') {
      reply(ack, false);
      return;
    }
    const cls = classWith(studentId);
    const ok = !!cls?.lesson_id;
    if (ok) namespace?.to(studentRoom(studentId)).emit('call', { lessonId: cls.lesson_id });
    reply(ack, ok);
  });
}

/** Answers a teacher's request if they asked for an answer (socket.io acknowledgement). */
function reply(ack: ((ok: boolean) => void) | undefined, ok: boolean): void {
  if (typeof ack === 'function') ack(ok);
}

function onStudent(socket: Socket, studentId: number): void {
  void socket.join(studentRoom(studentId));
  let sockets = studentSockets.get(studentId);
  if (!sockets) {
    sockets = new Map();
    studentSockets.set(studentId, sockets);
  }
  sockets.set(socket.id, { lessonId: null });
  onWheel(socket, () => db.getActiveClassOfStudent(studentId));
  socket.emit('class', studentClassOf(studentId));
  sendPresenceToTeacher(studentId);

  socket.on('position', (payload: unknown) => {
    const position = parsePosition(payload);
    if (!position) return;
    sockets.delete(socket.id); // re-insert: the latest position goes last
    sockets.set(socket.id, position);
    const cls = db.getActiveClassOfStudent(studentId);
    if (!cls) return;
    if (position.lessonId !== null && position.lessonId === cls.lesson_id) db.markClassStudentJoined(cls.id, studentId);
    sendPresenceToTeacher(studentId, cls);
  });

  socket.on('disconnect', () => {
    sockets.delete(socket.id);
    if (sockets.size === 0) studentSockets.delete(studentId);
    sendPresenceToTeacher(studentId);
  });
}

/** A screen holds a few exercises; more is not a screen. */
const MAX_ITEMS_IN_VIEW = 20;

const shortString = (value: unknown) => (typeof value === 'string' && value.length <= 64 ? value : null);

function parsePosition(payload: unknown): PositionEvent | undefined {
  const { lessonId, chapterId, itemId, itemIds } = (payload ?? {}) as Record<string, unknown>;
  if (lessonId === null) return { lessonId: null };
  if (typeof lessonId !== 'number' || !Number.isInteger(lessonId)) return undefined;
  const ids = (Array.isArray(itemIds) ? itemIds.slice(0, MAX_ITEMS_IN_VIEW) : [])
    .map(shortString)
    .filter((id): id is string => id !== null);
  const first = ids[0] ?? shortString(itemId);
  // An older page sends one item.
  return {
    lessonId,
    chapterId: shortString(chapterId),
    itemId: first,
    itemIds: ids.length > 0 || !first ? ids : [first],
  };
}
