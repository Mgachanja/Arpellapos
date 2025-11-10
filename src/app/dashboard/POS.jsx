// src/screens/Index.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUndoAlt } from '@fortawesome/free-solid-svg-icons';

import {
  fetchAndIndexAllProducts,
  addItemToCart,
  updateCartItemQuantity,
  removeItemFromCart,
  clearCart,
  selectCart,
  selectCartItemCount,
  selectProductsLoading,
} from '../../redux/slices/productSlice';

import indexedDb from '../../services/indexedDB';
import {
  validateAndAddToCart,
  validateCartQuantityChange
} from '../../services/cartService';

import api from '../../services/api';
import { selectUser } from '../../redux/slices/userSlice';
import { printOrderReceipt } from '../thermalPrinter/thermalPrinter';

const CTA = { background: '#FF7F50', color: '#fff' };
const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), wait);
  }, [fn, wait]);
}

/* Product card */
function ProductCard({ product, cartItems, onQuantityChange }) {
  const productId = product.id || product._id;
  const retailPrice = product.price || 0;
  const wholesalePrice = product.priceAfterDiscount || product.price || 0;

  const retailCartItem = cartItems.find(item =>
    (item.id || item._id) === productId && item.priceType === 'Retail'
  );
  const wholesaleCartItem = cartItems.find(item =>
    (item.id || item._id) === productId && item.priceType === 'Discounted'
  );

  const retailQuantity = retailCartItem ? retailCartItem.quantity : 0;
  const wholesaleQuantity = wholesaleCartItem ? wholesaleCartItem.quantity : 0;

  const [retailInput, setRetailInput] = useState(retailQuantity.toString() || '');
  const [wholesaleInput, setWholesaleInput] = useState(wholesaleQuantity.toString() || '');

  useEffect(() => setRetailInput(String(retailQuantity || '')), [retailQuantity]);
  useEffect(() => setWholesaleInput(String(wholesaleQuantity || '')), [wholesaleQuantity]);

  const applyRetail = () => {
    const v = parseInt(retailInput, 10);
    const qty = Number.isFinite(v) ? Math.max(0, v) : 0;
    onQuantityChange(productId, 'Retail', qty);
  };

  const applyWholesale = () => {
    const v = parseInt(wholesaleInput, 10);
    const qty = Number.isFinite(v) ? Math.max(0, v) : 0;
    onQuantityChange(productId, 'Discounted', qty);
  };

  return (
    <div className="product-card p-3 rounded-3 shadow-sm border-0 h-100 d-flex flex-column"
         style={{ background: 'linear-gradient(135deg,#fff 0%,#f8f9fa 100%)', border: '1px solid #e9ecef', minHeight: 200 }}>
      <div className="flex-grow-1 mb-3">
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm" style={{ fontSize: '0.9rem', minHeight: '2.4rem', overflow: 'hidden' }}>
          {product.name}
        </h6>

        <div className="mb-2">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="small text-muted">Retail:</span>
            <span className="fw-bold text-success" style={{ fontSize: '0.9rem' }}>{KSH(retailPrice)}</span>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <span className="small text-muted">Wholesale:</span>
            <span className="fw-bold text-info" style={{ fontSize: '0.9rem' }}>{KSH(wholesalePrice)}</span>
          </div>
        </div>

        {product.barcode && <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}><i className="fas fa-barcode me-1" />{product.barcode}</div>}
      </div>

      <div className="mb-2">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-success">Retail</span>
          {retailQuantity > 0 && <span className="badge bg-success">{retailQuantity}</span>}
        </div>

        <div className="d-flex gap-2 align-items-center">
          <div style={{ flex: 1 }}>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={retailInput}
              onChange={(e) => setRetailInput(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyRetail(); }}
              className="form-control form-control-sm quantity-input"
              aria-label="Retail quantity"
              placeholder="e.g., 20"
            />
          </div>
          <div style={{ width: 70 }}>
            <button className="btn btn-success btn-sm w-100" onClick={applyRetail} type="button">{retailQuantity > 0 ? 'Set' : 'Add'}</button>
          </div>
        </div>
      </div>

      <div className="wholesale-controls">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-info">Wholesale</span>
          {wholesaleQuantity > 0 && <span className="badge bg-info">{wholesaleQuantity}</span>}
        </div>

        <div className="d-flex gap-2 align-items-center">
          <div style={{ flex: 1 }}>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={wholesaleInput}
              onChange={(e) => setWholesaleInput(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') applyWholesale(); }}
              className="form-control form-control-sm quantity-input"
              aria-label="Wholesale quantity"
              placeholder="e.g., 20"
            />
          </div>
          <div style={{ width: 70 }}>
            <button className="btn btn-info btn-sm w-100" onClick={applyWholesale} type="button">{wholesaleQuantity > 0 ? 'Set' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Search header (only the input) */
function SearchHeader({ searchTerm, setSearchTerm, searchInputRef }) {
  return (
    <div className="mb-2 search-header-fixed">
      <div className="d-flex gap-3 align-items-center">
        <div className="flex-grow-1">
          <div className="input-group input-group-lg">
            <span className="input-group-text bg-white border-end-0"><i className="fas fa-search text-muted" /></span>
            <input
              ref={searchInputRef}
              type="text"
              defaultValue={searchTerm}
              onInput={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name or scan barcode..."
              className="form-control border-start-0 border-end-0 ps-0"
              autoComplete="off"
              spellCheck={false}
              style={{ fontSize: '1rem' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* Search Tools (moved controls; labeled and professional) */
function SearchTools({ loading, onRefresh, onClear, defaultPriceType, setDefaultPriceType }) {
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Search Tools</div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh product index"
              aria-label="Refresh products"
              style={{ minWidth: 0, padding: '6px 8px' }}
            >
              {loading ? <span className="spinner-border spinner-border-sm" /> : <FontAwesomeIcon icon={faUndoAlt} />}
            </button>

            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onClear}
              title="Clear search results"
              aria-label="Clear search"
              style={{ padding: '6px 10px' }}
            >
              <i className="fas fa-times me-1" /> Clear
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="defaultPriceType" style={{ margin: 0, fontSize: '0.85rem', color: '#6c757d' }}>Default scan price:</label>
          <select id="defaultPriceType" value={defaultPriceType} onChange={(e) => setDefaultPriceType(e.target.value)} className="form-select form-select-sm" style={{ width: 140 }}>
            <option value="Retail">Retail</option>
            <option value="Discounted">Wholesale</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/* Products grid */
function ProductsGrid({ hasSearched, filteredProducts, searchTerm, isLikelyBarcode, cart, onQuantityChange, loadingProducts }) {
  const cartByProduct = cart.reduce((acc, item) => {
    const pid = item.id || item._id;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(item);
    return acc;
  }, {});

  if (!hasSearched) {
    return (
      <div className="col-12">
        <div className="text-center py-5">
          <div className="mb-4"><i className="fas fa-search fa-3x text-muted mb-2" /><i className="fas fa-barcode fa-3x text-muted" /><i className="fas fa-shopping-cart fa-3x text-success" /></div>
          <h5 className="text-muted">Search for products or scan barcodes</h5>
          <p className="text-muted"><small className="text-success"><i className="fas fa-magic me-1" /><strong>Barcode scanner ready:</strong> Scan any barcode to instantly add items to your cart!</small></p>
        </div>
      </div>
    );
  }

  if (!filteredProducts || filteredProducts.length === 0) {
    return (
      <div className="col-12">
        <div className="text-center py-5">
          <i className={`fas ${isLikelyBarcode(searchTerm) ? 'fa-barcode' : 'fa-exclamation-circle'} fa-3x text-muted mb-3`} />
          <h5 className="text-muted">{isLikelyBarcode(searchTerm) ? 'No product found with this barcode' : 'No products found'}</h5>
          <p className="text-muted">{isLikelyBarcode(searchTerm) ? `Barcode "${searchTerm}" not found in inventory` : 'Try a different search term or barcode'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {filteredProducts.map(product => {
        const pid = product.id || product._id;
        const isLoading = loadingProducts.has(pid);
        const cartItems = cartByProduct[pid] || [];
        return (
          <div key={pid} className="col-6 col-sm-4 col-md-6 col-lg-4 col-xl-3 mb-3">
            <div style={{ position: 'relative' }}>
              <ProductCard product={product} cartItems={cartItems} onQuantityChange={onQuantityChange} />
              {isLoading && (
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 12, zIndex: 10 }}>
                  <div className="spinner-border text-primary" style={{ width: '2rem', height: '2rem' }}><span className="visually-hidden">Loading...</span></div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* Cart items */
function CartItems({ cart, onRemoveItem, KSH }) {
  if (!cart || cart.length === 0) {
    return (
      <div className="text-center py-5">
        <i className="fas fa-shopping-cart fa-3x text-muted mb-3" />
        <h6 className="text-muted">Your cart is empty</h6>
        <p className="text-muted mb-0 small">Add some products to get started</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th style={{ fontSize: '0.8rem', width: '55%' }}>Product</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Type</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Qty</th>
            <th style={{ fontSize: '0.8rem' }} className="text-end">Total</th>
            <th style={{ fontSize: '0.8rem', width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {cart.map(item => {
            const itemPrice = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
            const itemTotal = itemPrice * (item.quantity || 1);
            const itemId = item.id || item._id;
            const cartKey = `${itemId}_${item.priceType}`;
            return (
              <tr key={cartKey}>
                <td style={{ fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="cart-product-name" title={item.name} style={{ fontSize: '1.01rem', fontWeight: 600 }}>{item.name}</div>
                    <div className={`small ${item.priceType === 'Retail' ? 'text-success' : 'text-info'}`}>{KSH(itemPrice)}</div>
                    {item.barcode && <div className="text-muted" style={{ fontSize: '0.65rem' }}><i className="fas fa-barcode me-1" />{item.barcode}</div>}
                  </div>
                </td>
                <td className="text-center" style={{ fontSize: '0.7rem' }}>
                  <span className={`badge ${item.priceType === 'Retail' ? 'bg-success' : 'bg-info'} px-2 py-1`}>{item.priceType === 'Retail' ? 'Retail' : 'Wholesale'}</span>
                </td>
                <td className="text-center" style={{ fontSize: '0.75rem' }}>
                  <span className="badge bg-secondary px-2 py-1">{item.quantity || 1}</span>
                </td>
                <td className="text-end fw-semibold" style={{ fontSize: '0.75rem' }}>{KSH(itemTotal)}</td>
                <td className="text-center">
                  <button className="remove-circle-btn" onClick={() => onRemoveItem(cartKey, item)} title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} type="button">×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Payment form */
function PaymentForm({ paymentType, setPaymentType, paymentData, setPaymentData, cartTotal, KSH, setCurrentOrderId }) {
  const cashActive = { backgroundColor: '#FF8C00', border: '2px solid #FF6600', color: '#fff' };
  const cashInactive = { backgroundColor: '#FFEBD6', border: '2px solid #FFA500', color: '#1f1f1f' };
  const mpesaActive = { backgroundColor: '#22B14C', border: '2px solid #16A335', color: '#fff' };
  const mpesaInactive = { backgroundColor: '#E6F8EA', border: '2px solid #22B14C', color: '#1f1f1f' };
  const bothActive = { backgroundColor: '#0056B3', border: '2px solid #004494', color: '#fff' };
  const bothInactive = { backgroundColor: '#E7F1FF', border: '2px solid #0078D4', color: '#1f1f1f' };

  const handleMpesaInputChange = (raw) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 9);
    setPaymentData({ ...paymentData, mpesaPhone: digits ? `254${digits}` : '' });
  };

  const mpesaValueWithoutPrefix = paymentData.mpesaPhone ? paymentData.mpesaPhone.replace(/^254/, '') : '';

  return (
    <>
      <div className="mb-3">
        <div className="fw-semibold mb-2" style={{ fontSize: '0.95rem' }}>
          <i className="fas fa-credit-card me-2" />Payment Method
        </div>
        <div className="row g-2">
          <div className="col-4">
            <button type="button" className="btn w-100" onClick={() => { setPaymentType('cash'); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} style={paymentType === 'cash' ? cashActive : cashInactive}><i className="fas fa-money-bill-wave d-block mb-1" style={{ fontSize: '1.2rem' }} />Cash</button>
          </div>
          <div className="col-4">
            <button type="button" className="btn w-100" onClick={() => { setPaymentType('mpesa'); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} style={paymentType === 'mpesa' ? mpesaActive : mpesaInactive}><i className="fas fa-mobile-alt d-block mb-1" style={{ fontSize: '1.2rem' }} />M-Pesa</button>
          </div>
          <div className="col-4">
            <button type="button" className="btn w-100" onClick={() => { setPaymentType('both'); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} style={paymentType === 'both' ? bothActive : bothInactive}><i className="fas fa-exchange-alt d-block mb-1" style={{ fontSize: '1.2rem' }} />Hybrid</button>
          </div>
        </div>
      </div>

      {paymentType === 'cash' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Cash Amount Given</Form.Label>
          <div className="input-group input-group-lg">
            <span className="input-group-text">Ksh</span>
            <Form.Control type="number" value={paymentData.cashAmount} onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} placeholder="Enter amount received" min={cartTotal} style={{ fontSize: '1.1rem' }} />
          </div>
          {paymentData.cashAmount && Number(paymentData.cashAmount) >= cartTotal && (
            <div className="mt-2 p-2 bg-success bg-opacity-10 rounded border-start border-success border-3">
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-success fw-semibold"><i className="fas fa-check-circle me-1" />Change:</span>
                <span className="text-success fw-bold fs-5">{KSH(Number(paymentData.cashAmount) - cartTotal)}</span>
              </div>
            </div>
          )}
        </Form.Group>
      )}

      {paymentType === 'mpesa' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">M-Pesa Phone Number</Form.Label>
          <div className="input-group input-group-lg">
            <span className="input-group-text">📱</span>
            <span className="input-group-text">254</span>
            <Form.Control
              type="tel"
              placeholder="7XXXXXXXX"
              value={mpesaValueWithoutPrefix}
              onChange={(e) => handleMpesaInputChange(e.target.value)}
              style={{ fontSize: '1.1rem' }}
              inputMode="numeric"
              maxLength={9}
            />
          </div>
        </Form.Group>
      )}

      {paymentType === 'both' && (
        <>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Cash Amount</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">Ksh</span>
              <Form.Control type="number" value={paymentData.cashAmount} onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} placeholder="Enter cash amount" min={0} style={{ fontSize: '1.1rem' }} />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">M-Pesa Amount</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">Ksh</span>
              <Form.Control type="number" value={paymentData.mpesaAmount} onChange={(e) => setPaymentData({ ...paymentData, mpesaAmount: e.target.value })} placeholder="Enter M-Pesa amount" min={0} style={{ fontSize: '1.1rem' }} />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">M-Pesa Phone Number</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">📱</span>
              <span className="input-group-text">254</span>
              <Form.Control
                type="tel"
                placeholder="7XXXXXXXX"
                value={mpesaValueWithoutPrefix}
                onChange={(e) => handleMpesaInputChange(e.target.value)}
                style={{ fontSize: '1.1rem' }}
                inputMode="numeric"
                maxLength={9}
              />
            </div>
          </Form.Group>
        </>
      )}
    </>
  );
}

/* POS component */
export default function POS() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchType, setSearchType] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [paymentData, setPaymentData] = useState({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
  const [loadingProducts, setLoadingProducts] = useState(new Set());
  const [processingOrder, setProcessingOrder] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [defaultPriceType, setDefaultPriceType] = useState('Retail');

  const dispatch = useDispatch();
  const cart = useSelector(selectCart);
  const cartItemCount = useSelector(selectCartItemCount);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  const searchInputRef = useRef(null);
  const scannerRef = useRef({ buffer: '', firstTime: 0, lastTime: 0, timer: null });
  const barcodeResultsRef = useRef(null);

  const getInventoryId = useCallback((product) => {
    return product?.inventoryId || product?.inventory?.id || product?.inventory?._id || product?.inventory_id || product?.invId || product?.inventoryIdString || null;
  }, []);

  const isLikelyBarcode = useCallback((term) => {
    if (!term) return false;
    const numericOnly = /^\d+$/.test(term.trim());
    const length = term.trim().length;
    return numericOnly && length >= 8 && length <= 20;
  }, []);

  const setProductLoading = (productId, isLoading) => {
    setLoadingProducts(prev => {
      const next = new Set(prev);
      if (isLoading) next.add(productId); else next.delete(productId);
      return next;
    });
  };

  const calculateCartTotal = useCallback(() => {
    return cart.reduce((total, item) => {
      const price = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
      return total + price * (item.quantity || 1);
    }, 0);
  }, [cart]);

  useEffect(() => {
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(async () => {
        const all = await indexedDb.getAllProducts();
        setProducts(all);
      })
      .catch(() => toast.error('Failed to sync products'));
  }, [dispatch]);

  useEffect(() => {
    const THRESHOLD_AVG_MS = 80;
    const CLEAR_TIMEOUT = 800;
    const MIN_BARCODE_LENGTH = 8;

    const onKeyDown = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      const now = Date.now();
      const s = scannerRef.current;
      const target = e.target;
      const targetIsEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (targetIsEditable) return;

      if (e.key === 'Enter') {
        if (s.buffer.length >= MIN_BARCODE_LENGTH) {
          const totalTime = now - (s.firstTime || now);
          const avg = totalTime / Math.max(1, s.buffer.length);
          if (avg < THRESHOLD_AVG_MS) {
            const code = s.buffer;
            handleBarcodeScanned(code);
            s.buffer = '';
            s.firstTime = 0;
            s.lastTime = 0;
            e.preventDefault();
            e.stopPropagation();
          }
        }
        clearTimeout(s.timer);
        s.buffer = '';
        s.firstTime = 0;
        s.lastTime = 0;
        s.timer = null;
        return;
      }

      if (e.key.length === 1) {
        if (s.lastTime && (now - s.lastTime) > 150) {
          s.buffer = '';
          s.firstTime = now;
        }
        if (!s.firstTime) s.firstTime = now;
        s.buffer += e.key;
        s.lastTime = now;

        clearTimeout(s.timer);
        s.timer = setTimeout(() => {
          s.buffer = '';
          s.firstTime = 0;
          s.lastTime = 0;
          s.timer = null;
        }, CLEAR_TIMEOUT);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      clearTimeout(scannerRef.current.timer);
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 3000 });
    }
  }, []);

  useEffect(() => {
    const handleCheckoutEnter = (e) => {
      if (e.key !== 'Enter') return;
      if (!paymentType || cart.length === 0 || processingOrder) return;
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      if (paymentType === 'both') createOrder(); else completeCheckout();
    };

    window.addEventListener('keydown', handleCheckoutEnter);
    return () => window.removeEventListener('keydown', handleCheckoutEnter);
  }, [paymentType, cart.length, paymentData, processingOrder]);

  const performSearch = useCallback(async (term) => {
    if (!term || term.trim().length === 0) {
      setFilteredProducts([]); setHasSearched(false); setSearchType(''); return;
    }

    setHasSearched(true);
    const searchTermLower = term.toLowerCase().trim();
    const originalTerm = term.trim();

    try {
      let allResults = [];
      let foundByBarcode = false;

      const barcodeResult = await indexedDb.getProductByBarcode(originalTerm);
      if (barcodeResult) {
        allResults.push(barcodeResult);
        foundByBarcode = true;
        setSearchType('barcode');
      }

      if (!foundByBarcode || !isLikelyBarcode(originalTerm)) {
        const nameResults = await indexedDb.searchByName(searchTermLower, 100);
        nameResults.forEach(product => {
          const pid = product.id || product._id;
          if (!allResults.find(p => (p.id || p._id) === pid)) allResults.push(product);
        });
        setSearchType(foundByBarcode ? 'both' : 'name');
      }

      setFilteredProducts(allResults);

      if (foundByBarcode && isLikelyBarcode(originalTerm)) {
        barcodeResultsRef.current = allResults.slice();
        if (searchInputRef.current) try { searchInputRef.current.value = ''; } catch (e) {}
        setSearchTerm('');
        requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {} });
      }
    } catch (error) {
      toast.error('Search failed');
      setFilteredProducts([]);
      setSearchType('');
    }
  }, [isLikelyBarcode]);

  const debouncedSearch = useDebouncedCallback(performSearch, 300);
  useEffect(() => { debouncedSearch(searchTerm); }, [searchTerm, debouncedSearch]);

  const focusSearchInput = useCallback(() => {
    const el = searchInputRef.current;
    if (el?.focus) try { el.focus({ preventScroll: true }); } catch (err) {}
  }, []);

  const clearSearchAndProducts = useCallback(() => {
    if (searchInputRef.current) try { searchInputRef.current.value = ''; } catch (e) {}
    setSearchTerm(''); setFilteredProducts([]); setHasSearched(false); setSearchType(''); barcodeResultsRef.current = null;
    requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); else focusSearchInput(); } catch (e) {} });
  }, [focusSearchInput]);

  const handleClearCart = useCallback(() => {
    if (cartItemCount === 0) {
      toast.info('Cart is already empty');
      requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {} });
      return;
    }

    dispatch(clearCart());
    toast.success('Cart cleared');
    setCurrentOrderId(null); setPaymentType(''); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
    requestAnimationFrame(() => { try { if (searchInputRef.current) { searchInputRef.current.value = ''; searchInputRef.current.focus({ preventScroll: true }); } else focusSearchInput(); } catch (e) {} });
  }, [cartItemCount, dispatch, focusSearchInput]);

  /* barcode handler: shows only the scanned product card and clears search input */
  const handleBarcodeScanned = async (barcode) => {
    try {
      const product = await indexedDb.getProductByBarcode(barcode);
      if (!product) { 
        toast.error(`No product found with barcode: ${barcode}`); 
        return; 
      }

      const priceType = defaultPriceType || 'Retail';
      await handleQuantityChange(product.id || product._id, priceType, 1, product);

      // Display only the scanned product
      barcodeResultsRef.current = [product];
      setFilteredProducts([product]);
      setHasSearched(true);
      setSearchType('barcode');

      // Clear the search input
      if (searchInputRef.current) try { searchInputRef.current.value = ''; } catch (e) {}
      setSearchTerm('');
      requestAnimationFrame(() => focusSearchInput());
    } catch (error) {
      toast.error(`Failed to process barcode: ${error?.message || 'Unexpected error'}`);
      setLoadingProducts(prev => { const s = new Set(prev); s.clear(); return s; });
    }
  };

  useEffect(() => {
    if (searchTerm && searchTerm.trim().length > 0) barcodeResultsRef.current = null;
  }, [searchTerm]);

  const handleQuantityChange = async (productId, priceType, newQuantity, productData = null) => {
    try {
      const product = productData || filteredProducts.find(p => (p.id || p._id) === productId);
      if (!product) { toast.error('Product not found'); return; }

      const existingCartItem = cart.find(item => (item.id || item._id) === productId && item.priceType === priceType);

      if (newQuantity === 0) {
        if (existingCartItem) {
          const cartItemId = `${productId}_${priceType}`;
          try { dispatch(removeItemFromCart(cartItemId)); } catch (e) {}
          try { dispatch(removeItemFromCart({ id: cartItemId })); } catch (e) {}
          try { dispatch(removeItemFromCart({ productId, priceType })); } catch (e) {}
          try { dispatch(updateCartItemQuantity({ productId, quantity: 0 })); } catch (e) {}
          toast.success('Removed from cart');
          requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {} });
        }
        return;
      }

      const currentCartQty = existingCartItem ? existingCartItem.quantity : 0;
      const inventoryId = getInventoryId(product);
      if (!inventoryId) { toast.error('Cannot validate stock - inventory ID missing'); return; }

      setProductLoading(productId, true);

      if (newQuantity > currentCartQty) {
        const qtyToAdd = newQuantity - currentCartQty;
        try {
          const validation = await validateAndAddToCart({ productId, inventoryId, qty: qtyToAdd, currentCartQty });
          if (validation.status === 'conflict' || validation.status === 'error') { toast.error(validation.message); setProductLoading(productId, false); return; }
          if (validation.status === 'warning') toast.warning(validation.message);
        } catch (validationError) { /* proceed if validation service fails */ }
      } else {
        try {
          const validation = await validateCartQuantityChange({ productId, inventoryId, newQty: newQuantity, currentCartQty });
          if (validation.status === 'conflict' || validation.status === 'error') { toast.error(validation.message); setProductLoading(productId, false); return; }
        } catch (validationError) { /* proceed if validation service fails */ }
      }

      if (existingCartItem) {
        dispatch(updateCartItemQuantity({ productId, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        dispatch(addItemToCart({ product: { ...product, id: productId, priceType, price: product.price, priceAfterDiscount: product.priceAfterDiscount }, quantity: newQuantity }));
        // CLEAR search input after item is added to cart
        if (searchInputRef.current) {
          try { searchInputRef.current.value = ''; } catch (e) {}
        }
        setSearchTerm('');
        requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {} });
        toast.success(`Added to cart (${priceType === 'Retail' ? 'Retail' : 'Wholesale'})`);
      }

      setProductLoading(productId, false);
      requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); else focusSearchInput(); } catch (e) {} });
    } catch (error) {
      toast.error(`Failed to update cart: ${error?.message || 'Unexpected error'}`);
      setProductLoading(productId, false);
    }
  };

  const handleRemoveItem = (cartKey, item) => {
    if (!cartKey) { toast.error('Invalid cart item key'); return; }
    const productId = item?.id || item?._id || null;
    const priceType = item?.priceType || (cartKey.includes('_') ? cartKey.split('_').slice(-1)[0] : null);

    try {
      try { dispatch(removeItemFromCart(cartKey)); } catch (e) {}
      try { dispatch(removeItemFromCart({ id: cartKey })); } catch (e) {}
      if (productId && priceType) try { dispatch(removeItemFromCart({ productId, priceType })); } catch (e) {}
      if (productId) {
        try { dispatch(updateCartItemQuantity({ productId, quantity: 0 })); } catch (e) {}
        try { dispatch(removeItemFromCart(productId)); } catch (e) {}
      }
      toast.success('Item removed from cart');
    } catch (err) {
      toast.error('Failed to remove item');
    } finally {
      requestAnimationFrame(() => { try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {} });
    }
  };

  const refresh = async () => {
    try {
      await dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: true })).unwrap();
      const all = await indexedDb.getAllProducts();
      setProducts(all);
      toast.success('Products refreshed successfully');
    } catch {
      toast.error('Failed to refresh products');
    }
  };

  // Helper: mask phone for display/receipt
  const maskPhoneForReceipt = (rawPhone) => {
    if (!rawPhone) return 'Walk-in';
    const s = String(rawPhone).trim();
    if (s.length < 6) return s;
    const idx = s.length - 6;
    return s.substring(0, idx) + '***' + s.substring(s.length - 3);
  };

  const handleOrderCompletion = async (orderData) => {
    toast.success('Order completed');

    const receiptItems = cart.map(ci => {
      const sellingPrice = ci.priceType === 'Retail' ? (ci.price || 0) : (ci.priceAfterDiscount || ci.price || 0);
      const quantity = ci.quantity || 1;
      const lineTotal = sellingPrice * quantity;
      return { name: ci.name || ci.productName || 'Item', productName: ci.name || ci.productName || 'Item', salePrice: sellingPrice, sellingPrice, price: sellingPrice, quantity, qty: quantity, lineTotal, total: lineTotal, priceType: ci.priceType, barcode: ci.barcode || '' };
    });

    const cartTotalFromLines = receiptItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
    const currentCartTotal = calculateCartTotal();
    const actualUser = Array.isArray(user) ? user[0] : user;

    const getCashierName = () => {
      if (!actualUser) return 'Staff';
      const candidates = [
        actualUser.fullName,
        actualUser.full_name,
        actualUser.name,
        ((actualUser.firstName || actualUser.first_name) ? `${actualUser.firstName || actualUser.first_name} ${actualUser.lastName || actualUser.last_name || ''}` : null),
        actualUser.userName,
        actualUser.username,
        actualUser.email
      ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);

      const chosen = candidates.length > 0 ? candidates[0] : 'Staff';
      const firstToken = (chosen.split(/\s+/)[0] || chosen).trim();
      return firstToken || 'Staff';
    };

    const cashierName = getCashierName();

    const storeSettings = { storeName: 'ARPELLA STORE LIMITED', storeAddress: 'Ngong, Matasia', storePhone: '+254 7xx xxx xxx', pin: 'P052336649L', receiptFooter: 'Thank you for your business!' };

    const calculatePaymentDetails = () => {
      const paymentInfo = { cashAmount: 0, mpesaAmount: 0, change: 0 };
      if (paymentType === 'cash') { paymentInfo.cashAmount = Number(paymentData.cashAmount) || 0; paymentInfo.change = Math.max(0, paymentInfo.cashAmount - currentCartTotal); }
      else if (paymentType === 'mpesa') { paymentInfo.mpesaAmount = Number(paymentData.mpesaAmount) || currentCartTotal; }
      else if (paymentType === 'both') { paymentInfo.cashAmount = Number(paymentData.cashAmount) || 0; paymentInfo.mpesaAmount = Number(paymentData.mpesaAmount) || 0; const totalPaid = paymentInfo.cashAmount + paymentInfo.mpesaAmount; paymentInfo.change = Math.max(0, totalPaid - currentCartTotal); }
      return paymentInfo;
    };

    const paymentDetails = calculatePaymentDetails();

    const normalizedUser = {
      id: actualUser?.id || actualUser?._id || actualUser?.userId || null,
      fullName: cashierName, full_name: cashierName, name: cashierName,
      firstName: actualUser?.firstName || actualUser?.first_name || '', first_name: actualUser?.firstName || actualUser?.first_name || '',
      lastName: actualUser?.lastName || actualUser?.last_name || '', last_name: actualUser?.lastName || actualUser?.last_name || '',
      userName: actualUser?.userName || actualUser?.username || cashierName, username: actualUser?.userName || actualUser?.username || cashierName,
      phone: actualUser?.phone || actualUser?.phoneNumber || actualUser?.mobile || '', phoneNumber: actualUser?.phone || actualUser?.phoneNumber || actualUser?.mobile || '', email: actualUser?.email || ''
    };

    const rawCustomerPhone = (paymentType === 'mpesa' || paymentType === 'both') ? (paymentData.mpesaPhone || '').trim() || '' : (user && (user.phone || user.phoneNumber)) || '';
    const maskedCustomerPhone = rawCustomerPhone ? maskPhoneForReceipt(rawCustomerPhone) : 'Walk-in';

    const receiptData = {
      cart: receiptItems,
      cartTotal: Number.isFinite(cartTotalFromLines) && cartTotalFromLines >= 0 ? cartTotalFromLines : currentCartTotal,
      paymentType: paymentType || 'cash',
      paymentData: paymentDetails,
      user: normalizedUser, cashier: normalizedUser,
      orderNumber: orderData?.orderNumber || orderData?.orderId || orderData?.orderid || orderData?.id || `ORD-${Date.now().toString().slice(-6)}`,
      orderId: orderData?.orderNumber || orderData?.orderId || orderData?.orderid || orderData?.id || `ORD-${Date.now().toString().slice(-6)}`,
      customerPhone: maskedCustomerPhone,
      storeSettings
    };

    dispatch(clearCart());
    setPaymentType(''); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); setProcessingOrder(false);
    clearSearchAndProducts();

    if (paymentDetails.change > 0) toast.info(`Change: ${KSH(paymentDetails.change)}`, { autoClose: 5000, position: 'top-center' });

    try {
      const res = await printOrderReceipt(receiptData, null, storeSettings);
      if (res?.success) toast.success('Receipt printed successfully'); else toast.warning(`Receipt printing: ${res?.message || 'failed'}`);
    } catch (err) {
      toast.error('Receipt printing failed - check printer');
    }
  };

  const createOrder = async () => {
    if (!paymentType) { toast.error('Please select a payment method'); return; }
    const currentCartTotal = calculateCartTotal();

    if (paymentType === 'both') {
      const cashVal = Number(paymentData.cashAmount) || 0;
      const mpesaVal = Number(paymentData.mpesaAmount) || 0;
      if (!paymentData.mpesaPhone || paymentData.mpesaPhone.trim().length === 0) { toast.error('Please enter M-Pesa phone number'); return; }
      if (mpesaVal <= 0) { toast.error('Please enter a valid M-Pesa amount'); return; }
      if ((cashVal + mpesaVal) < currentCartTotal) { toast.error('Total payment amount must be >= cart total'); return; }
    }

    const payload = {
      buyerPin: 'N/A', orderSource: 'POS', latitude: coords?.lat ?? 0, longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({ productId: Number(ci.id || ci._id), quantity: ci.quantity, priceType: ci.priceType })),
      orderPaymentType: paymentType === 'cash' ? 'Cash' : paymentType === 'mpesa' ? 'Mpesa' : 'Hybrid',
      phoneNumber: paymentType === 'mpesa' || paymentType === 'both' ? (paymentData.mpesaPhone || '').trim() : (user && user.phone) || 'N/A'
    };

    if (paymentType === 'both') { payload.total = Number(paymentData.mpesaAmount) || 0; payload.cashAmount = Number(paymentData.cashAmount) || 0; payload.userId = (user && (user.phone || user.userName)) || ''; }
    if (paymentType === 'mpesa') payload.userId = (user && (user.phone || user.userName)) || '';
    if (paymentType === 'cash') payload.cashAmount = Number(paymentData.cashAmount) || 0;

    try {
      setProcessingOrder(true);
      toast.info('Creating order...');
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      if (orderId) { setCurrentOrderId(orderId); toast.success(`Order created. ID: ${orderId}`); if (paymentType !== 'both') await handleOrderCompletion(res.data); else toast.info('Hybrid order created. Confirm M-Pesa payment.'); }
      else { toast.success('Order created.'); if (paymentType !== 'both') await handleOrderCompletion(res.data); }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Order failed';
      toast.error(msg);
      setProcessingOrder(false);
    }
  };

  const completeCheckout = async () => {
    if (!paymentType) { toast.error('Please select a payment method'); return; }
    const currentCartTotal = calculateCartTotal();

    if (paymentType === 'cash') {
      const cashVal = Number(paymentData.cashAmount);
      if (!paymentData.cashAmount || Number.isNaN(cashVal) || cashVal < currentCartTotal) { toast.error('Please enter a valid cash amount (>= total)'); return; }
    }
    if (paymentType === 'mpesa' && (!paymentData.mpesaPhone || paymentData.mpesaPhone.trim().length === 0)) { toast.error('Please enter M-Pesa phone number'); return; }

    const payload = {
      buyerPin: 'N/A', orderSource: 'POS', latitude: coords?.lat ?? 0, longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({ productId: Number(ci.id || ci._id), quantity: ci.quantity, priceType: ci.priceType })),
      orderPaymentType: paymentType === 'cash' ? 'Cash' : 'Mpesa',
      phoneNumber: paymentType === 'mpesa' ? paymentData.mpesaPhone.trim() : (user && user.phone) || 'N/A'
    };

    if (paymentType === 'mpesa') payload.userId = (user && (user.phone || user.userName)) || '';
    if (paymentType === 'cash') payload.cashAmount = Number(paymentData.cashAmount) || 0;

    try {
      setProcessingOrder(true);
      toast.info(paymentType === 'mpesa' ? 'Creating M-Pesa order...' : 'Processing payment...');
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      if (paymentType === 'mpesa') {
        if (orderId) { setCurrentOrderId(orderId); toast.success(`M-Pesa order created. ID: ${orderId}`); } else { toast.success('M-Pesa order created.'); }
        setProcessingOrder(false);
      } else {
        await handleOrderCompletion(res.data);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Checkout failed';
      toast.error(msg);
      setProcessingOrder(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!currentOrderId) { toast.error('No order ID to check'); return; }
    try {
      setCheckingPayment(true); toast.info('Checking payment status...');
      let paid = false; let remoteData = null;
      try {
        const response = await api.get(`/payments/${currentOrderId}`);
        remoteData = response?.data || {};
        if (paymentType === 'mpesa') {
          const statusVal = remoteData?.status || remoteData?.paymentStatus || remoteData?.state || null;
          if (statusVal && String(statusVal).toLowerCase() === 'completed') paid = true;
        } else {
          if (remoteData.paid === true || String(remoteData.paymentStatus || '').toLowerCase() === 'paid' || String(remoteData.status || '').toLowerCase() === 'paid' || String(remoteData.status || '').toLowerCase() === 'completed') paid = true;
        }
      } catch (err) { /* ignore */ }

      if (!paid) {
        try {
          const orderResp = await api.get(`/order/${currentOrderId}`);
          const od = orderResp?.data || {};
          if (paymentType === 'mpesa') {
            const statusVal = od?.status || od?.paymentStatus || (od.payment && od.payment.status) || null;
            if (statusVal && String(statusVal).toLowerCase() === 'completed') paid = true;
          } else {
            if (od && (od.paid === true || String(od.status || '').toLowerCase() === 'paid' || String(od.paymentStatus || '').toLowerCase() === 'paid')) paid = true;
            else if (od && od.payment && (od.payment.paid === true || String(od.payment.status || '').toLowerCase() === 'paid')) paid = true;
          }
        } catch (err) { /* ignore */ }
      }

      if (paid) { toast.success('Payment confirmed'); await handleOrderCompletion({ orderNumber: currentOrderId }); }
      else toast.warning('Payment not confirmed yet');
    } catch (err) {
      toast.error('Payment check failed');
    } finally {
      setCheckingPayment(false);
    }
  };

  const currentCartTotal = calculateCartTotal();
  const displayedProducts = (barcodeResultsRef.current && (searchType === 'barcode' || isLikelyBarcode(searchTerm)) && (!searchTerm || searchTerm.trim() === '')) ? barcodeResultsRef.current : (filteredProducts || []);

  return (
    <div className="container-fluid py-4" style={{ background: '#f8f9fa', minHeight: '100vh', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="row h-100" style={{ minHeight: 'calc(100vh - 2rem)' }}>
        <div className="col-xl-4 col-lg-5 col-md-6 col-12 mb-4">
          <SearchHeader searchTerm={searchTerm} setSearchTerm={setSearchTerm} searchInputRef={searchInputRef} />

          <SearchTools loading={loading} onRefresh={refresh} onClear={clearSearchAndProducts} defaultPriceType={defaultPriceType} setDefaultPriceType={setDefaultPriceType} />

          <div className="products-container" style={{ height: 'calc(100vh - 280px)', overflowY: 'auto', paddingRight: 10 }}>
            <div className="row">
              <ProductsGrid hasSearched={hasSearched} filteredProducts={displayedProducts} searchTerm={searchTerm} isLikelyBarcode={isLikelyBarcode} cart={cart} onQuantityChange={handleQuantityChange} loadingProducts={loadingProducts} />
            </div>

            {hasSearched && displayedProducts.length > 0 && (
              <div className="row mt-3">
                <div className="col-12">
                  <div className="text-center text-muted">
                    <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} me-1`} />
                    {(() => {
                      const count = displayedProducts.length;
                      const label = (searchTerm && searchTerm.trim()) ? searchTerm : (barcodeResultsRef.current ? 'recent scan' : '');
                      return `Found ${count} products${label ? ` for "${label}"` : ''}`;
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-xl-8 col-lg-7 col-md-6 col-12">
          <div className="cart-sidebar h-100 bg-white rounded-3 shadow-sm p-4 position-sticky" style={{ top: 20, maxHeight: 'calc(100% - 150px)', display: 'flex', flexDirection: 'column' }}>
            <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
              <h5 className="fw-semibold mb-0 d-flex align-items-center"><i className="fas fa-shopping-cart me-2" />Cart{cartItemCount > 0 && <span className="badge bg-primary ms-2">{cartItemCount} items</span>}</h5>
              {cartItemCount > 0 && <button className="btn btn-outline-danger btn-sm" onClick={handleClearCart} title="Clear all items" aria-label="Clear cart" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i className="fas fa-trash" /> Clear</button>}
            </div>

            <div className="cart-items flex-grow-1" style={{ overflowY: 'auto', marginBottom: 20 }}>
              <CartItems cart={cart} onRemoveItem={handleRemoveItem} KSH={KSH} />
            </div>

            {cart.length > 0 && (
              <div className="cart-checkout border-top pt-3">
                <div className="d-flex justify-content-between align-items-center mb-3"><span className="fw-bold fs-4"><i className="fas fa-shopping-bag me-1" />Total:</span><span className="fw-bold fs-3 text-success">{KSH(currentCartTotal)}</span></div>

                <PaymentForm paymentType={paymentType} setPaymentType={setPaymentType} paymentData={paymentData} setPaymentData={setPaymentData} cartTotal={currentCartTotal} KSH={KSH} setCurrentOrderId={setCurrentOrderId} />

                {currentOrderId && (paymentType === 'mpesa' || paymentType === 'both') && (
                  <div className="alert alert-warning py-2 mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div><i className="fas fa-clock me-2" /><small>Order ID: <strong>{currentOrderId}</strong></small></div>
                      <div><Button variant="outline-success" size="sm" onClick={checkPaymentStatus} disabled={checkingPayment}>{checkingPayment ? <> <span className="spinner-border spinner-border-sm me-2" /> Checking... </> : <> <i className="fas fa-check-circle me-2" /> Confirm </>}</Button></div>
                    </div>
                    <div className="text-center mt-2 small text-muted">Confirm payment to finalize order</div>
                  </div>
                )}

                <Button style={{ ...CTA, width: '100%', padding: '14px', fontSize: '1.1rem', fontWeight: 600 }} onClick={paymentType === 'both' ? createOrder : completeCheckout} disabled={!paymentType || processingOrder} size="lg">
                  {processingOrder ? <> <span className="spinner-border spinner-border-sm me-2" /> Processing... </> : <> <i className="fas fa-check me-2" />{paymentType === 'both' ? 'Create Order' : 'Complete Order'} - {KSH(currentCartTotal)} </>}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .search-header-fixed { position: sticky; top: 0; background: #f8f9fa; z-index: 100; padding-bottom: 6px; }
        .product-card:hover { border-color: #007bff !important; }
        .form-control:focus { border-color: #007bff; box-shadow: 0 0 0 0.2rem rgba(0,123,255,0.25); }
        .cart-sidebar { border: 1px solid #e9ecef; }
        .cart-items { min-height: 200px; }
        .remove-circle-btn { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #dc3545; background: transparent; color: #dc3545; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; padding: 0; cursor: pointer; }
        .remove-circle-btn:hover { background: #dc3545; color: #fff; }
        .cart-product-name { max-width: 100%; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .search-header-fixed .input-group { display:flex; gap:8px; align-items:center; }
        .search-header-fixed .form-control { flex:1 1 auto; min-width:0; }
        .search-header-fixed .btn { padding:6px 8px; height:36px; min-width:36px; font-size:0.9rem; line-height:1; }
        
        /* Remove number input arrows */
        .quantity-input::-webkit-outer-spin-button,
        .quantity-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .quantity-input[type=number] {
          -moz-appearance: textfield;
        }
        
        @media (max-width:1199.98px) { .cart-sidebar { position: relative !important; max-height: none !important; margin-top: 20px; } }
        @media (min-width:1200px) { .col-xl-4 { flex: 0 0 40%; max-width: 40%; } .col-xl-8 { flex:0 0 60%; max-width:60%; } }
      `}</style>
    </div>
  );
}