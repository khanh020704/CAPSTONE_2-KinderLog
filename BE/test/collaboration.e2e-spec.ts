import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DataSource } from 'typeorm';
import { addDays, isoDate } from '../src/common/utils/date.util';
import { AnnouncementsService } from '../src/modules/announcements/announcements.service';
import { academicYearOf } from '../src/modules/academic-years/academic-year.util';
import { loadDemoData } from './fixtures/demo-data';
import { prepareTestDatabase } from './test-db';

/**
 * Academic years, school announcements, notifications, messages and the audit log — the data that used to live in
 * the browser — against the test database loaded with fixtures/demo-data.ts.
 * Fixture: school 1 (principal, teacher → Mặt Trời 1, teacher2 → Mặt Trời 2, teacher3 without class),
 * parent → child in Mặt Trời 1, parent20 → child in Mặt Trời 2; school 2 has principal2.
 */

const TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const PHONES = {
  admin: '0901000001',
  principal: '0902000001',
  principal2: '0902000002',
  teacher: '0903000001',
  teacher2: '0903000002',
  teacher3: '0903000003',
  parent: '0904000001',
  parent20: '0904000020',
};
type Who = keyof typeof PHONES;

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens = {} as Record<Who, string>;
const uid = {} as Record<Who, string>;
const ids: Record<string, string> = {};

const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, who: Who) =>
  request(http)[method](`/api${path}`).set('Authorization', `Bearer ${tokens[who]}`);

beforeAll(async () => {
  await prepareTestDatabase();
  await loadDemoData();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  for (const [who, phone] of Object.entries(PHONES) as [Who, string][]) {
    const res = await request(http).post('/api/auth/login').send({ phone, password: '123456' }).expect(200);
    tokens[who] = res.body.accessToken;
    uid[who] = res.body.user.id;
  }
});

afterAll(async () => {
  await app?.close();
});

describe('Academic years', () => {
  it('principal creates the current year; name, dates and duplicates are validated', async () => {
    const y = await api('post', '/academic-years', 'principal')
      .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-05-31', status: 'ACTIVE' })
      .expect(201);
    expect(y.body).toMatchObject({ name: '2026-2027', status: 'ACTIVE', startDate: '2026-09-01' });
    ids.year1 = y.body.id;
    await api('post', '/academic-years', 'principal')
      .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-05-31' })
      .expect(409);
    await api('post', '/academic-years', 'principal')
      .send({ name: '2026-2028', startDate: '2026-09-01', endDate: '2027-05-31' })
      .expect(400);
    await api('post', '/academic-years', 'principal')
      .send({ name: '2028-2029', startDate: '2029-05-31', endDate: '2028-09-01' })
      .expect(400);
  });

  it('activating another year deactivates the previous current year', async () => {
    const y = await api('post', '/academic-years', 'principal')
      .send({ name: '2027-2028', startDate: '2027-09-01', endDate: '2028-05-31' })
      .expect(201);
    ids.year2 = y.body.id;
    expect(y.body.status).toBe('INACTIVE');
    await api('patch', `/academic-years/${ids.year2}`, 'principal').send({ status: 'ACTIVE' }).expect(200);
    const list = (await api('get', '/academic-years', 'principal').expect(200)).body;
    expect(list.map((x: { name: string; status: string }) => `${x.name}:${x.status}`)).toEqual([
      '2027-2028:ACTIVE',
      '2026-2027:INACTIVE',
    ]);
    const current = (await api('get', '/academic-years/current', 'teacher').expect(200)).body;
    expect(current.id).toBe(ids.year2);
  });

  it('teachers read, cannot write; another school sees nothing', async () => {
    expect((await api('get', '/academic-years', 'teacher').expect(200)).body).toHaveLength(2);
    await api('post', '/academic-years', 'teacher')
      .send({ name: '2030-2031', startDate: '2030-09-01', endDate: '2031-05-31' })
      .expect(403);
    expect((await api('get', '/academic-years', 'principal2').expect(200)).body).toEqual([]);
    await api('get', `/academic-years/${ids.year1}`, 'principal2').expect(404);
  });

  it('a year used by classes cannot be deleted or renamed; an unused one can be deleted', async () => {
    const del = await api('delete', `/academic-years/${ids.year1}`, 'principal').expect(409);
    expect(del.body.message).toMatch(/class/);
    await api('patch', `/academic-years/${ids.year1}`, 'principal').send({ name: '2025-2026' }).expect(409);
    await api('delete', `/academic-years/${ids.year2}`, 'principal').expect(200);
  });

  it('a new school starts with its current academic year', async () => {
    const s = await api('post', '/schools', 'admin').send({ name: 'Mầm non Bình Minh' }).expect(201);
    const years = (await api('get', `/academic-years?schoolId=${s.body.id}`, 'admin').expect(200)).body;
    expect(years).toEqual([
      expect.objectContaining({ ...academicYearOf(isoDate(TZ)), status: 'ACTIVE', schoolId: s.body.id }),
    ]);
  });
});

