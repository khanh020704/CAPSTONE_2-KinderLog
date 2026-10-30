import { config } from 'dotenv';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

// The suites use the SQL Server from .env but their own database (<DB_NAME>_test) and upload folder (and Redis database 1),
// so running the tests never touches the real data. The AI pipeline runs offline (AI_MODE=mock) unless a suite overrides it.
config({ path: resolve(__dirname, '..', '.env'), quiet: true });
process.env.DB_NAME = `${process.env.DB_NAME ?? 'kinderlog'}_test`;
process.env.UPLOAD_DIR = join(tmpdir(), 'kinderlog-e2e-uploads');
// Redis logical database 1, so cached dashboards of the tests and of the running app never mix.
if (process.env.REDIS_URL) process.env.REDIS_URL = `${process.env.REDIS_URL.replace(/\/\d*$/, '')}/1`;
process.env.AI_MODE = 'mock';
// The suites sign in many times; the real 10/minute limit is checked by its own test.
process.env.LOGIN_RATE_LIMIT = '1000';
