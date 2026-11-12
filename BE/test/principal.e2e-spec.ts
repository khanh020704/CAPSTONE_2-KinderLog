import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadDemoData } from './fixtures/demo-data';
import { prepareTestDatabase } from './test-db';

/**
 * The principal's screens end to end: dashboard figures, academic years, classes, teachers, students, notices
 * (the principal and the admin have no messages or notification inbox) — and that a principal never reads or
 * changes another school's data.
 * Fixture: school 1 (principal, Mặt Trời 1 / Mặt Trời 2, teacher → Mặt Trời 1, teacher3 without class,
 * parent → child in Mặt Trời 1); school 2 (principal2, no classes).
 */

const INITIAL_PASSWORD = process.env.DEFAULT_PASSWORD ?? '123456';
const PHONES = {
  admin: '0901000001',
  principal: '0902000001',
  principal2: '0902000002',
  teacher: '0903000001',
  teacher3: '0903000003',
  parent: '0904000001',
};
type Who = keyof typeof PHONES;

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens = {} as Record<Who, string>;
const uid = {} as Record<Who, string>;
const ids: Record<string, string> = {};

const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, who: string) =>
  request(http)
    [method](`/api${path}`)
    .set('Authorization', `Bearer ${tokens[who as Who] ?? who}`);
const login = (phone: string, password = INITIAL_PASSWORD) =>
  request(http).post('/api/auth/login').send({ phone, password });

beforeAll(async () => {
  await prepareTestDatabase();
  await loadDemoData();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  for (const [who, phone] of Object.entries(PHONES) as [Who, string][]) {
    const res = await login(phone).expect(200);
    tokens[who] = res.body.accessToken;
    uid[who] = res.body.user.id;
  }
  const classes = (await api('get', '/classes', 'principal').expect(200)).body;
  ids.class1 = classes.find((c: { name: string }) => c.name === 'Mặt Trời 1').id;
  ids.class2 = classes.find((c: { name: string }) => c.name === 'Mặt Trời 2').id;
});

afterAll(async () => {
  await app?.close();
});

describe('Dashboard', () => {
  it('overview figures are the records of the school', async () => {
    const d = (await api('get', '/reports/dashboard', 'principal').expect(200)).body;
    const classes = (await api('get', '/classes', 'principal').expect(200)).body;
    const students = (await api('get', '/students?status=ACTIVE', 'principal').expect(200)).body;
    const teachers = (await api('get', '/users?role=TEACHER&status=ACTIVE', 'principal').expect(200)).body;
    const cameras = (await api('get', '/camera-streams', 'principal').expect(200)).body;
    expect(d.overview).toMatchObject({
      classes: classes.length,
      students: students.length,
      teachers: teachers.length,
      cameras: cameras.length,
    });
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/);
  });

  it('"Unread messages" counts unread teacher ↔ parent messages of the school (a number, no content)', async () => {
    const unread = async () =>
      (await api('get', '/reports/dashboard', 'principal').expect(200)).body.overview.unreadMessages;
    const before = await unread();
    const sent = await api('post', '/messages', 'teacher')
      .send({ receiverId: uid.parent, content: 'Riêng GV ↔ PH' })
      .expect(201);
    expect(await unread()).toBe(before + 1);
    await api('post', '/messages', 'teacher')
      .send({ receiverId: uid.teacher3, content: 'GV → GV' })
      .expect(403); // teachers do not message each other
    expect(await unread()).toBe(before + 1);
    await api('patch', `/messages/thread/${uid.teacher}/read`, 'parent').expect(200);
    expect(await unread()).toBe(before);
    expect(sent.body.content).toBe('Riêng GV ↔ PH');
    const other = (await api('get', '/reports/dashboard', 'principal2').expect(200)).body.overview;
    expect(other.unreadMessages).toBe(0);
  });
});

