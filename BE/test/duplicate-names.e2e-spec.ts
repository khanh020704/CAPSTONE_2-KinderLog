import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, isoDate } from '../src/common/utils/date.util';
import { loadDemoData } from './fixtures/demo-data';
import { prepareTestDatabase } from './test-db';

/**
 * Children with the same full name in one class. Every record is keyed by the child's id, so the data of
 * namesakes never mixes; only a name *said* in a voice report can be unclear, and then it is never guessed:
 * the statement is held until the teacher picks the child.
 */

const TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const day = addDays(isoDate(TZ), -20);
const SAME = 'Nguyễn Minh Anh';

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens: Record<string, string> = {};
let classId: string;
let twins: string[]; // three children called Nguyễn Minh Anh
let other: string; // Trần Minh Anh: same given name, other surname

const api = (method: 'get' | 'post' | 'put', path: string, who = 'teacher') =>
  request(http)[method](`/api${path}`).set('Authorization', `Bearer ${tokens[who]}`);
const login = (phone: string) => request(http).post('/api/auth/login').send({ phone, password: '123456' });
const classDay = async () =>
  (await api('get', `/daily-journals/class/${classId}?date=${day}`).expect(200)).body;
const journalOf = (d: any, id: string) => d.students.find((s: any) => s.student.id === id).journal;
const voiceDraft = async (transcript: string) =>
  (await api('post', '/class-journals/voice-draft').send({ classId, date: day, transcript }).expect(201))
    .body;

beforeAll(async () => {
  await prepareTestDatabase();
  await loadDemoData();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  tokens.principal = (await login('0902000001').expect(200)).body.accessToken;
  tokens.teacher = (await login('0903000002').expect(200)).body.accessToken; // homeroom of Mặt Trời 2
  classId = (await api('get', '/auth/me').expect(200)).body.classes[0].id;

  const add = async (fullName: string, dateOfBirth: string) =>
    (
      await api('post', '/students', 'principal')
        .send({ classId, fullName, dateOfBirth, gender: 'FEMALE' })
        .expect(201)
    ).body.id as string;
  twins = [await add(SAME, '2022-01-10'), await add(SAME, '2022-03-20'), await add(SAME, '2022-07-05')];
  other = await add('Trần Minh Anh', '2022-05-15');
});

afterAll(async () => {
  await app?.close();
});

describe('Children with the same full name', () => {
  it('can all be created, each with its own id', async () => {
    expect(new Set(twins).size).toBe(3);
    const named = (await classDay()).students.filter((s: any) => s.student.fullName === SAME);
    expect(named.map((s: any) => s.student.id).sort()).toEqual([...twins].sort());
    // The date of birth comes with each child, so the screens can tell the namesakes apart.
    expect(named.map((s: any) => s.student.dateOfBirth).sort()).toEqual([
      '2022-01-10',
      '2022-03-20',
      '2022-07-05',
    ]);
  });

  it('a journal written for one of them reaches only that child', async () => {
    // A past day: teachers edit only today, the principal any day.
    await api('put', `/daily-journals/student/${twins[0]}`, 'principal')
      .send({ date: day, attendance: 'PRESENT', mealLevel: 'ALL', teacherNote: 'Con ăn hết suất.' })
      .expect(200);
    const d = await classDay();
    expect(journalOf(d, twins[0])).toMatchObject({ mealLevel: 'ALL', teacherNote: 'Con ăn hết suất.' });
    expect(journalOf(d, twins[1])?.teacherNote ?? null).toBeNull();
    expect(journalOf(d, twins[2])?.teacherNote ?? null).toBeNull();
  });

  it('bulk logging with one exception changes only that child, not the namesakes', async () => {
    await api('post', '/daily-journals/bulk', 'principal')
      .send({
        classId,
        date: day,
        defaults: { attendance: 'PRESENT', mood: 'HAPPY' },
        exceptions: [{ studentId: twins[1], mood: 'SAD' }],
      })
      .expect(201);
    const d = await classDay();
    expect(journalOf(d, twins[1]).mood).toBe('SAD');
    expect(journalOf(d, twins[0]).mood).toBe('HAPPY');
    expect(journalOf(d, twins[2]).mood).toBe('HAPPY');
  });

  it('a voice report naming "bé Nguyễn Minh Anh" is never guessed: held, the three namesakes offered', async () => {
    const draft = await voiceDraft(`Cả lớp học hát. Bé ${SAME} ăn hết suất cơm.`);
    const issue = draft.issues.find((i: any) => i.type === 'ambiguous_student');
    expect(issue).toMatchObject({ held: true, status: 'open' });
    expect([...issue.candidates].sort()).toEqual([...twins].sort());
    for (const id of [...twins, other]) expect(draft.personal[id] ?? '').not.toMatch(/ăn hết suất/);
  });

  it('"bé Minh Anh" also matches Trần Minh Anh, so all four are offered', async () => {
    const draft = await voiceDraft('Bé Minh Anh ngủ ngon.');
    const issue = draft.issues.find((i: any) => i.type === 'ambiguous_student');
    expect([...issue.candidates].sort()).toEqual([...twins, other].sort());
  });

  it('the full name of the only Trần Minh Anh goes straight to her', async () => {
    const draft = await voiceDraft('Bé Trần Minh Anh ngủ ngon.');
    expect(draft.issues.filter((i: any) => i.type === 'ambiguous_student')).toHaveLength(0);
    expect(draft.personal[other]).toMatch(/ngủ ngon/);
    for (const id of twins) expect(draft.personal[id] ?? '').not.toMatch(/ngủ ngon/);
  });

  it('the teacher picks one namesake (here the principal, a past day); the note is saved for that child only', async () => {
    const draft = await voiceDraft(`Bé ${SAME} ăn hết suất cơm.`);
    const held = draft.issues.find((i: any) => i.held);
    const created = (
      await api('post', '/class-journals', 'principal')
        .send({
          classId,
          date: day,
          source: 'voice',
          sections: draft.sections,
          personal: { ...draft.personal, [twins[2]]: held.text },
          transcript: draft.transcript,
          issues: draft.issues,
        })
        .expect(201)
    ).body;
    const res = await api('put', `/class-journals/${created.id}`, 'principal')
      .send({
        personal: { ...created.personal, [twins[2]]: held.text },
        issues: created.issues.map((i: any) =>
          i.held
            ? { id: i.id, resolution: 'assigned', assignedTo: [twins[2]] }
            : { id: i.id, resolution: 'confirmed' },
        ),
      })
      .expect(200);
    expect(res.body.issues.every((i: any) => i.status === 'resolved')).toBe(true);
    expect(res.body.personal[twins[2]]).toMatch(/ăn hết suất/);
    expect(res.body.personal[twins[0]] ?? '').not.toMatch(/ăn hết suất/);
    expect(res.body.personal[twins[1]] ?? '').not.toMatch(/ăn hết suất/);
  });
});
