import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { validateAndAddToCart, validateCartQuantityChange } from '../../services/cartService';
import api from '../../services/api';
import { selectUser } from '../../redux/slices/userSlice';
import { printOrderReceipt } from '../thermalPrinter/thermalPrinter';

const CTA = { background: '#FF7F50', color: '#fff' };
const KSH = (amt) => `Ksh ${Number(amt).toLocaleString()}`;

const SCANNER_CONFIG = {
  THRESHOLD_AVG_MS: 80,
  CLEAR_TIMEOUT: 800,
  MIN_BARCODE_LENGTH: 8,
  BARCODE_MIN_LENGTH: 8,
  BARCODE_MAX_LENGTH: 20
};

function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), wait);
  }, [wait]);
}

const ProductCard = React.memo(function ProductCard({ product, cartItems, onQuantityChange, selected }) {
  const productId = product.id || product._id;
  const retailPrice = product.price || 0;
  const wholesalePrice = product.priceAfterDiscount || product.price || 0;
  const retailCartItem = cartItems.find(item => (item.id || item._id) === productId && item.priceType === 'Retail');
  const wholesaleCartItem = cartItems.find(item => (item.id || item._id) === productId && item.priceType === 'Discounted');
  const retailQuantity = retailCartItem ? retailCartItem.quantity : 0;
  const wholesaleQuantity = wholesaleCartItem ? wholesaleCartItem.quantity : 0;

  const handleRetailIncrement = () => onQuantityChange(productId, 'Retail', (retailQuantity || 0) + 1, product);
  const handleRetailDecrement = () => {
    if (retailQuantity > 1) onQuantityChange(productId, 'Retail', retailQuantity - 1, product);
    else if (retailQuantity === 1) onQuantityChange(productId, 'Retail', 0, product);
  };
  const handleRetailAddToCart = () => onQuantityChange(productId, 'Retail', 1, product);

  const handleWholesaleIncrement = () => onQuantityChange(productId, 'Discounted', (wholesaleQuantity || 0) + 1, product);
  const handleWholesaleDecrement = () => {
    if (wholesaleQuantity > 1) onQuantityChange(productId, 'Discounted', wholesaleQuantity - 1, product);
    else if (wholesaleQuantity === 1) onQuantityChange(productId, 'Discounted', 0, product);
  };
  const handleWholesaleAddToCart = () => onQuantityChange(productId, 'Discounted', 1, product);

  return (
    <div
      className={`product-card p-3 rounded-3 shadow-sm border-0 h-100 d-flex flex-column ${selected ? 'selected-product' : ''}`}
      data-pid={productId}
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
        border: selected ? '2px solid #007bff' : '1px solid #e9ecef',
        transition: 'all 0.12s ease-in-out',
        minHeight: '200px',
        boxSizing: 'border-box'
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
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm" style={{ fontSize: '0.95rem', minHeight: '2.4rem' }}>{product.name}</h6>
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
            <i className="fas fa-barcode me-1"></i>{product.barcode}
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
            <button className="btn btn-outline-success btn-sm rounded-circle" onClick={handleRetailDecrement} style={{ width: '28px', height: '28px', padding: 0 }} type="button"><i className="fas fa-minus" style={{ fontSize: '0.7rem' }}></i></button>
            <div className="mx-2 fw-bold text-center" style={{ minWidth: '25px', fontSize: '0.9rem' }}>{retailQuantity}</div>
            <button className="btn btn-outline-success btn-sm rounded-circle" onClick={handleRetailIncrement} style={{ width: '28px', height: '28px', padding: 0 }} type="button"><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
          </div>
        ) : (
          <button className="btn btn-success btn-sm w-100 rounded-pill" onClick={handleRetailAddToCart} style={{ fontWeight: '600', fontSize: '0.75rem', padding: '6px 12px' }} type="button"><i className="fas fa-plus me-1"></i>Add Retail</button>
        )}
      </div>

      <div className="wholesale-controls">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="small fw-semibold text-info">Wholesale</span>
          {wholesaleQuantity > 0 && <span className="badge bg-info">{wholesaleQuantity}</span>}
        </div>
        {wholesaleQuantity > 0 ? (
          <div className="d-flex align-items-center justify-content-center">
            <button className="btn btn-outline-info btn-sm rounded-circle" onClick={handleWholesaleDecrement} style={{ width: '28px', height: '28px', padding: 0 }} type="button"><i className="fas fa-minus" style={{ fontSize: '0.7rem' }}></i></button>
            <div className="mx-2 fw-bold text-center" style={{ minWidth: '25px', fontSize: '0.9rem' }}>{wholesaleQuantity}</div>
            <button className="btn btn-outline-info btn-sm rounded-circle" onClick={handleWholesaleIncrement} style={{ width: '28px', height: '28px', padding: 0 }} type="button"><i className="fas fa-plus" style={{ fontSize: '0.7rem' }}></i></button>
          </div>
        ) : (
          <button className="btn btn-info btn-sm w-100 rounded-pill" onClick={handleWholesaleAddToCart} style={{ fontWeight: '600', fontSize: '0.75rem', padding: '6px 12px' }} type="button"><i className="fas fa-plus me-1"></i>Add Wholesale</button>
        )}
      </div>
    </div>
  );
});

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
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const searchInputRef = useRef(null);
  const cashInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const scannerRef = useRef({ buffer: '', firstTime: 0, lastTime: 0, timer: null });

  const dispatch = useDispatch();
  const cart = useSelector(selectCart);
  const cartItemCount = useSelector(selectCartItemCount);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  const cartByProduct = useMemo(() => cart.reduce((acc, item) => {
    const pid = item.id || item._id;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(item);
    return acc;
  }, {}), [cart]);

  const getInventoryIdFromProduct = useCallback((product) => {
    return (
      product?.inventoryId ||
      product?.inventory?.id ||
      product?.inventory?._id ||
      product?.inventory_id ||
      product?.invId ||
      product?.inventoryIdString ||
      null
    );
  }, []);

  const isLikelyBarcode = useCallback((term) => {
    if (!term) return false;
    const numericOnly = /^\d+$/.test(term.trim());
    const length = term.trim().length;
    return numericOnly && (length >= SCANNER_CONFIG.BARCODE_MIN_LENGTH && length <= SCANNER_CONFIG.BARCODE_MAX_LENGTH);
  }, []);

  const setProductLoading = useCallback((productId, isLoading) => {
    setLoadingProducts(prev => {
      const newSet = new Set(prev);
      if (isLoading) newSet.add(productId);
      else newSet.delete(productId);
      return newSet;
    });
  }, []);

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (searchInputRef.current) {
          try { searchInputRef.current.focus(); searchInputRef.current.select && searchInputRef.current.select(); } catch (e) {}
        }
      }, 60);
    });
  }, []);

  const resetPaymentData = useCallback(() => {
    setPaymentType('');
    setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
    setCurrentOrderId(null);
  }, []);

  const calculateCartTotal = useCallback(() => {
    return cart.reduce((total, item) => {
      const price = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
      return total + (price * (item.quantity || 1));
    }, 0);
  }, [cart]);

  const handleQuantityChange = useCallback(async (productId, priceType, newQuantity, productData = null) => {
    try {
      setProductLoading(productId, true);
      // Ensure we have the freshest product data; attempt multiple fallbacks
      let product = productData || filteredProducts.find(p => (p.id || p._id) === productId) || products.find(p => (p.id || p._id) === productId);

      if (!product && indexedDb && indexedDb.getProductById) {
        try { product = await indexedDb.getProductById(productId); } catch (e) {}
      }

      // If still no product, try to search by barcode stored in older productData
      if (!product && productData && productData.barcode && indexedDb && indexedDb.getProductByBarcode) {
        try { product = await indexedDb.getProductByBarcode(productData.barcode); } catch (e) {}
      }

      if (!product) {
        toast.error('Product not found');
        setProductLoading(productId, false);
        return;
      }

      // Try to discover inventory id; if missing, re-query indexedDB by id/barcode
      let inventoryId = getInventoryIdFromProduct(product);
      if (!inventoryId) {
        try {
          if (indexedDb && indexedDb.getProductById) {
            const fresh = await indexedDb.getProductById(productId);
            if (fresh) {
              product = fresh;
              inventoryId = getInventoryIdFromProduct(product);
            }
          }
        } catch (e) {}
        if (!inventoryId && product.barcode && indexedDb && indexedDb.getProductByBarcode) {
          try {
            const fresh2 = await indexedDb.getProductByBarcode(product.barcode);
            if (fresh2) {
              product = fresh2;
              inventoryId = getInventoryIdFromProduct(product);
            }
          } catch (e) {}
        }
      }

      if (!inventoryId) {
        toast.error('Cannot validate stock - inventory ID missing');
        setProductLoading(productId, false);
        return;
      }

      // Find existing cart item with same product + priceType
      const existingCartItem = cart.find(item => (item.id || item._id) === productId && item.priceType === priceType);

      if (newQuantity === 0) {
        if (existingCartItem) {
          dispatch(removeItemFromCart(productId));
        }
        setProductLoading(productId, false);
        toast.success('Removed from cart');
        return;
      }

      const currentCartQty = existingCartItem ? existingCartItem.quantity : 0;

      // When increasing quantity validate stock; do a single retry on transient failure
      const runValidation = async () => {
        if (newQuantity > currentCartQty) {
          const qtyToAdd = newQuantity - currentCartQty;
          return await validateAndAddToCart({ productId, inventoryId, qty: qtyToAdd, currentCartQty });
        } else {
          return await validateCartQuantityChange({ productId, inventoryId, newQty: newQuantity, currentCartQty });
        }
      };

      let validation;
      try {
        validation = await runValidation();
      } catch (err) {
        // retry once if we can re-fetch product/inventory
        try {
          if (indexedDb && indexedDb.getProductById) {
            const fresh = await indexedDb.getProductById(productId);
            if (fresh) {
              product = fresh;
              inventoryId = getInventoryIdFromProduct(product);
            }
          }
        } catch (e) {}
        try {
          validation = await runValidation();
        } catch (err2) {
          validation = { status: 'error', message: err2?.message || 'Validation failed' };
        }
      }

      if (validation && (validation.status === 'conflict' || validation.status === 'error')) {
        toast.error(validation.message);
        setProductLoading(productId, false);
        return;
      }
      if (validation && validation.status === 'warning') {
        toast.warning(validation.message);
      }

      if (existingCartItem) {
        dispatch(updateCartItemQuantity({ productId, priceType, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        dispatch(addItemToCart({
          product: { ...product, id: productId, priceType, price: product.price, priceAfterDiscount: product.priceAfterDiscount },
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
  }, [filteredProducts, products, cart, dispatch, getInventoryIdFromProduct, setProductLoading]);

  const handleBarcodeScanned = useCallback(async (barcode) => {
    try {
      const product = await indexedDb.getProductByBarcode(barcode);
      if (!product) { toast.error(`No product found with barcode: ${barcode}`); return; }
      const retailPrice = product.price || 0;
      const wholesalePrice = product.priceAfterDiscount || product.price || 0;
      const wantsRetail = window.confirm(`Product: ${product.name}\n\nPress OK for Retail (${KSH(retailPrice)})\nPress Cancel for Wholesale (${KSH(wholesalePrice)})`);
      const chosenPriceType = wantsRetail ? 'Retail' : 'Discounted';
      await handleQuantityChange(product.id || product._id, chosenPriceType, 1, product);
      setFilteredProducts([product]);
      setHasSearched(true);
      setSearchType('barcode');
      setSelectedIndex(0);
      focusSearchInput();
    } catch (err) {
      console.error('Barcode handling error', err);
      toast.error(`Failed to process barcode: ${err?.message || 'Unexpected error'}`);
    }
  }, [handleQuantityChange, focusSearchInput]);

  const performSearch = useCallback(async (term) => {
    if (!term || term.trim().length === 0) {
      setFilteredProducts([]);
      setHasSearched(false);
      setSearchType('');
      setSelectedIndex(-1);
      return;
    }
    setHasSearched(true);
    const originalTerm = term.trim();
    const lower = originalTerm.toLowerCase();
    try {
      let results = [];
      if (products && products.length) {
        for (let i = 0; i < products.length && results.length < 500; i++) {
          const p = products[i];
          if (!p) continue;
          const name = (p.name || '').toLowerCase();
          if (name.includes(lower)) results.push(p);
        }
      }
      let foundByBarcode = false;
      const barcodeResult = await indexedDb.getProductByBarcode(originalTerm);
      if (barcodeResult) {
        results = [barcodeResult, ...results.filter(p => (p.id || p._id) !== (barcodeResult.id || barcodeResult._id))];
        foundByBarcode = true;
        setSearchType('barcode');
      }
      if (results.length === 0 && !foundByBarcode) {
        const nameResults = await indexedDb.searchByName(lower, 200);
        results = nameResults || [];
        setSearchType('name');
      } else if (foundByBarcode && results.length > 0 && isLikelyBarcode(originalTerm)) {
        setSearchType('barcode');
      } else if (foundByBarcode && results.length > 0) {
        setSearchType('both');
      } else if (!foundByBarcode && results.length > 0) {
        setSearchType('name');
      }
      setFilteredProducts(results);
      setSelectedIndex(results.length > 0 ? 0 : -1);
    } catch (error) {
      console.error('Search failed', error);
      toast.error('Search failed');
      setFilteredProducts([]);
      setSearchType('');
      setSelectedIndex(-1);
    }
  }, [products, isLikelyBarcode]);

  const debouncedSearch = useDebouncedCallback(performSearch, 240);
  useEffect(() => { debouncedSearch(searchTerm); }, [searchTerm, debouncedSearch]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setFilteredProducts([]);
    setHasSearched(false);
    setSearchType('');
    setSelectedIndex(-1);
    focusSearchInput();
  }, [focusSearchInput]);

  const handleOrderCompletion = useCallback(async (orderData) => {
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
    setSearchTerm('');
    setFilteredProducts([]);
    setHasSearched(false);
    setSearchType('');
    setSelectedIndex(-1);
    resetPaymentData();
    setProcessingOrder(false);
    setCurrentOrderId(null);
    focusSearchInput();
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
  }, [cart, paymentType, paymentData, user, dispatch, resetPaymentData, focusSearchInput, calculateCartTotal]);

  const createOrder = useCallback(async () => {
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
      buyerPin: 'N/A',
      latitude: coords?.lat ?? 0,
      longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({
        productId: Number(ci.id || ci._id),
        quantity: ci.quantity,
        priceType: ci.priceType || 'Retail'
      })),
      orderPaymentType: paymentType === 'cash' ? 'Cash' : paymentType === 'mpesa' ? 'Mpesa' : 'Hybrid',
      phoneNumber: paymentType === 'mpesa' || paymentType === 'both' ? (paymentData.mpesaPhone || '').trim() : (user && user.phone) || 'N/A'
    };
    if (paymentType === 'both') {
      payload.total = Number(paymentData.mpesaAmount) || 0;
      payload.cashAmount = Number(paymentData.cashAmount) || 0;
      payload.userId = (user && (user.phone || user.userName)) || '';
    }
    if (paymentType === 'mpesa') payload.userId = (user && (user.phone || user.userName)) || '';
    if (paymentType === 'cash') payload.cashAmount = Number(paymentData.cashAmount) || 0;
    try {
      setProcessingOrder(true);
      toast.info('Sending order to server...');
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      dispatch(clearCart());
      setSearchTerm('');
      setFilteredProducts([]);
      setHasSearched(false);
      setSearchType('');
      setSelectedIndex(-1);
      focusSearchInput();
      if (orderId) {
        setCurrentOrderId(orderId);
        toast.success(`Order created. Order ID: ${orderId}`);
      } else {
        toast.success('Order created.');
      }
      if (paymentType !== 'both') {
        await handleOrderCompletion(res.data);
      } else {
        toast.info('Hybrid order awaiting M-Pesa payment confirmation.');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Order creation failed. Please try again.';
      toast.error(msg);
    } finally {
      setProcessingOrder(false);
    }
  }, [paymentType, paymentData, cart, user, coords, dispatch, handleOrderCompletion, focusSearchInput, calculateCartTotal]);

  const completeCheckout = useCallback(async () => {
    if (!paymentType) { toast.error('Please select a payment method'); return; }
    const currentCartTotal = calculateCartTotal();
    if (paymentType === 'cash') {
      const cashVal = Number(paymentData.cashAmount);
      if (!paymentData.cashAmount || Number.isNaN(cashVal) || cashVal < currentCartTotal) { toast.error('Please enter a valid cash amount (>= total)'); return; }
    }
    if (paymentType === 'mpesa' && (!paymentData.mpesaPhone || paymentData.mpesaPhone.trim().length === 0)) { toast.error('Please enter M-Pesa phone number'); return; }
    const payload = {
      buyerPin: 'N/A',
      latitude: coords?.lat ?? 0,
      longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({
        productId: Number(ci.id || ci._id),
        quantity: ci.quantity,
        priceType: ci.priceType || 'Retail'
      })),
      orderPaymentType: paymentType === 'cash' ? 'Cash' : 'Mpesa',
      phoneNumber: paymentType === 'mpesa' ? paymentData.mpesaPhone.trim() : (user && user.phone) || 'N/A'
    };
    if (paymentType === 'mpesa') payload.userId = (user && (user.phone || user.userName)) || '';
    if (paymentType === 'cash') payload.cashAmount = Number(paymentData.cashAmount) || 0;
    try {
      setProcessingOrder(true);
      toast.info(paymentType === 'mpesa' ? 'Sending M-Pesa order to server...' : 'Processing payment...');
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      dispatch(clearCart());
      setSearchTerm('');
      setFilteredProducts([]);
      setHasSearched(false);
      setSearchType('');
      setSelectedIndex(-1);
      focusSearchInput();
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
    } finally {
      setProcessingOrder(false);
    }
  }, [paymentType, paymentData, cart, user, coords, dispatch, handleOrderCompletion, focusSearchInput, calculateCartTotal]);

  const checkPaymentStatus = useCallback(async () => {
    if (!currentOrderId) { toast.error('No order ID to check'); return; }
    try {
      setCheckingPayment(true);
      toast.info('Checking payment status...');
      const response = await api.get(`/payments/${currentOrderId}`);
      const paid = response?.data?.paid || response?.data?.isPaid || response?.data?.status === 'PAID' || response?.data?.status === 'paid' || response?.data?.orderid === currentOrderId;
      if (paid) {
        toast.success('Payment confirmed — finalizing order');
        await handleOrderCompletion({ orderNumber: currentOrderId });
      } else {
        toast.warning('Payment not yet confirmed. Try again shortly.');
      }
    } catch (err) {
      toast.error('Payment check failed. Please try again.');
    } finally {
      setCheckingPayment(false);
    }
  }, [currentOrderId, handleOrderCompletion]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (filteredProducts && filteredProducts.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = prev < filteredProducts.length - 1 ? prev + 1 : 0;
            const pid = filteredProducts[next]?.id || filteredProducts[next]?._id;
            if (pid) {
              const el = document.querySelector(`[data-pid="${pid}"]`);
              if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return next;
          });
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = (prev > 0 ? prev - 1 : filteredProducts.length - 1);
            const pid = filteredProducts[next]?.id || filteredProducts[next]?._id;
            if (pid) {
              const el = document.querySelector(`[data-pid="${pid}"]`);
              if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return next;
          });
          return;
        }
      }
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      const now = Date.now();
      const s = scannerRef.current;
      const active = document.activeElement;
      const activeIsEditable = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (e.key === 'Enter') {
        if (s.buffer.length >= SCANNER_CONFIG.MIN_BARCODE_LENGTH) {
          const totalTime = now - (s.firstTime || now);
          const avg = totalTime / Math.max(1, s.buffer.length);
          if (avg < SCANNER_CONFIG.THRESHOLD_AVG_MS) {
            const code = s.buffer;
            s.buffer = '';
            s.firstTime = 0;
            s.lastTime = 0;
            if (s.timer) { clearTimeout(s.timer); s.timer = null; }
            handleBarcodeScanned(code);
            setSearchTerm('');
            if (searchInputRef.current) { try { searchInputRef.current.value = ''; searchInputRef.current.focus(); } catch (e) {} }
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        e.preventDefault();
        if (paymentType && cart.length > 0 && !processingOrder) {
          if (paymentType === 'both') createOrder();
          else completeCheckout();
        } else {
          toast.info('Select payment method and ensure cart has items before checkout.');
        }
        if (s.timer) { clearTimeout(s.timer); s.timer = null; }
        s.buffer = '';
        s.firstTime = 0;
        s.lastTime = 0;
        return;
      }
      if (e.key.length === 1) {
        if (activeIsEditable && searchInputRef.current !== active) return;
        if (s.lastTime && (now - s.lastTime) > 150) {
          s.buffer = '';
          s.firstTime = now;
        }
        if (!s.firstTime) s.firstTime = now;
        s.buffer += e.key;
        s.lastTime = now;
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => { s.buffer = ''; s.firstTime = 0; s.lastTime = 0; s.timer = null; }, SCANNER_CONFIG.CLEAR_TIMEOUT);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (scannerRef.current.timer) { clearTimeout(scannerRef.current.timer); scannerRef.current.timer = null; }
    };
  }, [filteredProducts, paymentType, cart.length, processingOrder, handleBarcodeScanned, createOrder, completeCheckout]);

  useEffect(() => {
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(async () => {
        const all = await indexedDb.getAllProducts();
        setProducts(all || []);
      })
      .catch(() => toast.error('Failed to sync products'));
  }, [dispatch]);

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
    if (!filteredProducts || filteredProducts.length === 0) {
      setSelectedIndex(-1);
      return;
    }
    setSelectedIndex(prev => {
      if (prev < 0) return 0;
      if (prev >= filteredProducts.length) return filteredProducts.length - 1;
      return prev;
    });
  }, [filteredProducts]);

  const handleRemoveItem = useCallback((productId) => {
    try { dispatch(removeItemFromCart(productId)); } catch (e) {}
    toast.success('Item removed from cart');
  }, [dispatch]);

  const handleClearCart = useCallback(() => {
    if (cartItemCount === 0) { toast.info('Cart is already empty'); return; }
    dispatch(clearCart());
    setSearchTerm('');
    setFilteredProducts([]);
    setHasSearched(false);
    setSearchType('');
    setSelectedIndex(-1);
    resetPaymentData();
    focusSearchInput();
    toast.success('Cart cleared successfully');
    setCurrentOrderId(null);
  }, [cartItemCount, dispatch, resetPaymentData, focusSearchInput]);

  const refresh = useCallback(async () => {
    try {
      await dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: true })).unwrap();
      const all = await indexedDb.getAllProducts();
      setProducts(all || []);
      toast.success('Products refreshed successfully');
    } catch {
      toast.error('Failed to refresh products');
    }
  }, [dispatch]);

  const currentCartTotal = calculateCartTotal();

  return (
    <div className="container-fluid py-4" style={{ background: '#f8f9fa', minHeight: '100vh', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="row h-100" style={{ minHeight: 'calc(100vh - 2rem)' }}>
        <div className="col-xl-5 col-lg-5 col-md-6 col-12 mb-4">
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
                    aria-label="Search products"
                  />
                  {searchTerm && (
                    <button className="btn btn-outline-secondary border-start-0" type="button" onClick={clearSearch} title="Clear search"><i className="fas fa-times"></i></button>
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
              <button className="btn btn-lg px-4" onClick={refresh} style={{ ...CTA, minWidth: '120px' }} disabled={loading}>
                {loading ? (<><span className="spinner-border spinner-border-sm me-2"></span>Syncing...</>) : (<><i className="fas fa-sync-alt me-2"></i>Refresh</>)}
              </button>
            </div>
          </div>

          <div className="products-container" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: '10px' }}>
            {!hasSearched ? (
              <div className="row">
                <div className="col-12">
                  <div className="text-center py-5">
                    <div className="mb-4"><i className="fas fa-search fa-3x text-muted mb-2"></i><i className="fas fa-barcode fa-3x text-muted"></i><i className="fas fa-shopping-cart fa-3x text-success"></i></div>
                    <h5 className="text-muted">Search for products or scan barcodes</h5>
                    <p className="text-muted">Enter a product name to search or scan/type a barcode to automatically add to cart<br /><small className="text-success"><i className="fas fa-magic me-1"></i><strong>Barcode scanner ready:</strong> Scan any barcode to instantly add items to your cart!</small></p>
                  </div>
                </div>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="row">
                <div className="col-12">
                  <div className="text-center py-5"><i className={`fas ${isLikelyBarcode(searchTerm) ? 'fa-barcode' : 'fa-exclamation-circle'} fa-3x text-muted mb-3`}></i><h5 className="text-muted">{isLikelyBarcode(searchTerm) ? 'No product found with this barcode' : 'No products found'}</h5><p className="text-muted">{isLikelyBarcode(searchTerm) ? `Barcode "${searchTerm}" not found in inventory` : 'Try a different search term or barcode'}</p></div>
                </div>
              </div>
            ) : (
              <div className="products-grid" role="list">
                {filteredProducts.map((product, idx) => {
                  const pid = product.id || product._id;
                  const isLoading = loadingProducts.has(pid);
                  const cartItems = cartByProduct[pid] || [];
                  const selected = idx === selectedIndex;
                  return (
                    <div key={pid} className="product-tile" role="listitem">
                      <div style={{ position: 'relative' }}>
                        <ProductCard product={product} cartItems={cartItems} onQuantityChange={handleQuantityChange} selected={selected} />
                        {isLoading && (
                          <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: '12px', zIndex: 20 }}>
                            <div className="spinner-border text-primary" style={{ width: '2rem', height: '2rem' }}><span className="visually-hidden">Loading...</span></div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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

        <div className="col-xl-7 col-lg-7 col-md-6 col-12">
          <div className="cart-sidebar h-100 bg-white rounded-3 shadow-sm p-4 position-sticky" style={{ top: '20px', maxHeight: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
            <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
              <h5 className="fw-semibold mb-0 d-flex align-items-center"><i className="fas fa-shopping-cart me-2"></i>Cart {cartItemCount > 0 && <span className="badge bg-primary ms-2">{cartItemCount} items</span>}</h5>
              {cartItemCount > 0 && (<button className="btn btn-outline-danger btn-sm" onClick={handleClearCart} title="Clear all items"><i className="fas fa-trash me-1"></i>Clear</button>)}
            </div>

            <div className="cart-items flex-grow-1" style={{ overflowY: 'auto', marginBottom: '20px' }}>
              {cart.length === 0 ? (
                <div className="text-center py-5">
                  <i className="fas fa-shopping-cart fa-3x text-muted mb-3"></i>
                  <h6 className="text-muted">Your cart is empty</h6>
                  <p className="text-muted mb-0 small">Add some products to get started</p>
                </div>
              ) : (
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
                        const itemId = (item.id || item._id) + '::' + (item.priceType || 'Retail');
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
                              <span className={`badge ${item.priceType === 'Retail' ? 'bg-success' : 'bg-info'} px-2 py-1`}>{item.priceType === 'Retail' ? 'Retail' : 'Wholesale'}</span>
                            </td>
                            <td className="text-center" style={{ fontSize: '0.75rem' }}>
                              <span className="badge bg-secondary px-2 py-1">{item.quantity || 1}</span>
                            </td>
                            <td className="text-end fw-semibold" style={{ fontSize: '0.75rem' }}>{KSH(itemTotal)}</td>
                            <td className="text-center">
                              <button className="btn btn-outline-danger btn-sm rounded-circle" onClick={() => handleRemoveItem(item.id || item._id)} title={`Remove ${item.name} (${item.priceType})`} style={{ width: '24px', height: '24px', padding: 0, fontSize: '0.6rem' }}><i className="fas fa-times"></i></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="cart-checkout border-top pt-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-bold fs-4"><i className="fas fa-shopping-bag me-1"></i>Total:</span>
                  <span className="fw-bold fs-3 text-success">{KSH(currentCartTotal)}</span>
                </div>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small"><i className="fas fa-credit-card me-2"></i>Payment Method</Form.Label>
                  <Form.Select value={paymentType} onChange={(e) => { setPaymentType(e.target.value); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} size="sm">
                    <option value="">Select payment method</option>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="both">Hybrid (Cash + M-Pesa)</option>
                  </Form.Select>
                </Form.Group>

                {paymentType === 'cash' && (
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold small">Cash Amount Given</Form.Label>
                    <div className="input-group input-group-lg">
                      <span className="input-group-text">Ksh</span>
                      <Form.Control ref={cashInputRef} type="number" value={paymentData.cashAmount} onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} placeholder="Enter amount received" min={currentCartTotal} aria-label="Cash amount given" style={{ fontSize: '1.05rem', padding: '10px' }} />
                    </div>
                    {paymentData.cashAmount && Number(paymentData.cashAmount) >= currentCartTotal && (
                      <div className="mt-2 p-2 bg-success bg-opacity-10 rounded border-start border-success border-3">
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="text-success fw-semibold small"><i className="fas fa-check-circle me-1"></i>Change:</span>
                          <span className="text-success fw-bold">{KSH(Number(paymentData.cashAmount) - currentCartTotal)}</span>
                        </div>
                      </div>
                    )}
                  </Form.Group>
                )}

                {paymentType === 'mpesa' && (
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold small">M-Pesa Phone Number</Form.Label>
                    <div className="input-group input-group-lg">
                      <span className="input-group-text">📱</span>
                      <Form.Control ref={phoneInputRef} type="tel" placeholder="254XXXXXXXXX" value={paymentData.mpesaPhone} onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })} aria-label="M-Pesa phone number" style={{ fontSize: '1.05rem', padding: '10px' }} />
                    </div>
                  </Form.Group>
                )}

                {paymentType === 'both' && (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold small"><i className="fas fa-money-bill-wave me-2"></i>Cash Amount</Form.Label>
                      <div className="input-group input-group-lg">
                        <span className="input-group-text">Ksh</span>
                        <Form.Control type="number" value={paymentData.cashAmount} onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} placeholder="Enter cash amount" min={0} aria-label="Cash amount" style={{ fontSize: '1.05rem', padding: '10px' }} />
                      </div>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold small"><i className="fas fa-mobile-alt me-2"></i>M-Pesa Amount</Form.Label>
                      <div className="input-group input-group-lg">
                        <span className="input-group-text">Ksh</span>
                        <Form.Control type="number" value={paymentData.mpesaAmount} onChange={(e) => setPaymentData({ ...paymentData, mpesaAmount: e.target.value })} placeholder="Enter M-Pesa amount" min={0} aria-label="M-Pesa amount" style={{ fontSize: '1.05rem', padding: '10px' }} />
                      </div>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold small">M-Pesa Phone Number</Form.Label>
                      <div className="input-group input-group-lg">
                        <span className="input-group-text">📱</span>
                        <Form.Control type="tel" placeholder="2547XXXXXXXX" value={paymentData.mpesaPhone} onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })} aria-label="M-Pesa phone number" style={{ fontSize: '1.05rem', padding: '10px' }} />
                      </div>
                    </Form.Group>

                    {(paymentData.cashAmount || paymentData.mpesaAmount) && (
                      <div className="alert alert-info py-2 mb-3">
                        <div className="d-flex justify-content-between small"><span>Cash:</span><span>{KSH(Number(paymentData.cashAmount) || 0)}</span></div>
                        <div className="d-flex justify-content-between small"><span>M-Pesa:</span><span>{KSH(Number(paymentData.mpesaAmount) || 0)}</span></div>
                        <hr className="my-1" />
                        <div className="d-flex justify-content-between fw-semibold">
                          <span>Total Payment:</span>
                          <span className={((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) >= currentCartTotal ? 'text-success' : 'text-danger'}>
                            {KSH((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0))}
                          </span>
                        </div>
                        {((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) >= currentCartTotal && ((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) > currentCartTotal && (
                          <div className="d-flex justify-content-between text-success small"><span>Change:</span><span>{KSH(((Number(paymentData.cashAmount) || 0) + (Number(paymentData.mpesaAmount) || 0)) - currentCartTotal)}</span></div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {currentOrderId && (paymentType === 'mpesa' || paymentType === 'both') && (
                  <div className="alert alert-warning py-2 mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div><i className="fas fa-clock me-2"></i><small>Order ID: <strong>{currentOrderId}</strong></small></div>
                      <div>
                        <Button variant="outline-success" size="sm" onClick={checkPaymentStatus} disabled={checkingPayment}>
                          {checkingPayment ? (<><span className="spinner-border spinner-border-sm me-2"></span>Checking...</>) : (<><i className="fas fa-check-circle me-2"></i>Confirm Payment</>)}
                        </Button>
                      </div>
                    </div>
                    <div className="text-center mt-2 small text-muted">Use this to confirm M-Pesa payment and finalize the order.</div>
                  </div>
                )}

                <Button style={{ ...CTA, width: '100%', padding: '12px', fontSize: '1rem', fontWeight: '600' }} onClick={paymentType === 'both' ? createOrder : completeCheckout} disabled={!paymentType || processingOrder} size="lg">
                  {processingOrder ? (<><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>) : (<><i className="fas fa-check me-2"></i>{paymentType === 'both' ? 'Create Order' : 'Complete Order'} - {KSH(currentCartTotal)}</>)}
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
        .selected-product { box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
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
        .products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1rem;
          align-items: start;
        }
        .product-tile { width: 100%; box-sizing: border-box; }
        kbd { background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 3px; padding: 2px 6px; font-size: 0.875em; }
        @media (max-width: 1199.98px) {
          .cart-sidebar { position: relative !important; max-height: none !important; margin-top: 20px; }
        }
        @media (min-width: 1200px) {
          .col-xl-5 { flex: 0 0 41.666667%; max-width: 41.666667%; }
          .col-xl-7 { flex: 0 0 58.333333%; max-width: 58.333333%; }
        }
      `}</style>
    </div>
  );
}
