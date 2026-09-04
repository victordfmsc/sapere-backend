const { sanitizeError } = require('./env');

// Marca como 'error' los documentales que llevan demasiado tiempo sin llegar a 'completed'
// (worker caído, job perdido, redeploy a mitad de proceso).
const IN_PROGRESS = ['pending', 'started', 'generating_title', 'generating_script', 'generating_media'];
const STALE_MINUTES = Number(process.env.GENERATION_TIMEOUT_MINUTES) || 30;
const SWEEP_EVERY_MS = 5 * 60 * 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

async function sweepStale(db) {
  const limit = Date.now() - STALE_MINUTES * 60 * 1000;
  const snap = await db.collection('sapere').where('status', 'in', IN_PROGRESS).get();
  let marked = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if ((data.bukbukUrl || '').trim()) continue;
    const last = Math.max(toMillis(data.updatedAt), toMillis(data.publishTime));
    if (last === 0 || last > limit) continue;
    await doc.ref.update({
      status: 'error',
      errorMessage: `Processing did not finish within ${STALE_MINUTES} minutes (last status: ${data.status})`,
      updatedAt: new Date(),
    });
    marked++;
    console.log(`[Watchdog] ${doc.id} marked as error (stuck in ${data.status})`);
  }
  return marked;
}

function startWatchdog(getDb) {
  const run = async () => {
    try {
      const marked = await sweepStale(getDb());
      if (marked) console.log(`[Watchdog] sweep done: ${marked} document(s) marked as error`);
    } catch (error) {
      console.error('[Watchdog] sweep failed:', sanitizeError(error));
    }
  };
  setTimeout(run, 30 * 1000);
  setInterval(run, SWEEP_EVERY_MS);
  console.log(`[Watchdog] started: timeout ${STALE_MINUTES} min, sweep every ${SWEEP_EVERY_MS / 60000} min`);
}

module.exports = { startWatchdog, sweepStale, IN_PROGRESS };
