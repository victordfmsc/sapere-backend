const admin = require('firebase-admin');
const { getDb } = require('./firebase');
const { sanitizeError } = require('./env');
const revenuecat = require('./revenuecat');

// Créditos: RevenueCat Virtual Currency con reserva heredada en users.credits.
// Todos los endpoints exigen un ID token de Firebase; el uid sale del token.

const REFUND_WINDOW_MS = 15 * 60 * 1000;
const SPENDS = 'creditSpends';

async function requireUser(req, res, next) {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ ok: false, error: 'missing_token' });
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.uid = decoded.uid;
    next();
  } catch (error) {
    console.warn('[API] credits: invalid token:', sanitizeError(error));
    res.status(401).json({ ok: false, error: 'invalid_token' });
  }
}

function toCredits(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

async function legacyCredits(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? toCredits(snap.data().credits) : 0;
}

async function legacyAdjust(db, uid, delta) {
  const docRef = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return null;
    const current = toCredits(snap.data().credits);
    const next = current + delta;
    if (next < 0) return null;
    tx.update(docRef, { credits: next });
    return next;
  });
}

function registerCreditRoutes(app) {
  app.get('/v1/api/credits/balance', requireUser, async (req, res) => {
    try {
      const db = getDb();
      const [rc, legacy] = await Promise.all([
        revenuecat.isEnabled() ? revenuecat.getBalance(req.uid) : Promise.resolve(0),
        legacyCredits(db, req.uid),
      ]);
      res.json({ revenuecat: rc, legacy, total: rc + legacy, revenuecatEnabled: revenuecat.isEnabled() });
    } catch (error) {
      console.error('[API] Error reading credits:', sanitizeError(error));
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  app.post('/v1/api/credits/spend', requireUser, async (req, res) => {
    const uid = req.uid;
    try {
      const db = getDb();
      let source = null;
      let balance = 0;

      if (revenuecat.isEnabled()) {
        const current = await revenuecat.getBalance(uid);
        if (current >= 1) {
          await revenuecat.adjustBalance(uid, -1);
          source = 'revenuecat';
          balance = current - 1;
        }
      }

      if (!source) {
        const next = await legacyAdjust(db, uid, -1);
        if (next !== null) {
          source = 'legacy';
          balance = next;
        }
      }

      if (!source) {
        return res.status(402).json({ ok: false, error: 'insufficient_credits', balance: 0 });
      }

      const spendRef = await db.collection(SPENDS).add({
        uid,
        source,
        refunded: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[API] credit spent (${source}) for ${uid}: balance ${balance}, spend ${spendRef.id}`);
      res.json({ ok: true, source, balance, spendId: spendRef.id });
    } catch (error) {
      console.error('[API] Error spending credit:', sanitizeError(error));
      res.status(500).json({ ok: false, error: sanitizeError(error) });
    }
  });

  // Devuelve el crédito de un gasto reciente cuando la creación falló después de gastarlo.
  app.post('/v1/api/credits/refund', requireUser, async (req, res) => {
    const uid = req.uid;
    const { spendId } = req.body || {};
    if (!spendId || typeof spendId !== 'string') {
      return res.status(400).json({ ok: false, error: 'spendId required' });
    }
    try {
      const db = getDb();
      const spendRef = db.collection(SPENDS).doc(spendId);
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(spendRef);
        if (!snap.exists) return { status: 404, error: 'not_found' };
        const data = snap.data();
        if (data.uid !== uid) return { status: 403, error: 'forbidden' };
        if (data.refunded) return { status: 409, error: 'already_refunded' };
        const createdAt = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
        if (Date.now() - createdAt > REFUND_WINDOW_MS) return { status: 409, error: 'refund_window_expired' };
        tx.update(spendRef, { refunded: true, refundedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { source: data.source };
      });
      if (outcome.error) return res.status(outcome.status).json({ ok: false, error: outcome.error });

      let balance;
      try {
        if (outcome.source === 'revenuecat') {
          await revenuecat.adjustBalance(uid, 1);
          balance = await revenuecat.getBalance(uid);
        } else {
          balance = await legacyAdjust(db, uid, 1);
          if (balance === null) throw new Error('user document missing');
        }
      } catch (error) {
        await spendRef.update({ refunded: false, refundedAt: null }).catch(() => {});
        throw error;
      }
      console.log(`[API] credit refunded (${outcome.source}) for ${uid}: balance ${balance}, spend ${spendId}`);
      res.json({ ok: true, source: outcome.source, balance });
    } catch (error) {
      console.error('[API] Error refunding credit:', sanitizeError(error));
      res.status(500).json({ ok: false, error: sanitizeError(error) });
    }
  });
}

module.exports = { registerCreditRoutes };