describe('School announcements', () => {
  it('a draft is invisible to parents; publishing shows it and notifies the audience only', async () => {
    const a = await api('post', '/announcements', 'principal')
      .send({
        title: 'Nghỉ lễ 20/11',
        content: 'Trường nghỉ ngày 20/11.',
        category: 'HOLIDAY',
        audience: 'PARENTS',
      })
      .expect(201);
    ids.ann = a.body.id;
    expect(a.body).toMatchObject({
      status: 'DRAFT',
      publishedAt: null,
      createdBy: { fullName: 'Trần Thị Lan' },
    });
    await api('get', `/announcements/${ids.ann}`, 'parent').expect(404);

    const pub = await api('patch', `/announcements/${ids.ann}`, 'principal')
      .send({ status: 'PUBLISHED' })
      .expect(200);
    expect(pub.body.publishedAt).toEqual(expect.any(String));
    const forParent = (await api('get', '/announcements', 'parent').expect(200)).body;
    expect(forParent.items.map((x: { id: string }) => x.id)).toContain(ids.ann);
    const forTeacher = (await api('get', '/announcements', 'teacher').expect(200)).body;
    expect(forTeacher.items.map((x: { id: string }) => x.id)).not.toContain(ids.ann);

    const pn = (await api('get', '/notifications?type=ANNOUNCEMENT', 'parent').expect(200)).body;
    expect(pn.items).toEqual([
      expect.objectContaining({ refId: ids.ann, title: 'Nghỉ lễ 20/11', readAt: null }),
    ]);
    const tn = (await api('get', '/notifications?type=ANNOUNCEMENT', 'teacher').expect(200)).body;
    expect(tn.total).toBe(0);
  });

  it('expired notices are hidden from readers; staff list is paginated and filterable', async () => {
    await api('post', '/announcements', 'principal')
      .send({
        title: 'Họp phụ huynh cũ',
        content: 'Đã diễn ra.',
        audience: 'ALL',
        status: 'PUBLISHED',
        expiresOn: addDays(isoDate(TZ), -1),
      })
      .expect(201);
    const forParent = (await api('get', '/announcements', 'parent').expect(200)).body;
    expect(forParent.items.map((x: { title: string }) => x.title)).not.toContain('Họp phụ huynh cũ');

    const page = (await api('get', '/announcements?limit=1&page=2', 'principal').expect(200)).body;
    expect(page).toMatchObject({ total: 2, page: 2, limit: 1, pages: 2 });
    expect(page.items).toHaveLength(1);
    const holidays = (
      await api('get', '/announcements?category=HOLIDAY&search=nghi le', 'principal').expect(200)
    ).body;
    expect(holidays.items.map((x: { id: string }) => x.id)).toEqual([ids.ann]);
  });

  it('teachers cannot write; another school can neither see nor edit', async () => {
    await api('post', '/announcements', 'teacher').send({ title: 'x', content: 'y' }).expect(403);
    expect((await api('get', '/announcements', 'principal2').expect(200)).body.total).toBe(0);
    await api('patch', `/announcements/${ids.ann}`, 'principal2').send({ title: 'hack' }).expect(404);
    await api('delete', `/announcements/${ids.ann}`, 'principal2').expect(404);
  });

  it('a later publish date schedules it: hidden and unnotified until that day, then released once', async () => {
    const today = isoDate(TZ);
    await api('post', '/announcements', 'principal')
      .send({ title: 'x', content: 'y', status: 'PUBLISHED', publishOn: addDays(today, -1) })
      .expect(400);
    const a = await api('post', '/announcements', 'principal')
      .send({
        title: 'Khai giảng học kỳ II',
        content: 'Các con đi học lại.',
        audience: 'PARENTS',
        status: 'PUBLISHED',
        publishOn: addDays(today, 2),
      })
      .expect(201);
    expect(new Date(a.body.publishedAt).getTime()).toBeGreaterThan(Date.now());
    expect(a.body.notifiedAt).toBeNull();
    const seen = async () =>
      (await api('get', '/announcements', 'parent').expect(200)).body.items.some(
        (x: { id: string }) => x.id === a.body.id,
      );
    const notes = async () =>
      (await api('get', '/notifications?type=ANNOUNCEMENT', 'parent').expect(200)).body.items.filter(
        (n: { refId: string }) => n.refId === a.body.id,
      ).length;
    expect(await seen()).toBe(false);
    expect(await notes()).toBe(0);
    await api('get', `/announcements/${a.body.id}`, 'parent').expect(404);

    // the publish date can still move while it is scheduled
    const moved = await api('patch', `/announcements/${a.body.id}`, 'principal')
      .send({ publishOn: addDays(today, 3) })
      .expect(200);
    expect(new Date(moved.body.publishedAt).getTime()).toBeGreaterThan(
      new Date(a.body.publishedAt).getTime(),
    );

    // the day comes: the release job shows it and notifies the audience exactly once
    await app
      .get(DataSource)
      .query(
        'UPDATE school_announcements SET published_at = DATEADD(minute, -1, SYSUTCDATETIME()) WHERE id = @0',
        [a.body.id],
      );
    const job = app.get(AnnouncementsService);
    expect(await job.releaseDue()).toBe(1);
    expect(await job.releaseDue()).toBe(0);
    expect(await seen()).toBe(true);
    expect(await notes()).toBe(1);
  });
});

