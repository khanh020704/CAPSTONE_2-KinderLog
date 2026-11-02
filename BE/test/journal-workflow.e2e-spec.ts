import { createHmac } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, isoDate } from '../src/common/utils/date.util';
import { loadDemoData } from './fixtures/demo-data';
import { prepareTestDatabase } from './test-db';

/**
 * The class journal of one class and day, end to end: the six sections shared with the class and the private note
 * of each child, DRAFT / REVIEW → APPROVED → PUBLISHED, who may take each step, what each parent sees at each step,
 * changes after publishing (parents keep the published version until it is published again), further recordings that
 * add to the draft or correct it, and the attendance register beside it.
 */

const TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const today = isoDate(TZ);
const PHONES = {
  admin: '0901000001',
  principal: '0902000001',
  otherPrincipal: '0902000002',
  teacher: '0903000002', // homeroom teacher of Mặt Trời 2
  otherTeacher: '0903000001', // Mặt Trời 1
  parent: '0904000017', // a parent of a child in Mặt Trời 2
  otherParent: '0904000001', // a parent in Mặt Trời 1
};

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens: Record<string, string> = {};
let classId: string;
let otherClassId: string;
let child: { id: string; fullName: string };
let roster: { id: string; fullName: string }[];

const api = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, who: string) =>
  request(http)
    [method](`/api${path}`)
    .set('Authorization', `Bearer ${tokens[who] ?? who}`);
const login = (phone: string) => request(http).post('/api/auth/login').send({ phone, password: '123456' });
const classDay = async (who = 'teacher', date = today) =>
  (await api('get', `/daily-journals/class/${classId}?date=${date}`, who).expect(200)).body;
const timelineDay = async (who = 'parent', date = today) =>
  (await api('get', `/daily-journals/timeline?studentId=${child.id}`, who).expect(200)).body.days.find(
    (d: { date: string }) => d.date === date,
  );
const entryOf = (day: any, studentId: string) =>
  day.students.find((s: any) => s.student.id === studentId).journal;
const otherChildOf = () => roster.find((s) => s.id !== child.id)!;

beforeAll(async () => {
  await prepareTestDatabase();
  await loadDemoData();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  for (const [k, phone] of Object.entries(PHONES))
    tokens[k] = (await login(phone).expect(200)).body.accessToken;

  const me = (await api('get', '/auth/me', 'teacher').expect(200)).body;
  classId = me.classes[0].id;
  otherClassId = (await api('get', '/auth/me', 'otherTeacher').expect(200)).body.classes[0].id;
  const parent = (await api('get', '/auth/me', 'parent').expect(200)).body;
  child = parent.children.find((c: any) => c.class?.id === classId);
  roster = (await classDay()).students.map((s: any) => s.student);
});

afterAll(async () => {
  await app?.close();
});

describe('Class and day', () => {
  it('a day without a date is today in Asia/Ho_Chi_Minh, and a chosen date round-trips unchanged', async () => {
    expect((await classDay('teacher', today)).date).toBe(today);
    const res = await api('get', `/daily-journals/class/${classId}`, 'teacher').expect(200);
    expect(res.body.date).toBe(today);
    const past = addDays(today, -2);
    // an earlier day is corrected by the principal (teachers take attendance for today only)
    await api('post', '/daily-journals/bulk', 'principal')
      .send({ classId, date: past, defaults: { mealLevel: 'MOST' } })
      .expect(201);
    const day = await classDay('teacher', past);
    expect(day.date).toBe(past);
    expect(day.students.every((s: any) => s.journal?.journalDate === past)).toBe(true);
  });

  it('the fixture child is in the class under test', () => {
    expect(child).toBeDefined();
    expect(roster.length).toBeGreaterThan(3);
  });
});

