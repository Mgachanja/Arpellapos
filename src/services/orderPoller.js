// src/services/orderPoller.js
// Singleton poller that continuously checks server paged orders for new items.
// - Runs automatically when imported.
// - Exposes subscribe(listener) / unsubscribe(handle) / getState() / checkNow() / clearNewFlag()

import axios from 'axios';

// Try to import constants from common locations
let SERVER_BASE = '/api';
try {
  // Adjust this path based on where your constants file is located
  const constants = require('../constants');
  SERVER_BASE = constants?.baseUrl || constants?.default?.baseUrl || '/api';
} catch (e) {
  try {
    const constants = require('../app/constants');
    SERVER_BASE = constants?.baseUrl || constants?.default?.baseUrl || '/api';
  } catch (e2) {
    console.warn('Could not load constants, using default API path');
  }
}

const POLL_INTERVAL_MS = 60_000; // 1 minute
const PAGE_SIZE = 100; // Fetch 100 items per page
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

    // Iterate through all pages until we get less than PAGE_SIZE items
    while (true) {
      const url = `${SERVER_BASE}/paged-orders?pageNumber=${page}&pageSize=${PAGE_SIZE}`;
      const res = await axios.get(url);
      const items = normalizeItemsFromResp(res.data);

      if (!items || items.length === 0) break;

      // Check each item for new orders
      for (const it of items) {
        const t = Number(it.createdAt || it.created_at || it.timestamp || it.orderDate || 0);
        if (!lastLatestTs || t > lastLatestTs) {
          foundNewOrders.push(it);
          newest = Math.max(newest, t);
        }
      }

      // If we got less than PAGE_SIZE items, this is the last page
      if (items.length < PAGE_SIZE) break;
      
      // If we already found new orders, no need to continue
      if (foundNewOrders.length > 0) break;
      
      page += 1;
    }

    if (foundNewOrders.length > 0) {
      lastLatestTs = newest;
      newOrdersCount = foundNewOrders.length;
      localStorage.setItem(STORAGE_KEY, String(lastLatestTs));
      localStorage.setItem(NEW_ORDERS_COUNT_KEY, String(newOrdersCount));
      setNewFlag(true);
      notifyListeners({ 
        type: 'new', 
        latest: lastLatestTs, 
        count: newOrdersCount,
        orders: foundNewOrders 
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
    localStorage.setItem(NEW_FLAG_KEY, '1');
  } else {
    localStorage.removeItem(NEW_FLAG_KEY);
    localStorage.removeItem(NEW_ORDERS_COUNT_KEY);
    newOrdersCount = 0;
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  // immediate notify of current state
  try { 
    listener({ type: 'state', hasNew, latest: lastLatestTs, count: newOrdersCount }); 
  } catch (e) {
    console.error('Subscribe listener error:', e);
  }
  return () => { listeners.delete(listener); };
}

export function getState() {
  return { hasNew, latest: lastLatestTs, running, count: newOrdersCount };
}

export async function checkNow() {
  return checkOnce();
}

export function clearNewFlag() {
  setNewFlag(false);
  notifyListeners({ type: 'cleared' });
}

function start() {
  if (running) return;
  running = true;
  // attempt initial check after 2 seconds (non-blocking)
  setTimeout(() => { checkOnce().catch(() => {}); }, 2000);
  intervalId = setInterval(() => {
    checkOnce().catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  running = false;
}

// Start automatically on import
start();

// Expose for debugging
export default {
  subscribe,
  getState,
  checkNow,
  clearNewFlag,
  start,
  stop
};