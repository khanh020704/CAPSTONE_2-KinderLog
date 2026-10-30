import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, isoDate } from '../src/common/utils/date.util';
import { academicYearOf } from '../src/modules/academic-years/academic-year.util';
import { loadDemoData } from './fixtures/demo-data';
import { prepareTestDatabase } from './test-db';

/**
 * The System Admin's screens end to end: dashboard figures and their cache, schools, principal accounts (status,
 * password reset, deletion), monitoring, the audit log, and the empty / error cases behind them.
 */

const TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const INITIAL_PASSWORD = process.env.DEFAULT_PASSWORD ?? '123456';
const today = isoDate(TZ);

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, who: string) =>
  request(http)
    [method](`/api${path}`)
    .set('Authorization', `Bearer ${tokens[who] ?? who}`);
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
  tokens.admin = (await login('0901000001').expect(200)).body.accessToken;
});

afterAll(async () => {
  await app?.close();
});

describe('Dashboard', () => {
  it('figures match the records, and a write refreshes the cached dashboard at once', async () => {
    const before = (await api('get', '/reports/admin-dashboard', 'admin').expect(200)).body;
    const schools = (await api('get', '/schools', 'admin').expect(200)).body;
    const principals = (await api('get', '/users?role=PRINCIPAL', 'admin').expect(200)).body;
    expect(before.totals.schools).toBe(schools.length);
    expect(before.totals.activeSchools).toBe(
      schools.filter((s: { status: string }) => s.status === 'ACTIVE').length,
    );
    expect(before.totals.users.PRINCIPAL.total).toBe(principals.length);
    expect(before.last7Days.map((s: { schoolId: string }) => s.schoolId)).toEqual(
      schools.map((s: { id: string }) => s.id),
    );

    const s = await api('post', '/schools', 'admin').send({ name: 'Mầm non Ánh Dương' }).expect(201);
    ids.school = s.body.id;
    const after = (await api('get', '/reports/admin-dashboard', 'admin').expect(200)).body;
    expect(after.totals.schools).toBe(before.totals.schools + 1);
    expect(after.last7Days.find((x: { schoolId: string }) => x.schoolId === ids.school)).toMatchObject({
      journalEntries: 0,
      approvedEntries: 0,
    });
  });
});

describe('Schools', () => {
  it('a new school starts with its current academic year (ACTIVE) and counts at zero', async () => {
    const years = (await api('get', `/academic-years?schoolId=${ids.school}`, 'admin').expect(200)).body;
    expect(years).toEqual([expect.objectContaining({ ...academicYearOf(today), status: 'ACTIVE' })]);
    const row = (await api('get', '/schools', 'admin').expect(200)).body.find(
      (x: { id: string }) => x.id === ids.school,
    );
    expect(row).toMatchObject({ classCount: 0, teacherCount: 0, studentCount: 0, principals: [] });
  });

  it('edit and view; a duplicate name is refused on create and on edit', async () => {
    await api('patch', `/schools/${ids.school}`, 'admin')
      .send({ address: '12 Lê Duẩn, Đà Nẵng', phone: '02363111222', email: 'anhduong@school.vn' })
      .expect(200);
    const one = (await api('get', `/schools/${ids.school}`, 'admin').expect(200)).body;
    expect(one).toMatchObject({ name: 'Mầm non Ánh Dương', address: '12 Lê Duẩn, Đà Nẵng' });
    await api('post', '/schools', 'admin').send({ name: 'Mầm non Kinder Stars' }).expect(409);
    const dup = await api('patch', `/schools/${ids.school}`, 'admin')
      .send({ name: 'Mầm non Kinder Stars' })
      .expect(409);
    expect(dup.body.message).toMatch(/already exists/);
    await api('patch', `/schools/${ids.school}`, 'admin').send({ name: 'Mầm non Ánh Dương' }).expect(200); // own name
  });

  it('a school that still has accounts or classes is not deleted, with the reason', async () => {
    const kinder = (await api('get', '/schools', 'admin').expect(200)).body.find(
      (x: { name: string }) => x.name === 'Mầm non Kinder Stars',
    );
    const res = await api('delete', `/schools/${kinder.id}`, 'admin').expect(409);
    expect(res.body.message).toMatch(/account\(s\).*class\(es\)/);
  });

  it('an empty school is deleted together with its academic years', async () => {
    const s = await api('post', '/schools', 'admin').send({ name: 'Trường tạm' }).expect(201);
    await api('delete', `/schools/${s.body.id}`, 'admin').expect(200);
    await api('get', `/schools/${s.body.id}`, 'admin').expect(404);
    expect((await api('get', `/academic-years?schoolId=${s.body.id}`, 'admin').expect(200)).body).toEqual([]);
  });
});