describe("Edit window: teachers change today's journal only (school time zone), the principal any past day", () => {
  it("today: the teacher writes, changes and approves the class's journal; never the future", async () => {
    const created = await api('post', '/class-journals', 'otherTeacher')
      .send({ classId: otherClassId, sections: { meal: 'Hôm nay các con ăn cơm.' } })
      .expect(201);
    expect(created.body).toMatchObject({ date: today, editable: true });
    await api('put', `/class-journals/${created.body.id}`, 'otherTeacher')
      .send({ sections: { meal: 'Hôm nay các con ăn hết suất.' } })
      .expect(200);
    await api('post', `/class-journals/${created.body.id}/approve`, 'otherTeacher').expect(201);
    await api('post', '/class-journals', 'otherTeacher')
      .send({ classId: otherClassId, date: addDays(today, 1), sections: { meal: 'Ngày mai.' } })
      .expect(400);
  });

  it('yesterday and before: the teacher cannot add a journal', async () => {
    for (const back of [1, 3, 8]) {
      const res = await api('post', '/class-journals', 'teacher')
        .send({ classId, date: addDays(today, -back), sections: { meal: 'Ngày cũ.' } })
        .expect(403);
      expect(res.body.message).toMatch(/only change today's journal/);
    }
  });

  it('an earlier journal stays readable for the teacher; only the principal changes, approves or publishes it', async () => {
    const day = addDays(today, -10);
    const old = await api('post', '/class-journals', 'principal')
      .send({ classId, date: day, sections: { meal: 'Mười ngày trước.' } })
      .expect(201);
    expect(old.body.editable).toBe(true); // for the principal

    const seen = await api('get', `/class-journals/${old.body.id}`, 'teacher').expect(200);
    expect(seen.body).toMatchObject({ id: old.body.id, editable: false });
    const list = await api('get', `/class-journals?classId=${classId}&date=${day}`, 'teacher').expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ id: old.body.id, editable: false })]);

    await api('put', `/class-journals/${old.body.id}`, 'teacher')
      .send({ sections: { meal: 'Giáo viên sửa.' } })
      .expect(403);
    await api('post', `/class-journals/${old.body.id}/recordings`, 'teacher')
      .send({ transcript: 'Ghi thêm.' })
      .expect(403);
    await api('post', `/class-journals/${old.body.id}/approve`, 'teacher').expect(403);

    await api('put', `/class-journals/${old.body.id}`, 'principal')
      .send({ sections: { meal: 'Hiệu trưởng sửa.' } })
      .expect(200);
    await api('post', `/class-journals/${old.body.id}/approve`, 'principal').expect(201);
    // approved by the principal, still not the teacher's to publish
    await api('post', `/class-journals/${old.body.id}/publish`, 'teacher').expect(403);
    const after = await api('get', `/class-journals/${old.body.id}`, 'teacher').expect(200);
    expect(after.body).toMatchObject({ status: 'approved', sections: { meal: 'Hiệu trưởng sửa.' } });
  });
});

describe('Attendance for parents', () => {
  it('parents see attendance as soon as it is saved (before publishing); staff notes on present children stay hidden', async () => {
    // a weekend day without entries (no fixture data on weekends; 2 days ago is used by "Class and day").
    // Seven days in a row always hold a weekend day; 3–7 alone has none when the run is on a Monday.
    const day = [3, 4, 5, 6, 7, 8, 9]
      .map((n) => addDays(today, -n))
      .find((d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))!;
    const get = async (who: string) =>
      (await api('get', `/daily-journals/attendance?studentId=${child.id}&date=${day}`, who).expect(200))
        .body;
    expect(await get('parent')).toMatchObject({ attendance: null, absenceReason: null });

    await api('put', `/daily-journals/student/${child.id}`, 'principal')
      .send({ date: day, attendance: 'PRESENT', absenceReason: 'Đến muộn 15 phút' })
      .expect(200);
    expect(await get('parent')).toMatchObject({ attendance: 'PRESENT', absenceReason: null });
    expect(await get('teacher')).toMatchObject({ attendance: 'PRESENT', absenceReason: 'Đến muộn 15 phút' });
    // the journal of that day is still a draft: the parent's timeline does not have it
    expect(await timelineDay('parent', day)).toBeUndefined();

    await api('put', `/daily-journals/student/${child.id}`, 'principal')
      .send({ date: day, attendance: 'ABSENT', absenceReason: 'Bé bị sốt' })
      .expect(200);
    expect(await get('parent')).toMatchObject({ attendance: 'ABSENT', absenceReason: 'Bé bị sốt' });

    await api('get', `/daily-journals/attendance?studentId=${child.id}&date=${day}`, 'otherParent').expect(
      403,
    );
  });
});

