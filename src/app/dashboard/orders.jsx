// src/app/dashboard/SalesDashboard.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { useDispatch } from 'react-redux';
import { rtkApi } from '../../services/rtkApi';
import indexedDb from '../../services/indexedDB'; // same helper used in POS

/* ================= Helpers ================= */
const toLocalYMD = (ts) => {
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatTime = (ts) =>
  new Date(Number(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatKsh = (v) => {
  const n = num(v);
  return `${n < 0 ? '-' : ''}Ksh ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ================= IndexedDB helpers (based on your inspector) ================= */
const DB_NAME = 'ArpellaProductsDB';
const PRODUCTS_STORE = 'products';
const INVENTORIES_STORE = 'inventories';
const ORDERS_STORE = 'orders';

function openDB(name) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function readAll(db, store) {
  return new Promise((res, rej) => {
    try {
      if (!db.objectStoreNames.contains(store)) return res([]);
      const tx = db.transaction(store, 'readonly');
      const st = tx.objectStore(store);
      const rq = st.getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
    } catch (e) {
      res([]);
    }
  });
}

/* ================= Normalizers ================= */
const normalizeOrder = (o) => {
  const createdAt = num(o.createdAt ?? o.updatedAt ?? Date.now());
  const items = Array.isArray(o.cart)
    ? o.cart
    : Array.isArray(o.orderitems)
      ? o.orderitems
      : Array.isArray(o.orderItems)
        ? o.orderItems
        : [];

  const cartTotal =
    num(o.cartTotal ?? o.total ??
      items.reduce((s, it) => s + num(it.price ?? it.unitPrice ?? it.salePrice) * num(it.quantity ?? it.qty ?? 1), 0));

  return {
    raw: o,
    id: o.orderId ?? o._id ?? o.id ?? String(createdAt),
    createdAt,
    date: toLocalYMD(createdAt),
    time: formatTime(createdAt),
    items,
    cartTotal,
    paymentType: String(o.paymentType ?? o.payment ?? 'cash').toLowerCase(),
  };
};

/* ================= Component ================= */
export default function SalesDashboard() {
  const dispatch = useDispatch();
  const today = toLocalYMD(Date.now());

  const [date, setDate] = useState(today);
  const [orders, setOrders] = useState([]);
  const [inventoryCostMap, setInventoryCostMap] = useState({ costMap: new Map(), productInventoryKey: new Map() });
  const [startingCapital, setStartingCapital] = useState(0);
  const [capitalInput, setCapitalInput] = useState('');
  const [rowsLimit, setRowsLimit] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [loading, setLoading] = useState(true);

  const rowsOptions = ['all', 20, 50, 100, 200];

  // auto refresh interval (ms)
  const AUTO_REFRESH_MS = 30000; // 30s
  const refreshTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  /* ================= UTIL: build cost map ================= */
  const buildCostMapFromInventories = (inventories = []) => {
    const costMap = new Map();
    (inventories || []).forEach(inv => {
      if (!inv) return;
      // robust timestamp parse
      const ts = new Date(inv.updatedAt ?? inv.createdAt ?? inv.created_at ?? 0).getTime() || 0;
      const stockPrice = num(inv.stockPrice ?? inv.unitCost ?? inv.cost ?? inv.purchasePrice ?? 0);

      const keyCandidates = [inv.productId, inv.inventoryId, inv.product_id, inv.inventory_id, inv.id]
        .filter(Boolean)
        .map(String);

      if (keyCandidates.length === 0 && inv.productId) keyCandidates.push(String(inv.productId));

      keyCandidates.forEach(key => {
        const cur = costMap.get(key);
        if (!cur || ts > cur.ts) {
          costMap.set(key, { stockPrice, ts });
        }
      });
    });
    return costMap;
  };

  /* ================= LOAD LOCAL + REMOTE INVENTORIES & ORDERS ================= */
  useEffect(() => {
    isMountedRef.current = true;

    const fetchAndMerge = async () => {
      try {
        setLoading(true);

        // open local DB and read stores
        const db = await openDB(DB_NAME).catch(() => null);
        let productsRaw = [];
        let inventoriesRaw = [];
        let ordersRaw = [];

        if (db) {
          [productsRaw, inventoriesRaw, ordersRaw] = await Promise.all([
            readAll(db, PRODUCTS_STORE).catch(() => []),
            readAll(db, INVENTORIES_STORE).catch(() => []),
            readAll(db, ORDERS_STORE).catch(() => []),
          ]);
        } else {
          // fallback to any indexedDb helpers (like service)
          try {
            productsRaw = (indexedDb.getAllProducts && (await indexedDb.getAllProducts())) || [];
            // attempt to read inventories via indexedDb if provided
            inventoriesRaw = (indexedDb.getAllInventories && (await indexedDb.getAllInventories())) || inventoriesRaw;
            ordersRaw = (indexedDb.getAllOrders && (await indexedDb.getAllOrders())) || ordersRaw;
          } catch (e) {
            // ignore
          }
        }

        // Build productInventoryKey: inventoryId -> productId (as in your original)
        // Also build nameMap: name -> productId (for fallback)
        const productInventoryKey = new Map();
        const nameMap = new Map();
        (productsRaw || []).forEach(p => {
          if (p.inventoryId && p.productId) {
            productInventoryKey.set(String(p.inventoryId), String(p.productId));
          }
          const name = (p.name || p.productName || p.title || '').trim().toLowerCase();
          const pId = String(p.productId || p.id || '');
          if (name && pId) {
            nameMap.set(name, pId);
          }
        });

        // fetch remote paged inventories using rtkApi
        let remoteInventories = [];
        try {
          const resp = await dispatch(rtkApi.endpoints.getPagedInventories.initiate({ pageNumber: 1, pageSize: 2000 })).unwrap();
          // rtk query returns unwrapped data directly
          const payload = resp?.data ?? resp;
          remoteInventories = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : []);
        } catch (e) {
          // network/CORS/endpoint errors -> continue with local only
          remoteInventories = [];
        }

        // Merge: remote first (so remote entries will be used when newer)
        const mergedInventories = (remoteInventories || []).concat(inventoriesRaw || []);

        // Build costMap using merged inventories (remote wins due to timestamp handling)
        const costMap = buildCostMapFromInventories(mergedInventories);

        // If indexedDb service supports writing inventories back, persist remote items (optional)
        try {
          if (typeof indexedDb.putInventories === 'function' && remoteInventories && remoteInventories.length) {
            // attempt to persist in bulk if service exposes it
            await indexedDb.putInventories(remoteInventories);
          } else if (typeof indexedDb.putInventory === 'function' && remoteInventories && remoteInventories.length) {
            // fallback: put individually
            for (const inv of remoteInventories) {
              try { await indexedDb.putInventory(inv); } catch (e) { /* ignore per-item failure */ }
            }
          }
        } catch (e) {
          // ignore persistence errors (non-fatal)
        }

        if (!isMountedRef.current) return;
        setInventoryCostMap({ costMap, productInventoryKey, nameMap });

        // normalize orders to expected shape
        const normalized = (ordersRaw || []).map(normalizeOrder).sort((a, b) => b.createdAt - a.createdAt);
        setOrders(normalized);

        const saved = num(localStorage.getItem(`capital:${today}`));
        setStartingCapital(saved);
        setCapitalInput(saved ? String(saved) : '');

        console.debug('[SalesDashboard] Loaded (local + remote):', {
          products: productsRaw.length,
          localInventories: (inventoriesRaw || []).length,
          remoteInventories: (remoteInventories || []).length,
          orders: (ordersRaw || []).length,
          productInventoryKeys: productInventoryKey.size,
          costKeys: costMap.size,
        });
      } catch (e) {
        console.error('[SalesDashboard] load failed', e);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    };

    // initial fetch
    fetchAndMerge();

    // set up auto-refresh interval that refetches remote inventories and rebuilds cost map
    refreshTimerRef.current = setInterval(async () => {
      try {
        // only fetch remote page (we keep local indexes intact)
        const resp = await dispatch(rtkApi.endpoints.getPagedInventories.initiate({ pageNumber: 1, pageSize: 2000 }, { forceRefetch: true })).unwrap().catch(() => null);
        const payload = resp?.data ?? resp ?? null;
        const remote = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
        if (!remote || remote.length === 0) return;

        // merge remote with current indexed cost map keys (we don't re-read orders/products here)
        // For correct merging we should read local inventories once; but to avoid blocking we combine remote + what's in current costMap
        setInventoryCostMap(prev => {
          // Reconstruct an inventory-like array from prev.costMap entries is not straightforward;
          // instead we'll combine remote with local inventories previously loaded into indexedDb (quick read)
          (async () => {
            try {
              const db = await openDB(DB_NAME).catch(() => null);
              let localInventories = [];
              if (db) localInventories = await readAll(db, INVENTORIES_STORE).catch(() => []);
              else localInventories = (indexedDb.getAllInventories && (await indexedDb.getAllInventories())) || [];

              const merged = (remote || []).concat(localInventories || []);
              const newCostMap = buildCostMapFromInventories(merged);
              // persist remote if possible
              try {
                if (typeof indexedDb.putInventories === 'function' && remote && remote.length) {
                  await indexedDb.putInventories(remote);
                } else if (typeof indexedDb.putInventory === 'function' && remote && remote.length) {
                  for (const inv of remote) {
                    try { await indexedDb.putInventory(inv); } catch (e) { }
                  }
                }
              } catch (e) { }
              // productInventoryKey preserved from prev
              if (isMountedRef.current) setInventoryCostMap({ costMap: newCostMap, productInventoryKey: prev.productInventoryKey || new Map() });
            } catch (e) {
              // swallow
            }
          })();
          // return prev for now (the async inner will update state)
          return prev;
        });

      } catch (e) {
        // ignore auto-refresh errors
        console.debug('[SalesDashboard] auto-refresh error', e?.message || e);
      }
    }, AUTO_REFRESH_MS);

    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  useEffect(() => {
    const saved = num(localStorage.getItem(`capital:${date}`));
    setStartingCapital(saved);
    setCapitalInput(saved ? String(saved) : '');
  }, [date]);

  /* ================= PROFIT CALC ================= */
  const getUnitCost = (item) => {
    // 1. Try direct ID lookup with multiple field names
    const invId = String(item.inventoryId ?? item.inventory_id ?? item.productId ?? item.product_id ?? item.id ?? '');

    if (invId) {
      // Try productInventoryKey mapping first
      const productKey = inventoryCostMap.productInventoryKey?.get(invId);
      if (productKey) {
        const entry = inventoryCostMap.costMap?.get(productKey);
        if (entry) return num(entry.stockPrice);
      }

      // Try direct lookup
      const entry = inventoryCostMap.costMap?.get(invId);
      if (entry) return num(entry.stockPrice);
    }

    // 2. Fallback: Name lookup if no entry found
    const name = (item.name ?? item.title ?? item.productName ?? '').trim().toLowerCase();
    if (name) {
      const fallbackId = inventoryCostMap.nameMap?.get(name);
      if (fallbackId) {
        const entry = inventoryCostMap.costMap?.get(fallbackId);
        if (entry) return num(entry.stockPrice);
      }
    }

    // 3. Last resort: check if item has embedded cost fields
    return num(item.stockPrice ?? item.unitCost ?? item.cost ?? item.purchasePrice ?? 0);
  };

  const calculateOrderProfit = (order) =>
    (order.items || []).reduce((sum, it) => {
      const pType = String(it.priceType || 'Retail').toLowerCase();
      const isWholesale = pType.includes('wholesale') || pType.includes('discount');

      let sell = 0;
      if (num(it.sellingPrice) > 0) {
        sell = num(it.sellingPrice);
      } else if (isWholesale) {
        // If wholesale/discounted, prefer explicit discounted price
        sell = num(it.priceAfterDiscount) || num(it.price);
      } else {
        // Default to retail price
        sell = num(it.price);
      }

      const cost = getUnitCost(it);
      const qty = num(it.quantity ?? it.qty ?? 1);
      return sum + (sell - cost) * qty;
    }, 0);

  const dayOrders = useMemo(() => orders.filter(o => o.date === date), [orders, date]);

  const displayedOrders = useMemo(() => {
    if (rowsLimit === 'all') return dayOrders;
    return dayOrders.slice(0, Number(rowsLimit));
  }, [dayOrders, rowsLimit]);

  const totals = useMemo(() => {
    const acc = {
      revenue: 0,
      cogs: 0,
      cash: 0,
      mpesa: 0,
      capital: startingCapital,
      retailRevenue: 0,
      wholesaleRevenue: 0
    };

    dayOrders.forEach(o => {
      // Revenue & Type Split
      let orderRetail = 0;
      let orderWholesale = 0;

      (o.items || []).forEach(it => {
        const pType = String(it.priceType || '').toLowerCase();
        const isWholesale = pType.includes('wholesale') || pType.includes('discount');
        
        let itSell = 0;
        if (num(it.sellingPrice) > 0) {
          itSell = num(it.sellingPrice);
        } else if (isWholesale) {
          itSell = num(it.priceAfterDiscount) || num(it.price);
        } else {
          itSell = num(it.price);
        }
        
        const lineTotal = itSell * (num(it.quantity) || 1);
        
        if (pType === 'retail') {
          orderRetail += lineTotal;
        } else {
          // Assume non-retail (Discounted/Wholesale) is wholesale
          orderWholesale += lineTotal;
        }

        // Cost aggregation
        acc.cogs += getUnitCost(it) * num(it.quantity ?? it.qty ?? 1);
      });

      acc.retailRevenue += orderRetail;
      acc.wholesaleRevenue += orderWholesale;
      acc.revenue += num(o.cartTotal);

      // Payment Split
      const pt = String(o.paymentType || 'cash').toLowerCase();
      if (pt.includes('mpesa')) acc.mpesa += num(o.cartTotal);
      else if (pt.includes('hybrid')) {
        const pd = o.raw?.paymentData ?? o.raw?.orderData?.paymentData ?? {};
        acc.cash += num(pd.cashAmount ?? pd.cash ?? 0);
        acc.mpesa += num(pd.mpesaAmount ?? pd.mpesa ?? 0);
      } else acc.cash += num(o.cartTotal);
    });

    const profit = acc.revenue - acc.cogs;
    const margin = acc.revenue > 0 ? (profit / acc.revenue) * 100 : 0;

    return {
      ...acc,
      profit,
      margin,
      netAfterCapital: profit - startingCapital
    };
  }, [dayOrders, inventoryCostMap, startingCapital]);

  const saveCapital = () => {
    const n = num(capitalInput);
    localStorage.setItem(`capital:${date}`, String(n));
    setStartingCapital(n);
  };

  const prevDate = () => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    setDate(toLocalYMD(d));
  };

  const nextDate = () => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    setDate(toLocalYMD(d));
  };

  const goToday = () => setDate(toLocalYMD(Date.now()));

  const loadMore = () => {
    if (rowsLimit === 'all') return;
    const n = Number(rowsLimit) || 0;
    const next = n + Math.max(20, n || 20);
    if (next >= dayOrders.length) setRowsLimit('all');
    else setRowsLimit(next);
  };

  const openOrderModal = (order) => {
    setSelectedOrder(order);
    setShowModal(true);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setShowModal(false);
  };

  const handleDeleteOrder = (orderId) => {
    setOrderToDelete(orderId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;
    try {
      await indexedDb.deleteOrder(orderToDelete);
      setOrders(prev => prev.filter(o => o.id !== orderToDelete));
      toast.success('Transaction deleted');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete');
    } finally {
      setShowDeleteModal(false);
      setOrderToDelete(null);
    }
  };

  /* ================= RENDER ================= */
  return (
    <div className="sales-dashboard-root" aria-live="polite">
      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="title-block">
            <div className="icon-wrap">
              <TrendingUp className="icon" />
            </div>
            <div>
              <h1 className="title">Sales Management</h1>
              <p className="subtitle">Real-time profit tracking and transaction analytics</p>
            </div>
          </div>
        </header>

        {/* Controls */}
        <section className="controls">
          <div className="controls-left">
            <button className="nav-btn" onClick={prevDate} aria-label="Previous day">
              <ChevronLeft className="nav-icon" />
            </button>

            <div className="date-input">
              <Calendar className="calendar-icon" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="date-field"
                aria-label="Select date"
              />
            </div>

            <button className="nav-btn" onClick={nextDate} aria-label="Next day">
              <ChevronRight className="nav-icon" />
            </button>

            <button className="btn primary" onClick={goToday} aria-label="Go to today">Today</button>
          </div>

          <div className="controls-right">
            <div className="capital-box">
              <DollarSign className="capital-icon" />
              <input
                value={capitalInput}
                onChange={(e) => setCapitalInput(e.target.value)}
                placeholder="Starting capital"
                className="capital-input"
                aria-label="Starting capital"
              />
              <button className="btn success" onClick={saveCapital} aria-label="Save capital">Save</button>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="metrics-grid" role="region" aria-label="Key metrics">
          <article className="metric-card">
            <div className="metric-head">
              <div className="metric-icon bg-blue"><ShoppingCart /></div>
              <span className="metric-label">Revenue</span>
            </div>
            <div className="metric-value">{formatKsh(totals.revenue)}</div>
            <div className="metric-note">Total sales for {date}</div>
          </article>

          <article className="metric-card">
            <div className="metric-head">
              <div className="metric-icon bg-red"><DollarSign /></div>
              <span className="metric-label">COGS</span>
            </div>
            <div className="metric-value">{formatKsh(totals.cogs)}</div>
            <div className="metric-note">Cost of goods sold</div>
          </article>

          <article className="metric-card">
            <div className="metric-head">
              <div className="metric-icon bg-green"><TrendingUp /></div>
              <span className="metric-label">Profit</span>
            </div>
            <div className="metric-value">{formatKsh(totals.profit)}</div>
            <div className="metric-note">Margin: {totals.margin.toFixed(1)}%</div>
          </article>

          <article className="metric-card">
            <div className="metric-head">
              <div className="metric-icon bg-indigo"><DollarSign /></div>
              <span className="metric-label">Net Profit</span>
            </div>
            <div className="metric-value">{formatKsh(totals.netAfterCapital)}</div>
            <div className="metric-note">After capital ({formatKsh(totals.capital)})</div>
          </article>
        </section>

        {/* Breakdown Metrics */}
        <section className="metrics-grid" style={{ marginTop: '16px' }} role="region" aria-label="Sales breakdown">
          <article className="metric-card">
            <div className="metric-head">
              <div className="metric-icon bg-indigo"><DollarSign /></div>
              <span className="metric-label">Retail Sales</span>
            </div>
            <div className="metric-value">{formatKsh(totals.retailRevenue)}</div>
            <div className="metric-note">Total retail revenue</div>
          </article>

          <article className="metric-card">
            <div className="metric-head">
              <div className="metric-icon bg-orange"><DollarSign /></div>
              <span className="metric-label">Wholesale Sales</span>
            </div>
            <div className="metric-value">{formatKsh(totals.wholesaleRevenue)}</div>
            <div className="metric-note">Total wholesale revenue</div>
          </article>
        </section>

        {/* Payment breakdown */}
        <section className="payment-breakdown">
          <div className="payment-card cash">
            <div className="payment-title">Cash Payments</div>
            <div className="payment-amount">{formatKsh(totals.cash)}</div>
          </div>
          <div className="payment-card mpesa">
            <div className="payment-title">M-Pesa Payments</div>
            <div className="payment-amount">{formatKsh(totals.mpesa)}</div>
          </div>
        </section>

        {/* Transactions table */}
        <section className="transactions">
          <div className="transactions-header">
            <div>
              <h2 className="transactions-title">Transactions</h2>
              <p className="transactions-sub">Showing {displayedOrders.length} of {dayOrders.length} transactions</p>
            </div>

            <div className="transactions-controls">
              <select
                value={rowsLimit}
                onChange={(e) => setRowsLimit(e.target.value)}
                className="rows-select"
                aria-label="Rows to display"
              >
                {rowsOptions.map((o) => (
                  <option key={String(o)} value={o}>
                    {o === 'all' ? 'All rows' : `${o} rows`}
                  </option>
                ))}
              </select>

              {rowsLimit !== 'all' && displayedOrders.length < dayOrders.length && (
                <button className="btn primary" onClick={loadMore}>Load More</button>
              )}
            </div>
          </div>

          <div className="transactions-body">
            {loading ? (
              <div className="empty-state">
                <div className="spinner" role="status" aria-hidden="true" />
                <p>Loading transactions...</p>
              </div>
            ) : displayedOrders.length === 0 ? (
              <div className="empty-state">
                <AlertCircle className="empty-icon" />
                <p>No transactions found for this date</p>
              </div>
            ) : (
              <div className="table-wrap" role="table" aria-label="Transactions table">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Order ID</th>
                      <th>Type</th>
                      <th>Payment</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Profit</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedOrders.map((o) => {
                      const orderProfit = calculateOrderProfit(o);
                      const paymentType = String(o.paymentType).toLowerCase();

                      return (
                        <tr key={o.id} onClick={() => openOrderModal(o)} className="table-row">
                          <td className="mono">{o.time}</td>
                          <td className="mono id-cell">{String(o.id).slice(0, 12)}</td>
                          <td>
                            {(() => {
                              const types = (o.items || []).map(i => String(i.priceType || 'Retail').toLowerCase());
                              const hasRetail = types.includes('retail');
                              const hasWholesale = types.some(t => t.includes('wholesale') || t.includes('discount'));

                              if (hasRetail && hasWholesale) return <span className="badge warning">Mixed</span>;
                              if (hasWholesale) return <span className="badge orange">Wholesale</span>;
                              return <span className="badge dark-brown">Retail</span>;
                            })()}
                          </td>
                          <td>
                            {paymentType.includes('mpesa') ? (
                              <span className="badge mpesa">M-Pesa</span>
                            ) : paymentType.includes('hybrid') ? (
                              <span className="badge hybrid">Hybrid</span>
                            ) : (
                              <span className="badge cash">Cash</span>
                            )}
                          </td>
                          <td className="text-right bold">{formatKsh(o.cartTotal)}</td>
                          <td className="text-right bold profit">{formatKsh(orderProfit)}</td>
                          <td className="text-center actions-cell">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openOrderModal(o);
                              }}
                              className="icon-btn view-btn"
                              title="View details"
                              aria-label={`View order ${o.id}`}
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOrder(o.id);
                              }}
                              className="icon-btn delete-btn"
                              title="Delete transaction"
                              aria-label={`Delete order ${o.id}`}
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Order Modal */}
      {showModal && selectedOrder && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Order Details</h3>
                <p className="meta">Order #{selectedOrder.id} • {selectedOrder.date} {selectedOrder.time}</p>
              </div>
              <button className="icon-btn close" onClick={closeModal} aria-label="Close">
                <X />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-table-wrap">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th className="text-right">Price</th>
                      <th className="text-center">Qty</th>
                      <th className="text-right">Cost</th>
                      <th className="text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((it, idx) => {
                      const pType = String(it.priceType || 'Retail').toLowerCase();
                      const isWholesale = pType.includes('wholesale') || pType.includes('discount');

                      let sell = 0;
                      if (num(it.sellingPrice) > 0) {
                        sell = num(it.sellingPrice);
                      } else if (isWholesale) {
                        sell = num(it.priceAfterDiscount) || num(it.price);
                      } else {
                        sell = num(it.price ?? it.unitPrice ?? it.salePrice);
                      }

                      const qty = num(it.quantity ?? it.qty ?? 1);
                      const cost = getUnitCost(it);
                      const profit = (sell - cost) * qty;
                      return (
                        <tr key={idx}>
                          <td className="item-name">{it.name ?? it.title ?? 'Item'}</td>
                          <td>
                            <span className={`badge small ${String(it.priceType || 'Retail').toLowerCase() === 'retail' ? 'dark-brown' : 'orange'}`}>
                              {it.priceType || 'Retail'}
                            </span>
                          </td>
                          <td className="text-right">{formatKsh(sell)}</td>
                          <td className="text-center">{qty}</td>
                          <td className="text-right">{formatKsh(cost)}</td>
                          <td className={`text-right ${profit >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatKsh(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" className="text-bold">Total Order Profit</td>
                      <td className="text-right text-bold profit-total">{formatKsh(calculateOrderProfit(selectedOrder))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="order-summary">
                <div className="summary-card">
                  <div className="summary-label">Order Total</div>
                  <div className="summary-value">{formatKsh(selectedOrder.cartTotal)}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">Payment Type</div>
                  <div className="summary-value capitalize">{selectedOrder.paymentType}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">Items Count</div>
                  <div className="summary-value">{selectedOrder.items.length}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-panel delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header delete-header">
              <div className="d-flex align-items-center gap-3">
                <div className="alert-icon-wrap">
                  <AlertCircle size={24} color="#dc2626" />
                </div>
                <div>
                  <h3 className="m-0">Delete Transaction</h3>
                  <p className="meta m-0">This action cannot be undone</p>
                </div>
              </div>
              <button className="icon-btn close" onClick={() => setShowDeleteModal(false)}>
                <X />
              </button>
            </div>
            <div className="modal-body text-center py-4">
              <p className="fs-5 mb-4">Are you sure you want to permanently delete transaction <br /><strong>#{orderToDelete}</strong>?</p>
              <div className="d-flex justify-content-center gap-3 mt-4">
                <button className="btn outline" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                <button className="btn danger" onClick={confirmDelete}>Delete Permanently</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        :root{
          --card-bg: #ffffff;
          --muted: #64748b;
          --radius: 14px;
          --shadow: 0 6px 24px rgba(15,23,42,0.06);
        }
        .sales-dashboard-root { background: linear-gradient(180deg,#f8fafc 0%, #eef2ff 100%); min-height:100vh; padding:28px 16px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; color: #0f172a; }
        .container { max-width: 1200px; margin: 0 auto; }

        /* Header */
        .header { margin-bottom: 18px; }
        .title-block { display:flex; align-items:center; gap:16px; }
        .icon-wrap { background: linear-gradient(135deg,#2563eb,#7c3aed); padding:10px; border-radius:12px; display:flex; align-items:center; justify-content:center; box-shadow: var(--shadow); }
        .icon { width:20px; height:20px; color:white; }
        .title { font-size:1.7rem; margin:0; letter-spacing:-0.02em; }
        .subtitle { margin:4px 0 0; color:var(--muted); font-size:0.95rem; }

        /* Controls */
        .controls { display:flex; justify-content:space-between; gap:12px; margin-bottom:18px; align-items:center; }
        .controls-left { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .nav-btn { background:transparent; border:1px solid #e6eef8; padding:8px; border-radius:10px; cursor:pointer; transition:all .12s; }
        .nav-btn:hover { transform:translateY(-1px); box-shadow: 0 4px 12px rgba(2,6,23,0.06); }
        .nav-icon { width:18px; height:18px; color:#1f2937; }
        .date-input { display:flex; align-items:center; gap:8px; background:#fff; padding:8px 12px; border-radius:12px; border:1px solid #e6eef8; }
        .calendar-icon { width:16px; height:16px; color:var(--muted); }
        .date-field { border:none; background:transparent; outline:none; font-weight:600; color:#0f172a; }

        .btn { padding:8px 12px; border-radius:10px; border:none; cursor:pointer; font-weight:600; transition:background .12s; }
        .btn.primary { background:#0ea5e9; color:white; }
        .btn.primary:hover { background:#0284c7; }
        .btn.success { background:#10b981; color:white; }
        .btn.success:hover { background:#059669; }

        .controls-right { display:flex; align-items:center; gap:12px; }
        .capital-box { display:flex; align-items:center; gap:10px; background:#fff; border-radius:12px; padding:8px 12px; border:1px solid #e6eef8; }
        .capital-icon { width:16px; height:16px; color:var(--muted); }
        .capital-input { border:none; outline:none; background:transparent; width:140px; font-weight:700; color:#0f172a; }

        /* Metrics */
        .metrics-grid { display:grid; grid-template-columns:repeat(1,1fr); gap:16px; margin-bottom:20px; }
        @media(min-width:720px){ .metrics-grid { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:1024px){ .metrics-grid { grid-template-columns:repeat(4,1fr); } }

        .metric-card { background:var(--card-bg); border-radius:var(--radius); padding:18px; box-shadow:var(--shadow); border:1px solid #eef2ff; transition:transform .12s, box-shadow .12s; }
        .metric-card:hover { transform:translateY(-6px); box-shadow: 0 12px 36px rgba(15,23,42,0.09); }
        .metric-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .metric-icon { width:38px; height:38px; display:flex; align-items:center; justify-content:center; border-radius:10px; color:white; }
        .metric-icon.bg-blue { background:rgba(99,102,241,0.12); color:#2563eb; padding:8px; }
        .metric-icon.bg-red { background:rgba(254,226,226,0.12); color:#dc2626; padding:8px; }
        .metric-icon.bg-green { background:rgba(220,252,231,0.12); color:#16a34a; padding:8px; }
        .metric-icon.bg-indigo { background:rgba(224,231,255,0.12); color:#4f46e5; padding:8px; }
        .metric-label { font-size:0.75rem; color:var(--muted); font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
        .metric-value { font-size:1.6rem; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .metric-note { color:var(--muted); font-size:0.9rem; }

        /* Payment cards */
        .payment-breakdown { display:grid; grid-template-columns:repeat(1,1fr); gap:12px; margin-bottom:20px; }
        @media(min-width:720px){ .payment-breakdown { grid-template-columns:repeat(2,1fr); } }
        .payment-card { border-radius:12px; padding:14px; color:white; box-shadow:var(--shadow); display:flex; flex-direction:column; gap:6px; }
        .payment-card.cash { background: linear-gradient(90deg,#10b981,#059669); }
        .payment-card.mpesa { background: linear-gradient(90deg,#2563eb,#7c3aed); }
        .payment-title { font-weight:700; font-size:0.85rem; opacity:0.95; }
        .payment-amount { font-size:1.6rem; font-weight:800; }

        /* Transactions */
        .transactions { margin-top:10px; border-radius:12px; overflow:hidden; box-shadow:var(--shadow); background:var(--card-bg); border:1px solid #eef2ff; }
        .transactions-header { display:flex; justify-content:space-between; align-items:center; padding:18px; border-bottom:1px solid #f1f5f9; gap:12px; }
        .transactions-title { margin:0; font-size:1.1rem; }
        .transactions-sub { margin:4px 0 0; color:var(--muted); font-size:0.9rem; }
        .transactions-controls { display:flex; gap:8px; align-items:center; }
        .rows-select { padding:8px 12px; border-radius:10px; border:1px solid #e6eef8; background:#fff; font-weight:600; }
        .transactions-body { padding:0; }

        .table-wrap { overflow:auto; max-height:420px; }
        .transactions-table { width:100%; border-collapse:collapse; min-width:820px; }
        .transactions-table thead th { text-align:left; padding:12px 16px; font-size:0.75rem; color:var(--muted); font-weight:700; letter-spacing:0.06em; text-transform:uppercase; border-bottom:1px solid #f1f5f9; }
        .transactions-table tbody td { padding:12px 16px; vertical-align:middle; }
        .table-row { cursor:pointer; transition:background .12s; }
        .table-row:hover { background:#fbfdff; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace; font-size:0.95rem; color:#0f172a; }
        .id-cell { color:#475569; }
        .badge { display:inline-block; padding:6px 10px; border-radius:999px; font-size:0.75rem; font-weight:700; }
        .badge.cash { background:#ecfdf5; color:#065f46; }
        .badge.mpesa { background:#e6f0ff; color:#1e40af; }
        .badge.hybrid { background:#fff7ed; color:#92400e; }
        .badge.warning { background:#fef3c7; color:#d97706; }
        .badge.info { background:#e0f2fe; color:#0284c7; }
        .badge.orange { background:#fff7ed; color:#ea580c; border: 1px solid #ffedd5; }
        .badge.dark-brown { background:#efebe9; color:#5d4037; border: 1px solid #d7ccc8; }
        .badge.small { font-size: 0.75rem; padding: 2px 6px; }
        .text-right { text-align:right; }
        .text-center { text-align:center; }
        .bold { font-weight:700; }
        .profit { color:#059669; }
        .icon-btn { background:transparent; border:1px solid transparent; padding:6px; border-radius:8px; cursor:pointer; transition:all .12s; display:inline-flex; align-items:center; justify-content:center; }
        .icon-btn:hover { background:#f1f5f9; transform:translateY(-1px); }
        .view-btn { color:#64748b; }
        .view-btn:hover { color:#2563eb; background:#eff6ff; }
        .delete-btn { color:#94a3b8; }
        .delete-btn:hover { color:#dc2626; background:#fef2f2; }
        .actions-cell { display:flex; gap:8px; justify-content:center; }

        /* Empty states */
        .empty-state { padding:36px; text-align:center; color:var(--muted); }
        .empty-icon { width:48px; height:48px; color:#cbd5e1; margin-bottom:8px; display:block; margin-left:auto; margin-right:auto; }
        .spinner { display:inline-block; width:40px; height:40px; border-radius:999px; border:4px solid rgba(2,6,23,0.08); border-top-color:#0ea5e9; animation:spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        /* Modal */
        .modal-backdrop { position:fixed; inset:0; background:rgba(2,6,23,0.5); display:flex; align-items:center; justify-content:center; padding:20px; z-index:50; }
        .modal-panel { width:100%; max-width:980px; border-radius:14px; background:#fff; box-shadow:0 20px 60px rgba(2,6,23,0.4); max-height:90vh; overflow:hidden; display:flex; flex-direction:column; }
        .modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px; border-bottom:1px solid #f1f5f9; background:linear-gradient(90deg,#fbfdff,#f1f8ff); }
        .modal-header h3 { margin:0; }
        .meta { margin:4px 0 0; color:var(--muted); font-size:0.9rem; }
        .modal-body { padding:18px; overflow:auto; }
        .modal-table-wrap { width:100%; overflow:auto; margin-bottom:18px; }
        .details-table { width:100%; border-collapse:collapse; }
        .details-table thead th { text-align:left; padding:10px 12px; font-size:0.8rem; color:var(--muted); border-bottom:1px solid #f1f5f9; }
        .details-table tbody td { padding:10px 12px; vertical-align:middle; }
        .details-table tfoot td { padding:12px; border-top:2px solid #eef2ff; font-weight:800; }
        .item-name { font-weight:600; color:#0f172a; }

        .order-summary { display:grid; grid-template-columns:repeat(1,1fr); gap:12px; margin-top:10px; }
        @media(min-width:720px){ .order-summary { grid-template-columns:repeat(3,1fr); } }
        .summary-card { background:#fbfdff; padding:14px; border-radius:10px; border:1px solid #f1f5f9; }
        .summary-label { font-size:0.75rem; color:var(--muted); margin-bottom:6px; font-weight:700; text-transform:uppercase; }
        .summary-value { font-size:1.1rem; font-weight:800; color:#0f172a; }

        /* small helpers */
        .text-bold { font-weight:800; }
        .capitalize { text-transform:capitalize; }
        .profit-positive { color:#059669; }
        .profit-negative { color:#dc2626; }
        .profit-total { color:#059669; font-weight:900; }

        .delete-modal { max-width: 480px; }
        .delete-header { background: #fff; border-bottom: 1px solid #f1f5f9; }
        .alert-icon-wrap { background: #fef2f2; padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .btn.outline { background: transparent; border: 1px solid #e2e8f0; color: #64748b; }
        .btn.outline:hover { background: #f8fafc; border-color: #cbd5e1; }
        .btn.danger { background: #dc2626; color: white; }
        .btn.danger:hover { background: #b91c1c; }
      `}</style>
    </div>
  );
}
