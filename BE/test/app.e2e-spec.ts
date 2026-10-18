import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { rmSync } from 'fs';
import { basename, join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, clock, isoDate } from '../src/common/utils/date.util';
import { runSeed } from '../src/database/seeds/seed';
import { CacheService } from '../src/modules/cache/cache.service';

/**
 * System integration suite: the real AppModule (guards, pipes, filters, TypeORM, Redis) against the database in
 * .env, reseeded before the run. Tests run in order and share state (a journal saved by the teacher is then read by
 * the parent and counted by the principal), like the demo itself.
 */

const TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const PHONES = {
  admin: '0901000001',
  principal: '0902000001',
  teacher: '0903000001',
  teacher2: '0903000002',
  parent: '0904000001',
};

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens: Record<string, string> = {};
const today = isoDate(TZ);

const api = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, who?: string) => {
  const r = request(http)[method](`/api${path}`);
  return who ? r.set('Authorization', `Bearer ${tokens[who] ?? who}`) : r;
};
const login = (phone: string, password = '123456', role?: string) =>
  api('post', '/auth/login').send({ phone, password, role });

beforeAll(async () => {
  await runSeed({ quiet: true });
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  await app.get(CacheService).invalidate('dash:');
  for (const [k, phone] of Object.entries(PHONES)) tokens[k] = (await login(phone)).body.accessToken;
});

afterAll(async () => {
  await app?.close();
  // the uploaded test photo is not part of the demo data
  if (ids.photoUrl) {
    rmSync(join(process.env.UPLOAD_DIR ?? 'uploads', 'photos', basename(ids.photoUrl)), { force: true });
  }
});

// shared ids, filled as the suite goes
const ids: Record<string, string> = {};

describe('1. Health & bootstrap', () => {
  it('GET /health reports the database up (public route)', async () => {
    const res = await request(http).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up', dbEngine: 'SQL Server', aiMode: 'mock' });
  });
});