describe('Attendance notes', () => {
  it('a present child keeps a note; an old absence reason goes when the child is back without a new note', async () => {
    const day = addDays(today, -3);
    const [a, b] = roster;
    const sheet = (exceptions: Record<string, unknown>[]) =>
      api('post', '/daily-journals/bulk', 'principal')
        .send({ classId, date: day, defaults: { attendance: 'PRESENT' }, exceptions })
        .expect(201);
    const noteOf = async (id: string) => entryOf(await classDay('teacher', day), id).absenceReason;

    await sheet([
      { studentId: a.id, attendance: 'PRESENT', absenceReason: 'Đến muộn 15 phút' },
      { studentId: b.id, attendance: 'ABSENT', absenceReason: 'Bé bị sốt' },
    ]);
    expect(await noteOf(a.id)).toBe('Đến muộn 15 phút');
    expect(await noteOf(b.id)).toBe('Bé bị sốt');

    // a later save that does not mention the notes (e.g. the journal form) keeps them
    await api('post', '/daily-journals/bulk', 'principal')
      .send({
        classId,
        date: day,
        defaults: { mealLevel: 'ALL' },
        exceptions: [{ studentId: b.id, attendance: 'ABSENT' }],
      })
      .expect(201);
    expect(await noteOf(a.id)).toBe('Đến muộn 15 phút');
    expect(await noteOf(b.id)).toBe('Bé bị sốt');

    // b comes back: the absence reason is dropped; a note given at the same time is kept
    await sheet([]);
    expect(await noteOf(b.id)).toBeNull();
    await sheet([{ studentId: b.id, attendance: 'ABSENT', absenceReason: 'Bé bị sốt' }]);
    await sheet([{ studentId: b.id, attendance: 'PRESENT', absenceReason: 'Đi học lại, còn hơi ho' }]);
    expect(await noteOf(b.id)).toBe('Đi học lại, còn hơi ho');
  });
});

describe('Journal photo upload permissions', () => {
  it.each(['admin', 'principal', 'teacher'])('%s can reach the upload handler', async (who) => {
    const res = await api('post', '/class-journals/photos', who).expect(400);
    expect(res.body.message).toBe('Attach at least one image in the "photos" field');
  });

  it('parents cannot upload journal photos', () =>
    api('post', '/class-journals/photos', 'parent').expect(403));
});