describe('Academic years & classes', () => {
  it('years: "2026-2027" format, one ACTIVE year', async () => {
    await api('post', '/academic-years', 'principal')
      .send({ name: '2026–2027', startDate: '2026-09-01', endDate: '2027-05-31' })
      .expect(400); // the API takes "2026-2027"; the FE converts the dash before sending
    const y = await api('post', '/academic-years', 'principal')
      .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-05-31', status: 'ACTIVE' })
      .expect(201);
    expect((await api('get', '/academic-years/current', 'principal').expect(200)).body.id).toBe(y.body.id);
  });

  it('create a class with a free-text age group; duplicate names are refused clearly', async () => {
    const c = await api('post', '/classes', 'principal')
      .send({
        name: 'Lá 1',
        academicYear: '2026-2027',
        ageGroup: '5-6 tuổi',
        homeroomTeacherId: uid.teacher3,
      })
      .expect(201);
    ids.newClass = c.body.id;
    expect(c.body).toMatchObject({ ageGroup: '5-6 tuổi', homeroomTeacher: { id: uid.teacher3 } });
    const dup = await api('post', '/classes', 'principal')
      .send({ name: 'Lá 1', academicYear: '2026-2027' })
      .expect(409);
    expect(dup.body.message).toBe('A class named Lá 1 already exists in 2026-2027');
    await api('post', '/classes', 'principal').send({ name: 'Lá 1', academicYear: '2027-2028' }).expect(201); // other year
    await api('patch', `/classes/${ids.newClass}`, 'principal').send({ name: 'Mặt Trời 1' }).expect(409);
    await api('patch', `/classes/${ids.newClass}`, 'principal').send({ ageGroup: '4-5 tuổi' }).expect(200);
  });

  it('a homeroom teacher must be an active teacher of the same school', async () => {
    const other = (await api('get', '/auth/me', 'principal2').expect(200)).body.id;
    await api('patch', `/classes/${ids.newClass}`, 'principal')
      .send({ homeroomTeacherId: other })
      .expect(400);
  });

  it('deleting a class: refused with the reason while students or journal history remain', async () => {
    const withStudents = await api('delete', `/classes/${ids.class1}`, 'principal').expect(409);
    expect(withStudents.body.message).toMatch(/still has \d+ student\(s\)/);

    // a class whose children moved away keeps its journal history
    const students = (await api('get', `/students?classId=${ids.class2}`, 'principal').expect(200)).body;
    for (const s of students)
      await api('patch', `/students/${s.id}`, 'principal').send({ classId: ids.newClass }).expect(200);
    const withHistory = await api('delete', `/classes/${ids.class2}`, 'principal').expect(409);
    expect(withHistory.body.message).toMatch(/journal entries in its history/);

    const empty = await api('post', '/classes', 'principal')
      .send({ name: 'Lớp tạm', academicYear: '2026-2027' })
      .expect(201);
    await api('post', '/camera-streams', 'principal')
      .send({
        classId: empty.body.id,
        name: 'Cam tạm',
        streamUrl: 'https://example.com/a.m3u8',
        allowedStartTime: '08:00',
        allowedEndTime: '09:00',
        allowedWeekdays: 62,
      })
      .expect(201);
    await api('delete', `/classes/${empty.body.id}`, 'principal').expect(200); // its camera goes with it
  });
});

