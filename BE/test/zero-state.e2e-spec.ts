import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { rmSync } from 'fs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { cleanDatabase } from '../src/database/clean-database';
import { dataSourceOptions } from '../src/database/data-source';
import { seedAdmin } from '../src/database/seeds/admin.seed';
import { prepareTestDatabase } from './test-db';

/**
 * A fresh installation: empty tables plus the first System Admin (what `npm run db:clean` leaves). The admin sets up
 * a school from scratch, and every dashboard / report / list must work while there is nothing to count yet.
 * The AI keys are left out on purpose: the AI endpoints must say they are not set up instead of inventing a draft.
 */

const ADMIN = { phone: '0900000000', password: 'FreshStart2026', fullName: 'Quản trị hệ thống' };
const INITIAL_PASSWORD = process.env.DEFAULT_PASSWORD ?? '123456';
const PHONES = { principal: '0912000001', teacher: '0913000001', parent: '0914000001' };

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

const api = (method: 'get' | 'post' | 'patch', path: string, who: string) =>
  request(http)[method](`/api${path}`).set('Authorization', `Bearer ${tokens[who]}`);
const login = async (who: string, phone: string, password = INITIAL_PASSWORD) => {
  const res = await request(http).post('/api/auth/login').send({ phone, password }).expect(200);
  tokens[who] = res.body.accessToken;
};
/** Every number in a payload is finite: no NaN / Infinity from a division by zero (JSON turns those into null). */
const finiteNumbers = (value: unknown, path = '$'): string[] => {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => finiteNumbers(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => finiteNumbers(v, `${path}.${k}`));
  return [];
};

beforeAll(async () => {
  // Live AI mode without keys, as on a server where nobody has configured them yet.
  process.env.AI_MODE = 'live';
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.GROQ_API_KEY = '';
  process.env.JOURNAL_AI_PROVIDER = '';

  await prepareTestDatabase();
  rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true }); // a fresh installation has no uploads
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  await cleanDatabase(ds);
  await seedAdmin(ds, ADMIN);
  await ds.destroy();

  const { AppModule } = await import('../src/app.module'); // after the env above
  const { configureApp } = await import('../src/app.setup');
  const { CacheService } = await import('../src/modules/cache/cache.service');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  await app.get(CacheService).invalidate('dash:');
});

afterAll(async () => {
  await app?.close();
  rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true });
});

describe('Fresh installation (only the System Admin)', () => {
  it('health: database up, AI reported as not set up', async () => {
    const res = await request(http).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      db: 'up',
      // Without an LLM key the keyword rules make the draft; without a speech-to-text key the browser transcribes.
      ai: { mode: 'live', speechToText: 'missing-key', extraction: 'ready', extractionProvider: 'keywords' },
    });
  });

  it('the seeded admin signs in; no demo account exists', async () => {
    await login('admin', ADMIN.phone, ADMIN.password);
    await request(http).post('/api/auth/login').send({ phone: '0901000001', password: '123456' }).expect(401);
  });

  it('admin dashboard, school list and user list are empty but valid', async () => {
    const dash = (await api('get', '/reports/admin-dashboard', 'admin').expect(200)).body;
    expect(dash.totals).toMatchObject({ schools: 0, activeSchools: 0 });
    expect(dash.totals.users.SYSTEM_ADMIN.total).toBe(1);
    expect(dash.totals.users.PARENT.total).toBe(0);
    expect(dash.last7Days).toEqual([]);
    expect(finiteNumbers(dash)).toEqual([]);

    expect((await api('get', '/schools', 'admin').expect(200)).body).toEqual([]);
    const users = (await api('get', '/users', 'admin').expect(200)).body;
    expect(users.map((u: { phone: string }) => u.phone)).toEqual([ADMIN.phone]);
  });

  it('system metrics are measured, with no uploaded files yet', async () => {
    const m = (await api('get', '/system/metrics', 'admin').expect(200)).body;
    expect(m.memory.totalBytes).toBeGreaterThan(0);
    expect(m.cpu.percent).toBeGreaterThanOrEqual(0);
    expect(m.uploads).toMatchObject({ photoFiles: 0, photoBytes: 0 });
    expect(m.database.sizeBytes).toBeGreaterThan(0);
  });
});