describe('The class journal: DRAFT → APPROVED → PUBLISHED', () => {
  let id: string;
  const other = () => otherChildOf();

  it('a journal for a future day (400) or a child of another class (400) is refused', async () => {
    await api('post', '/class-journals', 'teacher')
      .send({ classId, date: addDays(today, 1), sections: { meal: 'x' } })
      .expect(400);
    const stranger = (await api('get', `/daily-journals/class/${otherClassId}`, 'otherTeacher').expect(200))
      .body.students[0].student.id;
    await api('post', '/class-journals', 'teacher')
      .send({ classId, sections: { meal: 'x' }, personal: { [stranger]: 'Ghi chú' } })
      .expect(400);
    await api('post', '/class-journals', 'otherTeacher')
      .send({ classId, sections: { meal: 'x' } })
      .expect(403);
  });

  it('written by hand it starts as a DRAFT; one journal per class and day', async () => {
    const res = await api('post', '/class-journals', 'teacher')
      .send({
        classId,
        sections: { meal: 'Các con ăn cơm, canh rau ngót.', learning: 'Cả lớp học hát.' },
        personal: { [child.id]: 'Con hôm nay mạnh dạn phát biểu.' },
      })
      .expect(201);
    id = res.body.id;
    expect(res.body).toMatchObject({
      status: 'draft',
      source: 'manual',
      date: today,
      revision: 0,
      sections: { meal: 'Các con ăn cơm, canh rau ngót.', learning: 'Cả lớp học hát.', sleep: '' },
      personal: { [child.id]: 'Con hôm nay mạnh dạn phát biểu.' },
    });
    await api('post', '/class-journals', 'teacher')
      .send({ classId, sections: { meal: 'y' } })
      .expect(409);
    expect((await classDay()).classJournal).toMatchObject({ id, status: 'draft' });
  });

  it('DRAFT: parents see nothing, not even by id; publishing before approving is refused', async () => {
    expect(await timelineDay()).toBeUndefined();
    await api('get', `/class-journals/${id}`, 'parent').expect(403);
    await api('post', `/class-journals/${id}/publish`, 'teacher').expect(409);
  });

  it('only the class teacher and the school principal work on it', async () => {
    await api('put', `/class-journals/${id}`, 'otherTeacher').send({ sections: {} }).expect(403);
    await api('post', `/class-journals/${id}/approve`, 'otherPrincipal').expect(403);
    await api('post', `/class-journals/${id}/approve`, 'parent').expect(403);
    await api('get', `/class-journals?classId=${classId}`, 'otherTeacher').expect(403);
  });

  it('saving keeps it a draft; an empty journal cannot be approved', async () => {
    const res = await api('put', `/class-journals/${id}`, 'teacher')
      .send({
        sections: {
          meal: 'Các con ăn cơm, canh rau ngót.',
          learning: 'Cả lớp học hát.',
          note: 'Mai các con mặc đồng phục.',
        },
        personal: { [child.id]: 'Con hôm nay mạnh dạn phát biểu.', [other().id]: 'Con hơi ho nhẹ.' },
      })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'draft' });
    expect(Object.keys(res.body.personal)).toHaveLength(2);
    const empty = await api('post', '/class-journals', 'principal')
      .send({ classId, date: addDays(today, -1) })
      .expect(201);
    await api('post', `/class-journals/${empty.body.id}/approve`, 'principal').expect(409);
  });

  it('APPROVED: still nothing for parents; PUBLISHED: each parent sees the class and only their own child', async () => {
    expect((await api('post', `/class-journals/${id}/approve`, 'teacher').expect(201)).body.status).toBe(
      'approved',
    );
    expect(await timelineDay()).toBeUndefined();
    const res = await api('post', `/class-journals/${id}/publish`, 'teacher').expect(201);
    expect(res.body).toMatchObject({ status: 'published', revision: 1 });

    const day = await timelineDay();
    expect(day).toMatchObject({
      sections: { meal: 'Các con ăn cơm, canh rau ngót.', note: 'Mai các con mặc đồng phục.' },
      personalNote: 'Con hôm nay mạnh dạn phát biểu.',
    });
    expect(day.events.map((e: any) => e.key)).toEqual(
      expect.arrayContaining(['meal', 'learning', 'classNote', 'note']),
    );
    // the note about another child is not in this parent's answer at all
    expect(JSON.stringify(day)).not.toContain('Con hơi ho nhẹ.');
  });

  it('parents are told: the whole class about the journal, a child’s parents about that child’s note', async () => {
    const notes = (await api('get', '/notifications?type=JOURNAL', 'parent').expect(200)).body.items;
    const titles = notes.map((n: any) => n.title);
    expect(titles).toContain('New journal published');
    expect(titles).toContain(`A note about ${child.fullName}`);
    expect(notes.find((n: any) => n.title === 'New journal published').link).toBe(
      `/parent/journal?date=${today}`,
    );
  });

  it('a parent sees only their own child: another child of the class → 403', async () => {
    await api('get', `/daily-journals/timeline?studentId=${other().id}`, 'parent').expect(403);
  });

  it('changed after publishing: back to draft, parents keep the published version until it is published again', async () => {
    const res = await api('put', `/class-journals/${id}`, 'teacher')
      .send({
        sections: {
          meal: 'Các con ăn cháo thịt bằm.',
          learning: 'Cả lớp học hát.',
          note: 'Mai các con mặc đồng phục.',
        },
        personal: { [child.id]: 'Con hôm nay mạnh dạn phát biểu.', [other().id]: 'Con hơi ho nhẹ.' },
      })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'draft', unpublishedChanges: true });
    expect((await timelineDay()).sections.meal).toBe('Các con ăn cơm, canh rau ngót.');

    await api('post', `/class-journals/${id}/approve`, 'principal').expect(201);
    expect((await api('post', `/class-journals/${id}/publish`, 'principal').expect(201)).body.revision).toBe(
      2,
    );
    const day = await timelineDay();
    expect(day.sections.meal).toBe('Các con ăn cháo thịt bằm.');
    expect(day.editedAt).toBeTruthy();
    const titles = (await api('get', '/notifications?type=JOURNAL', 'parent').expect(200)).body.items.map(
      (n: any) => n.title,
    );
    expect(titles).toContain('Journal updated');
  });

  it('a change to one child’s note is announced to that child’s parents only', async () => {
    const count = async () =>
      (await api('get', '/notifications?type=JOURNAL', 'parent').expect(200)).body.items.length;
    const before = await count();
    await api('put', `/class-journals/${id}`, 'teacher')
      .send({ personal: { [child.id]: 'Con hôm nay mạnh dạn phát biểu.', [other().id]: 'Con đã đỡ ho.' } })
      .expect(200);
    await api('post', `/class-journals/${id}/approve`, 'teacher').expect(201);
    await api('post', `/class-journals/${id}/publish`, 'teacher').expect(201);
    expect(await count()).toBe(before); // neither this parent's child nor the class sections changed
  });

  it('the history lists the journals with their status', async () => {
    const all = (await api('get', `/class-journals?classId=${classId}`, 'teacher').expect(200)).body.items;
    expect(all.find((j: any) => j.id === id)).toMatchObject({ status: 'published', date: today });
    const drafts = (
      await api('get', `/class-journals?classId=${classId}&status=draft`, 'teacher').expect(200)
    ).body.items;
    expect(drafts.every((j: any) => j.status === 'draft')).toBe(true);
    expect(drafts.some((j: any) => j.id === id)).toBe(false);
  });
});

