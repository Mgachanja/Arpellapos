import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle
} from 'lucide-react';

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
  const today = toLocalYMD(Date.now());

  const [date, setDate] = useState(today);
  const [orders, setOrders] = useState([]);
  const [inventoryCostMap, setInventoryCostMap] = useState({ costMap: new Map(), productInventoryKey: new Map() });
  const [startingCapital, setStartingCapital] = useState(0);
  const [capitalInput, setCapitalInput] = useState('');
  const [rowsLimit, setRowsLimit] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const rowsOptions = ['all', 20, 50, 100, 200];

  /* ================= LOAD DATA FROM INDEXEDDB ================= */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const db = await openDB(DB_NAME).catch(() => null);
        if (!alive) return;

        let productsRaw = [];
        let inventoriesRaw = [];
        let ordersRaw = [];

        if (db) {
          [productsRaw, inventoriesRaw, ordersRaw] = await Promise.all([
            readAll(db, PRODUCTS_STORE).catch(() => []),
            readAll(db, INVENTORIES_STORE).catch(() => []),
            readAll(db, ORDERS_STORE).catch(() => []),
          ]);
        }

        // Build product map: inventoryId -> productId
        const productInventoryKey = new Map();
        (productsRaw || []).forEach(p => {
          if (p.inventoryId && p.productId) {
            productInventoryKey.set(String(p.inventoryId), String(p.productId));
          }
        });

        // Build a robust cost map: key -> { stockPrice, ts }
        // We'll index inventories by several candidate keys so lookups are tolerant of schema differences.
        const costMap = new Map();
        (inventoriesRaw || []).forEach(inv => {
          const ts = new Date(inv.updatedAt ?? inv.createdAt ?? 0).getTime();
          const stockPrice = num(inv.stockPrice ?? inv.unitCost ?? inv.cost);

          const keyCandidates = [inv.productId, inv.inventoryId, inv.product_id, inv.inventory_id]
            .filter(Boolean)
            .map(String);

          // if no key candidates, try to use productId-like fields
          if (keyCandidates.length === 0 && inv.productId) keyCandidates.push(String(inv.productId));

          keyCandidates.forEach(key => {
            const cur = costMap.get(key);
            if (!cur || ts > cur.ts) {
              costMap.set(key, { stockPrice, ts });
            }
          });
        });

        setInventoryCostMap({ costMap, productInventoryKey });

        const normalized = (ordersRaw || []).map(normalizeOrder).sort((a, b) => b.createdAt - a.createdAt);
        setOrders(normalized);

        const saved = num(localStorage.getItem(`capital:${today}`));
        setStartingCapital(saved);
        setCapitalInput(saved ? String(saved) : '');

        console.debug('[SalesDashboard] Loaded from IndexedDB:', {
          products: productsRaw.length,
          inventories: inventoriesRaw.length,
          orders: ordersRaw.length,
          productInventoryKeys: productInventoryKey.size,
          costKeys: costMap.size,
        });
      } catch (e) {
        console.error('Failed to load data from IndexedDB', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const saved = num(localStorage.getItem(`capital:${date}`));
    setStartingCapital(saved);
    setCapitalInput(saved ? String(saved) : '');
  }, [date]);

  /* ================= PROFIT CALC ================= */
  const getUnitCost = (item) => {
    const invId = String(item.inventoryId ?? item.inventory_id ?? item.productId ?? '');
    // try to resolve productId from productInventoryKey map
    const productKey = inventoryCostMap.productInventoryKey?.get(invId) || invId;
    const entry = inventoryCostMap.costMap?.get(productKey) || inventoryCostMap.costMap?.get(invId);
    return num(entry?.stockPrice);
  };

  const calculateOrderProfit = (order) =>
    order.items.reduce((sum, it) => {
      const sell = num(it.price ?? it.unitPrice ?? it.salePrice);
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
    let revenue = 0, cogs = 0, cash = 0, mpesa = 0;

    dayOrders.forEach(o => {
      revenue += num(o.cartTotal);
      o.items.forEach(it => {
        cogs += getUnitCost(it) * num(it.quantity ?? it.qty ?? 1);
      });

      const pt = String(o.paymentType || 'cash').toLowerCase();
      if (pt.includes('mpesa')) mpesa += num(o.cartTotal);
      else if (pt.includes('hybrid')) {
        const pd = o.raw?.paymentData ?? o.raw?.orderData?.paymentData ?? {};
        cash += num(pd.cashAmount ?? pd.cash ?? 0);
        mpesa += num(pd.mpesaAmount ?? pd.mpesa ?? 0);
      } else cash += num(o.cartTotal);
    });

    const profit = revenue - cogs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      revenue,
      cogs,
      profit,
      margin,
      netAfterCapital: profit - startingCapital,
      cash,
      mpesa,
      capital: startingCapital
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
                          <td className="text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openOrderModal(o);
                              }}
                              className="icon-btn"
                              aria-label={`View order ${o.id}`}
                            >
                              <Eye />
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
                      <th className="text-right">Price</th>
                      <th className="text-center">Qty</th>
                      <th className="text-right">Cost</th>
                      <th className="text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((it, idx) => {
                      const sell = num(it.price ?? it.unitPrice ?? it.salePrice);
                      const qty = num(it.quantity ?? it.qty ?? 1);
                      const cost = getUnitCost(it);
                      const profit = (sell - cost) * qty;
                      return (
                        <tr key={idx}>
                          <td className="item-name">{it.name ?? it.title ?? 'Item'}</td>
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
        .text-right { text-align:right; }
        .text-center { text-align:center; }
        .bold { font-weight:700; }
        .profit { color:#059669; }
        .icon-btn { background:transparent; border:1px solid transparent; padding:6px; border-radius:8px; cursor:pointer; transition:background .12s; }
        .icon-btn:hover { background:#f8fafc; }

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
      `}</style>
    </div>
  );
}
