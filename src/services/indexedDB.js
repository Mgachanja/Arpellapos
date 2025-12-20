// src/services/indexedDb.js
// Simple IndexedDB wrapper for product metadata, barcode map and orders store
const DB_NAME = 'ArpellaProductsDB';
const DB_VERSION = 2; // bumped to include orders store
const STORE_PRODUCTS = 'products';
const STORE_BARCODES = 'barcodes'; // { code, productId }
const STORE_ORDERS = 'orders'; // { orderId, ... }

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        const pStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
        pStore.createIndex('name_lower', 'name_lower', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_BARCODES)) {
        db.createObjectStore(STORE_BARCODES, { keyPath: 'code' });
      }

      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        const oStore = db.createObjectStore(STORE_ORDERS, { keyPath: 'orderId' });
        oStore.createIndex('createdAt', 'createdAt', { unique: false });
        oStore.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------------------
   Product / Barcode functions
   ---------------------------- */

async function putProducts(products = []) {
  if (!products || !products.length) return;
  const db = await openDB();
  const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], 'readwrite');
  const pStore = tx.objectStore(STORE_PRODUCTS);
  const bStore = tx.objectStore(STORE_BARCODES);

  for (const raw of products) {
    const p = {
      ...raw,
      name_lower: (raw.name || raw.productName || '').toLowerCase()
    };
    pStore.put(p);

    // update barcode store for each barcode (if present)
    const barcodes = Array.isArray(raw.barcodes) ? raw.barcodes : (raw.barcodes ? [raw.barcodes] : []);
    for (const code of barcodes) {
      if (!code) continue;
      try { bStore.put({ code: String(code).trim(), productId: raw.id }); } catch (e) { /* ignore per-item errors */ }
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAll() {
  const db = await openDB();
  const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], 'readwrite');
  tx.objectStore(STORE_PRODUCTS).clear();
  tx.objectStore(STORE_BARCODES).clear();
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getAllProducts() {
  const db = await openDB();
  const tx = db.transaction(STORE_PRODUCTS, 'readonly');
  const store = tx.objectStore(STORE_PRODUCTS);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getProductById(id) {
  if (id === undefined || id === null) return null;
  const db = await openDB();
  const tx = db.transaction(STORE_PRODUCTS, 'readonly');
  const store = tx.objectStore(STORE_PRODUCTS);
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getProductByBarcode(code) {
  if (!code) return null;
  code = String(code).trim();
  const db = await openDB();
  const tx = db.transaction([STORE_BARCODES, STORE_PRODUCTS], 'readonly');
  const b = tx.objectStore(STORE_BARCODES);
  const pstore = tx.objectStore(STORE_PRODUCTS);
  return new Promise((resolve, reject) => {
    const req = b.get(code);
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec) return resolve(null);
      const pReq = pstore.get(rec.productId);
      pReq.onsuccess = () => resolve(pReq.result || null);
      pReq.onerror = () => reject(pReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Simple substring search across name_lower (client-side full scan).
 * For the POS expected sizes (few thousand rows) this is OK.
 * Returns up to `limit` results.
 */
async function searchByName(term, limit = 50) {
  if (!term || term.trim().length < 1) return [];
  term = term.toLowerCase().trim();
  const db = await openDB();
  const tx = db.transaction(STORE_PRODUCTS, 'readonly');
  const store = tx.objectStore(STORE_PRODUCTS);
  const results = [];
  return new Promise((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) {
        resolve(results.slice(0, limit));
        return;
      }
      const rec = cur.value;
      if (rec.name_lower && rec.name_lower.includes(term)) {
        results.push(rec);
        if (results.length >= limit) return resolve(results.slice(0, limit));
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ----------------------------
   Orders store + broadcasting
   ---------------------------- */

// broadcast helper: uses BroadcastChannel when available, fallback to localStorage event
function broadcastOrderMessage(msg) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('arpella-orders');
      bc.postMessage(msg);
      bc.close();
      return;
    }
    // fallback: localStorage hack — set a unique key so storage event fires
    const key = `arpella-orders-msg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try {
      localStorage.setItem(key, JSON.stringify(msg));
      // cleanup - schedule removal
      setTimeout(() => {
        try { localStorage.removeItem(key); } catch (e) {}
      }, 2000);
    } catch (e) {
      // ignore localStorage failures
    }
  } catch (e) {
    // no-op if both mechanisms fail
  }
}

/**
 * Persist an order into indexedDB orders store.
 * orderObj must include orderId (string/number). function normalizes timestamps and defaults.
 */
async function putOrder(orderObj) {
  if (!orderObj) throw new Error('orderObj is required');
  if (!orderObj.orderId) {
    // try to derive an orderId if not present
    orderObj.orderId = orderObj.orderId || orderObj.id || orderObj.orderNumber || `OFFLINE-${Date.now().toString().slice(-8)}`;
  }
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  const store = tx.objectStore(STORE_ORDERS);
  const now = Date.now();
  const toStore = {
    createdAt: orderObj.createdAt || now,
    updatedAt: orderObj.updatedAt || now,
    status: orderObj.status || (orderObj.paymentType === 'cash' ? (Number(orderObj.cashAmount || 0) >= Number(orderObj.cartTotal || 0) ? 'paid' : 'pending') : 'pending'),
    cartTotal: orderObj.cartTotal || computeCartTotal(orderObj.cart || []),
    ...orderObj
  };
  store.put(toStore);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      try { broadcastOrderMessage({ type: 'order-put', orderId: toStore.orderId }); } catch (e) {}
      resolve(toStore);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function updateOrder(orderId, patch = {}) {
  if (!orderId) throw new Error('orderId required');
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  const store = tx.objectStore(STORE_ORDERS);
  const getReq = store.get(orderId);
  return new Promise((resolve, reject) => {
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) return reject(new Error('order not found'));
      const updated = { ...existing, ...patch, updatedAt: Date.now() };
      store.put(updated);
      tx.oncomplete = () => {
        try { broadcastOrderMessage({ type: 'order-updated', orderId }); } catch (e) {}
        resolve(updated);
      };
      tx.onerror = () => reject(tx.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function getAllOrders({ limit = 1000, reverse = true } = {}) {
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readonly');
  const store = tx.objectStore(STORE_ORDERS);
  const index = store.index('createdAt');
  const results = [];
  return new Promise((resolve, reject) => {
    const direction = reverse ? 'prev' : 'next';
    const req = index.openCursor(null, direction);
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur || results.length >= limit) return resolve(results.slice(0, limit));
      results.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function getOrderById(orderId) {
  if (!orderId) return null;
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readonly');
  const store = tx.objectStore(STORE_ORDERS);
  return new Promise((resolve, reject) => {
    const req = store.get(orderId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOrder(orderId) {
  if (!orderId) throw new Error('orderId required');
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  const store = tx.objectStore(STORE_ORDERS);
  store.delete(orderId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      try { broadcastOrderMessage({ type: 'order-deleted', orderId }); } catch (e) {}
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function clearOrders() {
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  tx.objectStore(STORE_ORDERS).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      try { broadcastOrderMessage({ type: 'orders-cleared' }); } catch (e) {}
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/* ----------------------------
   Helpers
   ---------------------------- */

function computeCartTotal(cart = []) {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((s, it) => {
    const price = it.priceType === 'Retail' ? (Number(it.price || it.priceAfterDiscount || 0)) : (Number(it.priceAfterDiscount || it.price || 0));
    const qty = Number(it.quantity || 1);
    return s + (price * qty);
  }, 0);
}

/* ----------------------------
   Export
   ---------------------------- */

export default {
  openDB,
  // products and barcodes
  putProducts,
  getAllProducts,
  getProductById,
  getProductByBarcode,
  searchByName,
  clearAll,
  // orders
  putOrder,
  updateOrder,
  getAllOrders,
  getOrderById,
  deleteOrder,
  clearOrders,
  // utilities
  broadcastOrderMessage
};