describe('Voice: a further recording adds to the draft, and can correct it', () => {
  let id: string;
  const day = addDays(today, -4);

  it('a voice journal starts in REVIEW with its transcript, recording and points to confirm', async () => {
    const draft = (
      await api('post', '/class-journals/voice-draft', 'principal')
        .send({
          classId,
          date: day,
          transcript: `Cả lớp học vẽ. Bé ${child.fullName} ăn hết suất cơm. Bé Tùng ngủ ngon.`,
        })
        .expect(201)
    ).body;
    expect(draft.sections.learning).toMatch(/học vẽ/);
    expect(draft.personal[child.id]).toMatch(/ăn hết suất/);
    const unknown = draft.issues.find((i: any) => i.type === 'unknown_student');
    expect(unknown).toMatchObject({ held: true, status: 'open' });
    expect(JSON.stringify(draft.sections)).not.toMatch(/Tùng/i); // a held statement is in no section

    const res = await api('post', '/class-journals', 'principal')
      .send({
        classId,
        date: day,
        source: 'voice',
        sections: draft.sections,
        personal: draft.personal,
        transcript: draft.transcript,
        issues: draft.issues,
        audio: ['/uploads/audio/a.webm'],
      })
      .expect(201);
    id = res.body.id;
    expect(res.body).toMatchObject({ status: 'review', source: 'voice', audio: ['/uploads/audio/a.webm'] });
    expect(res.body.transcript).toMatch(/học vẽ/);
  });

  it('open points block approving; the teacher decides each one', async () => {
    await api('post', `/class-journals/${id}/approve`, 'principal').expect(409);
    const j = (await api('get', `/class-journals/${id}`, 'principal').expect(200)).body;
    const held = j.issues.find((i: any) => i.held);
    // a held statement needs a real decision: "confirmed" is not one
    await api('put', `/class-journals/${id}`, 'principal')
      .send({ issues: [{ id: held.id, resolution: 'confirmed' }] })
      .expect(400);
    const decisions = j.issues.map((i: any) => ({
      id: i.id,
      resolution: i.held ? 'discarded' : 'confirmed',
    }));
    const res = await api('put', `/class-journals/${id}`, 'principal')
      .send({ issues: decisions })
      .expect(200);
    expect(res.body.issues.every((i: any) => i.status === 'resolved')).toBe(true);
    expect(res.body.status).toBe('review');
  });

  it('recording more adds to the text, and "cô nhầm" replaces the statement it corrects', async () => {
    const given = child.fullName.split(' ').slice(-1)[0];
    const draft = (
      await api('post', '/class-journals/voice-draft', 'principal')
        .send({
          classId,
          journalId: id,
          transcript: `Cô nhầm, bé ${given} ăn được một nửa suất. Các con ngủ trưa ngon.`,
        })
        .expect(201)
    ).body;
    const fix = draft.issues.find((i: any) => i.type === 'correction');
    expect(fix).toMatchObject({ previousText: expect.stringMatching(/ăn hết suất/) });

    const res = await api('post', `/class-journals/${id}/recordings`, 'principal')
      .send({
        sections: draft.sections,
        personal: draft.personal,
        transcript: draft.transcript,
        issues: draft.issues,
        audioUrl: '/uploads/audio/b.webm',
      })
      .expect(201);
    expect(res.body.personal[child.id]).toMatch(/một nửa suất/);
    expect(res.body.personal[child.id]).not.toMatch(/ăn hết suất/);
    expect(res.body.sections.learning).toMatch(/học vẽ/);
    expect(res.body.sections.sleep).toMatch(/ngủ trưa ngon/);
    expect(res.body.audio).toEqual(['/uploads/audio/a.webm', '/uploads/audio/b.webm']);
    expect(res.body.status).toBe('review');
  });
});

