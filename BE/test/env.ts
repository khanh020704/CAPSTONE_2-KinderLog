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
// Uploads stay on disk (no private key: nothing is ever sent to ImageKit), but journals may still point at
// this fixed ImageKit folder, so the address check is tested the same way whatever .env holds.
process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/kinderlog-e2e';
process.env.IMAGEKIT_PRIVATE_KEY = '';
process.env.IMAGEKIT_FOLDER = '/kinderlog';