describe('Messages', () => {
  it('contacts follow the real relations of each account', async () => {
    const names = async (who: Who) =>
      (await api('get', '/messages/contacts', who).expect(200)).body.map(
        (c: { user: { id: string } }) => c.user.id,
      );
    const parentContacts = await names('parent');
    expect(parentContacts).toEqual(expect.arrayContaining([uid.teacher]));
    expect(parentContacts).not.toContain(uid.principal); // principals do not message parents
    expect(parentContacts).not.toContain(uid.teacher2);
    expect(await names('teacher')).toEqual(expect.arrayContaining([uid.parent]));
    expect(await names('teacher')).not.toContain(uid.teacher2); // teachers do not message each other
    expect(await names('teacher')).not.toContain(uid.parent20);
    expect(await names('teacher')).not.toContain(uid.principal); // no messaging for principals
    await api('get', '/messages/contacts', 'admin').expect(403); // nor for the system admin
  });

  it('messages outside those relations are refused', async () => {
    const send = (from: Who, to: Who) =>
      api('post', '/messages', from).send({ receiverId: uid[to], content: 'Xin chào' });
    await send('parent', 'teacher2').expect(403); // not their child's teacher
    await send('parent', 'parent20').expect(403);
    await send('teacher3', 'parent').expect(403); // teacher without that class
    await send('principal2', 'teacher').expect(403); // principals have no messaging
    await send('admin', 'teacher').expect(403);
    await send('teacher', 'principal').expect(403);
    await send('parent', 'parent').expect(403); // themselves
    await send('teacher', 'teacher2').expect(403); // teachers do not message each other, even in one school
    await send('teacher2', 'teacher').expect(403);
  });

  it('parent → teacher: unread count, one merged notification, conversation summary', async () => {
    await api('post', '/messages', 'parent')
      .send({ receiverId: uid.teacher, content: 'Chào cô ạ' })
      .expect(201);
    const m2 = await api('post', '/messages', 'parent')
      .send({ receiverId: uid.teacher, content: 'Hôm nay bé An hơi ho, cô để ý giúp em.' })
      .expect(201);
    ids.msg2 = m2.body.id;

    expect((await api('get', '/messages/unread-count', 'teacher').expect(200)).body).toEqual({ unread: 2 });
    const notes = (await api('get', '/notifications?type=MESSAGE&unread=true', 'teacher').expect(200)).body;
    expect(notes.items).toEqual([
      expect.objectContaining({
        refId: uid.parent,
        link: '/teacher/messages',
        body: expect.stringContaining('ho'),
      }),
    ]);

    const contacts = (await api('get', '/messages/contacts', 'teacher').expect(200)).body;
    const withParent = contacts.find((c: { user: { id: string } }) => c.user.id === uid.parent);
    expect(withParent).toMatchObject({ unread: 2, canReply: true, lastMessage: { senderId: uid.parent } });
    expect(withParent.lastMessage.content).toContain('ho');
    expect(contacts[0].user.id).toBe(uid.parent); // most recent conversation first
  });

  it('the thread is paginated newest first, and reading it clears the unread count', async () => {
    await api('post', '/messages', 'teacher')
      .send({ receiverId: uid.parent, content: 'Cô cảm ơn chị.' })
      .expect(201);
    const page1 = (await api('get', `/messages/thread/${uid.parent}?limit=2`, 'teacher').expect(200)).body;
    expect(page1).toMatchObject({ total: 3, pages: 2 });
    expect(page1.items.map((m: { content: string }) => m.content)).toEqual([
      'Cô cảm ơn chị.',
      'Hôm nay bé An hơi ho, cô để ý giúp em.',
    ]);
    const page2 = (await api('get', `/messages/thread/${uid.parent}?limit=2&page=2`, 'teacher').expect(200))
      .body;
    expect(page2.items.map((m: { content: string }) => m.content)).toEqual(['Chào cô ạ']);

    expect((await api('patch', `/messages/thread/${uid.parent}/read`, 'teacher').expect(200)).body).toEqual({
      updated: 2,
    });
    expect((await api('get', '/messages/unread-count', 'teacher').expect(200)).body).toEqual({ unread: 0 });
    // the "new message" notification about that parent is cleared with the conversation
    const msgNotes = (await api('get', '/notifications?type=MESSAGE&unread=true', 'teacher').expect(200))
      .body;
    expect(msgNotes.total).toBe(0);
    // the parent sees the same conversation from the other side
    const fromParent = (await api('get', `/messages/thread/${uid.teacher}`, 'parent').expect(200)).body;
    expect(fromParent.total).toBe(3);
  });

  it('only the sender edits (while unread) or deletes a message', async () => {
    await api('patch', `/messages/${ids.msg2}`, 'parent').send({ content: 'sửa' }).expect(409); // already read
    const fresh = await api('post', '/messages', 'parent').send({
      receiverId: uid.teacher,
      content: 'Gõ nhầm',
    });
    await api('patch', `/messages/${fresh.body.id}`, 'parent').send({ content: 'Đã sửa' }).expect(200);
    await api('patch', `/messages/${fresh.body.id}`, 'teacher').send({ content: 'x' }).expect(403);
    await api('delete', `/messages/${fresh.body.id}`, 'teacher').expect(403);
    await api('delete', `/messages/${fresh.body.id}`, 'teacher2').expect(404);
    await api('delete', `/messages/${fresh.body.id}`, 'parent').expect(200);
  });
});

