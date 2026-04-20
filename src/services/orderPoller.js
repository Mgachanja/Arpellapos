// Robust order poller with named + default exports
// No imports that escape src/.

let SERVER_BASE = '/api';
try {
  // resolve constants relative to src/services
  // if your constants file is elsewhere adjust the path
  // use require to avoid bundler issues during SSR
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const constants = require('../app/constants/index');
  SERVER_BASE = constants?.baseUrl || constants?.default?.baseUrl || SERVER_BASE;
} catch (e) {
  try {
    // fallback path
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const constants = require('../app/constants');
    SERVER_BASE = constants?.baseUrl || constants?.default?.baseUrl || SERVER_BASE;
  } catch (e2) {
    // keep default
  }
}

const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 100;
const STORAGE_KEY = 'arpella:lastServerOrderTs';
const NEW_FLAG_KEY = 'arpella:hasNewServerOrders';
const NEW_ORDERS_COUNT_KEY = 'arpella:newOrdersCount';

const listeners = new Set();
let lastLatestTs = Number(localStorage.getItem(STORAGE_KEY) || 0);
let hasNew = Boolean(localStorage.getItem(NEW_FLAG_KEY) === '1');
let newOrdersCount = Number(localStorage.getItem(NEW_ORDERS_COUNT_KEY) || 0);
let running = false;
let intervalId = null;

function normalizeItemsFromResp(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.orders)) return data.orders;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

async function checkOnce() {
  try {
    let page = 1;
    let foundNewOrders = [];
    let newest = lastLatestTs || 0;

    while (true) {
      const url = `${SERVER_BASE}/paged-orders?pageNumber=${page}&pageSize=${PAGE_SIZE}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = normalizeItemsFromResp(await res.json());

      if (!items || items.length === 0) break;

      for (const it of items) {
        const t = Number(it.createdAt || it.created_at || it.timestamp || it.orderDate || 0);
        if (!lastLatestTs || t > lastLatestTs) {
          foundNewOrders.push(it);
          newest = Math.max(newest, t);
        }
      }

      if (items.length < PAGE_SIZE) break;
      if (foundNewOrders.length > 0) break;
      page += 1;
    }

    if (foundNewOrders.length > 0) {
      lastLatestTs = newest;
      newOrdersCount = foundNewOrders.length;
      try { localStorage.setItem(STORAGE_KEY, String(lastLatestTs)); } catch (e) {}
      try { localStorage.setItem(NEW_ORDERS_COUNT_KEY, String(newOrdersCount)); } catch (e) {}
      setNewFlag(true);
      notifyListeners({
        type: 'new',
        latest: lastLatestTs,
        count: newOrdersCount,
        orders: foundNewOrders,
      });
    }

    return { foundNew: foundNewOrders.length > 0, latest: lastLatestTs, count: foundNewOrders.length };
  } catch (err) {
    console.error('Order poller error:', err);
    notifyListeners({ type: 'error', error: err });
    return { foundNew: false, error: err };
  }
}

function notifyListeners(payload) {
  for (const l of listeners) {
    try { l(payload); } catch (e) { console.error('Listener error:', e); }
  }
}

function setNewFlag(v) {
  hasNew = !!v;
  if (hasNew) {
    try { localStorage.setItem(NEW_FLAG_KEY, '1'); } catch (e) {}
  } else {
    try { localStorage.removeItem(NEW_FLAG_KEY); } catch (e) {}
    try { localStorage.removeItem(NEW_ORDERS_COUNT_KEY); } catch (e) {}
    newOrdersCount = 0;
  }
}

// named exports
const subscribe = (listener) => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  try { listener({ type: 'state', hasNew, latest: lastLatestTs, count: newOrdersCount }); } catch (e) { console.error('Subscribe listener error:', e); }
  return () => { listeners.delete(listener); };
};

const getState = () => ({ hasNew, latest: lastLatestTs, running, count: newOrdersCount });

const checkNow = async () => checkOnce();

const clearNewFlag = () => { setNewFlag(false); notifyListeners({ type: 'cleared' }); };

const start = () => {
  if (running) return;
  running = true;
  setTimeout(() => { checkOnce().catch(() => {}); }, 2000);
  intervalId = setInterval(() => { checkOnce().catch(() => {}); }, POLL_INTERVAL_MS);
};

const stop = () => {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  running = false;
};

// auto-start
start();

// exports
export {
  subscribe,
  getState,
  checkNow,
  clearNewFlag,
  start,
  stop,
};

export default {
  subscribe,
  getState,
  checkNow,
  clearNewFlag,
  start,
  stop,
};