describe('Principal accounts', () => {
  it('create for a school; the principal signs in with the initial password', async () => {
    const p = await api('post', '/users', 'admin')
      .send({ fullName: 'Đinh Thu Trang', phone: '0912345678', role: 'PRINCIPAL', schoolId: ids.school })
      .expect(201);
    ids.principal = p.body.id;
    expect(p.body).toMatchObject({ role: 'PRINCIPAL', status: 'ACTIVE', school: { id: ids.school } });
    tokens.principal = (await login('0912345678').expect(200)).body.accessToken;
    await api('post', '/users', 'admin')
      .send({ fullName: 'Trùng số', phone: '0912345678', role: 'PRINCIPAL', schoolId: ids.school })
      .expect(409);
    await api('post', '/users', 'admin')
      .send({ fullName: 'Không trường', phone: '0912000000', role: 'PRINCIPAL' })
      .expect(403);
  });

  it('reset password brings back the initial password', async () => {
    await api('patch', '/auth/change-password', 'principal')
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: 'NewPass2026' })
      .expect(200);
    await login('0912345678').expect(401);
    await api('post', `/users/${ids.principal}/reset-password`, 'admin').expect(201);
    tokens.principal = (await login('0912345678').expect(200)).body.accessToken;
  });

  it('locking the account cuts off its open session; activating restores access', async () => {
    await api('patch', `/users/${ids.principal}/status`, 'admin').send({ status: 'LOCKED' }).expect(200);
    await api('get', '/auth/me', 'principal').expect(401);
    await login('0912345678').expect(403);
    await api('patch', `/users/${ids.principal}/status`, 'admin').send({ status: 'ACTIVE' }).expect(200);
    tokens.principal = (await login('0912345678').expect(200)).body.accessToken;
    await api('get', '/auth/me', 'principal').expect(200);
  });

  it('locking or deactivating the school cuts off its staff at once', async () => {
    for (const status of ['LOCKED', 'INACTIVE']) {
      await api('patch', `/schools/${ids.school}`, 'admin').send({ status }).expect(200);
      const res = await api('get', '/auth/me', 'principal').expect(401);
      expect(res.body.message).toMatch(/school is not active/);
      await login('0912345678').expect(403);
    }
    await api('patch', `/schools/${ids.school}`, 'admin').send({ status: 'ACTIVE' }).expect(200);
    tokens.principal = (await login('0912345678').expect(200)).body.accessToken;
  });

  it('the admin cannot change or delete their own account', async () => {
    const me = (await api('get', '/auth/me', 'admin').expect(200)).body;
    await api('patch', `/users/${me.id}/status`, 'admin').send({ status: 'LOCKED' }).expect(400);
    await api('delete', `/users/${me.id}`, 'admin').expect(400);
  });

  it('deleting a principal who wrote notices: no error, notices and audit entries stay', async () => {
    const a = await api('post', '/announcements', 'principal').send({
      title: 'Chào năm học mới',
      content: 'Xin chào.',
    });
    expect(a.status).toBe(201);
    await api('delete', `/users/${ids.principal}`, 'admin').expect(200);
    await login('0912345678').expect(401);

    const notices = (await api('get', `/announcements?schoolId=${ids.school}`, 'admin').expect(200)).body;
    expect(notices.items).toEqual([expect.objectContaining({ id: a.body.id, createdById: null })]);
    const logs = (
      await api('get', `/audit-logs?search=${encodeURIComponent('Đinh Thu Trang')}&limit=50`, 'admin').expect(
        200,
      )
    ).body;
    // her own actions (sign-ins, the notice) keep her name; the link to the deleted account becomes NULL
    const own = logs.items.filter((l: { userName: string }) => l.userName === 'Đinh Thu Trang');
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((l: { userId: string | null }) => l.userId === null)).toBe(true);
  });
});

