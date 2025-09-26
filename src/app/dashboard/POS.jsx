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
  selectCartTotal,
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
const KSH = (amt) => `Ksh ${Number(amt).toLocaleString()}`;

// Custom hook for debounced callbacks
function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), wait);
  }, [fn, wait]);
}

// ProductCard Component - FIXED for wholesale/retail
function ProductCard({ product, cartItems, onQuantityChange }) {
  const productId = product.id || product._id;
  const retailPrice = product.price || 0;
  const wholesalePrice = product.priceAfterDiscount || product.price || 0;
  
  // FIXED: Get cart quantities for both price types with proper filtering
  const retailCartItem = cartItems.find(item => 
    (item.id || item._id) === productId && item.priceType === 'Retail'
  );
  const wholesaleCartItem = cartItems.find(item => 
    (item.id || item._id) === productId && item.priceType === 'Discounted'
  );
  
  const retailQuantity = retailCartItem ? retailCartItem.quantity : 0;
  const wholesaleQuantity = wholesaleCartItem ? wholesaleCartItem.quantity : 0;

  // FIXED: Handlers now properly pass the productId
  const handleRetailIncrement = () => {
    console.log('Retail increment for product:', productId, 'current qty:', retailQuantity);
    onQuantityChange(productId, 'Retail', retailQuantity + 1);
  };
  
  const handleRetailDecrement = () => {
    console.log('Retail decrement for product:', productId, 'current qty:', retailQuantity);
    if (retailQuantity > 1) {
      onQuantityChange(productId, 'Retail', retailQuantity - 1);
    } else if (retailQuantity === 1) {
      onQuantityChange(productId, 'Retail', 0);
    }
  };
  
  const handleRetailAddToCart = () => {
    console.log('Adding retail for product:', productId);
    onQuantityChange(productId, 'Retail', 1);
  };

  const handleWholesaleIncrement = () => {
    console.log('Wholesale increment for product:', productId, 'current qty:', wholesaleQuantity);
    onQuantityChange(productId, 'Discounted', wholesaleQuantity + 1);
  };
  
  const handleWholesaleDecrement = () => {
    console.log('Wholesale decrement for product:', productId, 'current qty:', wholesaleQuantity);
    if (wholesaleQuantity > 1) {
      onQuantityChange(productId, 'Discounted', wholesaleQuantity - 1);
    } else if (wholesaleQuantity === 1) {
      onQuantityChange(productId, 'Discounted', 0);
    }
  };
  
  const handleWholesaleAddToCart = () => {
    console.log('Adding wholesale for product:', productId);
    onQuantityChange(productId, 'Discounted', 1);
  };

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
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm" style={{ fontSize: '0.9rem', minHeight: '2.4rem' }}>
          {product.name}
        </h6>
        
        {/* Price Display */}
        <div className="mb-2">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="small text-muted">Retail:</span>
            <span className="fw-bold text-success" style={{ fontSize: '0.9rem' }}>
              {KSH(retailPrice)}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <span className="small text-muted">Wholesale:</span>
            <span className="fw-bold text-info" style={{ fontSize: '0.9rem' }}>
              {KSH(wholesalePrice)}
            </span>
          </div>
        </div>
        
        {product.barcode && (
          <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-barcode me-1"></i>
            {product.barcode}
          </div>
        )}
      </div>

      {/* Retail Controls */}
      <div className="mb-2">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-success">Retail</span>
          {retailQuantity > 0 && (
            <span className="badge bg-success">{retailQuantity}</span>
          )}
        </div>
        {retailQuantity > 0 ? (
          <div className="d-flex align-items-center justify-content-center">
            <button
              className="btn btn-outline-success btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleRetailDecrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
            >
              <i className="fas fa-minus" style={{ fontSize: '0.7rem' }}></i>
            </button>
            <div className="mx-2 fw-bold text-center" style={{ minWidth: '25px', fontSize: '0.9rem', color: '#495057' }}>
              {retailQuantity}
            </div>
            <button
              className="btn btn-outline-success btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleRetailIncrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
            >
              <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-success btn-sm w-100 rounded-pill"
            onClick={handleRetailAddToCart}
            style={{ fontWeight: '600', fontSize: '0.75rem', padding: '6px 12px' }}
            type="button"
          >
            <i className="fas fa-plus me-1"></i>
            Add Retail
          </button>
        )}
      </div>

      {/* Wholesale Controls */}
      <div className="wholesale-controls">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-info">Wholesale</span>
          {wholesaleQuantity > 0 && (
            <span className="badge bg-info">{wholesaleQuantity}</span>
          )}
        </div>
        {wholesaleQuantity > 0 ? (
          <div className="d-flex align-items-center justify-content-center">
            <button
              className="btn btn-outline-info btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleWholesaleDecrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
            >
              <i className="fas fa-minus" style={{ fontSize: '0.7rem' }}></i>
            </button>
            <div className="mx-2 fw-bold text-center" style={{ minWidth: '25px', fontSize: '0.9rem', color: '#495057' }}>
              {wholesaleQuantity}
            </div>
            <button
              className="btn btn-outline-info btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleWholesaleIncrement}
              style={{ width: '28px', height: '28px', padding: '0' }}
              type="button"
            >
              <i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-info btn-sm w-100 rounded-pill"
            onClick={handleWholesaleAddToCart}
            style={{ fontWeight: '600', fontSize: '0.75rem', padding: '6px 12px' }}
            type="button"
          >
            <i className="fas fa-plus me-1"></i>
            Add Wholesale
          </button>
        )}
      </div>
    </div>
  );
}