describe('Setting up the first school from scratch', () => {
  it('admin creates the school and its principal', async () => {
    const school = await api('post', '/schools', 'admin').send({ name: 'Mầm non Hoa Sen' }).expect(201);
    ids.school = school.body.id;
    await api('post', '/users', 'admin')
      .send({ fullName: 'Lê Thị Hoa', phone: PHONES.principal, role: 'PRINCIPAL', schoolId: ids.school })
      .expect(201);
    await login('principal', PHONES.principal);
  });

  it('principal dashboard before any class: zero rates, no division by zero', async () => {
    const dash = (await api('get', '/reports/dashboard', 'principal').expect(200)).body;
    expect(dash.overview).toMatchObject({ classes: 0, students: 0, teachers: 0, parents: 0, cameras: 0 });
    expect(dash.kpis).toMatchObject({
      attendanceRate: 0,
      submissionRate: 0,
      nutritionIndex: null,
      healthAlerts: 0,
    });
    expect(dash.today.classes).toEqual([]);
    expect(dash.attendanceTrend.every((d: { present: number }) => d.present === 0)).toBe(true);
    expect(finiteNumbers(dash)).toEqual([]);
  });

  it('every report is empty and still exports to PDF and Excel', async () => {
    for (const type of ['attendance', 'journals', 'activity', 'students', 'parents', 'nutrition', 'health']) {
      const t = (await api('get', `/reports/table?type=${type}`, 'principal').expect(200)).body;
      expect(t.rows).toEqual([]);
      expect(finiteNumbers(t)).toEqual([]);
    }
    for (const format of ['pdf', 'xlsx']) {
      const res = await api('get', `/reports/export?type=attendance&format=${format}`, 'principal')
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    }
  });

  it('a teacher with no class yet sees empty lists (not an SQL error)', async () => {
    const t = await api('post', '/users', 'principal')
      .send({ fullName: 'Trần Thị Mai', phone: PHONES.teacher, role: 'TEACHER' })
      .expect(201);
    ids.teacher = t.body.id;
    await login('teacher', PHONES.teacher);
    expect((await api('get', '/classes', 'teacher').expect(200)).body).toEqual([]);
    expect((await api('get', '/students', 'teacher').expect(200)).body).toEqual([]);
  });

  it('a parent with no child linked yet sees an empty list', async () => {
    const p = await api('post', '/users', 'principal')
      .send({ fullName: 'Nguyễn Văn Bình', phone: PHONES.parent, role: 'PARENT' })
      .expect(201);
    ids.parent = p.body.id;
    await login('parent', PHONES.parent);
    expect((await api('get', '/students', 'parent').expect(200)).body).toEqual([]);
  });

  it('principal creates a class (still no students): dashboard and history stay valid', async () => {
    const c = await api('post', '/classes', 'principal')
      .send({ name: 'Chồi 1', academicYear: '2026-2027', homeroomTeacherId: ids.teacher })
      .expect(201);
    ids.class = c.body.id;
    const dash = (await api('get', '/reports/dashboard', 'principal').expect(200)).body;
    expect(dash.overview.classes).toBe(1);
    expect(dash.today.classes).toEqual([
      expect.objectContaining({ classId: ids.class, total: 0, present: 0, logged: 0 }),
    ]);
    expect(finiteNumbers(dash)).toEqual([]);
    expect((await api('get', `/class-journals?classId=${ids.class}`, 'teacher').expect(200)).body).toEqual({
      items: [],
    });
  });

  it('first student and parent link; the child has an empty timeline', async () => {
    const s = await api('post', '/students', 'principal')
      .send({ classId: ids.class, fullName: 'Nguyễn Minh Khang', dateOfBirth: '2022-04-10', gender: 'MALE' })
      .expect(201);
    ids.student = s.body.id;
    await api('post', `/students/${ids.student}/parents`, 'principal')
      .send({ parentId: ids.parent, relationship: 'FATHER' })
      .expect(201);
    const tl = (await api('get', `/daily-journals/timeline?studentId=${ids.student}`, 'parent').expect(200))
      .body;
    expect(finiteNumbers(tl)).toEqual([]);
    expect(JSON.stringify(tl)).not.toContain('"events":[{');
  });

  it('without API keys: the keyword rules make the draft; recordings need the browser transcript (else 503)', async () => {
    const res = await api('post', '/class-journals/voice-draft', 'teacher')
      .send({ classId: ids.class, transcript: 'Hôm nay các con ăn hết suất.' })
      .expect(201);
    expect(res.body.engine).toBe('keywords');
    expect(res.body.sections.meal).toMatch(/ăn hết suất/);

    const audio = { filename: 'a.webm', contentType: 'audio/webm' };
    const voice = await api('post', '/class-journals/transcribe', 'teacher')
      .field('classId', ids.class)
      .attach('audio', Buffer.from('fake'), audio)
      .expect(503);
    expect(voice.body.message).toContain('GROQ_API_KEY');
    const heard = await api('post', '/class-journals/transcribe', 'teacher')
      .field('classId', ids.class)
      .field('transcript', 'Các con ngủ ngon.')
      .attach('audio', Buffer.from('fake'), audio)
      .expect(201);
    expect(heard.body).toMatchObject({ transcriptSource: 'browser', transcript: 'Các con ngủ ngon.' });
  });

  it('the teacher logs the first journal manually and the dashboard counts it', async () => {
    await api('post', '/daily-journals/bulk', 'teacher')
      .send({ classId: ids.class, defaults: { attendance: 'PRESENT', mealLevel: 'ALL' }, exceptions: [] })
      .expect(201);
    const dash = (await api('get', '/reports/dashboard', 'principal').expect(200)).body;
    expect(dash.today.classes[0]).toMatchObject({ total: 1, present: 1, logged: 1 });
    expect(dash.kpis.attendanceRate).toBe(100);
    expect(finiteNumbers(dash)).toEqual([]);
  });
});

// supertest parser that keeps binary bodies as a Buffer
function binary(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
}