describe('Monitoring', () => {
  it('/health: SQL Server reachable with its ping, AI state from .env', async () => {
    const h = (await request(http).get('/health').expect(200)).body;
    expect(h).toMatchObject({ status: 'ok', db: 'up', dbEngine: 'SQL Server', aiMode: 'mock' });
    expect(h.dbLatencyMs).toBeGreaterThanOrEqual(0);
    expect(h.ai).toEqual({
      mode: 'mock',
      speechToText: 'offline',
      speechToTextProvider: 'mock',
      extraction: 'offline',
      extractionProvider: 'mock',
    });
  });

  it('/system/metrics: measured values, consistent, admin only', async () => {
    const m = (await api('get', '/system/metrics', 'admin').expect(200)).body;
    expect(m.cpu.percent).toBeGreaterThanOrEqual(0);
    expect(m.cpu.percent).toBeLessThanOrEqual(100);
    expect(m.memory.usedBytes).toBeLessThanOrEqual(m.memory.totalBytes);
    if (m.disk) expect(m.disk.usedBytes).toBeLessThanOrEqual(m.disk.totalBytes);
    expect(m.database.sizeBytes).toBeGreaterThan(0);
    expect(m.uploads).toMatchObject({ writable: true, photoFiles: expect.any(Number) });
    const principal = (await login('0902000001').expect(200)).body.accessToken;
    await api('get', '/system/metrics', principal).expect(403);
  });
});

