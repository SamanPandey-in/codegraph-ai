import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const { pgPool, redisClient } = await import('./infrastructure/connections.js');

  try {
    const res = await pgPool.query('SELECT NOW()');
    console.log('Postgres time:', res.rows[0]);

    await redisClient.set('test', 'hello');
    const val = await redisClient.get('test');
    console.log('Redis value:', val);
  } catch (error) {
    console.error('Connection test failed:', error);
    process.exitCode = 1;
  } finally {
    await redisClient.quit();
    await pgPool.end();
  }
})();
