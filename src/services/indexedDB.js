// src/services/indexedDb.js
// Simple IndexedDB wrapper for product metadata and barcode map
const DB_NAME = 'ArpellaProductsDB';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products';
const STORE_BARCODES = 'barcodes'; // { code, productId }

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putProducts(products = []) {
  if (!products || !products.length) return;
  const db = await openDB();
  const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], 'readwrite');
  const pStore = tx.objectStore(STORE_PRODUCTS);
  const bStore = tx.objectStore(STORE_BARCODES);

  for (const raw of products) {
    const p = {
      ...raw,
      name_lower: (raw.name || '').toLowerCase()
    };
    pStore.put(p);

    // update barcode store for each barcode (if present)
    const barcodes = Array.isArray(raw.barcodes) ? raw.barcodes : (raw.barcodes ? [raw.barcodes] : []);
    for (const code of barcodes) {
      if (!code) continue;
      bStore.put({ code: String(code).trim(), productId: raw.id });
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
    req.onsuccess = async () => {
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
        if (results.length >= limit) return resolve(results);
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export default {
  openDB,
  putProducts,
  getAllProducts,
  getProductById,
  getProductByBarcode,
  searchByName,
  clearAll
};
