const fetch = require('node-fetch');
const { getEnv } = require('./env');

// Cliente mínimo de la API v2 de RevenueCat para la moneda virtual (créditos).
// Necesita REVENUECAT_SECRET_KEY (secret key con Customer Purchases Configuration
// y Customer Configuration en lectura/escritura) y REVENUECAT_PROJECT_ID.
const BASE = 'https://api.revenuecat.com/v2';

function config() {
  return {
    key: getEnv('REVENUECAT_SECRET_KEY'),
    project: getEnv('REVENUECAT_PROJECT_ID'),
    currency: getEnv('REVENUECAT_CURRENCY') || 'CRD',
  };
}

function isEnabled() {
  const c = config();
  return Boolean(c.key && c.project);
}

async function request(path, options = {}) {
  const { key, project } = config();
  const response = await fetch(`${BASE}/projects/${project}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    const err = new Error(`RevenueCat API ${response.status}: ${String(data.message || data.raw || response.statusText).slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

function extractBalance(data, code) {
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const itemCode = (item.currency && item.currency.code) || item.code || item.currency_code;
    if (itemCode === code) return Number(item.balance || 0);
  }
  if (data.code === code && data.balance !== undefined) return Number(data.balance || 0);
  return 0;
}

async function getBalance(customerId) {
  const { currency } = config();
  try {
    const data = await request(`/customers/${encodeURIComponent(customerId)}/virtual_currencies`);
    return extractBalance(data, currency);
  } catch (err) {
    if (err.status === 404) return 0; // cliente aún no existe en RevenueCat
    throw err;
  }
}

async function adjustBalance(customerId, delta) {
  const { currency } = config();
  return request(`/customers/${encodeURIComponent(customerId)}/virtual_currencies/transactions`, {
    method: 'POST',
    body: JSON.stringify({ adjustments: { [currency]: delta } }),
  });
}

module.exports = { isEnabled, getBalance, adjustBalance, extractBalance };