describe('2. Authentication & JWT', () => {
  it('signs in all 4 roles and returns a Bearer JWT + profile', () => {
    for (const k of ['admin', 'principal', 'teacher', 'parent']) expect(tokens[k]).toMatch(/^ey/);
  });

  it.each([
    ['admin', 'SYSTEM_ADMIN'],
    ['principal', 'PRINCIPAL'],
    ['teacher', 'TEACHER'],
    ['parent', 'PARENT'],
  ])('GET /auth/me with the %s token returns role %s', async (who, role) => {
    const res = await api('get', '/auth/me', who).expect(200);
    expect(res.body.role).toBe(role);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('teacher profile carries the homeroom class; parent profile carries the child', async () => {
    const t = await api('get', '/auth/me', 'teacher');
    const p = await api('get', '/auth/me', 'parent');
    expect(t.body.classes[0].name).toBe('Mặt Trời 1');
    expect(p.body.children[0].fullName).toBe('Nguyễn Minh An');
    ids.class1 = t.body.classes[0].id;
    ids.an = p.body.children[0].id;
  });

  it('wrong password → 401 with a generic message', async () => {
    const res = await login(PHONES.teacher, 'wrong-pass').expect(401);
    expect(res.body.message).toBe('Incorrect phone number or password');
  });
  it('role picked on the login screen must match → 401', () =>
    login(PHONES.teacher, '123456', 'PARENT').expect(401));
  it('inactive account → 403', () => login('0903000004').expect(403));
  it('malformed phone → 400 (validation)', () => login('12345').expect(400));
  it('no token → 401', () => api('get', '/classes').expect(401));
  it('tampered token → 401', () => api('get', '/auth/me', `${tokens.teacher.slice(0, -4)}AAAA`).expect(401));

  it('expired token → 401 (FE then signs the user out)', async () => {
    const jwt = app.get(JwtService);
    const me = (await api('get', '/auth/me', 'teacher')).body;
    const expired = await jwt.signAsync(
      { sub: me.id, role: me.role, schoolId: me.schoolId },
      { expiresIn: -60 },
    );
    await api('get', '/auth/me', expired).expect(401);
  });
});

describe('3. RBAC & multi-tenant isolation', () => {
  it('principal lists the 2 classes of the school with student counts', async () => {
    const res = await api('get', '/classes', 'principal').expect(200);
    expect(res.body).toHaveLength(2);
    ids.class2 = res.body.find((c: any) => c.name === 'Mặt Trời 2').id;
    expect(res.body.find((c: any) => c.id === ids.class1).studentCount).toBe(16);
  });
  it('teacher only sees the homeroom class', async () =>
    expect((await api('get', '/classes', 'teacher')).body).toHaveLength(1));
  it('teacher → another class register: 403', () =>
    api('get', `/daily-journals/class/${ids.class2}`, 'teacher').expect(403));
  it('teacher → user management: 403', () => api('get', '/users', 'teacher').expect(403));
  it('principal → platform school list: 403', () => api('get', '/schools', 'principal').expect(403));
  it('parent → class register: 403', () =>
    api('get', `/daily-journals/class/${ids.class1}`, 'parent').expect(403));
  it('principal of another school cannot see this school’s students', async () => {
    const other = (await login('0902000002')).body.accessToken;
    const res = await api('get', '/students', other).expect(200);
    expect(res.body).toHaveLength(0);
    await api('get', `/students/${ids.an}`, other).expect(403);
  });
  it('accent-insensitive search finds "Hương" with "huong"', async () => {
    const res = await api('get', '/users?role=PARENT&search=huong', 'principal').expect(200);
    expect(res.body.map((u: any) => u.fullName)).toContain('Nguyễn Thị Hương');
  });
});

describe('4. Teacher — bulk logging with exceptions', () => {
  let roster: any[];
  const byName = (n: string) => roster.find((s) => s.student.fullName === n).student.id;

  it('class register for today starts empty', async () => {
    const res = await api('get', `/daily-journals/class/${ids.class1}`, 'teacher').expect(200);
    expect(res.body.summary).toMatchObject({ total: 16, logged: 0 });
    roster = res.body.students;
  });

  it('rejects an invalid payload (temperature 50°C) with 400', () =>
    api('post', '/daily-journals/bulk', 'teacher')
      .send({
        classId: ids.class1,
        defaults: {},
        exceptions: [{ studentId: byName('Nguyễn Minh An'), temperature: 50 }],
      })
      .expect(400));

  it('rejects a future date (400) and a date older than 7 days for teachers (403)', async () => {
    await api('post', '/daily-journals/bulk', 'teacher')
      .send({ classId: ids.class1, date: addDays(today, 1), defaults: {} })
      .expect(400);
    await api('post', '/daily-journals/bulk', 'teacher')
      .send({ classId: ids.class1, date: addDays(today, -10), defaults: {} })
      .expect(403);
  });

  it('saves class defaults for 16 children with 3 exceptions as DRAFT', async () => {
    const res = await api('post', '/daily-journals/bulk', 'teacher')
      .send({
        classId: ids.class1,
        defaults: {
          attendance: 'PRESENT',
          mealLevel: 'ALL',
          mealNote: 'Cơm, canh bí đỏ',
          sleepMinutes: 90,
          sleepQuality: 'GOOD',
          healthStatus: 'NORMAL',
          mood: 'HAPPY',
          learningNote: 'Vẽ tranh gia đình',
        },
        exceptions: [
          {
            studentId: byName('Nguyễn Minh An'),
            mealLevel: 'LITTLE',
            temperature: 37.9,
            healthNote: 'Hơi sốt',
          },
          { studentId: byName('Trần Bảo Ngọc'), attendance: 'ABSENT', absenceReason: 'Gia đình xin nghỉ' },
          { studentId: byName('Hoàng Đức Minh'), sleepMinutes: 40, sleepQuality: 'POOR', mood: 'TIRED' },
        ],
      })
      .expect(201);
    expect(res.body).toMatchObject({ total: 16, exceptions: 3, absent: 1 });
    expect(res.body.entries.every((e: any) => e.status === 'DRAFT' && e.source === 'BULK')).toBe(true);
    const an = res.body.entries.find((e: any) => e.studentId === byName('Nguyễn Minh An'));
    expect(an).toMatchObject({
      mealLevel: 'LITTLE',
      sleepMinutes: 90,
      healthStatus: 'MONITOR',
      temperature: 37.9,
    });
    const ngoc = res.body.entries.find((e: any) => e.studentId === byName('Trần Bảo Ngọc'));
    // regression: the class "NORMAL" health is not copied to a child who was not there
    expect(ngoc).toMatchObject({
      attendance: 'ABSENT',
      mealLevel: null,
      sleepMinutes: null,
      healthStatus: null,
    });
    const minh = res.body.entries.find((e: any) => e.studentId === byName('Hoàng Đức Minh'));
    expect(minh).toMatchObject({ sleepMinutes: 40, mealLevel: 'ALL', mood: 'TIRED' });
    const warned = res.body.warnings.map((w: any) => w.studentName);
    expect(warned).toEqual(expect.arrayContaining(['Nguyễn Minh An', 'Lê Gia Huy'])); // fever + allergy on file
  });

  it('parent cannot see the draft before approval', async () => {
    const res = await api('get', `/daily-journals/timeline?studentId=${ids.an}`, 'parent').expect(200);
    expect(res.body.days.find((d: any) => d.date === today)).toBeUndefined();
  });

  it('single-child edit (PUT) keeps the entry a draft', async () => {
    const res = await api('put', `/daily-journals/student/${ids.an}`, 'teacher')
      .send({ teacherNote: 'Con mạnh dạn phát biểu' })
      .expect(200);
    expect(res.body).toMatchObject({ teacherNote: 'Con mạnh dạn phát biểu', status: 'DRAFT' });
  });

  it('uploads a photo once and links it to every child present', async () => {
    const res = await api('post', '/daily-journals/photos', 'teacher')
      .field('classId', ids.class1)
      .field('caption', 'Giờ vẽ tranh')
      .attach('photos', Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64'), {
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    expect(res.body.linkedStudents).toHaveLength(15); // 16 minus the absent child
    await request(http).get(res.body.files[0]).expect(200);
    ids.photoUrl = res.body.files[0];
  });

  it('rejects a non-image upload with 400', () =>
    api('post', '/daily-journals/photos', 'teacher')
      .field('classId', ids.class1)
      .attach('photos', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400));
});

describe('5. Teacher — AI Voice-to-JSON', () => {
  it('AI text: class defaults + 3 named exceptions, nothing written without apply', async () => {
    const res = await api('post', '/daily-journals/ai/text', 'teacher')
      .send({
        classId: ids.class1,
        transcript:
          'Hôm nay các con học hát bài Cả nhà thương nhau. Các con ăn hết suất cơm. Cả lớp ngủ trưa khoảng 1 tiếng rưỡi, ngủ ngon. Bé Gia Huy bị ho và sổ mũi, nhiệt độ 37,6 độ. Bé Bảo Ngọc khóc nhiều, chỉ ăn ít. Bé Nhật Nam xin nghỉ học.',
      })
      .expect(201);
    const d = res.body.draft;
    expect(d.classDefaults).toMatchObject({ mealLevel: 'ALL', sleepMinutes: 90, sleepQuality: 'GOOD' });
    const byName = (n: string) => d.exceptions.find((e: any) => e.studentName === n);
    expect(byName('Lê Gia Huy')).toMatchObject({ temperature: 37.6, healthStatus: 'MONITOR' });
    expect(byName('Trần Bảo Ngọc')).toMatchObject({ mood: 'SAD', mealLevel: 'LITTLE' });
    expect(byName('Đỗ Nhật Nam')).toMatchObject({ attendance: 'ABSENT' });
    expect(res.body.applied).toBeNull();
    expect(res.body.pipeline).toMatchObject({ asr: 'client', extractor: 'rule-based' });
  });

  it('regression: "thịt viên sốt cà chua" is a dish, not a fever (class stays NORMAL)', async () => {
    const res = await api('post', '/daily-journals/ai/text', 'teacher')
      .send({
        classId: ids.class1,
        transcript:
          'Bữa trưa có cơm, canh bí đỏ và thịt viên sốt cà chua, các con ăn hết suất. Sức khỏe các con bình thường. Bé Gia Huy bị sốt 38 độ.',
      })
      .expect(201);
    expect(res.body.draft.classDefaults).toMatchObject({ healthStatus: 'NORMAL', mealLevel: 'ALL' });
    expect(res.body.draft.classDefaults.healthNote).not.toMatch(/thịt viên/);
    const huy = res.body.draft.exceptions.find((e: any) => e.studentName === 'Lê Gia Huy');
    expect(huy).toMatchObject({ healthStatus: 'SICK', temperature: 38 });
  });

  it('AI voice (multipart audio → ASR → extractor) with apply=true saves VOICE drafts', async () => {
    const res = await api('post', '/daily-journals/ai/voice', 'teacher')
      .field('classId', ids.class1)
      .field('apply', 'true')
      .attach('audio', Buffer.alloc(4096, 1), { filename: 'rec.webm', contentType: 'audio/webm' })
      .expect(201);
    expect(res.body.transcript.length).toBeGreaterThan(20);
    expect(res.body.pipeline.asr).toBe('mock');
    expect(res.body.applied.total).toBe(16);
    expect(res.body.applied.entries.every((e: any) => e.status === 'DRAFT' && e.source === 'VOICE')).toBe(
      true,
    );
  });

  it('AI voice without a recording → 400; non-audio file → 400', async () => {
    await api('post', '/daily-journals/ai/voice', 'teacher').field('classId', ids.class1).expect(400);
    await api('post', '/daily-journals/ai/voice', 'teacher')
      .field('classId', ids.class1)
      .attach('audio', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
  });

  it('parents cannot call the AI pipeline (403)', () =>
    api('post', '/daily-journals/ai/text', 'parent')
      .send({ classId: ids.class1, transcript: 'abc test' })
      .expect(403));
});

describe('6. Teacher — approve & publish', () => {
  it('approves every draft of the class for today', async () => {
    const res = await api('post', '/daily-journals/approve', 'teacher')
      .send({ classId: ids.class1 })
      .expect(201);
    expect(res.body.approved).toBe(16);
  });

  it('history lists today as fully approved', async () => {
    const res = await api('get', `/daily-journals/class/${ids.class1}/history`, 'teacher').expect(200);
    expect(res.body[0]).toMatchObject({ date: today, logged: 16, approved: 16, draft: 0, voice: true });
  });
});

describe('7. Parent — timeline & camera', () => {
  it('timeline shows today (approved) with ordered events and the photo', async () => {
    const res = await api('get', `/daily-journals/timeline?studentId=${ids.an}`, 'parent').expect(200);
    const day = res.body.days[0];
    expect(day.date).toBe(today);
    expect(day.events.map((e: any) => e.key)).toEqual(
      expect.arrayContaining(['learning', 'meal', 'sleep', 'health', 'emotion']),
    );
    expect(day.photos.length).toBeGreaterThanOrEqual(1);
  });

  it('parent cannot read another child’s timeline (403)', async () => {
    const other = (await api('get', '/students', 'principal')).body.find(
      (s: any) => s.fullName === 'Trần Bảo Ngọc',
    );
    await api('get', `/daily-journals/timeline?studentId=${other.id}`, 'parent').expect(403);
  });

  describe('camera viewing window', () => {
    const { weekday } = clock(TZ);
    const allDays = 254;
    const camIds: string[] = [];

    beforeAll(async () => {
      const base = {
        classId: ids.class1,
        streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        allowedStartTime: '00:00',
        allowedEndTime: '23:59',
      };
      // open every day vs. open every day except today: deterministic whatever the time of the run
      const open = await api('post', '/camera-streams', 'principal')
        .send({ ...base, name: 'QA open', allowedWeekdays: allDays })
        .expect(201);
      const closed = await api('post', '/camera-streams', 'principal')
        .send({ ...base, name: 'QA closed', allowedWeekdays: allDays & ~(1 << weekday) })
        .expect(201);
      camIds.push(open.body.id, closed.body.id);
    });
    afterAll(async () => {
      for (const id of camIds) await api('delete', `/camera-streams/${id}`, 'principal');
    });

    it('inside the window: LIVE with the HLS URL', async () => {
      const res = await api('get', `/camera-streams/watch?studentId=${ids.an}`, 'parent').expect(200);
      const cam = res.body.cameras.find((c: any) => c.name === 'QA open');
      expect(cam).toMatchObject({ state: 'LIVE' });
      expect(cam.streamUrl).toMatch(/\.m3u8$/);
    });

    it('outside the window: SCHEDULED, no URL, next window given; direct watch → 403', async () => {
      const res = await api('get', `/camera-streams/watch?studentId=${ids.an}`, 'parent').expect(200);
      const cam = res.body.cameras.find((c: any) => c.name === 'QA closed');
      expect(cam).toMatchObject({ state: 'SCHEDULED', streamUrl: null });
      expect(cam.window.date).toBe(addDays(today, 1));
      await api('get', `/camera-streams/${camIds[1]}/watch`, 'parent').expect(403);
    });

    it('a parent of another class cannot watch this class (403)', async () => {
      const p2 = (await login('0904000017')).body.accessToken;
      await api('get', `/camera-streams/watch?studentId=${ids.an}`, p2).expect(403);
    });

    it('rejects a closing time before the opening time (400)', () =>
      api('post', '/camera-streams', 'principal')
        .send({
          classId: ids.class1,
          name: 'bad',
          streamUrl: 'https://x.test/a.m3u8',
          allowedStartTime: '10:00',
          allowedEndTime: '09:00',
        })
        .expect(400));
  });
});

describe('8. Principal — dashboard & reports', () => {
  let dash: any;

  it('dashboard returns KPIs, chart series and today per class', async () => {
    dash = (await api('get', '/reports/dashboard', 'principal').expect(200)).body;
    expect(dash.overview).toMatchObject({ classes: 2, students: 31 });
    expect(dash.attendanceTrend.length).toBe(dash.range.schoolDays);
    for (const p of dash.attendanceTrend) {
      expect(p.attendanceRate).toBeGreaterThanOrEqual(0);
      expect(p.attendanceRate).toBeLessThanOrEqual(100);
    }
    expect(dash.today.classes.find((c: any) => c.classId === ids.class1).journalState).toBe('APPROVED');
  });

  it('chart figures match the report rows (attendance KPI = Σ present / Σ marked)', async () => {
    const t = (
      await api(
        'get',
        `/reports/table?type=attendance&from=${dash.range.from}&to=${dash.range.to}`,
        'principal',
      ).expect(200)
    ).body;
    const present = t.rows.reduce((s: number, r: any) => s + r.present, 0);
    const absent = t.rows.reduce((s: number, r: any) => s + r.absent, 0);
    expect(dash.kpis.attendanceRate).toBeCloseTo(Math.round((present / (present + absent)) * 1000) / 10, 1);
    const todayPoint = dash.attendanceTrend.find((p: any) => p.date === today);
    const todayRows = t.rows.filter((r: any) => r.date === today);
    expect(todayPoint.present).toBe(todayRows.reduce((s: number, r: any) => s + r.present, 0));
  });

  it('nutrition distribution sums to the number of meals in the nutrition report', async () => {
    const t = (
      await api(
        'get',
        `/reports/table?type=nutrition&from=${dash.range.from}&to=${dash.range.to}`,
        'principal',
      )
    ).body;
    const meals = t.rows.reduce((s: number, r: any) => s + r.days, 0);
    const dist = Object.values(dash.nutrition.distribution as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    );
    expect(dist).toBe(meals);
  });

  it.each(['attendance', 'journals', 'nutrition', 'health'])('report table "%s" has rows', async (type) => {
    const res = await api('get', `/reports/table?type=${type}&from=${dash.range.from}`, 'principal').expect(
      200,
    );
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('exports a real PDF (Vietnamese font embedded)', async () => {
    const res = await api('get', '/reports/export?type=attendance&format=pdf', 'principal')
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    // regression: the file name carries the resolved range even when from/to are omitted
    expect(res.headers['content-disposition']).toMatch(
      /kinderlog-attendance-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.pdf/,
    );
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('DejaVuSans');
  });

  it('exports an Excel file whose rows match the report table', async () => {
    const res = await api(
      'get',
      `/reports/export?type=attendance&format=xlsx&from=${dash.range.from}`,
      'principal',
    )
      .buffer(true)
      .parse(binary)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    expect(ws.getCell(1, 1).value).toBe('Báo cáo chuyên cần');
    expect(ws.getRow(4).getCell(1).value).toBe('Ngày');
    const t = (await api('get', `/reports/table?type=attendance&from=${dash.range.from}`, 'principal')).body;
    let dataRows = 0;
    ws.eachRow(
      (row, n) =>
        n > 4 &&
        typeof row.getCell(1).value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.getCell(1).value as string) &&
        dataRows++,
    );
    expect(dataRows).toBe(t.rows.length);
  });

  it('teachers and parents cannot open the dashboard (403)', async () => {
    await api('get', '/reports/dashboard', 'teacher').expect(403);
    await api('get', '/reports/dashboard', 'parent').expect(403);
  });
});

describe('9. Principal & Admin — management', () => {
  it('creates a teacher; duplicate phone → 409; cannot create a principal (403)', async () => {
    const res = await api('post', '/users', 'principal')
      .send({ fullName: 'Giáo Viên Kiểm Thử', phone: '0909999999', role: 'TEACHER' })
      .expect(201);
    ids.qaTeacher = res.body.id;
    await api('post', '/users', 'principal')
      .send({ fullName: 'Trùng Số', phone: '0909999999', role: 'TEACHER' })
      .expect(409);
    await api('post', '/users', 'principal')
      .send({ fullName: 'Hiệu Trưởng Thử', phone: '0909999998', role: 'PRINCIPAL' })
      .expect(403);
  });

  it('locking an account revokes its token immediately', async () => {
    const t = (await login('0909999999')).body.accessToken;
    await api('get', '/auth/me', t).expect(200);
    await api('patch', `/users/${ids.qaTeacher}/status`, 'principal').send({ status: 'LOCKED' }).expect(200);
    await api('get', '/auth/me', t).expect(401);
    await login('0909999999').expect(403);
    await api('delete', `/users/${ids.qaTeacher}`, 'principal').expect(200);
  });

  it('creates a student with a new parent and links them (N-N map)', async () => {
    const parent = await api('post', '/users', 'principal')
      .send({ fullName: 'Phụ Huynh Kiểm Thử', phone: '0909888777', role: 'PARENT' })
      .expect(201);
    const st = await api('post', '/students', 'principal')
      .send({
        classId: ids.class1,
        fullName: 'Học Sinh Kiểm Thử',
        dateOfBirth: '2022-06-01',
        gender: 'MALE',
        allergies: 'Dị ứng trứng',
      })
      .expect(201);
    const linked = await api('post', `/students/${st.body.id}/parents`, 'principal')
      .send({ parentId: parent.body.id, relationship: 'MOTHER', isPrimary: true })
      .expect(201);
    expect(linked.body.parentLinks[0]).toMatchObject({ relationship: 'MOTHER', isPrimary: true });
    const me = (await login('0909888777')).body.user;
    expect(me.children[0].fullName).toBe('Học Sinh Kiểm Thử');
    await api('delete', `/students/${st.body.id}`, 'principal').expect(200);
    await api('delete', `/users/${parent.body.id}`, 'principal').expect(200);
  });

  it('a class with students cannot be deleted (409)', () =>
    api('delete', `/classes/${ids.class1}`, 'principal').expect(409));

  it('admin sees every school with its principal and the platform dashboard', async () => {
    const schools = (await api('get', '/schools', 'admin').expect(200)).body;
    expect(schools).toHaveLength(2);
    expect(schools.find((s: any) => s.name === 'Mầm non Kinder Stars')).toMatchObject({
      classCount: 2,
      teacherCount: 4,
    });
    const ad = (await api('get', '/reports/admin-dashboard', 'admin').expect(200)).body;
    expect(ad.totals.schools).toBe(2);
    await api('get', `/reports/dashboard?schoolId=${schools[0].id}`, 'admin').expect(200);
  });
});

describe('10. Rate limiting', () => {
  afterAll(() => {
    process.env.LOGIN_RATE_LIMIT = '1000';
  });

  it('login is throttled per IP: over the limit → 429 with Retry-After', async () => {
    process.env.LOGIN_RATE_LIMIT = '1'; // the suite already used more than one attempt in this minute
    const res = await login(PHONES.teacher).expect(429);
    expect(res.headers['retry-after'] ?? res.headers['retry-after-default']).toBeDefined();
  });
});

// supertest parser that keeps binary bodies as a Buffer
function binary(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
}
