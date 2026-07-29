/**
 * Jest global setup.
 *
 * Runs before the test framework is installed (`setupFiles`), so it is the place
 * for environment defaults that modules read at import time — several modules
 * under `src/constants/` capture `process.env` values into consts on first load.
 */

process.env.ROCK_API_URL ??= 'https://rock.test.invalid/api';
process.env.NEXT_PUBLIC_ROCK_API_URL ??= 'https://rock.test.invalid/api';
process.env.ROCK_API_KEY ??= 'test-rock-api-key';

// Keep Redis-backed caches inert: no REDIS_URL means the client short-circuits.
process.env.REDIS_URL ??= '';
process.env.REDIS_KEY_PREFIX ??= 'runsheet:test:';
