// src/screens/Index.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';

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

// Use printer helper (centralizes ipcRenderer usage + logging)
import { printOrderReceipt } from '../thermalPrinter/thermalPrinter';

const CTA = { background: '#FF7F50', color: '#fff' };
const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

/* ----------------------------
   Small util hooks / components
   ---------------------------- */
function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), wait);
  }, [fn, wait]);
}

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

  const handleRetailIncrement = () => onQuantityChange(productId, 'Retail', retailQuantity + 1);
  const handleRetailDecrement = () => {
    if (retailQuantity > 1) onQuantityChange(productId, 'Retail', retailQuantity - 1);
    else if (retailQuantity === 1) onQuantityChange(productId, 'Retail', 0);
  };
  const handleRetailAddToCart = () => onQuantityChange(productId, 'Retail', 1);

  const handleWholesaleIncrement = () => onQuantityChange(productId, 'Discounted', wholesaleQuantity + 1);
  const handleWholesaleDecrement = () => {
    if (wholesaleQuantity > 1) onQuantityChange(productId, 'Discounted', wholesaleQuantity - 1);
    else if (wholesaleQuantity === 1) onQuantityChange(productId, 'Discounted', 0);
  };
  const handleWholesaleAddToCart = () => onQuantityChange(productId, 'Discounted', 1);

  return (
    <div
      className="product-card p-3 rounded-3 shadow-sm border-0 h-100 d-flex flex-column"
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
        border: '1px solid #e9ecef',
        transition: 'all 0.2s ease-in-out',
        minHeight: '200px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }}
    >
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

        {product.barcode && (
          <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-barcode me-1"></i>
            {product.barcode}
          </div>
        )}
      </div>

      <div className="mb-2">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-success">Retail</span>
          {retailQuantity > 0 && <span className="badge bg-success">{retailQuantity}</span>}
        </div>
        {retailQuantity > 0 ? (
          <div className="d-flex align-items-center justify-content-center">
            <button
              className="btn btn-outline-success btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleRetailDecrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
              aria-label={`Decrease retail quantity for ${product.name}`}
            >
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>−</span>
            </button>
            <div className="mx-2 fw-bold text-center" style={{ minWidth: '25px', fontSize: '0.9rem', color: '#495057' }}>
              {retailQuantity}
            </div>
            <button
              className="btn btn-outline-success btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleRetailIncrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
              aria-label={`Increase retail quantity for ${product.name}`}
            >
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-success btn-sm w-100 rounded-pill"
            onClick={handleRetailAddToCart}
            style={{ fontWeight: '600', fontSize: '0.75rem', padding: '6px 12px' }}
            type="button"
          >
            <span style={{ marginRight: 6 }}>+</span>Add Retail
          </button>
        )}
      </div>

      <div className="wholesale-controls">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-info">Wholesale</span>
          {wholesaleQuantity > 0 && <span className="badge bg-info">{wholesaleQuantity}</span>}
        </div>
        {wholesaleQuantity > 0 ? (
          <div className="d-flex align-items-center justify-content-center">
            <button
              className="btn btn-outline-info btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleWholesaleDecrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
              aria-label={`Decrease wholesale quantity for ${product.name}`}
            >
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>−</span>
            </button>
            <div className="mx-2 fw-bold text-center" style={{ minWidth: '25px', fontSize: '0.9rem', color: '#495057' }}>
              {wholesaleQuantity}
            </div>
            <button
              className="btn btn-outline-info btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleWholesaleIncrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
              aria-label={`Increase wholesale quantity for ${product.name}`}
            >
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-info btn-sm w-100 rounded-pill"
            onClick={handleWholesaleAddToCart}
            style={{ fontWeight: '600', fontSize: '0.75rem', padding: '6px 12px' }}
            type="button"
          >
            <span style={{ marginRight: 6 }}>+</span>Add Wholesale
          </button>
        )}
      </div>
    </div>
  );
}

/* ----------------------------
   Search header (UNCONTROLLED input)
   ---------------------------- */