describe('Notifications', () => {
  it('principal notifies a whole role of the school; never another school', async () => {
    const res = await api('post', '/notifications', 'principal')
      .send({ role: 'TEACHER', title: 'Họp giáo viên 16:30', body: 'Phòng họp tầng 2' })
      .expect(201);
    expect(res.body).toEqual({ sent: 3 }); // three active teachers in school 1 (the fourth is inactive)
    await api('post', '/notifications', 'principal')
      .send({ userIds: [uid.principal2], title: 'x' })
      .expect(403);
    await api('post', '/notifications', 'teacher').send({ role: 'PARENT', title: 'x' }).expect(403);
  });

  it('a user reads, marks and deletes only their own notifications', async () => {
    const list = (await api('get', '/notifications?limit=1', 'teacher').expect(200)).body;
    expect(list.limit).toBe(1);
    expect(list.total).toBeGreaterThanOrEqual(2);
    const first = list.items[0];
    expect(first).toMatchObject({ title: 'Họp giáo viên 16:30', type: 'SYSTEM', readAt: null });

    await api('patch', `/notifications/${first.id}/read`, 'parent').expect(404);
    await api('delete', `/notifications/${first.id}`, 'parent').expect(404);
    const read = (await api('patch', `/notifications/${first.id}/read`, 'teacher').expect(200)).body;
    expect(read.readAt).toEqual(expect.any(String));

    const before = (await api('get', '/notifications/unread-count', 'teacher').expect(200)).body.unread;
    const all = (await api('patch', '/notifications/read-all', 'teacher').expect(200)).body;
    expect(all.updated).toBe(before);
    expect((await api('get', '/notifications/unread-count', 'teacher').expect(200)).body).toEqual({
      unread: 0,
    });
    await api('delete', `/notifications/${first.id}`, 'teacher').expect(200);
  });
});