describe('Teachers & students', () => {
  it('student photo: uploaded as a file, served, replaced; images only; own school only', async () => {
    const s = (await api('get', `/students?classId=${ids.class1}`, 'principal').expect(200)).body[0];
    const jpg = Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64');
    const first = await api('post', `/students/${s.id}/avatar`, 'principal')
      .attach('avatar', jpg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(first.body.avatarUrl).toMatch(/^\/uploads\/photos\/.+\.jpg$/);
    await request(http).get(first.body.avatarUrl).expect(200);
    const second = await api('post', `/students/${s.id}/avatar`, 'principal')
      .attach('avatar', jpg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
    await request(http).get(first.body.avatarUrl).expect(404); // the previous file is removed
    await api('post', `/students/${s.id}/avatar`, 'principal')
      .attach('avatar', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
    await api('post', `/students/${s.id}/avatar`, 'principal').expect(400); // no file
    await api('post', `/students/${s.id}/avatar`, 'principal2')
      .attach('avatar', jpg, { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(403);
    await api('post', `/students/${s.id}/avatar`, 'teacher')
      .attach('avatar', jpg, { filename: 'd.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('teacher account: create, reset password, lock; a principal cannot create a principal', async () => {
    const t = await api('post', '/users', 'principal')
      .send({ fullName: 'Hồ Thị Tuyết', phone: '0913555555', role: 'TEACHER' })
      .expect(201);
    expect(t.body.school.id).toBe((await api('get', '/auth/me', 'principal')).body.schoolId);
    const tok = (await login('0913555555').expect(200)).body.accessToken;
    await api('patch', '/auth/change-password', tok)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: 'Tuyet2026' })
      .expect(200);
    await api('post', `/users/${t.body.id}/reset-password`, 'principal').expect(201);
    await login('0913555555').expect(200);
    await api('patch', `/users/${t.body.id}/status`, 'principal').send({ status: 'LOCKED' }).expect(200);
    await login('0913555555').expect(403);
    await api('post', '/users', 'principal')
      .send({ fullName: 'Người Thử', phone: '0913555556', role: 'PRINCIPAL' })
      .expect(403);
  });

  it('students: any past date of birth is saved; transfer within the school; delete with history', async () => {
    const s = await api('post', '/students', 'principal')
      .send({ classId: ids.newClass, fullName: 'Bé Tuổi Lệch', dateOfBirth: '2023-12-31', gender: 'FEMALE' })
      .expect(201); // younger than the class's age group: the FE only warns, the API accepts
    await api('patch', `/students/${s.body.id}`, 'principal').send({ classId: ids.class1 }).expect(200);
    await api('post', '/students', 'principal')
      .send({ classId: ids.newClass, fullName: 'Ngày sai', dateOfBirth: '2023-02-30', gender: 'MALE' })
      .expect(400);
    await api('delete', `/students/${s.body.id}`, 'principal').expect(200);
    await api('get', `/students/${s.body.id}`, 'principal').expect(404);
  });
});

describe('Notices & messages', () => {
  it('publishing sets the date on the server', async () => {
    const a = await api('post', '/announcements', 'principal')
      .send({
        title: 'Họp phụ huynh',
        content: 'Thứ bảy 8:00.',
        status: 'PUBLISHED',
        publishedAt: '2020-01-01',
      })
      .expect(400); // the publish date is not an input
    expect(a.body.message.join(' ')).toMatch(/publishedAt should not exist/);
    const ok = await api('post', '/announcements', 'principal')
      .send({ title: 'Họp phụ huynh', content: 'Thứ bảy 8:00.', status: 'PUBLISHED' })
      .expect(201);
    expect(Date.now() - new Date(ok.body.publishedAt).getTime()).toBeLessThan(60_000);
  });

  it('the principal and the system admin have no messages or notification inbox (403)', async () => {
    for (const who of ['principal', 'admin'] as const) {
      await api('get', '/messages/contacts', who).expect(403);
      await api('get', '/messages/unread-count', who).expect(403);
      await api('get', `/messages/thread/${uid.teacher}`, who).expect(403);
      await api('post', '/messages', who).send({ receiverId: uid.teacher, content: 'x' }).expect(403);
      await api('get', '/notifications', who).expect(403);
      await api('get', '/notifications/unread-count', who).expect(403);
      await api('patch', '/notifications/read-all', who).expect(403);
    }
  });

  it('teachers and parents cannot reach the principal or the admin; their own messaging is unchanged', async () => {
    const contacts = (await api('get', '/messages/contacts', 'teacher').expect(200)).body;
    const roles = new Set(contacts.map((c: { user: { role: string } }) => c.user.role));
    expect([...roles].sort()).toEqual(['PARENT']); // a teacher writes to parents only
    await api('post', '/messages', 'teacher').send({ receiverId: uid.principal, content: 'x' }).expect(403);
    await api('post', '/messages', 'teacher').send({ receiverId: uid.admin, content: 'x' }).expect(403);
    await api('post', '/messages', 'parent').send({ receiverId: uid.principal, content: 'x' }).expect(403);
    await api('post', '/messages', 'teacher')
      .send({ receiverId: uid.parent, content: 'GV → PH' })
      .expect(201);
    await api('post', '/messages', 'parent')
      .send({ receiverId: uid.teacher, content: 'PH → GV' })
      .expect(201);
    await api('post', '/messages', 'teacher')
      .send({ receiverId: uid.teacher3, content: 'GV → GV' })
      .expect(403); // teachers do not message each other
  });

  it('the principal still sends notifications to teachers and parents', async () => {
    const res = await api('post', '/notifications', 'principal')
      .send({ role: 'PARENT', title: 'Nghỉ lễ', body: 'Trường nghỉ thứ hai.' })
      .expect(201);
    expect(res.body.sent).toBeGreaterThan(0);
    const inbox = (await api('get', '/notifications?type=SYSTEM', 'parent').expect(200)).body.items;
    expect(inbox.map((n: { title: string }) => n.title)).toContain('Nghỉ lễ');
  });
});

describe('Parent–child link status', () => {
  it('an INACTIVE link hides the child from the parent everywhere; editing without a status keeps it; ACTIVE restores', async () => {
    const me = (await api('get', '/auth/me', 'parent').expect(200)).body;
    const child = me.children[0];
    const link = (await api('get', `/students/${child.id}`, 'principal').expect(200)).body.parentLinks.find(
      (l: { parentId: string }) => l.parentId === uid.parent,
    );
    expect(link.status).toBe('ACTIVE');
    const setLink = (body: Record<string, unknown>) =>
      api('post', `/students/${child.id}/parents`, 'principal')
        .send({ parentId: uid.parent, relationship: link.relationship, ...body })
        .expect(201);

    await setLink({ status: 'INACTIVE' });
    expect(
      (await api('get', '/students', 'parent').expect(200)).body.map((s: { id: string }) => s.id),
    ).not.toContain(child.id);
    await api('get', `/students/${child.id}`, 'parent').expect(403);
    await api('get', `/daily-journals/timeline?studentId=${child.id}`, 'parent').expect(403);
    await api('get', `/camera-streams/watch?studentId=${child.id}`, 'parent').expect(403);
    expect(
      (await api('get', '/auth/me', 'parent').expect(200)).body.children.map((c: { id: string }) => c.id),
    ).not.toContain(child.id);
    await api('post', '/messages', 'parent').send({ receiverId: uid.teacher, content: 'x' }).expect(403);

    await setLink({ relationship: 'GUARDIAN' }); // e.g. the student form changing only the relationship
    const kept = (await api('get', `/students/${child.id}`, 'principal').expect(200)).body.parentLinks.find(
      (l: { parentId: string }) => l.parentId === uid.parent,
    );
    expect(kept).toMatchObject({ relationship: 'GUARDIAN', status: 'INACTIVE' });

    await setLink({ status: 'ACTIVE' });
    await api('get', `/students/${child.id}`, 'parent').expect(200);
    await api('post', '/messages', 'parent')
      .send({ receiverId: uid.teacher, content: 'Chào cô' })
      .expect(201);
    await api('post', '/students/' + child.id + '/parents', 'principal')
      .send({ parentId: uid.parent, relationship: 'GUARDIAN', status: 'LOCKED' })
      .expect(400); // only ACTIVE / INACTIVE
  });
});

describe('Isolation between schools', () => {
  it("principal2 cannot read or change school 1's classes, students, accounts or reports", async () => {
    const student = (await api('get', `/students?classId=${ids.class1}`, 'principal').expect(200)).body[0];
    await api('get', `/classes/${ids.class1}`, 'principal2').expect(403);
    await api('patch', `/classes/${ids.class1}`, 'principal2').send({ name: 'hack' }).expect(403);
    await api('delete', `/classes/${ids.class1}`, 'principal2').expect(403);
    await api('get', `/students/${student.id}`, 'principal2').expect(403);
    await api('patch', `/students/${student.id}`, 'principal2').send({ fullName: 'hack' }).expect(403);
    await api('get', `/users/${uid.teacher}`, 'principal2').expect(403);
    await api('post', `/users/${uid.teacher}/reset-password`, 'principal2').expect(403);
    await api('get', `/reports/dashboard?classId=${ids.class1}`, 'principal2').expect(403);
    expect((await api('get', '/students', 'principal2').expect(200)).body).toEqual([]);
    expect((await api('get', '/classes', 'principal2').expect(200)).body).toEqual([]);
    // and cannot move a child of its own into school 1 (nor school 1's into its own)
    await api('patch', `/students/${student.id}`, 'principal').send({ classId: ids.class1 }).expect(200);
    const mine = await api('post', '/classes', 'principal2')
      .send({ name: 'Hoa 1', academicYear: '2026-2027' })
      .expect(201);
    await api('patch', `/students/${student.id}`, 'principal').send({ classId: mine.body.id }).expect(403);
  });
});