function SearchHeader({ searchTerm, setSearchTerm, searchType, loading, onRefresh, onClear, searchInputRef }) {
  return (
    <div className="mb-4 search-header-fixed">
      <div className="d-flex flex-column flex-md-row gap-3 align-items-center">
        <div className="flex-grow-1">
          <div className="input-group input-group-lg">
            <span className="input-group-text bg-white border-end-0">
              <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} text-muted`}></i>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              defaultValue={searchTerm}
              onInput={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name or scan barcode..."
              className="form-control border-start-0 border-end-0 ps-0"
              style={{ fontSize: '1rem' }}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn btn-outline-secondary border-start-0" type="button" onClick={onClear} title="Clear search" aria-label="Clear search">
              <i className="fas fa-times"></i>
            </button>
          </div>
          {searchType && (
            <div className="small text-muted mt-1">
              <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : searchType === 'both' ? 'fa-search-plus' : 'fa-search'} me-1`}></i>
              {searchType === 'barcode' && 'Found by barcode scan'}
              {searchType === 'name' && 'Searched by name'}
              {searchType === 'both' && 'Found by barcode + name matches'}
            </div>
          )}
        </div>
        <button className="btn btn-lg px-4" onClick={onRefresh} style={{ ...CTA, minWidth: '120px' }} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2"></span>
              Syncing...
            </>
          ) : (
            <>
              <i className="fas fa-sync-alt me-2"></i>
              Refresh
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------
   Other presentational pieces
   ---------------------------- */
function ProductsGrid({ hasSearched, filteredProducts, searchTerm, isLikelyBarcode, cart, onQuantityChange, loadingProducts }) {
  const cartByProduct = cart.reduce((acc, item) => {
    const productId = item.id || item._id;
    if (!acc[productId]) acc[productId] = [];
    acc[productId].push(item);
    return acc;
  }, {});

  if (!hasSearched) {
    return (
      <div className="col-12">
        <div className="text-center py-5">
          <div className="mb-4">
            <i className="fas fa-search fa-3x text-muted mb-2"></i>
            <i className="fas fa-barcode fa-3x text-muted"></i>
            <i className="fas fa-shopping-cart fa-3x text-success"></i>
          </div>
          <h5 className="text-muted">Search for products or scan barcodes</h5>
          <p className="text-muted">
            Enter a product name to search or scan/type a barcode to automatically add items to your cart
            <br />
            <small className="text-success">
              <i className="fas fa-magic me-1"></i>
              <strong>Barcode scanner ready:</strong> Scan any barcode to instantly add items to your cart!
            </small>
          </p>
        </div>
      </div>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <div className="col-12">
        <div className="text-center py-5">
          <i className={`fas ${isLikelyBarcode(searchTerm) ? 'fa-barcode' : 'fa-exclamation-circle'} fa-3x text-muted mb-3`}></i>
          <h5 className="text-muted">
            {isLikelyBarcode(searchTerm) ? 'No product found with this barcode' : 'No products found'}
          </h5>
          <p className="text-muted">
            {isLikelyBarcode(searchTerm) ? `Barcode "${searchTerm}" not found in inventory` : 'Try a different search term or barcode'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {filteredProducts.map((product) => {
        const productId = product.id || product._id;
        const isLoading = loadingProducts.has(productId);
        const cartItems = cartByProduct[productId] || [];

        return (
          <div key={productId} className="col-6 col-sm-4 col-md-6 col-lg-4 col-xl-3 mb-3">
            <div style={{ position: 'relative' }}>
              <ProductCard 
                product={product} 
                cartItems={cartItems} 
                onQuantityChange={onQuantityChange} 
              />
              {isLoading && (
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '12px', zIndex: 10 }}>
                  <div className="spinner-border text-primary" style={{ width: '2rem', height: '2rem' }}>
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* NOTE: onRemoveItem now expects (cartKey, item) to provide maximum context */
function CartItems({ cart, onRemoveItem, KSH }) {
  if (cart.length === 0) {
    return (
      <div className="text-center py-5">
        <i className="fas fa-shopping-cart fa-3x text-muted mb-3"></i>
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
            <th style={{ fontSize: '0.8rem', width: '60px' }}></th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => {
            const itemPrice = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
            const itemTotal = itemPrice * (item.quantity || 1);
            const itemId = item.id || item._id;
            const cartKey = `${itemId}_${item.priceType}`;

            return (
              <tr key={cartKey}>
                <td style={{ fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="cart-product-name" title={item.name} style={{ fontSize: '1.01rem', fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className={`small ${item.priceType === 'Retail' ? 'text-success' : 'text-info'}`}>{KSH(itemPrice)}</div>
                    {item.barcode && <div className="text-muted" style={{ fontSize: '0.65rem' }}><i className="fas fa-barcode me-1"></i>{item.barcode}</div>}
                  </div>
                </td>
                <td className="text-center" style={{ fontSize: '0.7rem' }}>
                  <span className={`badge ${item.priceType === 'Retail' ? 'bg-success' : 'bg-info'} px-2 py-1`}>
                    {item.priceType === 'Retail' ? 'Retail' : 'Wholesale'}
                  </span>
                </td>
                <td className="text-center" style={{ fontSize: '0.75rem' }}>
                  <span className="badge bg-secondary px-2 py-1">{item.quantity || 1}</span>
                </td>
                <td className="text-end fw-semibold" style={{ fontSize: '0.75rem' }}>{KSH(itemTotal)}</td>
                <td className="text-center">
                  <button
                    className="remove-circle-btn"
                    onClick={() => onRemoveItem(cartKey, item)}
                    title={`Remove ${item.name} (${item.priceType})`}
                    aria-label={`Remove ${item.name}`}
                    type="button"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------
   Payment form
   ---------------------------- */
/* (PaymentForm unchanged from your original; omitted here for brevity in explanation but included below in code) */
function PaymentForm({ paymentType, setPaymentType, paymentData, setPaymentData, cartTotal, KSH, setCurrentOrderId }) {
  const cashActive = { backgroundColor: '#FF8C00', border: '2px solid #FF6600', color: '#fff' };
  const cashInactive = { backgroundColor: '#FFEBD6', border: '2px solid #FFA500', color: '#1f1f1f' };
  const mpesaActive = { backgroundColor: '#22B14C', border: '2px solid #16A335', color: '#fff' };
  const mpesaInactive = { backgroundColor: '#E6F8EA', border: '2px solid #22B14C', color: '#1f1f1f' };
  const bothActive = { backgroundColor: '#0056B3', border: '2px solid #004494', color: '#fff' };
  const bothInactive = { backgroundColor: '#E7F1FF', border: '2px solid #0078D4', color: '#1f1f1f' };

  return (
    <>
      <div className="mb-3">
        <div className="fw-semibold mb-2" style={{ fontSize: '0.95rem' }}>
          <i className="fas fa-credit-card me-2"></i>Payment Method
        </div>
        <div className="row g-2">
          <div className="col-4">
            <button
              type="button"
              className="btn w-100"
              onClick={() => {
                setPaymentType('cash');
                setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
                setCurrentOrderId(null);
              }}
              style={paymentType === 'cash' ? cashActive : cashInactive}
            >
              <i className="fas fa-money-bill-wave d-block mb-1" style={{ fontSize: '1.2rem' }}></i>
              Cash
            </button>
          </div>

          <div className="col-4">
            <button
              type="button"
              className="btn w-100"
              onClick={() => {
                setPaymentType('mpesa');
                setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
                setCurrentOrderId(null);
              }}
              style={paymentType === 'mpesa' ? mpesaActive : mpesaInactive}
            >
              <i className="fas fa-mobile-alt d-block mb-1" style={{ fontSize: '1.2rem' }}></i>
              M-Pesa
            </button>
          </div>

          <div className="col-4">
            <button
              type="button"
              className="btn w-100"
              onClick={() => {
                setPaymentType('both');
                setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
                setCurrentOrderId(null);
              }}
              style={paymentType === 'both' ? bothActive : bothInactive}
            >
              <i className="fas fa-exchange-alt d-block mb-1" style={{ fontSize: '1.2rem' }}></i>
              Hybrid
            </button>
          </div>
        </div>
      </div>

      {paymentType === 'cash' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Cash Amount Given</Form.Label>
          <div className="input-group input-group-lg">
            <span className="input-group-text">Ksh</span>
            <Form.Control
              type="number"
              value={paymentData.cashAmount}
              onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })}
              placeholder="Enter amount received"
              min={cartTotal}
              style={{ fontSize: '1.1rem' }}
            />
          </div>
          {paymentData.cashAmount && Number(paymentData.cashAmount) >= cartTotal && (
            <div className="mt-2 p-2 bg-success bg-opacity-10 rounded border-start border-success border-3">
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-success fw-semibold"><i className="fas fa-check-circle me-1"></i>Change:</span>
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
            <Form.Control
              type="tel"
              placeholder="254XXXXXXXXX"
              value={paymentData.mpesaPhone}
              onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })}
              style={{ fontSize: '1.1rem' }}
            />
          </div>
        </Form.Group>
      )}

      {paymentType === 'both' && (
        <div>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold"><i className="fas fa-money-bill-wave me-2"></i>Cash Amount</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">Ksh</span>
              <Form.Control
                type="number"
                value={paymentData.cashAmount}
                onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })}
                placeholder="Enter cash amount"
                min={0}
                style={{ fontSize: '1.1rem' }}
              />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold"><i className="fas fa-mobile-alt me-2"></i>M-Pesa Amount</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">Ksh</span>
              <Form.Control
                type="number"
                value={paymentData.mpesaAmount}
                onChange={(e) => setPaymentData({ ...paymentData, mpesaAmount: e.target.value })}
                placeholder="Enter M-Pesa amount"
                min={0}
                style={{ fontSize: '1.1rem' }}
              />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">M-Pesa Phone Number</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">📱</span>
              <Form.Control
                type="tel"
                placeholder="2547XXXXXXXX"
                value={paymentData.mpesaPhone}
                onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })}
                style={{ fontSize: '1.1rem' }}
              />
            </div>
          </Form.Group>

          {(paymentData.cashAmount || paymentData.mpesaAmount) && (
            <div className="alert alert-info py-2 mb-3">
              <div className="d-flex justify-content-between"><span>Cash:</span><span>{KSH(Number(paymentData.cashAmount) || 0)}</span></div>
              <div className="d-flex justify-content-between"><span>M-Pesa:</span><span>{KSH(Number(paymentData.mpesaAmount) || 0)}</span></div>
              <hr className="my-1" />
              <div className="d-flex justify-content-between fw-semibold">
                <span>Total Payment:</span>
                <span className={((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) >= cartTotal ? 'text-success' : 'text-danger'}>
                  {KSH((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0))}
                </span>
              </div>
              {((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) >= cartTotal && ((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) > cartTotal && (
                <div className="d-flex justify-content-between text-success"><span>Change:</span><span>{KSH(((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) - cartTotal)}</span></div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ----------------------------
   Main POS component
   ---------------------------- */
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

  const dispatch = useDispatch();
  const cart = useSelector(selectCart);
  const cartItemCount = useSelector(selectCartItemCount);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  const searchInputRef = useRef(null);
  const scannerRef = useRef({ buffer: '', firstTime: 0, lastTime: 0, timer: null });

  const getInventoryId = useCallback((product) => {
    return (
      product.inventoryId ||
      product.inventory?.id ||
      product.inventory?._id ||
      product.inventory_id ||
      product.invId ||
      product.inventoryIdString ||
      null
    );
  }, []);

  const isLikelyBarcode = useCallback((term) => {
    if (!term) return false;
    const numericOnly = /^\d+$/.test(term.trim());
    const length = term.trim().length;
    return numericOnly && (length >= 8 && length <= 20);
  }, []);

  const setProductLoading = (productId, isLoading) => {
    setLoadingProducts(prev => {
      const newSet = new Set(prev);
      if (isLoading) newSet.add(productId);
      else newSet.delete(productId);
      return newSet;
    });
  };

  const calculateCartTotal = useCallback(() => {
    return cart.reduce((total, item) => {
      const price = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
      return total + (price * (item.quantity || 1));
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

  /* Barcode scanner capture - only when target is not an input */
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
            // Reset scanner state
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
    if (navigator && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { timeout: 3000 }
      );
    }
  }, []);

   useEffect(() => {
    const handleCheckoutEnter = (e) => {
      if (e.key !== 'Enter') return;
      if (!paymentType) return;
      if (cart.length === 0) return;
      if (processingOrder) return;

      // Prevent any default form submission / input side-effects
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) { /* ignore */ }

      // Trigger the appropriate flow
      if (paymentType === 'both') {
        // Create hybrid order
        createOrder();
      } else {
        // Complete single-method checkout
        completeCheckout();
      }
    };

    window.addEventListener('keydown', handleCheckoutEnter);
    return () => window.removeEventListener('keydown', handleCheckoutEnter);
  }, [paymentType, cart.length, paymentData, processingOrder]);

  const performSearch = useCallback(async (term) => {
    if (!term || term.trim().length === 0) {
      setFilteredProducts([]);
      setHasSearched(false);
      setSearchType('');
      return;
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
          const productId = product.id || product._id;
          const exists = allResults.find(p => (p.id || p._id) === productId);
          if (!exists) allResults.push(product);
        });

        if (!foundByBarcode) setSearchType('name');
        else setSearchType('both');
      }

      setFilteredProducts(allResults);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
      setFilteredProducts([]);
      setSearchType('');
    }
  }, [isLikelyBarcode]);

  const debouncedSearch = useDebouncedCallback(performSearch, 300);
  useEffect(() => { debouncedSearch(searchTerm); }, [searchTerm, debouncedSearch]);

  /* OPTIMIZED: Fast focus without retries or delays */
  const focusSearchInput = useCallback(() => {
    const el = searchInputRef.current;
    if (el && typeof el.focus === 'function') {
      try {
        el.focus({ preventScroll: true });
      } catch (err) {
        // Fail silently
      }
    }
  }, []);

  /* OPTIMIZED: Batch clear operation with minimal re-renders */
  const clearSearchAndProducts = useCallback(() => {
    // Clear DOM input immediately
    if (searchInputRef.current) {
      try { searchInputRef.current.value = ''; } catch (e) {}
    }

    // Batch state updates
    setSearchTerm('');
    setFilteredProducts([]);
    setHasSearched(false);
    setSearchType('');

    // Non-blocking focus
    requestAnimationFrame(() => {
      try {
        if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
        else focusSearchInput();
      } catch (e) {}
    });
  }, [focusSearchInput]);

  /* Clear cart flow - immediate (no alert) */
  const handleClearCart = useCallback(() => {
    if (cartItemCount === 0) {
      toast.info('Cart is already empty');
      // ensure focus
      requestAnimationFrame(() => {
        try {
          if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
        } catch (e) {}
      });
      return;
    }

    dispatch(clearCart());
    toast.success('Cart cleared');

    // Batch state updates
    setCurrentOrderId(null);
    setPaymentType('');
    setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });

    // Clear and focus the search input non-blocking
    requestAnimationFrame(() => {
      try {
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
          searchInputRef.current.focus({ preventScroll: true });
        } else {
          focusSearchInput();
        }
      } catch (e) {}
    });
  }, [cartItemCount, dispatch, focusSearchInput]);

  /* Barcode scanned handler */
  const handleBarcodeScanned = async (barcode) => {
    try {
      const product = await indexedDb.getProductByBarcode(barcode);
      if (!product) {
        toast.error(`No product found with barcode: ${barcode}`);
        return;
      }

      const priceType = await new Promise((resolve) => {
        const retailPrice = product.price || 0;
        const wholesalePrice = product.priceAfterDiscount || product.price || 0;

        const result = window.confirm(
          `Select price type for "${product.name}":\n\n` +
          `Click OK for Retail (${KSH(retailPrice)})\n` +
          `Click Cancel for Wholesale (${KSH(wholesalePrice)})`
        );
        resolve(result ? 'Retail' : 'Discounted');
      });

      await handleQuantityChange(product.id || product._id, priceType, 1, product);

      setFilteredProducts([product]);
      setHasSearched(true);
      setSearchType('barcode');

      // Clear input and focus
      if (searchInputRef.current) {
        try { searchInputRef.current.value = ''; } catch (e) {}
      }
      setSearchTerm('');

      requestAnimationFrame(() => {
        focusSearchInput();
      });
    } catch (error) {
      console.error('Barcode scan error:', error);
      toast.error(`Failed to process barcode: ${error?.message || 'Unexpected error'}`);
      setLoadingProducts(prev => {
        const newSet = new Set(prev);
        newSet.clear();
        return newSet;
      });
    }
  };

  /* Quantity change flow */
  const handleQuantityChange = async (productId, priceType, newQuantity, productData = null) => {
    try {
      const product = productData || filteredProducts.find(p => (p.id || p._id) === productId);
      if (!product) {
        toast.error('Product not found');
        return;
      }

      const existingCartItem = cart.find(item =>
        (item.id || item._id) === productId && item.priceType === priceType
      );

      if (newQuantity === 0) {
        if (existingCartItem) {
          const cartItemId = `${productId}_${priceType}`;
          // Use composite key removal (used elsewhere) — keep for compatibility.
          dispatch(removeItemFromCart(cartItemId));
          // try alternative shapes (some reducers expect different payloads)
          try { dispatch(removeItemFromCart({ id: cartItemId })); } catch (e) {}
          try { dispatch(removeItemFromCart({ productId, priceType })); } catch (e) {}
          try { dispatch(updateCartItemQuantity({ productId, quantity: 0 })); } catch (e) {}
          toast.success('Removed from cart');

          // focus input after remove
          requestAnimationFrame(() => {
            try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {}
          });
        }
        return;
      }

      const currentCartQty = existingCartItem ? existingCartItem.quantity : 0;
      const inventoryId = getInventoryId(product);

      if (!inventoryId) {
        toast.error('Cannot validate stock - inventory ID missing');
        return;
      }

      setProductLoading(productId, true);

      if (newQuantity > currentCartQty) {
        const qtyToAdd = newQuantity - currentCartQty;

        try {
          const validation = await validateAndAddToCart({
            productId,
            inventoryId,
            qty: qtyToAdd,
            currentCartQty
          });

          if (validation.status === 'conflict' || validation.status === 'error') {
            toast.error(validation.message);
            setProductLoading(productId, false);
            return;
          }

          if (validation.status === 'warning') {
            toast.warning(validation.message);
          }
        } catch (validationError) {
          console.warn('Stock validation failed, proceeding anyway:', validationError);
        }
      } else {
        try {
          const validation = await validateCartQuantityChange({
            productId,
            inventoryId,
            newQty: newQuantity,
            currentCartQty
          });

          if (validation.status === 'conflict' || validation.status === 'error') {
            toast.error(validation.message);
            setProductLoading(productId, false);
            return;
          }
        } catch (validationError) {
          console.warn('Cart quantity validation failed, proceeding anyway:', validationError);
        }
      }

      if (existingCartItem) {
        dispatch(updateCartItemQuantity({ productId: productId, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        dispatch(addItemToCart({
          product: {
            ...product,
            id: productId,
            priceType: priceType,
            price: product.price,
            priceAfterDiscount: product.priceAfterDiscount
          },
          quantity: newQuantity
        }));
        toast.success(`Added to cart (${priceType === 'Retail' ? 'Retail' : 'Wholesale'})`);
      }

      setProductLoading(productId, false);

      // Non-blocking focus
      requestAnimationFrame(() => {
        try {
          if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
          else focusSearchInput();
        } catch (e) {}
      });
    } catch (error) {
      console.error('handleQuantityChange error:', error);
      toast.error(`Failed to update cart: ${error?.message || 'Unexpected error'}`);
      setProductLoading(productId, false);
    }
  };

  /**
   * Hardened removal handler.
   * Accepts cartKey (composite) and the full item object for context.
   * Tries multiple payload shapes to satisfy different reducer shapes.
   * Also tries updateCartItemQuantity({ productId, quantity: 0 }) as a fallback.
   */
  const handleRemoveItem = (cartKey, item) => {
    if (!cartKey) {
      toast.error('Invalid cart item key');
      return;
    }

    const productId = item?.id || item?._id || null;
    const priceType = item?.priceType || (cartKey.includes('_') ? cartKey.split('_').slice(-1)[0] : null);

    console.info('handleRemoveItem invoked', { cartKey, productId, priceType, item });

    try {
      // 1) Try the most likely shape: composite string key
      try {
        dispatch(removeItemFromCart(cartKey));
        console.debug('Dispatched removeItemFromCart(cartKey)', cartKey);
      } catch (e) {
        console.warn('removeItemFromCart(cartKey) failed:', e);
      }

      // 2) Try object with id field
      try {
        dispatch(removeItemFromCart({ id: cartKey }));
        console.debug('Dispatched removeItemFromCart({ id: cartKey })', cartKey);
      } catch (e) {
        console.warn('removeItemFromCart({ id }) failed:', e);
      }

      // 3) Try object with productId and priceType
      if (productId && priceType) {
        try {
          dispatch(removeItemFromCart({ productId, priceType }));
          console.debug('Dispatched removeItemFromCart({ productId, priceType })', { productId, priceType });
        } catch (e) {
          console.warn('removeItemFromCart({ productId, priceType }) failed:', e);
        }
      }

      // 4) Fallback: attempt updating quantity to 0 (some reducers use update action)
      if (productId) {
        try {
          dispatch(updateCartItemQuantity({ productId, quantity: 0 }));
          console.debug('Dispatched updateCartItemQuantity({ productId, quantity: 0 })', { productId });
        } catch (e) {
          console.warn('updateCartItemQuantity fallback failed:', e);
        }
      }

      // 5) Try remove by raw productId (some implementations expect that)
      if (productId) {
        try {
          dispatch(removeItemFromCart(productId));
          console.debug('Dispatched removeItemFromCart(productId)', productId);
        } catch (e) {
          console.warn('removeItemFromCart(productId) failed:', e);
        }
      }

      toast.success('Item removed from cart');
    } catch (err) {
      console.error('Failed to remove item:', err);
      toast.error('Failed to remove item');
    } finally {
      // Focus input non-blocking to avoid UI "freeze"
      requestAnimationFrame(() => {
        try { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); } catch (e) {}
      });
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


const handleOrderCompletion = async (orderData) => {
  toast.success('Order completed');

  // Build normalized cart items
  const receiptItems = cart.map(ci => {
    const sellingPrice = ci.priceType === 'Retail'
      ? (ci.price || 0)
      : (ci.priceAfterDiscount || ci.price || 0);
    const quantity = ci.quantity || 1;
    const lineTotal = sellingPrice * quantity;

    return {
      name: ci.name || ci.productName || 'Item',
      productName: ci.name || ci.productName || 'Item',
      salePrice: sellingPrice,
      sellingPrice: sellingPrice,
      price: sellingPrice,
      quantity: quantity,
      qty: quantity,
      lineTotal: lineTotal,
      total: lineTotal,
      priceType: ci.priceType,
      barcode: ci.barcode || ''
    };
  });

  const cartTotalFromLines = receiptItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
  const currentCartTotal = calculateCartTotal();

  // FIX: Access user[0] since user is an array!
  const actualUser = Array.isArray(user) ? user[0] : user;

  // Build cashier name with comprehensive fallbacks - using actualUser
  const getCashierName = () => {
    if (!actualUser) return 'Staff';
    
    // Try fullName variations
    if (actualUser.fullName && actualUser.fullName.trim()) return actualUser.fullName.trim();
    if (actualUser.full_name && actualUser.full_name.trim()) return actualUser.full_name.trim();
    if (actualUser.name && actualUser.name.trim()) return actualUser.name.trim();
    
    // Try first + last name (matches your dashboard: firstName + lastName)
    const firstName = (actualUser.firstName || actualUser.first_name || '').trim();
    const lastName = (actualUser.lastName || actualUser.last_name || '').trim();
    if (firstName || lastName) {
      const combined = `${firstName} ${lastName}`.trim();
      if (combined) return combined;
    }
    
    // Try username variations
    if (actualUser.userName && actualUser.userName.trim()) return actualUser.userName.trim();
    if (actualUser.username && actualUser.username.trim()) return actualUser.username.trim();
    
    // Try email as last resort
    if (actualUser.email && actualUser.email.trim()) return actualUser.email.trim();
    
    return 'Staff';
  };

  const cashierName = getCashierName();
  console.log('Cashier name resolved to:', cashierName, 'from actualUser:', actualUser);

  // Store settings
  const storeSettings = {
    storeName: 'ARPELLA STORE LIMITED',
    storeAddress: 'Ngong, Matasia',
    storePhone: '+254 7xx xxx xxx',
    pin: 'P052336649L',
    receiptFooter: 'Thank you for your business!'
  };

  // Calculate payment amounts and change
  const calculatePaymentDetails = () => {
    const paymentInfo = {
      cashAmount: 0,
      mpesaAmount: 0,
      change: 0
    };

    if (paymentType === 'cash') {
      paymentInfo.cashAmount = Number(paymentData.cashAmount) || 0;
      paymentInfo.change = Math.max(0, paymentInfo.cashAmount - currentCartTotal);
    } else if (paymentType === 'mpesa') {
      paymentInfo.mpesaAmount = Number(paymentData.mpesaAmount) || currentCartTotal;
    } else if (paymentType === 'both') {
      paymentInfo.cashAmount = Number(paymentData.cashAmount) || 0;
      paymentInfo.mpesaAmount = Number(paymentData.mpesaAmount) || 0;
      const totalPaid = paymentInfo.cashAmount + paymentInfo.mpesaAmount;
      paymentInfo.change = Math.max(0, totalPaid - currentCartTotal);
    }

    return paymentInfo;
  };

  const paymentDetails = calculatePaymentDetails();

  // Build COMPLETE and NORMALIZED user object - using actualUser
  const normalizedUser = {
    // Primary identifiers
    id: actualUser?.id || actualUser?._id || actualUser?.userId || null,
    
    // Name fields - provide ALL variations
    fullName: cashierName,
    full_name: cashierName,
    name: cashierName,
    firstName: actualUser?.firstName || actualUser?.first_name || '',
    first_name: actualUser?.firstName || actualUser?.first_name || '',
    lastName: actualUser?.lastName || actualUser?.last_name || '',
    last_name: actualUser?.lastName || actualUser?.last_name || '',
    
    // Username fields
    userName: actualUser?.userName || actualUser?.username || cashierName,
    username: actualUser?.userName || actualUser?.username || cashierName,
    
    // Contact fields
    phone: actualUser?.phone || actualUser?.phoneNumber || actualUser?.mobile || '',
    phoneNumber: actualUser?.phone || actualUser?.phoneNumber || actualUser?.mobile || '',
    email: actualUser?.email || ''
  };

  console.log('Normalized user object:', normalizedUser);

  // Build complete receipt data with ALL required fields
  const receiptData = {
    // Cart data
    cart: receiptItems,
    cartTotal: Number.isFinite(cartTotalFromLines) && cartTotalFromLines >= 0
      ? cartTotalFromLines
      : currentCartTotal,
    
    // Payment data
    paymentType: paymentType || 'cash',
    paymentData: paymentDetails,
    
    // User data - provide BOTH 'user' and 'cashier' fields
    user: normalizedUser,
    cashier: normalizedUser, // Alias for compatibility
    
    // Order identifiers
    orderNumber: orderData?.orderNumber || 
                 orderData?.orderId || 
                 orderData?.orderid || 
                 orderData?.id ||
                 `ORD-${Date.now().toString().slice(-6)}`,
    orderId: orderData?.orderNumber || 
             orderData?.orderId || 
             orderData?.orderid || 
             orderData?.id ||
             `ORD-${Date.now().toString().slice(-6)}`,
    
    // Customer info
    customerPhone: (paymentType === 'mpesa' || paymentType === 'both')
      ? (paymentData.mpesaPhone || '').trim() || 'Walk-in'
      : 'Walk-in',
    
    // Store settings
    storeSettings: storeSettings
  };

  console.log('Complete receipt data being sent:', {
    cartItems: receiptData.cart.length,
    cartTotal: receiptData.cartTotal,
    paymentType: receiptData.paymentType,
    cashierName: receiptData.user.fullName,
    orderNumber: receiptData.orderNumber
  });

  // Clear cart and state BEFORE async printing
  dispatch(clearCart());
  setPaymentType('');
  setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
  setCurrentOrderId(null);
  setProcessingOrder(false);
  clearSearchAndProducts();

  // Show change info if applicable
  if (paymentDetails.change > 0) {
    toast.info(`Change: ${KSH(paymentDetails.change)}`, {
      autoClose: 5000,
      position: 'top-center'
    });
  }

  // Call the thermal printer function
  try {
    console.log('Calling printOrderReceipt with receiptData...');
    const res = await printOrderReceipt(receiptData, null, storeSettings);
    
    if (res?.success) {
      toast.success('Receipt printed successfully');
      console.log('Print success:', res);
    } else {
      toast.warning(`Receipt printing: ${res?.message || 'failed'}`);
      console.warn('Print warning:', res);
    }
  } catch (err) {
    console.error('Async print error:', err);
    toast.error('Receipt printing failed - check console for details');
  }
};
  const createOrder = async () => {
    if (!paymentType) {
      toast.error('Please select a payment method');
      return;
    }

    const currentCartTotal = calculateCartTotal();

    if (paymentType === 'both') {
      const cashVal = Number(paymentData.cashAmount) || 0;
      const mpesaVal = Number(paymentData.mpesaAmount) || 0;

      if (!paymentData.mpesaPhone || paymentData.mpesaPhone.trim().length === 0) {
        toast.error('Please enter M-Pesa phone number');
        return;
      }

      if (mpesaVal <= 0) {
        toast.error('Please enter a valid M-Pesa amount');
        return;
      }

      if ((cashVal + mpesaVal) < currentCartTotal) {
        toast.error('Total payment amount must be >= cart total');
        return;
      }
    }

    const payload = {
      buyerPin: 'N/A',
      orderSource: "POS",
      latitude: coords?.lat ?? 0,
      longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({
        productId: Number(ci.id || ci._id),
        quantity: ci.quantity,
        priceType: ci.priceType
      })),
      orderPaymentType: paymentType === 'cash' ? 'Cash' : paymentType === 'mpesa' ? 'Mpesa' : 'Hybrid',
      phoneNumber: paymentType === 'mpesa' || paymentType === 'both' ? (paymentData.mpesaPhone || '').trim() : (user && user.phone) || 'N/A'
    };

    if (paymentType === 'both') {
      payload.total = Number(paymentData.mpesaAmount) || 0;
      payload.cashAmount = Number(paymentData.cashAmount) || 0;
      payload.userId = (user && (user.phone || user.userName)) || '';
    }

    if (paymentType === 'mpesa') {
      payload.userId = (user && (user.phone || user.userName)) || '';
    }

    if (paymentType === 'cash') {
      payload.cashAmount = Number(paymentData.cashAmount) || 0;
    }

    try {
      setProcessingOrder(true);
      toast.info('Creating order...');

      const res = await api.post('/order', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      if (orderId) {
        setCurrentOrderId(orderId);
        toast.success(`Order created. ID: ${orderId}`);

        if (paymentType !== 'both') {
          await handleOrderCompletion(res.data);
        } else {
          toast.info('Hybrid order created. Confirm M-Pesa payment.');
        }
      } else {
        toast.success('Order created.');
        if (paymentType !== 'both') {
          await handleOrderCompletion(res.data);
        }
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Order failed';
      toast.error(msg);
      setProcessingOrder(false);
    }
  };

  const completeCheckout = async () => {
    if (!paymentType) {
      toast.error('Please select a payment method');
      return;
    }

    const currentCartTotal = calculateCartTotal();

    if (paymentType === 'cash') {
      const cashVal = Number(paymentData.cashAmount);
      if (!paymentData.cashAmount || Number.isNaN(cashVal) || cashVal < currentCartTotal) {
        toast.error('Please enter a valid cash amount (>= total)');
        return;
      }
    }

    if (paymentType === 'mpesa' && (!paymentData.mpesaPhone || paymentData.mpesaPhone.trim().length === 0)) {
      toast.error('Please enter M-Pesa phone number');
      return;
    }

    const payload = {
      buyerPin: 'N/A',
      orderSource: "POS",
      latitude: coords?.lat ?? 0,
      longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({
        productId: Number(ci.id || ci._id),
        quantity: ci.quantity,
        priceType: ci.priceType
      })),
      orderPaymentType: paymentType === 'cash' ? 'Cash' : 'Mpesa',
      phoneNumber: paymentType === 'mpesa' ? paymentData.mpesaPhone.trim() : (user && user.phone) || 'N/A'
    };

    if (paymentType === 'mpesa') {
      payload.userId = (user && (user.phone || user.userName)) || '';
    }

    if (paymentType === 'cash') {
      payload.cashAmount = Number(paymentData.cashAmount) || 0;
    }

    try {
      setProcessingOrder(true);
      toast.info(paymentType === 'mpesa' ? 'Creating M-Pesa order...' : 'Processing payment...');

      const res = await api.post('/order', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      if (paymentType === 'mpesa') {
        if (orderId) {
          setCurrentOrderId(orderId);
          toast.success(`M-Pesa order created. ID: ${orderId}`);
        } else {
          toast.success('M-Pesa order created.');
        }
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
    if (!currentOrderId) {
      toast.error('No order ID to check');
      return;
    }

    try {
      setCheckingPayment(true);
      toast.info('Checking payment status...');

      let paid = false;
      let remoteData = null;

      try {
        const response = await api.get(`/payments/${currentOrderId}`);
        remoteData = response?.data || {};

        if (paymentType === 'mpesa') {
          const statusVal = remoteData?.status || remoteData?.paymentStatus || remoteData?.state || null;
          if (statusVal && String(statusVal).toLowerCase() === 'completed') {
            paid = true;
          }
        } else {
          if (remoteData.paid === true ||
              String(remoteData.paymentStatus || '').toLowerCase() === 'paid' ||
              String(remoteData.status || '').toLowerCase() === 'paid' ||
              String(remoteData.status || '').toLowerCase() === 'completed') {
            paid = true;
          }
        }
      } catch (err) {
        console.warn('/payments check failed:', err?.message || err);
      }

      if (!paid) {
        try {
          const orderResp = await api.get(`/order/${currentOrderId}`);
          const od = orderResp?.data || {};

          if (paymentType === 'mpesa') {
            const statusVal = od?.status || od?.paymentStatus || (od.payment && od.payment.status) || null;
            if (statusVal && String(statusVal).toLowerCase() === 'completed') {
              paid = true;
            }
          } else {
            if (od && (od.paid === true || String(od.status || '').toLowerCase() === 'paid' || String(od.paymentStatus || '').toLowerCase() === 'paid')) {
              paid = true;
            } else if (od && od.payment && (od.payment.paid === true || String(od.payment.status || '').toLowerCase() === 'paid')) {
              paid = true;
            }
          }
        } catch (err) {
          console.warn('/order check failed:', err?.message || err);
        }
      }

      if (paid) {
        toast.success('Payment confirmed');
        await handleOrderCompletion({ orderNumber: currentOrderId });
      } else {
        toast.warning('Payment not confirmed yet');
      }
    } catch (err) {
      console.error('Payment check failed:', err);
      toast.error('Payment check failed');
    } finally {
      setCheckingPayment(false);
    }
  };

  const currentCartTotal = calculateCartTotal();

  /* ----------------------------
     Render
     ---------------------------- */
  return (
    <div className="container-fluid py-4" style={{ background: '#f8f9fa', minHeight: '100vh', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="row h-100" style={{ minHeight: 'calc(100vh - 2rem)' }}>
        <div className="col-xl-4 col-lg-5 col-md-6 col-12 mb-4">
          <SearchHeader
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            searchType={searchType}
            loading={loading}
            onRefresh={refresh}
            onClear={clearSearchAndProducts}
            searchInputRef={searchInputRef}
          />

          <div className="products-container" style={{ height: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: '10px' }}>
            <div className="row">
              <ProductsGrid
                hasSearched={hasSearched}
                filteredProducts={filteredProducts}
                searchTerm={searchTerm}
                isLikelyBarcode={isLikelyBarcode}
                cart={cart}
                onQuantityChange={handleQuantityChange}
                loadingProducts={loadingProducts}
              />
            </div>

            {hasSearched && filteredProducts.length > 0 && (
              <div className="row mt-3">
                <div className="col-12">
                  <div className="text-center text-muted">
                    <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} me-1`}></i>
                    Found {filteredProducts.length} products for "{searchTerm}"
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-xl-8 col-lg-7 col-md-6 col-12">
          <div className="cart-sidebar h-100 bg-white rounded-3 shadow-sm p-4 position-sticky" style={{ top: '20px', maxHeight: 'calc(100% - 150px)', display: 'flex', flexDirection: 'column' }}>
            <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
              <h5 className="fw-semibold mb-0 d-flex align-items-center">
                <i className="fas fa-shopping-cart me-2"></i>
                Cart
                {cartItemCount > 0 && <span className="badge bg-primary ms-2">{cartItemCount} items</span>}
              </h5>
              {cartItemCount > 0 && (
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={handleClearCart}
                  title="Clear all items"
                  aria-label="Clear cart"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <i className="fas fa-trash"></i>
                  Clear
                </button>
              )}
            </div>

            <div className="cart-items flex-grow-1" style={{ overflowY: 'auto', marginBottom: '20px' }}>
              <CartItems cart={cart} onRemoveItem={handleRemoveItem} KSH={KSH} />
            </div>

            {cart.length > 0 && (
              <div className="cart-checkout border-top pt-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-bold fs-4"><i className="fas fa-shopping-bag me-1"></i>Total:</span>
                  <span className="fw-bold fs-3 text-success">{KSH(currentCartTotal)}</span>
                </div>

                <PaymentForm
                  paymentType={paymentType}
                  setPaymentType={setPaymentType}
                  paymentData={paymentData}
                  setPaymentData={setPaymentData}
                  cartTotal={currentCartTotal}
                  KSH={KSH}
                  setCurrentOrderId={setCurrentOrderId}
                />

                {currentOrderId && (paymentType === 'mpesa' || paymentType === 'both') && (
                  <div className="alert alert-warning py-2 mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div><i className="fas fa-clock me-2"></i><small>Order ID: <strong>{currentOrderId}</strong></small></div>
                      <div>
                        <Button variant="outline-success" size="sm" onClick={checkPaymentStatus} disabled={checkingPayment}>
                          {checkingPayment ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2"></span>
                              Checking...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-check-circle me-2"></i>
                              Confirm
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="text-center mt-2 small text-muted">Confirm payment to finalize order</div>
                  </div>
                )}

                <Button
                  style={{ ...CTA, width: '100%', padding: '14px', fontSize: '1.1rem', fontWeight: '600' }}
                  onClick={paymentType === 'both' ? createOrder : completeCheckout}
                  disabled={!paymentType || processingOrder}
                  size="lg"
                >
                  {processingOrder ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check me-2"></i>
                      {paymentType === 'both' ? 'Create Order' : 'Complete Order'} - {KSH(currentCartTotal)}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .search-header-fixed {
          position: sticky;
          top: 0;
          background: #f8f9fa;
          z-index: 100;
          padding-bottom: 10px;
        }
        .table-hover tbody tr:hover { background-color: rgba(0, 123, 255, 0.05); }
        .btn-outline-danger:hover { transform: scale(1.03); }
        .product-card:hover { border-color: #007bff !important; }
        .form-control:focus { border-color: #007bff; box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25); }
        .product-card .text-muted.small { opacity: 0.7; transition: opacity 0.2s; }
        .product-card:hover .text-muted.small { opacity: 1; }
        .cart-sidebar { border: 1px solid #e9ecef; }
        .cart-items { min-height: 200px; }
        .cart-items::-webkit-scrollbar { width: 6px; }
        .cart-items::-webkit-scrollbar-track { background: #f8f9fa; border-radius: 3px; }
        .cart-items::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 3px; }
        .cart-items::-webkit-scrollbar-thumb:hover { background: #ced4da; }
        .products-container::-webkit-scrollbar { width: 8px; }
        .products-container::-webkit-scrollbar-track { background: #f8f9fa; border-radius: 4px; }
        .products-container::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 4px; }
        .products-container::-webkit-scrollbar-thumb:hover { background: #ced4da; }

        /* Remove circle button (red border with 'x') */
        .remove-circle-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 1px solid #dc3545;
          background: transparent;
          color: #dc3545;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          line-height: 1;
          padding: 0;
          cursor: pointer;
        }
        .remove-circle-btn:hover {
          background: #dc3545;
          color: #fff;
        }

        /* Cart product name truncation/ellipsis */
        .cart-product-name {
          max-width: 100%;
          display: inline-block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media (max-width: 1199.98px) {
          .cart-sidebar { position: relative !important; max-height: none !important; margin-top: 20px; }
        }

        @media (min-width: 1200px) {
          .col-xl-4 { flex: 0 0 40%; max-width: 40%; }
          .col-xl-8 { flex: 0 0 60%; max-width: 60%; }
        }
      `}</style>
    </div>
  );
}