describe('Audit log', () => {
  it('date, action and status filters with pagination', async () => {
    const all = (await api('get', `/audit-logs?from=${today}&to=${today}&limit=5`, 'admin').expect(200)).body;
    expect(all.total).toBeGreaterThan(5);
    expect(all.pages).toBe(Math.ceil(all.total / 5));
    const page2 = (
      await api('get', `/audit-logs?from=${today}&to=${today}&limit=5&page=2`, 'admin').expect(200)
    ).body;
    expect(page2.items.map((l: { id: string }) => l.id)).not.toContain(all.items[0].id);

    const creates = (
      await api('get', '/audit-logs?action=CREATE&module=Schools&limit=50', 'admin').expect(200)
    ).body;
    expect(creates.items.length).toBeGreaterThan(0);
    expect(
      creates.items.every(
        (l: { action: string; module: string }) => l.action === 'CREATE' && l.module === 'Schools',
      ),
    ).toBe(true);
    const failed = (await api('get', '/audit-logs?status=FAILED&limit=100', 'admin').expect(200)).body;
    expect(failed.items.map((l: { httpStatus: number }) => l.httpStatus)).toContain(409); // the refused deletions above
  });

  it('empty results and bad filters', async () => {
    const yesterday = addDays(today, -1);
    const none = (await api('get', `/audit-logs?from=${yesterday}&to=${yesterday}`, 'admin').expect(200))
      .body;
    expect(none).toMatchObject({ items: [], total: 0, pages: 0 });
    expect((await api('get', '/audit-logs?search=khong-co-gi-ca', 'admin').expect(200)).body.total).toBe(0);
    await api('get', '/audit-logs?from=2026-13-40', 'admin').expect(400);
    await api('get', '/audit-logs?limit=1000', 'admin').expect(400);
    expect(
      (await api('get', '/users?role=PRINCIPAL&search=khong-co-gi-ca', 'admin').expect(200)).body,
    ).toEqual([]);
  });

  it('Action filter: every action type is recorded and filtered exactly, totals add up to "all actions"', async () => {
    // One request per action type; refused requests are recorded too, so made-up ids are enough.
    const principal = (await login('0902000001').expect(200)).body.accessToken;
    const nobody = '00000000-0000-4000-8000-000000000000';
    await api('patch', `/schools/${ids.school}`, 'admin').send({ address: 'Đà Nẵng' }); // UPDATE
    await api('patch', `/users/${nobody}/status`, 'admin').send({ status: 'INACTIVE' }); // STATUS
    await api('post', `/users/${nobody}/reset-password`, 'admin'); // RESET_PASSWORD
    await api('patch', '/auth/change-password', principal).send({
      currentPassword: 'sai-mat-khau',
      newPassword: 'MatKhau2026',
    }); // CHANGE_PASSWORD
    await api('post', `/class-journals/${nobody}/approve`, principal); // APPROVE
    await api('post', `/class-journals/${nobody}/publish`, principal); // PUBLISH
    await api('post', '/daily-journals/bulk', principal).send({}); // BULK_SAVE
    await api('post', '/class-journals/photos', principal); // UPLOAD
    await api('post', '/class-journals/voice-draft', principal).send({}); // AI_DRAFT
    await api('post', `/students/${nobody}/parents`, principal).send({}); // LINK
    await api('delete', `/students/${nobody}/parents/${nobody}`, principal); // UNLINK
    await api('delete', `/daily-journals/${nobody}`, principal); // DELETE

    const ACTIONS = [
      'LOGIN',
      'CREATE',
      'UPDATE',
      'DELETE',
      'STATUS',
      'APPROVE',
      'BULK_SAVE',
      'UPLOAD',
      'RESET_PASSWORD',
      'CHANGE_PASSWORD',
      'LINK',
      'UNLINK',
      'AI_DRAFT',
      'PUBLISH',
    ];
    const all = (await api('get', '/audit-logs?limit=1', 'admin').expect(200)).body.total;
    let sum = 0;
    for (const action of ACTIONS) {
      const page = (await api('get', `/audit-logs?action=${action}&limit=100`, 'admin').expect(200)).body;
      expect(page.total).toBeGreaterThan(0);
      expect(page.items.every((l: { action: string }) => l.action === action)).toBe(true);
      expect(page.pages).toBe(Math.ceil(page.total / 100));
      if (page.total > 1) {
        const second = (await api('get', `/audit-logs?action=${action}&limit=1&page=2`, 'admin').expect(200))
          .body;
        expect(second).toMatchObject({ total: page.total, items: [expect.objectContaining({ action })] });
      }
      sum += page.total;
    }
    expect(sum).toBe(all); // "All actions" (no action param) = all action types together, nothing outside them

    const removed = (
      await api('get', '/audit-logs?action=DELETE&module=Daily%20Journal', 'admin').expect(200)
    ).body;
    expect(removed.items[0]).toMatchObject({ action: 'DELETE', status: 'FAILED' });
    await api('get', '/audit-logs?action=STATUS_CHANGE', 'admin').expect(400);
  });

  it('admin purges entries older than a day', async () => {
    await api('delete', '/audit-logs', 'admin').expect(400); // `before` is required
    const res = (await api('delete', `/audit-logs?before=${addDays(today, 1)}`, 'admin').expect(200)).body;
    expect(res.deleted).toBeGreaterThan(0);
    const left = (await api('get', '/audit-logs', 'admin').expect(200)).body;
    expect(left.items.every((l: { action: string; module: string }) => l.module === 'Audit Logs')).toBe(true);
  });
});