describe('Audit log', () => {
  it('records sign-ins, including failed ones (admin view)', async () => {
    await request(http)
      .post('/api/auth/login')
      .send({ phone: PHONES.teacher, password: 'wrong-pass' })
      .expect(401);
    const logs = (await api('get', '/audit-logs?module=Authentication&status=FAILED', 'admin').expect(200))
      .body;
    expect(logs.items[0]).toMatchObject({
      action: 'LOGIN',
      status: 'FAILED',
      httpStatus: 401,
      description: expect.stringContaining(PHONES.teacher),
    });
    expect(JSON.stringify(logs)).not.toContain('wrong-pass');
  });

  it('principal sees the actions of their school with actor, outcome and IP', async () => {
    const logs = (await api('get', '/audit-logs?module=Academic%20Years&limit=50', 'principal').expect(200))
      .body;
    expect(logs.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'CREATE',
          status: 'SUCCESS',
          userName: 'Trần Thị Lan',
          userRole: 'PRINCIPAL',
          description: expect.stringContaining('2026-2027'),
          ipAddress: expect.any(String),
        }),
        expect.objectContaining({ action: 'DELETE', status: 'FAILED', httpStatus: 409 }),
      ]),
    );
    const all = (await api('get', '/audit-logs?limit=100', 'principal').expect(200)).body;
    expect(all.items.every((l: { userRole: string }) => l.userRole !== 'SYSTEM_ADMIN')).toBe(true);
    // message text and the messages module are never recorded
    expect(JSON.stringify(all)).not.toContain('Chào cô');
    expect(all.items.some((l: { module: string }) => l.module === 'Messages')).toBe(false);
  });

  it('filters and pagination; other schools and other roles are kept out', async () => {
    const page = (await api('get', '/audit-logs?limit=2&page=2&action=CREATE', 'principal').expect(200)).body;
    expect(page).toMatchObject({ page: 2, limit: 2 });
    expect(page.items.every((l: { action: string }) => l.action === 'CREATE')).toBe(true);
    const today = isoDate(TZ);
    const dated = (
      await api('get', `/audit-logs?from=${today}&to=${today}&search=lan`, 'principal').expect(200)
    ).body;
    expect(dated.total).toBeGreaterThan(0);

    const other = (await api('get', '/audit-logs?limit=100', 'principal2').expect(200)).body;
    expect(other.items.every((l: { userName: string }) => l.userName !== 'Trần Thị Lan')).toBe(true);
    await api('get', '/audit-logs', 'teacher').expect(403);
    await api('get', '/audit-logs', 'parent').expect(403);
    await api('delete', `/audit-logs?before=${today}`, 'principal').expect(403);
  });

  it('deleting an account keeps its audit entries and removes its messages', async () => {
    await api('delete', `/users/${uid.parent}`, 'principal').expect(200);
    const thread = (await api('get', `/messages/thread/${uid.parent}`, 'teacher').expect(200)).body;
    expect(thread.total).toBe(0);
    const logs = (await api('get', '/audit-logs?module=Authentication&limit=100', 'admin').expect(200)).body;
    expect(logs.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ userName: 'Nguyễn Thị Hương', userId: null })]),
    );
  });

  it('admin purges old entries', async () => {
    const res = await api('delete', `/audit-logs?before=${addDays(isoDate(TZ), 1)}`, 'admin').expect(200);
    expect(res.body.deleted).toBeGreaterThan(0);
  });
});