// Search Header Component (unchanged)
function SearchHeader({ searchTerm, setSearchTerm, searchType, loading, onRefresh, onClear, searchInputRef }) {
  return (
    <div className="mb-4">
      <div className="d-flex flex-column flex-md-row gap-3 align-items-center">
        <div className="flex-grow-1">
          <div className="input-group input-group-lg">
            <span className="input-group-text bg-white border-end-0">
              <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} text-muted`}></i>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name or scan barcode to add..."
              className="form-control border-start-0 border-end-0 ps-0"
              style={{ fontSize: '1rem' }}
            />
            {searchTerm && (
              <button className="btn btn-outline-secondary border-start-0" type="button" onClick={onClear} title="Clear search">
                <i className="fas fa-times"></i>
              </button>
            )}
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

// Products Grid Component - FIXED for cart grouping
function ProductsGrid({ hasSearched, filteredProducts, searchTerm, isLikelyBarcode, cart, onQuantityChange, loadingProducts }) {
  // FIXED: Group cart items by productId for easier lookup
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
            Enter a product name to search or scan/type a barcode to automatically add to cart
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

// Cart Items Component - UPDATED to show price type
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
      <table className="table table-sm table-hover">
        <thead className="table-light">
          <tr>
            <th style={{ fontSize: '0.8rem' }}>Product</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Type</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Qty</th>
            <th style={{ fontSize: '0.8rem' }} className="text-end">Total</th>
            <th style={{ fontSize: '0.8rem', width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => {
            const itemPrice = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
            const itemTotal = itemPrice * (item.quantity || 1);
            const itemId = item.id || item._id;

            return (
              <tr key={itemId}>
                <td style={{ fontSize: '0.75rem' }}>
                  <div className="text-truncate" style={{ maxWidth: '400px', fontSize: '1.01rem' }} title={item.name}>
                    <strong>{item.name}</strong>
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
                  <button className="btn btn-outline-danger btn-sm rounded-circle" onClick={() => onRemoveItem(itemId, item.name, item.priceType)} title={`Remove ${item.name} (${item.priceType})`} style={{ width: '24px', height: '24px', padding: '0', fontSize: '0.6rem' }}>
                    <i className="fas fa-times"></i>
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

// Payment Form Component (unchanged)
function PaymentForm({ paymentType, setPaymentType, paymentData, setPaymentData, cartTotal, KSH, setCurrentOrderId }) {
  return (
    <>
      <Form.Group className="mb-3">
        <Form.Label className="fw-semibold small"><i className="fas fa-credit-card me-2"></i>Payment Method</Form.Label>
        <Form.Select 
          value={paymentType} 
          onChange={(e) => { 
            setPaymentType(e.target.value); 
            setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); 
            setCurrentOrderId(null); 
          }} 
          size="sm"
        >
          <option value="">Select payment method</option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="both">Hybrid (Cash + M-Pesa)</option>
        </Form.Select>
      </Form.Group>

      {paymentType === 'cash' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small">Cash Amount Given</Form.Label>
          <div className="input-group input-group-sm">
            <span className="input-group-text">Ksh</span>
            <Form.Control 
              type="number" 
              value={paymentData.cashAmount} 
              onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} 
              placeholder="Enter amount received" 
              min={cartTotal} 
            />
          </div>
          {paymentData.cashAmount && Number(paymentData.cashAmount) >= cartTotal && (
            <div className="mt-2 p-2 bg-success bg-opacity-10 rounded border-start border-success border-3">
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-success fw-semibold small"><i className="fas fa-check-circle me-1"></i>Change:</span>
                <span className="text-success fw-bold">{KSH(Number(paymentData.cashAmount) - cartTotal)}</span>
              </div>
            </div>
          )}
        </Form.Group>
      )}

      {paymentType === 'mpesa' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small">M-Pesa Phone Number</Form.Label>
          <div className="input-group input-group-sm">
            <span className="input-group-text">📱</span>
            <Form.Control 
              type="tel" 
              placeholder="254XXXXXXXXX" 
              value={paymentData.mpesaPhone} 
              onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })} 
            />
          </div>
        </Form.Group>
      )}

      {paymentType === 'both' && (
        <div>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold small"><i className="fas fa-money-bill-wave me-2"></i>Cash Amount</Form.Label>
            <div className="input-group input-group-sm">
              <span className="input-group-text">Ksh</span>
              <Form.Control 
                type="number" 
                value={paymentData.cashAmount} 
                onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} 
                placeholder="Enter cash amount" 
                min={0} 
              />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold small"><i className="fas fa-mobile-alt me-2"></i>M-Pesa Amount</Form.Label>
            <div className="input-group input-group-sm">
              <span className="input-group-text">Ksh</span>
              <Form.Control 
                type="number" 
                value={paymentData.mpesaAmount} 
                onChange={(e) => setPaymentData({ ...paymentData, mpesaAmount: e.target.value })} 
                placeholder="Enter M-Pesa amount" 
                min={0} 
              />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold small">M-Pesa Phone Number</Form.Label>
            <div className="input-group input-group-sm">
              <span className="input-group-text">📱</span>
              <Form.Control 
                type="tel" 
                placeholder="2547XXXXXXXX" 
                value={paymentData.mpesaPhone} 
                onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })} 
              />
            </div>
          </Form.Group>

          {(paymentData.cashAmount || paymentData.mpesaAmount) && (
            <div className="alert alert-info py-2 mb-3">
              <div className="d-flex justify-content-between small"><span>Cash:</span><span>{KSH(Number(paymentData.cashAmount) || 0)}</span></div>
              <div className="d-flex justify-content-between small"><span>M-Pesa:</span><span>{KSH(Number(paymentData.mpesaAmount) || 0)}</span></div>
              <hr className="my-1" />
              <div className="d-flex justify-content-between fw-semibold">
                <span>Total Payment:</span>
                <span className={((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) >= cartTotal ? 'text-success' : 'text-danger'}>
                  {KSH((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0))}
                </span>
              </div>
              {((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) >= cartTotal && ((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) > cartTotal && (
                <div className="d-flex justify-content-between text-success small"><span>Change:</span><span>{KSH(((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) - cartTotal)}</span></div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function POS() {
  // State management
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
  const [defaultPriceType, setDefaultPriceType] = useState('Retail'); // For barcode scans

  // Redux hooks
  const dispatch = useDispatch();
  const cart = useSelector(selectCart);
  const cartItemCount = useSelector(selectCartItemCount);
  const cartTotal = useSelector(selectCartTotal);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  // Refs
  const searchInputRef = useRef(null);
  const scannerRef = useRef({ buffer: '', firstTime: 0, lastTime: 0, timer: null });

  // Utility functions
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

  // Calculate cart total with price types - UPDATED
  const calculateCartTotal = useCallback(() => {
    return cart.reduce((total, item) => {
      const price = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
      return total + (price * (item.quantity || 1));
    }, 0);
  }, [cart]);

  // Initialize products on component mount
  useEffect(() => {
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(async () => {
        const all = await indexedDb.getAllProducts();
        setProducts(all);
      })
      .catch(() => toast.error('Failed to sync products'));
  }, [dispatch]);

  // Barcode scanner functionality - UPDATED to handle price type selection
  useEffect(() => {
    const THRESHOLD_AVG_MS = 80;
    const CLEAR_TIMEOUT = 800;
    const MIN_BARCODE_LENGTH = 8;

    const onKeyDown = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

      const now = Date.now();
      const s = scannerRef.current;
      const active = document.activeElement;
      const activeIsEditable = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

      if (activeIsEditable && searchInputRef.current !== active) return;

      if (e.key === 'Enter') {
        if (s.buffer.length >= MIN_BARCODE_LENGTH) {
          const totalTime = now - (s.firstTime || now);
          const avg = totalTime / Math.max(1, s.buffer.length);
          if (avg < THRESHOLD_AVG_MS) {
            const code = s.buffer;
            handleBarcodeScanned(code);
            setSearchTerm('');
            if (searchInputRef.current) {
              searchInputRef.current.value = '';
              searchInputRef.current.focus();
            }
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

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(scannerRef.current.timer);
    };
  }, [cart, getInventoryId, dispatch, defaultPriceType]);

  // Geolocation
  useEffect(() => {
    if (navigator && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => { /* silent fail */ },
        { timeout: 3000 }
      );
    }
  }, []);

  // Keyboard shortcuts for checkout
  useEffect(() => {
    const currentCartTotal = calculateCartTotal();
    const handleCheckoutEnter = (e) => {
      if (e.key === 'Enter' && paymentType && cart.length > 0 && !processingOrder) {
        const activeElement = document.activeElement;
        const isTypingInInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
        if (!isTypingInInput) {
          e.preventDefault();
          if (paymentType === 'both') createOrder();
          else completeCheckout();
        }
      }
    };

    window.addEventListener('keydown', handleCheckoutEnter);
    return () => window.removeEventListener('keydown', handleCheckoutEnter);
  }, [paymentType, cart.length, paymentData, processingOrder, calculateCartTotal]);

  // Search functionality
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

  // Handler functions - FIXED for price types
  const handleBarcodeScanned = async (barcode) => {
    try {
      console.log('Barcode scanned:', barcode);
      const product = await indexedDb.getProductByBarcode(barcode);
      if (!product) {
        toast.error(`No product found with barcode: ${barcode}`);
        return;
      }

      // Show price type selection dialog
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

  // FIXED: Main quantity change handler
  const handleQuantityChange = async (productId, priceType, newQuantity, productData = null) => {
    try {
      console.log('handleQuantityChange called:', { productId, priceType, newQuantity });
      
      const product = productData || filteredProducts.find(p => (p.id || p._id) === productId);
      if (!product) {
        toast.error('Product not found');
        return;
      }

      // Find existing cart item with same product and price type
      const existingCartItem = cart.find(item => 
        (item.id || item._id) === productId && item.priceType === priceType
      );

      console.log('Existing cart item:', existingCartItem);

      if (newQuantity === 0) {
        if (existingCartItem) {
          const cartItemId = `${productId}_${priceType}`;
          dispatch(removeItemFromCart(cartItemId));
          toast.success('Removed from cart');
        }
        return;
      }

      const currentCartQty = existingCartItem ? existingCartItem.quantity : 0;
      const inventoryId = getInventoryId(product);
      
      console.log('Inventory ID:', inventoryId);
      
      if (!inventoryId) {
        toast.error('Cannot validate stock - inventory ID missing');
        return;
      }

      setProductLoading(productId, true);

      // Validate stock if increasing quantity
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
          // Continue with the operation even if validation fails
        }
      } else {
        // Validate quantity decrease
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
          // Continue with the operation even if validation fails
        }
      }

      if (existingCartItem) {
        // Update existing item
        console.log('Updating existing cart item for product:', productId);
        dispatch(updateCartItemQuantity({ productId: productId, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        // Add new item to cart
        console.log('Adding new item to cart');
        dispatch(addItemToCart({
          product: { 
            ...product, 
            id: productId,
            priceType: priceType,
            // Ensure we have the right price fields
            price: product.price,
            priceAfterDiscount: product.priceAfterDiscount
          },
          quantity: newQuantity
        }));
        toast.success(`Added to cart (${priceType === 'Retail' ? 'Retail' : 'Wholesale'})`);
      }

      setProductLoading(productId, false);
    } catch (error) {
      console.error('handleQuantityChange error:', error);
      toast.error(`Failed to update cart: ${error?.message || 'Unexpected error'}`);
      setProductLoading(productId, false);
    }
  };

  const handleRemoveItem = (productId, productName, priceType) => {
    if (window.confirm(`Remove "${productName}" (${priceType === 'Retail' ? 'Retail' : 'Wholesale'}) from cart?`)) {
      dispatch(removeItemFromCart(productId));
      toast.success('Item removed from cart');
    }
  };

  const handleClearCart = () => {
    if (cartItemCount === 0) {
      toast.info('Cart is already empty');
      return;
    }

    if (window.confirm('Are you sure you want to clear all items from the cart?')) {
      dispatch(clearCart());
      toast.success('Cart cleared successfully');
      setCurrentOrderId(null);
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

  const clearSearch = () => {
    setSearchTerm('');
    setFilteredProducts([]);
    setHasSearched(false);
    setSearchType('');
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // Order and payment handlers - UPDATED for price types
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
      toast.info('Sending order to server...');

      const res = await api.post('/order', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      if (orderId) {
        setCurrentOrderId(orderId);
        toast.success(`Order created. Order ID: ${orderId}`);

        if (paymentType !== 'both') {
          await handleOrderCompletion(res.data);
        } else {
          toast.info('Hybrid order awaiting M-Pesa payment confirmation.');
        }
      } else {
        toast.success('Order created.');
        if (paymentType !== 'both') {
          await handleOrderCompletion(res.data);
        } else {
          toast.info('Hybrid order created but server did not return an order id.');
        }
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Order creation failed. Please try again.';
      toast.error(msg);
    } finally {
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
      toast.info(paymentType === 'mpesa' ? 'Sending M-Pesa order to server...' : 'Processing payment...');

      const res = await api.post('/order', payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      if (paymentType === 'mpesa') {
        if (orderId) {
          setCurrentOrderId(orderId);
          toast.success(`M-Pesa order created. Order ID: ${orderId}. Confirm payment when customer pays.`);
        } else {
          toast.success('M-Pesa order created. Confirm payment when customer pays.');
        }
      } else {
        await handleOrderCompletion(res.data);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Checkout failed. Please try again.';
      toast.error(msg);
      setProcessingOrder(false);
    } finally {
      setProcessingOrder(false);
    }
  };

  const handleOrderCompletion = async (orderData) => {
    toast.success('Order completed');
    const currentCartTotal = calculateCartTotal();

    const receiptData = {
      cart,
      cartTotal: currentCartTotal,
      paymentType,
      paymentData: {
        ...paymentData,
        cashAmount: paymentType === 'cash' ? Number(paymentData.cashAmount) : paymentType === 'both' ? Number(paymentData.cashAmount) || 0 : 0,
        change: paymentType === 'cash' ? Math.max(0, Number(paymentData.cashAmount) - currentCartTotal) : paymentType === 'both' ? Math.max(0, (Number(paymentData.cashAmount) + Number(paymentData.mpesaAmount)) - currentCartTotal) : 0,
        mpesaAmount: paymentType === 'both' ? Number(paymentData.mpesaAmount) : Number(paymentData.mpesaAmount) || 0
      },
      user,
      orderNumber: orderData?.orderNumber || orderData?.orderId || orderData?.orderid || `ORD-${Date.now().toString().slice(-6)}`,
      customerPhone: paymentType === 'mpesa' || paymentType === 'both' ? (paymentData.mpesaPhone || '').trim() : ''
    };

    try {
      await printOrderReceipt(receiptData);
      toast.success('Receipt printed successfully');
    } catch (printError) {
      toast.warning('Order completed but receipt printing failed. Check printer connection.');
    }

    dispatch(clearCart());
    setPaymentType('');
    setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
    setCurrentOrderId(null);
    setProcessingOrder(false);

    if (paymentType === 'cash') {
      const given = Number(paymentData.cashAmount);
      const change = given - currentCartTotal;
      if (!Number.isNaN(change) && change > 0) toast.info(`Change to return: ${KSH(change)}`);
    }

    if (paymentType === 'both') {
      const totalGiven = (Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0);
      const change = totalGiven - currentCartTotal;
      if (change > 0) toast.info(`Change to return: ${KSH(change)}`);
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

      const response = await api.get(`/payments/${currentOrderId}`);

      const paid = response?.data?.orderid === currentOrderId;

      if (paid) {
        toast.success('Payment confirmed — finalizing order');
        await handleOrderCompletion({ orderNumber: currentOrderId });
      } else {
        toast.warning('Payment not yet confirmed. Try again shortly.');
      }
    } catch (err) {
      const msg = 'Payment check failed. Please try again.';
      toast.error(msg);
    } finally {
      setCheckingPayment(false);
    }
  };

  // Get current cart total for display
  const currentCartTotal = calculateCartTotal();

  return (
    <div className="container-fluid py-4" style={{ background: '#f8f9fa', minHeight: '100vh', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="row h-100" style={{ minHeight: 'calc(100vh - 2rem)' }}>
        {/* Left side - Products (1/3 of screen) */}
        <div className="col-xl-4 col-lg-5 col-md-6 col-12 mb-4">
          <SearchHeader
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            searchType={searchType}
            loading={loading}
            onRefresh={refresh}
            onClear={clearSearch}
            searchInputRef={searchInputRef}
          />

          {/* Products Grid */}
          <div className="products-container" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: '10px' }}>
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

        {/* Right side - Cart (2/3 of screen) */}
        <div className="col-xl-8 col-lg-7 col-md-6 col-12">
          <div className="cart-sidebar h-100 bg-white rounded-3 shadow-sm p-4 position-sticky" style={{ top: '20px', maxHeight: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
            {/* Cart Header */}
            <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
              <h5 className="fw-semibold mb-0 d-flex align-items-center">
                <i className="fas fa-shopping-cart me-2"></i>
                Cart
                {cartItemCount > 0 && <span className="badge bg-primary ms-2">{cartItemCount} items</span>}
              </h5>
              {cartItemCount > 0 && (
                <button className="btn btn-outline-danger btn-sm" onClick={handleClearCart} title="Clear all items">
                  <i className="fas fa-trash me-1"></i>
                  Clear
                </button>
              )}
            </div>

            {/* Cart Items */}
            <div className="cart-items flex-grow-1" style={{ overflowY: 'auto', marginBottom: '20px' }}>
              <CartItems cart={cart} onRemoveItem={handleRemoveItem} KSH={KSH} />
            </div>

            {/* Cart Total & Checkout */}
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

                {/* Payment Confirmation for M-Pesa and Hybrid */}
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
                              Confirm Payment
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="text-center mt-2 small text-muted">Use this to confirm M-Pesa payment and finalize the order.</div>
                  </div>
                )}

                {/* Checkout Button */}
                <Button 
                  style={{ ...CTA, width: '100%', padding: '12px', fontSize: '1rem', fontWeight: '600' }} 
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

      <style jsx>{`
        @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css');
        .table-hover tbody tr:hover { background-color: rgba(0, 123, 255, 0.05); }
        .btn-outline-danger:hover { transform: scale(1.05); }
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
        kbd { background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 3px; padding: 2px 6px; font-size: 0.875em; }
        
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