// src/services/indexedDB.js
// Revised: products store no longer uses top-level stockPrice as source-of-truth.
// Inventories are stored in a dedicated store. Profit calculation uses latest inventory record.

const DB_NAME = 'ArpellaProductsDB';
const DB_VERSION = 5; // bump to ensure indices
const STORE_PRODUCTS = 'products';
const STORE_BARCODES = 'barcodes';
const STORE_ORDERS = 'orders';
const STORE_INVENTORIES = 'inventories';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const tx = ev.target.transaction;

      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        const pStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
        pStore.createIndex('name_lower', 'name_lower', { unique: false });
        pStore.createIndex('inventoryId', 'inventoryId', { unique: false });
      } else {
        // ensure indexes
        try { const pStore = tx.objectStore(STORE_PRODUCTS); if (!pStore.indexNames.contains('inventoryId')) pStore.createIndex('inventoryId', 'inventoryId', { unique: false }); } catch (e) { }
        try { const pStore = tx.objectStore(STORE_PRODUCTS); if (!pStore.indexNames.contains('name_lower')) pStore.createIndex('name_lower', 'name_lower', { unique: false }); } catch (e) { }
      }

      if (!db.objectStoreNames.contains(STORE_BARCODES)) {
        db.createObjectStore(STORE_BARCODES, { keyPath: 'code' });
      }

      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        const oStore = db.createObjectStore(STORE_ORDERS, { keyPath: 'orderId' });
        oStore.createIndex('createdAt', 'createdAt', { unique: false });
        oStore.createIndex('status', 'status', { unique: false });
      }

      // new inventories store: keyPath inventoryId (or fallback to generated id)
      if (!db.objectStoreNames.contains(STORE_INVENTORIES)) {
        const invStore = db.createObjectStore(STORE_INVENTORIES, { keyPath: 'inventoryId' });
        invStore.createIndex('productId', 'productId', { unique: false });
        invStore.createIndex('createdAt', 'createdAt', { unique: false });
      } else {
        // ensure indexes exist for inventories
        try {
          const invStore = tx.objectStore(STORE_INVENTORIES);
          if (!invStore.indexNames.contains('productId')) invStore.createIndex('productId', 'productId', { unique: false });
          if (!invStore.indexNames.contains('createdAt')) invStore.createIndex('createdAt', 'createdAt', { unique: false });
        } catch (e) { console.error("Error creating inventory indexes", e); }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function looksLikeInteger(v) {
  if (v === undefined || v === null) return false;
  return /^[0-9]+$/.test(String(v));
}

function normalizeId(obj) {
  if (!obj) return null;
  // prefer numeric id when present so numeric primary ids remain numeric
  if (obj.id !== undefined && obj.id !== null && looksLikeInteger(obj.id)) return Number(obj.id);
  if (obj.productId !== undefined && obj.productId !== null && looksLikeInteger(obj.productId)) return Number(obj.productId);
  // otherwise prefer productId/inventoryId or id (string)
  return obj.productId ?? obj.inventoryId ?? obj.id ?? obj.productID ?? obj.product_id ?? null;
}

function toNumber(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ----------------------------
   Products / Barcodes
   ---------------------------- */

async function putProducts(products = []) {
  if (!Array.isArray(products) || products.length === 0) return;
  const db = await openDB();
  const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], 'readwrite');
  const pStore = tx.objectStore(STORE_PRODUCTS);
  const bStore = tx.objectStore(STORE_BARCODES);

  for (const raw of products) {
    const id = normalizeId(raw);
    if (!id) continue;

    const inventoryId = raw.inventoryId ?? raw.inventory_id ?? raw.inventory ?? null;

    const product = {
      ...raw,
      id,
      inventoryId: inventoryId ?? undefined,
      name: raw.name ?? raw.productName ?? raw.title ?? null,
      name_lower: (raw.name ?? raw.productName ?? raw.title ?? '').toString().toLowerCase(),
      price: raw.price !== undefined ? toNumber(raw.price) : (raw.salePrice !== undefined ? toNumber(raw.salePrice) : undefined),
      priceAfterDiscount: raw.priceAfterDiscount !== undefined ? toNumber(raw.priceAfterDiscount) : undefined,
      // NOTE: do NOT write authoritative stockPrice here anymore — inventories store is source-of-truth
      updatedAt: raw.updatedAt ?? raw.updated_at ?? Date.now()
    };

    try {
      // attempt to merge with existing if inventoryId collides
      if (product.inventoryId) {
        try {
          const idx = pStore.index('inventoryId');
          const existing = await new Promise((res) => {
            const r = idx.get(String(product.inventoryId));
            r.onsuccess = () => res(r.result || null);
            r.onerror = () => res(null);
          });
          if (existing) {
            const merged = { ...existing, ...product };
            // Preserve numeric existing.id if it's numeric
            if (looksLikeInteger(existing.id) && !looksLikeInteger(merged.id)) merged.id = existing.id;
            pStore.put(merged);
          } else {
            pStore.put(product);
          }
        } catch (e) {
          pStore.put(product);
        }
      } else {
        pStore.put(product);
      }
    } catch (e) {
      try { pStore.put(product); } catch (err) { }
    }

    const barcodes = Array.isArray(raw.barcodes) ? raw.barcodes : (raw.barcodes ? [raw.barcodes] : []);
    if (raw.barcode) barcodes.push(raw.barcode);
    for (const code of barcodes) {
      if (!code) continue;
      try { bStore.put({ code: String(code).trim(), productId: id }); } catch (e) { }
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAll() {
  const db = await openDB();
  const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES, STORE_INVENTORIES], 'readwrite');
  tx.objectStore(STORE_PRODUCTS).clear();
  tx.objectStore(STORE_BARCODES).clear();
  tx.objectStore(STORE_INVENTORIES).clear();
  return new Promise((res, rej) => {
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

async function getAllProducts() {
  const db = await openDB();
  const tx = db.transaction(STORE_PRODUCTS, 'readonly');
  const store = tx.objectStore(STORE_PRODUCTS);
  return reqToPromise(store.getAll());
}

async function getProductById(id) {
  if (id === undefined || id === null) return null;
  const db = await openDB();
  const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], 'readonly');
  const store = tx.objectStore(STORE_PRODUCTS);

  try {
    const direct = await reqToPromise(store.get(id));
    if (direct) return direct;
  } catch (e) { }

  try {
    const directS = await reqToPromise(store.get(String(id)));
    if (directS) return directS;
  } catch (e) { }

  try {
    const invIdx = store.index('inventoryId');
    const found = await reqToPromise(invIdx.get(String(id)));
    if (found) return found;
  } catch (e) { }

  // barcode mapping
  try {
    const bStore = tx.objectStore(STORE_BARCODES);
    const bRec = await reqToPromise(bStore.get(String(id)));
    if (bRec && bRec.productId !== undefined && bRec.productId !== null) {
      const p = await reqToPromise(store.get(bRec.productId));
      if (p) return p;
    }
  } catch (e) { }

  try {
    const nameIdx = store.index('name_lower');
    const maybe = await reqToPromise(nameIdx.get(String(id).toLowerCase()));
    if (maybe) return maybe;
  } catch (e) { }

  // fallback cursor scan: small scan to find a match
  try {
    const maybe = await new Promise((resolve) => {
      const r = store.openCursor();
      r.onsuccess = (ev) => {
        const cur = ev.target.result;
        if (!cur) return resolve(null);
        const rec = cur.value;
        const k = String(id).toLowerCase();
        if ((rec.inventoryId && String(rec.inventoryId).toLowerCase() === k)
          || (rec.id && String(rec.id).toLowerCase() === k)
          || (rec.name_lower && rec.name_lower.includes(k))) {
          return resolve(rec);
        }
        cur.continue();
      };
      r.onerror = () => resolve(null);
    });
    if (maybe) return maybe;
  } catch (e) { }

  return null;
}

async function getProductByBarcode(code) {
  if (!code) return null;
  const db = await openDB();
  const tx = db.transaction([STORE_BARCODES, STORE_PRODUCTS], 'readonly');
  const b = tx.objectStore(STORE_BARCODES);
  const pstore = tx.objectStore(STORE_PRODUCTS);
  return new Promise((resolve, reject) => {
    const req = b.get(String(code).trim());
    req.onsuccess = async () => {
      const rec = req.result;
      if (!rec) return resolve(null);
      const pReq = pstore.get(rec.productId);
      pReq.onsuccess = () => resolve(pReq.result || null);
      pReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * Simple substring search across name_lower (client-side scan).
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
   Inventories store (new)
   ---------------------------- */

async function putInventories(inventories = []) {
  if (!Array.isArray(inventories) || inventories.length === 0) return;
  const db = await openDB();
  const tx = db.transaction([STORE_INVENTORIES, STORE_PRODUCTS], 'readwrite');
  const invStore = tx.objectStore(STORE_INVENTORIES);
  const pStore = tx.objectStore(STORE_PRODUCTS);

  for (const raw of inventories) {
    // canonicalize inventoryId: prefer inventoryId field, otherwise productId-based key
    const invId = raw.inventoryId ?? raw.inventory_id ?? (raw.inventoryId === undefined ? null : raw.inventoryId) ?? String(raw.inventoryId ?? Date.now() + Math.random().toString(36).slice(2, 8));
    const record = {
      ...raw,
      inventoryId: invId,
      productId: raw.productId ?? raw.product_id ?? null,
      stockQuantity: toNumber(raw.stockQuantity ?? raw.stockQuantity ?? raw.quantity ?? 0),
      stockThreshold: toNumber(raw.stockThreshold ?? 0),
      stockPrice: toNumber(raw.stockPrice ?? raw.price ?? 0),
      createdAt: raw.createdAt ?? raw.created_at ?? Date.now(),
      updatedAt: raw.updatedAt ?? raw.updated_at ?? Date.now(),
      supplierId: raw.supplierId ?? raw.supplier_id ?? null,
      invoiceNumber: raw.invoiceNumber ?? raw.invoice_number ?? null,
      raw: raw
    };

    invStore.put(record);

    // Optionally attach a lightweight pointer into product record (not authoritative)
    if (record.productId) {
      try {
        const existing = await reqToPromise(pStore.get(record.productId)).catch(() => null);
        if (existing) {
          const hist = Array.isArray(existing.inventoryHistory) ? existing.inventoryHistory.slice() : [];
          const snapshot = {
            inventoryId: record.inventoryId,
            stockPrice: record.stockPrice,
            stockQuantity: record.stockQuantity,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
          };
          // dedupe recent
          const last = hist[0];
          if (!(last && last.inventoryId === snapshot.inventoryId && last.createdAt === snapshot.createdAt)) {
            hist.unshift(snapshot);
            if (hist.length > 50) hist.length = 50;
            existing.inventoryHistory = hist;
            // do NOT overwrite product-level stockPrice; inventories are source-of-truth
            pStore.put(existing);
          }
        }
      } catch (e) { }
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllInventories({ limit = 1000, reverse = true } = {}) {
  const db = await openDB();
  const tx = db.transaction([STORE_INVENTORIES], 'readonly');
  const store = tx.objectStore(STORE_INVENTORIES);
  const index = store.index('createdAt');
  const direction = reverse ? 'prev' : 'next';
  const results = [];
  return new Promise((resolve, reject) => {
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

async function getInventoriesByProductId(productId, { limit = 50, reverse = true } = {}) {
  if (!productId) return [];
  const db = await openDB();
  const tx = db.transaction([STORE_INVENTORIES], 'readonly');
  const store = tx.objectStore(STORE_INVENTORIES);
  const idx = store.index('productId');
  const direction = reverse ? 'prev' : 'next';
  const results = [];
  return new Promise((resolve, reject) => {
    const req = idx.openCursor(IDBKeyRange.only(productId), direction);
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur || results.length >= limit) return resolve(results.slice(0, limit));
      results.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function getLatestInventoryForProduct(productId) {
  const list = await getInventoriesByProductId(productId, { limit: 1, reverse: true }).catch(() => []);
  return Array.isArray(list) && list.length ? list[0] : null;
}

/* ----------------------------
   Orders + helpers
   ---------------------------- */

function broadcastOrderMessage(msg) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('arpella-orders');
      bc.postMessage(msg);
      bc.close();
      return;
    }
    const key = `arpella-orders-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      localStorage.setItem(key, JSON.stringify(msg));
      setTimeout(() => { try { localStorage.removeItem(key); } catch (e) { } }, 2000);
    } catch (e) { }
  } catch (e) { }
}

async function putOrder(orderObj) {
  if (!orderObj) throw new Error('orderObj is required');
  if (!orderObj.orderId) {
    orderObj.orderId = orderObj.orderId ?? orderObj.id ?? orderObj.orderNumber ?? `OFFLINE-${Date.now().toString().slice(-8)}`;
  }
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  const store = tx.objectStore(STORE_ORDERS);
  const now = Date.now();
  const toStore = {
    createdAt: orderObj.createdAt ?? now,
    updatedAt: orderObj.updatedAt ?? now,
    status: orderObj.status ?? (orderObj.paymentType === 'cash' ? (Number(orderObj.cashAmount ?? 0) >= Number(orderObj.cartTotal ?? 0) ? 'paid' : 'pending') : 'pending'),
    cartTotal: orderObj.cartTotal ?? computeCartTotal(orderObj.cart ?? []),
    ...orderObj
  };
  store.put(toStore);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { try { broadcastOrderMessage({ type: 'order-put', orderId: toStore.orderId }); } catch (e) { }; resolve(toStore); };
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
      tx.oncomplete = () => { try { broadcastOrderMessage({ type: 'order-updated', orderId }); } catch (e) { }; resolve(updated); };
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
  return reqToPromise(store.get(orderId)).catch(() => null);
}

async function deleteOrder(orderId) {
  if (!orderId) throw new Error('orderId required');
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  const store = tx.objectStore(STORE_ORDERS);
  store.delete(orderId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { try { broadcastOrderMessage({ type: 'order-deleted', orderId }); } catch (e) { }; resolve(true); };
    tx.onerror = () => reject(tx.error);
  });
}

async function clearOrders() {
  const db = await openDB();
  const tx = db.transaction([STORE_ORDERS], 'readwrite');
  tx.objectStore(STORE_ORDERS).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { try { broadcastOrderMessage({ type: 'orders-cleared' }); } catch (e) { }; resolve(true); };
    tx.onerror = () => reject(tx.error);
  });
}

/* ----------------------------
   Helpers
   ---------------------------- */

function computeCartTotal(cart = []) {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((s, it) => {
    const price = it.priceType === 'Retail'
      ? (Number(it.price ?? 0))
      : (Number(it.wholesalePrice) || Number(it.priceAfterDiscount) || Number(it.price ?? 0));
    const qty = Number(it.quantity ?? it.qty ?? 1);
    return s + (price * qty);
  }, 0);
}

/**
 * Calculate profit for an order using inventories store as source-of-truth for cost.
 * tries item.productId / item.inventoryId / item.id / barcodes / name
 */
async function calculateOrderProfit(order = {}) {
  const items = order.items ?? order.cart ?? [];
  if (!Array.isArray(items) || items.length === 0) return 0;
  let profit = 0;
  for (const it of items) {
    const candidates = [it.productId, it.product_id, it.id, it._id, it.inventoryId, it.inventory_id].filter(Boolean);
    let inv = null;
    for (const c of candidates) {
      // try to find inventory by productId or inventoryId
      inv = await getLatestInventoryForProduct(c).catch(() => null);
      if (inv) break;
      // try by inventory id
      try {
        const db = await openDB();
        const tx = db.transaction([STORE_INVENTORIES], 'readonly');
        const store = tx.objectStore(STORE_INVENTORIES);
        const maybe = await reqToPromise(store.get(String(c))).catch(() => null);
        if (maybe) { inv = maybe; break; }
      } catch (e) { }
    }

    // barcode fallback
    if (!inv && (it.barcode || it.barcodes)) {
      const b = Array.isArray(it.barcodes) ? it.barcodes[0] : it.barcode || it.barcodes;
      if (b) {
        const prod = await getProductByBarcode(b).catch(() => null);
        if (prod) inv = await getLatestInventoryForProduct(prod.id).catch(() => null);
      }
    }

    // name fallback
    if (!inv) {
      const name = it.name || it.product?.name || it.productName || '';
      if (name) {
        const matches = await searchByName(name, 1).catch(() => []);
        if (Array.isArray(matches) && matches.length) {
          inv = await getLatestInventoryForProduct(matches[0].id).catch(() => null);
        }
      }
    }

    const cost = toNumber(inv?.stockPrice ?? 0, 0);
    
    const pType = String(it.priceType || 'Retail').toLowerCase();
    const isWholesale = pType.includes('wholesale') || pType.includes('discount');

    let salePrice = 0;
    if (toNumber(it.sellingPrice) > 0) {
      salePrice = toNumber(it.sellingPrice);
    } else if (isWholesale) {
      salePrice = toNumber(it.wholesalePrice) || toNumber(it.priceAfterDiscount) || toNumber(it.price);
    } else {
      salePrice = toNumber(it.salePrice ?? it.price ?? it.unitPrice ?? 0, 0);
    }

    const qty = toNumber(it.quantity ?? it.qty ?? 1, 1);
    profit += (salePrice - cost) * qty;
  }
  return profit;
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
  // inventories
  putInventories,
  getAllInventories,
  getInventoriesByProductId,
  getLatestInventoryForProduct,
  // orders
  putOrder,
  updateOrder,
  getAllOrders,
  getOrderById,
  deleteOrder,
  clearOrders,
  // utilities
  broadcastOrderMessage,
  // profit helper
  calculateOrderProfit
};