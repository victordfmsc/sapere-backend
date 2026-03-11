const { Queue } = require('bullmq');
const { Redis } = require('ioredis');

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

connection.on('error', (err) => {
  console.error('[Redis] Connection Error:', err.message);
});

connection.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

const generateQueue = new Queue('generate', { connection });

module.exports = { generateQueue, connection };
