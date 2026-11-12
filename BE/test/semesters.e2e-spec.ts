import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadDemoData } from './fixtures/demo-data';
import { prepareTestDatabase } from './test-db';

/**
 * Semesters (học kỳ) of an academic year: a new year starts with Học kỳ 1 / Học kỳ 2, and the principal adds, changes
 * and deletes semesters inside the year's dates, never overlapping. Other roles only read them.
 */

let app: NestExpressApplication;
let http: ReturnType<NestExpressApplication['getHttpServer']>;
const tokens: Record<string, string> = {};
let yearId: string;

const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, who = 'principal') =>
  request(http)[method](`/api${path}`).set('Authorization', `Bearer ${tokens[who]}`);
const login = (phone: string) => request(http).post('/api/auth/login').send({ phone, password: '123456' });
const names = (year: any) => year.semesters.map((s: any) => `${s.name} ${s.startDate}..${s.endDate}`);

beforeAll(async () => {
  await prepareTestDatabase();
  await loadDemoData();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, { swagger: false });
  await app.init();
  http = app.getHttpServer();
  tokens.principal = (await login('0902000001').expect(200)).body.accessToken;
  tokens.otherPrincipal = (await login('0902000002').expect(200)).body.accessToken;
  tokens.teacher = (await login('0903000001').expect(200)).body.accessToken;
  tokens.parent = (await login('0904000001').expect(200)).body.accessToken;
});

afterAll(async () => {
  await app?.close();
});

describe('Semesters', () => {
  it('a new academic year starts with Học kỳ 1 (until 15 January) and Học kỳ 2 (from 16 January)', async () => {
    const year = (
      await api('post', '/academic-years')
        .send({ name: '2030-2031', startDate: '2030-09-01', endDate: '2031-05-31' })
        .expect(201)
    ).body;
    yearId = year.id;
    expect(names(year)).toEqual(['Học kỳ 1 2030-09-01..2031-01-15', 'Học kỳ 2 2031-01-16..2031-05-31']);
  });

  it('the list of academic years carries the semesters of each year', async () => {
    const years = (await api('get', '/academic-years').expect(200)).body;
    expect(names(years.find((y: any) => y.id === yearId))).toHaveLength(2);
  });

  it('a semester overlapping another is refused', async () => {
    const res = await api('post', `/academic-years/${yearId}/semesters`)
      .send({ name: 'Học kỳ hè', startDate: '2031-01-10', endDate: '2031-02-01' })
      .expect(409);
    expect(res.body.message).toMatch(/overlap/i);
  });

  it('a semester outside the academic year is refused', async () => {
    await api('post', `/academic-years/${yearId}/semesters`)
      .send({ name: 'Học kỳ hè', startDate: '2031-06-01', endDate: '2031-07-01' })
      .expect(400);
  });

  it('a semester ending before it starts, or with a name already used, is refused', async () => {
    await api('post', `/academic-years/${yearId}/semesters`)
      .send({ name: 'Học kỳ hè', startDate: '2031-05-30', endDate: '2031-05-20' })
      .expect(400);
    const year = (await api('get', `/academic-years/${yearId}`).expect(200)).body;
    const hk2 = year.semesters[1];
    await api('patch', `/academic-years/semesters/${hk2.id}`).send({ name: 'học kỳ 1' }).expect(409);
  });

  it('the principal shortens a semester, adds one in the freed days, then deletes it', async () => {
    const year = (await api('get', `/academic-years/${yearId}`).expect(200)).body;
    const hk2 = year.semesters[1];
    await api('patch', `/academic-years/semesters/${hk2.id}`).send({ endDate: '2031-05-20' }).expect(200);
    const added = (
      await api('post', `/academic-years/${yearId}/semesters`)
        .send({ name: 'Học kỳ hè', startDate: '2031-05-21', endDate: '2031-05-31' })
        .expect(201)
    ).body;
    expect(names(added)).toContain('Học kỳ hè 2031-05-21..2031-05-31');
    const summer = added.semesters.find((s: any) => s.name === 'Học kỳ hè');
    const after = (await api('delete', `/academic-years/semesters/${summer.id}`).expect(200)).body;
    expect(after.semesters).toHaveLength(2);
  });

  it('the year cannot be shortened so that a semester falls outside it', async () => {
    await api('patch', `/academic-years/${yearId}`).send({ endDate: '2031-04-30' }).expect(400);
  });

  it('teachers and parents read the semesters but cannot change them', async () => {
    const seen = (await api('get', '/academic-years', 'teacher').expect(200)).body;
    expect(seen.find((y: any) => y.id === yearId).semesters).toHaveLength(2);
    for (const who of ['teacher', 'parent']) {
      await api('post', `/academic-years/${yearId}/semesters`, who)
        .send({ name: 'X', startDate: '2031-05-21', endDate: '2031-05-31' })
        .expect(403);
    }
  });

  it("another school's principal cannot see or change these semesters", async () => {
    await api('post', `/academic-years/${yearId}/semesters`, 'otherPrincipal')
      .send({ name: 'X', startDate: '2031-05-21', endDate: '2031-05-31' })
      .expect(404);
  });

  it('deleting the academic year deletes its semesters', async () => {
    await api('delete', `/academic-years/${yearId}`).expect(200);
    await api('get', `/academic-years/${yearId}`).expect(404);
  });
});