describe('Integrity checks', () => {
  it('a journal only points at files uploaded through KinderLog', async () => {
    const j = (await api('get', `/class-journals?classId=${classId}&date=${today}`, 'teacher').expect(200))
      .body.items[0];
    await api('put', `/class-journals/${j.id}`, 'teacher')
      .send({ photos: ['https://tracker.example.com/pixel.gif'] })
      .expect(400);
    await api('post', '/class-journals', 'teacher')
      .send({ classId, date: addDays(today, -5), source: 'voice', audio: ['javascript:alert(1)'] })
      .expect(400);
  });

  it('recordings stored in ImageKit are accepted only from the audio folder', async () => {
    const root = `${process.env.IMAGEKIT_URL_ENDPOINT}${process.env.IMAGEKIT_FOLDER}`;
    for (const bad of [
      `${root}/photos/rec.webm`,
      `${root}/audio/../rec.webm`,
      'https://evil.example/kinderlog/audio/rec.webm',
    ]) {
      await api('post', '/class-journals', 'principal')
        .send({ classId, date: addDays(today, -5), source: 'voice', audio: [bad] })
        .expect(400);
    }
    for (const bad of [`${root}/audio/rec.webm?tr=w-10`, `${root}/audio/rec.webm?x=1`]) {
      await api('post', '/class-journals', 'principal')
        .send({ classId, date: addDays(today, -5), source: 'voice', audio: [bad] })
        .expect(400);
    }
    // ImageKit recordings are served as stored (?tr=orig-true), not transcoded
    const audio = [
      `${root}/audio/0b6f1c2e-2222-4a5b-9c3d-123456789abc.webm?tr=orig-true`,
      `${root}/audio/0b6f1c2e-3333-4a5b-9c3d-123456789abc.webm`,
      '/uploads/audio/x.webm',
    ];
    const j = await api('post', '/class-journals', 'principal')
      .send({ classId, date: addDays(today, -5), source: 'voice', transcript: 'Các con ăn cơm.', audio })
      .expect(201);
    expect(j.body.audio).toEqual(audio);
  });

  it('an uploaded photo is named after its image type, never after the name the browser sent', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const res = await api('post', '/class-journals/photos', 'teacher')
      .attach('photos', png, { filename: 'evil.html', contentType: 'image/png' })
      .expect(201);
    expect(res.body.urls[0]).toMatch(/^\/uploads\/photos\/[0-9a-f-]{36}\.png$/);
    const served = await request(http).get(res.body.urls[0]).expect(200);
    expect(served.headers['content-type']).toMatch(/^image\/png/);
  });

  describe('signed ImageKit URLs', () => {
    // Signing needs the private key but no network; nothing is uploaded in these tests.
    const key = 'private_e2e_signing_key';
    beforeAll(() => (process.env.IMAGEKIT_PRIVATE_KEY = key));
    afterAll(() => (process.env.IMAGEKIT_PRIVATE_KEY = ''));
    const endpoint = () => process.env.IMAGEKIT_URL_ENDPOINT!;
    const root = () => `${endpoint()}${process.env.IMAGEKIT_FOLDER}`;
    const verify = (signed: string, stored: string) => {
      const m = signed.match(/^(.*)[?&]ik-t=(\d+)&ik-s=([0-9a-f]{40})$/);
      expect(m?.[1]).toBe(stored);
      const expected = createHmac('sha1', key)
        .update(stored.slice(endpoint().length + 1) + m![2])
        .digest('hex');
      expect(m![3]).toBe(expected);
      expect(Number(m![2]) * 1000).toBeGreaterThan(Date.now() + 60 * 60 * 1000 - 1000); // at least the TTL ahead
    };

    it('responses carry signed URLs; a signed URL sent back is stored unsigned', async () => {
      const audio = `${root()}/audio/0b6f1c2e-4444-4a5b-9c3d-123456789abc.webm?tr=orig-true`;
      const photo = `${root()}/photos/0b6f1c2e-5555-4a5b-9c3d-123456789abc.jpg`;
      const j = await api('post', '/class-journals', 'principal')
        .send({
          classId,
          date: addDays(today, -9),
          source: 'voice',
          transcript: 'Các con ngủ ngon.',
          audio: [audio],
        })
        .expect(201);
      verify(j.body.audio[0], audio);

      const put = await api('put', `/class-journals/${j.body.id}`, 'principal')
        .send({ photos: [photo] })
        .expect(200);
      verify(put.body.photos[0], photo);
      // The browser edits the journal with what it was given: the signed URLs go back, nothing is signed twice.
      const again = await api('put', `/class-journals/${j.body.id}`, 'principal')
        .send({ photos: put.body.photos })
        .expect(200);
      verify(again.body.photos[0], photo);
      expect(again.body.photos[0].match(/ik-s=/g)).toHaveLength(1);
      const fresh = await api('get', `/class-journals/${j.body.id}`, 'principal').expect(200);
      verify(fresh.body.audio[0], audio);

      // A signature does not make a foreign address acceptable.
      await api('put', `/class-journals/${j.body.id}`, 'principal')
        .send({ photos: [`https://evil.example/x.jpg?ik-t=1&ik-s=${'0'.repeat(40)}`] })
        .expect(400);
    });

    it('/health reports that ImageKit files are handed out signed', async () => {
      const h = await request(http).get('/health').expect(200);
      expect(h.body).toMatchObject({ mediaStorage: 'imagekit', signedMediaUrls: true });
    });
  });

  it('photos stored in ImageKit are accepted only from the configured folder', async () => {
    const base = `${process.env.IMAGEKIT_URL_ENDPOINT}${process.env.IMAGEKIT_FOLDER}/photos`;
    const j = (
      await api('post', '/class-journals', 'principal')
        .send({ classId, date: addDays(today, -11), sections: { meal: 'Các con ăn cơm.' } })
        .expect(201)
    ).body;
    const ok = [`${base}/0b6f1c2e-1111-4a5b-9c3d-123456789abc.jpg`, '/uploads/photos/abc.jpg'];
    const saved = await api('put', `/class-journals/${j.id}`, 'principal').send({ photos: ok }).expect(200);
    expect(saved.body.photos).toEqual(ok);
    for (const bad of [
      `${process.env.IMAGEKIT_URL_ENDPOINT}/other/abc.jpg`, // another folder of the same account
      `${base}/../secret.jpg`,
      `${base}/sub/abc.jpg`,
      `https://ik.imagekit.io/someone-else${process.env.IMAGEKIT_FOLDER}/photos/abc.jpg`,
    ]) {
      await api('put', `/class-journals/${j.id}`, 'principal')
        .send({ photos: [bad] })
        .expect(400);
    }
  });

  it('publishing twice at the same time publishes once', async () => {
    const day = addDays(today, -6);
    const j = (
      await api('post', '/class-journals', 'principal')
        .send({ classId, date: day, sections: { meal: 'Các con ăn cơm.' } })
        .expect(201)
    ).body;
    await api('post', `/class-journals/${j.id}/approve`, 'principal').expect(201);
    const results = await Promise.all([
      api('post', `/class-journals/${j.id}/publish`, 'principal'),
      api('post', `/class-journals/${j.id}/publish`, 'principal'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await api('get', `/class-journals/${j.id}`, 'teacher').expect(200)).body.revision).toBe(1);
  });

  it('a child who changed class keeps the journals of the class they were in, and never sees the new class’s past', async () => {
    const from = addDays(today, -14);
    // A weekend day in the range: no attendance entry for the child that day, yet it is still their class's journal.
    const weekend = [8, 9, 10, 11, 12, 13]
      .map((n) => addDays(today, -n))
      .find((d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))!;
    const sat = (
      await api('post', '/class-journals', 'principal')
        .send({ classId, date: weekend, sections: { learning: 'Các con tham gia ngày hội cuối tuần.' } })
        .expect(201)
    ).body;
    await api('post', `/class-journals/${sat.id}/approve`, 'principal').expect(201);
    await api('post', `/class-journals/${sat.id}/publish`, 'principal').expect(201);

    const timeline = async () =>
      (await api('get', `/daily-journals/timeline?studentId=${child.id}&from=${from}`, 'parent').expect(200))
        .body.days;
    const before = (await timeline()).map((d: any) => d.id);
    expect(before).toContain(sat.id);
    await api('patch', `/students/${child.id}`, 'principal').send({ classId: otherClassId }).expect(200);
    try {
      const after = await timeline();
      // The same days as before the move: the other class's published journals of those weeks stay out.
      expect(after.map((d: any) => d.id)).toEqual(before);
      expect(after.find((d: any) => d.date === today).personalNote).toBe('Con hôm nay mạnh dạn phát biểu.');
    } finally {
      await api('patch', `/students/${child.id}`, 'principal').send({ classId }).expect(200);
    }
  });

  it('a class with class journals in its history cannot be deleted', async () => {
    const cls = (
      await api('post', '/classes', 'principal')
        .send({ name: 'Lớp thử xóa', academicYear: '2026-2027' })
        .expect(201)
    ).body;
    const kid = (
      await api('post', '/students', 'principal')
        .send({ classId: cls.id, fullName: 'Trần Thử', dateOfBirth: '2022-01-01', gender: 'MALE' })
        .expect(201)
    ).body;
    await api('post', '/class-journals', 'principal')
      .send({ classId: cls.id, sections: { meal: 'Các con ăn cơm.' } })
      .expect(201);
    await api('delete', `/students/${kid.id}`, 'principal').expect(200);
    const res = await api('delete', `/classes/${cls.id}`, 'principal').expect(409);
    expect(res.body.message).toMatch(/journal entries in its history/);
  });
});

describe('Audit', () => {
  it('every step is in the audit log', async () => {
    const logs = (await api('get', '/audit-logs?module=Daily%20Journal&limit=100', 'principal').expect(200))
      .body.items;
    const actions = new Set(logs.map((l: any) => l.action));
    for (const a of ['CREATE', 'UPDATE', 'APPROVE', 'PUBLISH', 'BULK_SAVE', 'AI_DRAFT']) {
      expect(actions).toContain(a);
    }
  });
});
