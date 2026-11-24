import '../tempDataDir';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boardOfStudent } from '../../src/board/store';
import * as db from '../../src/db';

/** addClassHomework (db.ts): exercises set during a class go into one homework per student and lesson. */
describe('class homework', () => {
  const teacher = db.createUser('t', 'x', 'teacher');
  const ana = db.createUser('ana', 'x', 'student');
  const ben = db.createUser('ben', 'x', 'student');
  const lessonA = db.createLesson('A', '{}');
  const lessonB = db.createLesson('B', '{}');
  const cls = db.createClass(teacher.id, lessonA.id, [ana.id, ben.id], {
    groupId: null,
    soloStudentId: null,
    boardId: boardOfStudent(ana.id).id,
  });
  const homeworkOf = (studentId: number, lessonId: number) =>
    db.listHomework({ studentId, lessonId }).filter((h) => h.class_session_id === cls.id);

  it('the first exercise makes a homework for each student, the next ones join it', () => {
    const first = db.addClassHomework(cls.id, lessonA.id, [ana.id, ben.id], 'e1', 'c1');
    assert.deepEqual(
      first.map((r) => [r.studentId, r.created, r.added]),
      [
        [ana.id, true, true],
        [ben.id, true, true],
      ],
    );
    const second = db.addClassHomework(cls.id, lessonA.id, [ana.id, ben.id], 'e2', 'c1');
    assert.deepEqual(
      second.map((r) => [r.created, r.added]),
      [
        [false, true],
        [false, true],
      ],
    );
    assert.equal(second[0].homeworkId, first[0].homeworkId);
    const [h] = homeworkOf(ana.id, lessonA.id);
    assert.equal(homeworkOf(ana.id, lessonA.id).length, 1);
    assert.deepEqual([...h.exercise_ids].sort(), ['e1', 'e2']);
    assert.equal(h.status, 'assigned');
  });

  it('the same exercise twice changes nothing', () => {
    const again = db.addClassHomework(cls.id, lessonA.id, [ana.id], 'e1', 'c1');
    assert.deepEqual([again[0].created, again[0].added], [false, false]);
    assert.equal(homeworkOf(ana.id, lessonA.id)[0].exercise_ids.length, 2);
  });

  it('another lesson of the same class is a new homework', () => {
    const r = db.addClassHomework(cls.id, lessonB.id, [ana.id], 'x1', 'c9');
    assert.equal(r[0].created, true);
    assert.equal(homeworkOf(ana.id, lessonB.id).length, 1);
    assert.notEqual(r[0].homeworkId, homeworkOf(ana.id, lessonA.id)[0].id);
  });

  it('a homework already sent is the student’s turn again when it gets an exercise; one that is not new does not reopen it', () => {
    const [h] = homeworkOf(ben.id, lessonA.id);
    db.setHomeworkStatus(h.id, 'submitted');
    db.addClassHomework(cls.id, lessonA.id, [ben.id], 'e1', 'c1');
    assert.equal(db.getHomework(h.id)?.status, 'submitted', 'nothing was added');
    db.addClassHomework(cls.id, lessonA.id, [ben.id], 'e3', 'c1');
    assert.equal(db.getHomework(h.id)?.status, 'assigned');
  });

  it('students get the chapter; homework from "Asignar tarea" is apart', () => {
    assert.ok(db.hasLessonAccess(lessonA.id, ana.id));
    const [fromTab] = db.createHomework(lessonA.id, [ana.id], ['z'], ['c1']).map((id) => db.getHomework(id)!);
    assert.equal(fromTab.class_session_id, null);
    assert.equal(homeworkOf(ana.id, lessonA.id).length, 1, 'the class one is still one');
  });
});
