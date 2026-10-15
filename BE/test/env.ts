import { config } from 'dotenv';
import { resolve } from 'path';

// The suite runs against the database in .env (reseeded before the run) and in AI mock mode.
config({ path: resolve(__dirname, '..', '.env'), quiet: true });
process.env.AI_MODE = 'mock';
// The suite signs in ~20 times; the real 10/minute limit is checked by its own test at the end.
process.env.LOGIN_RATE_LIMIT = '1000';
