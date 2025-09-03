// src/screens/Index.js (or wherever your POS component lives)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { v4 as uuidv4 } from 'uuid';

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
  validateCartQuantityChange,
  checkoutOrder
} from '../../services/cartService';

import api from '../../services/api';
import { selectUser } from '../../redux/slices/userSlice';

import { printOrderReceipt } from '../thermalPrinter/thermalPrinter'; 

const CTA = { background: '#FF7F50', color: '#fff' };
const KSH = (amt) => `Ksh ${Number(amt).toLocaleString()}`;

function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), wait);
  }, [fn, wait]);
}

function ProductCard({ product, cartQuantity, onQuantityChange }) {
  const productId = product.id || product._id;

  const handleIncrement = () => {
    onQuantityChange(productId, (cartQuantity || 0) + 1);
  };

  const handleDecrement = () => {
    if (cartQuantity > 1) {
      onQuantityChange(productId, cartQuantity - 1);
    } else if (cartQuantity === 1) {
      onQuantityChange(productId, 0);
    }
  };

  const handleAddToCart = () => {
    onQuantityChange(productId, 1);
  };

  return (
    <div
      className="product-card p-3 rounded-3 shadow-sm border-0 h-100 d-flex flex-column"
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
        border: '1px solid #e9ecef',
        transition: 'all 0.2s ease-in-out',
        minHeight: '140px'
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
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm"
            style={{ fontSize: '0.9rem', minHeight: '2.4rem' }}>
          {product.name}
        </h6>
        <div className="product-price fw-bold text-success mb-0"
             style={{ fontSize: '1rem' }}>
          {KSH(product.salePrice || product.price || 0)}
        </div>
        {/* Show barcode if available */}
        {product.barcode && (
          <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-barcode me-1"></i>
            {product.barcode}
          </div>
        )}
      </div>

      <div className="quantity-controls">
        {cartQuantity > 0 ? (
          <div className="d-flex align-items-center justify-content-center">
            <button
              className="btn btn-outline-danger btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleDecrement}
              style={{ width: '32px', height: '32px', padding: '0' }}
            >
              <i className="fas fa-minus" style={{ fontSize: '0.75rem' }}></i>
            </button>

            <div className="mx-3 fw-bold text-center"
                 style={{ minWidth: '30px', fontSize: '1.1rem', color: '#495057' }}>
              {cartQuantity}
            </div>

            <button
              className="btn btn-outline-success btn-sm rounded-circle d-flex align-items-center justify-content-center"
              onClick={handleIncrement}
              style={{ width: '32px', height: '32px', padding: '0' }}
            >
              <i className="fas fa-plus" style={{ fontSize: '0.75rem' }}></i>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm w-100 rounded-pill"
            onClick={handleAddToCart}
            style={{
              background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
              border: 'none',
              fontWeight: '600',
              fontSize: '0.85rem',
              padding: '8px 16px'
            }}
          >
            <i className="fas fa-plus me-2"></i>
            Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}

export default function POS() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchType, setSearchType] = useState(''); // Track if search was by name or barcode

  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [paymentType, setPaymentType] = useState('');
  const [paymentData, setPaymentData] = useState({ cashAmount: '', mpesaPhone: '' });

  const [loadingProducts, setLoadingProducts] = useState(new Set());

  // Geolocation coordinates with fallback to (0,0)
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });

  const dispatch = useDispatch();
  const cart = useSelector(selectCart);
  const cartItemCount = useSelector(selectCartItemCount);
  const cartTotal = useSelector(selectCartTotal);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  // Create cart map for quick quantity lookup
  const cartMap = cart.reduce((acc, cur) => {
    acc[cur.id || cur._id] = cur.quantity || 1;
    return acc;
  }, {});

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

  useEffect(() => {
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(async () => {
        const all = await indexedDb.getAllProducts();
        setProducts(all);
      })
      .catch(() => toast.error('Failed to sync products'));
  }, [dispatch]);

  // Helper function to detect if search term is likely a barcode
  const isLikelyBarcode = useCallback((term) => {
    if (!term) return false;
    // Check if it's all numbers and reasonable barcode length
    const numericOnly = /^\d+$/.test(term.trim());
    const length = term.trim().length;
    // Common barcode lengths: UPC (12), EAN (13), Code 128 (variable), etc.
    return numericOnly && (length >= 8 && length <= 20);
  }, []);

  // New function to handle barcode scan and auto-add to cart
  const handleBarcodeScanned = async (barcode) => {
    try {
      console.log('Processing scanned barcode:', barcode);
      
      const product = await indexedDb.getProductByBarcode(barcode);
      
      if (!product) {
        toast.error(`No product found with barcode: ${barcode}`);
        // Still show the barcode in search for manual verification
        setSearchTerm(barcode);
        performSearch(barcode);
        return;
      }

      const productId = product.id || product._id;
      const currentCartQty = cartMap[productId] || 0;
      const newQuantity = currentCartQty + 1;

      console.log('Found product by barcode:', product.name);
      console.log('Current cart quantity:', currentCartQty, 'New quantity:', newQuantity);

      // Validate and add to cart
      const inventoryId = getInventoryId(product);
      
      if (!inventoryId) {
        console.error('No inventory ID found for product:', product);
        toast.error(`Cannot add ${product.name} - inventory ID missing`);
        return;
      }

      setProductLoading(productId, true);

      const validation = await validateAndAddToCart({
        productId,
        inventoryId,
        qty: 1,
        currentCartQty
      });

      console.log('Validation result:', validation);

      if (validation.status === 'conflict') {
        toast.error(validation.message);
        setProductLoading(productId, false);
        return;
      }

      if (validation.status === 'error') {
        toast.error(validation.message);
        setProductLoading(productId, false);
        return;
      }

      if (validation.status === 'warning') {
        toast.warning(validation.message);
      }

      // Add/update cart
      if (currentCartQty > 0) {
        console.log('Updating existing cart item quantity');
        dispatch(updateCartItemQuantity({ productId, quantity: newQuantity }));
        toast.success(`${product.name} quantity increased to ${newQuantity}`, {
          icon: '📦',
          position: 'top-center',
          autoClose: 2000
        });
      } else {
        console.log('Adding new item to cart');
        dispatch(addItemToCart({
          product: { ...product, id: productId },
          quantity: 1
        }));
        toast.success(`${product.name} added to cart!`, {
          icon: '🛒',
          position: 'top-center',
          autoClose: 2000
        });
      }

      // Update search to show the product that was added
      setSearchTerm(barcode);
      setFilteredProducts([product]);
      setHasSearched(true);
      setSearchType('barcode');

      // Clear search input but keep the result visible
      if (searchInputRef.current) {
        searchInputRef.current.value = '';
        searchInputRef.current.focus();
      }

      setProductLoading(productId, false);

    } catch (error) {
      console.error('Barcode scan processing failed:', error);
      toast.error(`Failed to process barcode: ${error.message}`);
      setLoadingProducts(prev => {
        const newSet = new Set(prev);
        newSet.clear();
        return newSet;
      });
    }
  };

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

      // First try barcode search - exact match
      console.log('Searching for barcode:', originalTerm);
      const barcodeResult = await indexedDb.getProductByBarcode(originalTerm);
      
      if (barcodeResult) {
        console.log('Found product by barcode:', barcodeResult);
        allResults.push(barcodeResult);
        foundByBarcode = true;
        setSearchType('barcode');
      }

      // If no barcode match found, or we want to show name matches too, search by name
      if (!foundByBarcode || !isLikelyBarcode(originalTerm)) {
        console.log('Searching by name:', searchTermLower);
        const nameResults = await indexedDb.searchByName(searchTermLower, 100);
        console.log('Found products by name:', nameResults.length);
        
        // Add name results, avoiding duplicates
        nameResults.forEach(product => {
          const productId = product.id || product._id;
          const exists = allResults.find(p => (p.id || p._id) === productId);
          if (!exists) {
            allResults.push(product);
          }
        });

        if (!foundByBarcode) {
          setSearchType('name');
        } else {
          setSearchType('both');
        }
      }

      console.log('Total results found:', allResults.length);
      setFilteredProducts(allResults);

    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
      setFilteredProducts([]);
      setSearchType('');
    }
  }, [isLikelyBarcode]);

  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  // Enhanced barcode scanner detection logic with auto-add functionality
  const searchInputRef = useRef(null);
  const scannerRef = useRef({
    buffer: '',
    firstTime: 0,
    lastTime: 0,
    timer: null
  });

  useEffect(() => {
    const THRESHOLD_AVG_MS = 80; // Faster typing threshold for scanner detection
    const CLEAR_TIMEOUT = 800;
    const MIN_BARCODE_LENGTH = 8; // Minimum characters for barcode

    const onKeyDown = (e) => {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;

      const now = Date.now();
      const s = scannerRef.current;
      const active = document.activeElement;
      const activeIsEditable = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

      // Only intercept if not focused on a different input
      if (activeIsEditable && searchInputRef.current !== active) {
        return;
      }

      if (e.key === 'Enter') {
        if (s.buffer.length >= MIN_BARCODE_LENGTH) {
          const totalTime = now - (s.firstTime || now);
          const avg = totalTime / Math.max(1, s.buffer.length);

          // If typed fast enough (like a scanner), treat as barcode scan
          if (avg < THRESHOLD_AVG_MS) {
            const code = s.buffer;
            console.log('Barcode scanned:', code, 'Average typing speed:', avg + 'ms per char');
            
            // Auto-add to cart instead of just searching
            handleBarcodeScanned(code);

            // Show scan feedback with cart icon
            toast.info(
              <div className="d-flex align-items-center">
                <i className="fas fa-barcode me-2"></i>
                <span>Barcode scanned: {code}</span>
              </div>,
              {
                position: 'top-center',
                autoClose: 1500,
                hideProgressBar: true
              }
            );

            e.preventDefault();
            e.stopPropagation();
          }
        }
        
        // Clear buffer
        clearTimeout(s.timer);
        s.buffer = '';
        s.firstTime = 0;
        s.lastTime = 0;
        s.timer = null;
        return;
      }

      // Capture character input
      if (e.key.length === 1) {
        // Reset buffer if too much time has passed
        if (s.lastTime && (now - s.lastTime) > 150) {
          s.buffer = '';
          s.firstTime = now;
        }
        
        if (!s.firstTime) s.firstTime = now;
        s.buffer += e.key;
        s.lastTime = now;

        // Auto-clear buffer after timeout
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
  }, [cartMap, getInventoryId, dispatch]); // Added dependencies for handleBarcodeScanned

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

  const setProductLoading = (productId, isLoading) => {
    setLoadingProducts(prev => {
      const newSet = new Set(prev);
      if (isLoading) {
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  };

  const handleQuantityChange = async (productId, newQuantity) => {
    try {
      console.log('handleQuantityChange called:', { productId, newQuantity });

      const product = filteredProducts.find(p => (p.id || p._id) === productId);
      if (!product) {
        console.error('Product not found:', productId);
        toast.error('Product not found');
        return;
      }

      console.log('Found product:', product);

      if (newQuantity === 0) {
        console.log('Removing from cart');
        dispatch(removeItemFromCart(productId));
        toast.success('Removed from cart');
        return;
      }

      const currentCartQty = cartMap[productId] || 0;
      const inventoryId = getInventoryId(product);

      if (!inventoryId) {
        console.error('No inventory ID found for product:', product);
        toast.error('Cannot validate stock - inventory ID missing');
        return;
      }

      console.log('Current cart quantity:', currentCartQty);
      console.log('Inventory ID:', inventoryId);

      setProductLoading(productId, true);

      if (newQuantity > currentCartQty) {
        const qtyToAdd = newQuantity - currentCartQty;
        console.log('Adding quantity:', qtyToAdd);

        const validation = await validateAndAddToCart({
          productId,
          inventoryId,
          qty: qtyToAdd,
          currentCartQty
        });

        console.log('Validation result:', validation);

        if (validation.status === 'conflict') {
          toast.error(validation.message);
          setProductLoading(productId, false);
          return;
        }

        if (validation.status === 'error') {
          toast.error(validation.message);
          setProductLoading(productId, false);
          return;
        }

        if (validation.status === 'warning') {
          toast.warning(validation.message);
        }
      } else {
        const validation = await validateCartQuantityChange({
          productId,
          inventoryId,
          newQty: newQuantity,
          currentCartQty
        });

        console.log('Quantity change validation:', validation);

        if (validation.status === 'conflict') {
          toast.error(validation.message);
          setProductLoading(productId, false);
          return;
        }

        if (validation.status === 'error') {
          toast.error(validation.message);
          setProductLoading(productId, false);
          return;
        }
      }

      if (currentCartQty > 0) {
        console.log('Updating cart item. Current:', currentCartQty, 'New:', newQuantity);
        dispatch(updateCartItemQuantity({ productId, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        console.log('Adding new item to cart');
        dispatch(addItemToCart({
          product: { ...product, id: productId },
          quantity: newQuantity
        }));
        toast.success('Added to cart');
      }

      setProductLoading(productId, false);
    } catch (error) {
      console.error('Cart operation failed:', error);
      toast.error(`Failed to update cart: ${error.message}`);
      setProductLoading(productId, false);
    }
  };

  const handleRemoveItem = (productId, productName) => {
    if (window.confirm(`Remove "${productName}" from cart?`)) {
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
    }
  };

  // Get current position for order location tracking
  useEffect(() => {
    if (navigator && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => {
          console.warn('Geolocation unavailable:', err?.message || err);
        },
        { timeout: 3000 }
      );
    }
  }, []);

  const completeCheckout = async () => {
    if (!paymentType) {
      toast.error('Please select a payment method');
      return;
    }

    if (paymentType === 'cash') {
      const cashVal = Number(paymentData.cashAmount);
      if (!paymentData.cashAmount || Number.isNaN(cashVal) || cashVal < cartTotal) {
        toast.error('Please enter a valid cash amount (>= total)');
        return;
      }
    }

    if (paymentType === 'mpesa' && (!paymentData.mpesaPhone || paymentData.mpesaPhone.trim().length === 0)) {
      toast.error('Please enter M-Pesa phone number');
      return;
    }

    // Build order payload - exclude userId for cash payments
    const payload = {
      orderPaymentType: paymentType === 'cash' ? 'Cash' : 'Mpesa',
      phoneNumber: paymentType === 'mpesa' ? paymentData.mpesaPhone.trim() : (user && user.phone) || '',
      buyerPin: 'N/A',
      latitude: coords?.lat ?? 0,
      longitude: coords?.lng ?? 0,
      orderItems: cart.map(ci => ({
        productId: Number(ci.id || ci._id),
        quantity: ci.quantity
      }))
    };

    // Add userId only for M-Pesa payments
    if (paymentType === 'mpesa') {
      payload.userId = (user && (user.phone || user.userName)) || '';
    }

    try {
      toast.info('Processing payment...');

      const res = await api.post('/order', payload , {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      toast.success('Order completed successfully!');

      // Prepare receipt data for thermal printing
      const orderData = {
        cart: cart,
        cartTotal: cartTotal,
        paymentType: paymentType,
        paymentData: {
          ...paymentData,
          cashAmount: paymentType === 'cash' ? Number(paymentData.cashAmount) : 0,
          change: paymentType === 'cash' ? Math.max(0, Number(paymentData.cashAmount) - cartTotal) : 0
        },
        user: user,
        orderNumber: res.data?.orderNumber || `ORD-${Date.now().toString().slice(-6)}`,
        customerPhone: paymentType === 'mpesa' ? paymentData.mpesaPhone.trim() : ''
      };

      // Print thermal receipt
      try {
        await printOrderReceipt(orderData);
        toast.success('Receipt printed successfully!');
      } catch (printError) {
        console.error('Failed to print receipt:', printError);
        toast.warning('Order completed but receipt printing failed. Check printer connection.');
      }

      dispatch(clearCart());

      setCheckoutVisible(false);
      setPaymentType('');
      setPaymentData({ cashAmount: '', mpesaPhone: '' });

      if (paymentType === 'cash') {
        const given = Number(paymentData.cashAmount);
        const change = given - cartTotal;
        if (!Number.isNaN(change) && change > 0) {
          toast.info(`Change to return: ${KSH(change)}`);
        }
      }
    } catch (err) {
      console.error('Checkout failed', err);
      const msg = err?.response?.data?.message || err?.message || 'Checkout failed. Please try again.';
      toast.error(msg);
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setFilteredProducts([]);
    setHasSearched(false);
    setSearchType('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  return (
    <div className="container-fluid py-4" style={{
      background: '#f8f9fa',
      minHeight: '100vh',
      maxWidth: '100%',
      overflow: 'hidden'
    }}>
      <div className="row mb-4">
        <div className="col-12">
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
                  <button
                    className="btn btn-outline-secondary border-start-0"
                    type="button"
                    onClick={clearSearch}
                    title="Clear search"
                  >
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
            <button
              className="btn btn-lg px-4"
              onClick={refresh}
              style={{ ...CTA, minWidth: '120px' }}
              disabled={loading}
            >
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
      </div>

      <div className="row" style={{ maxWidth: '100%', margin: 0 }}>
        {!hasSearched ? (
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
        ) : filteredProducts.length === 0 ? (
          <div className="col-12">
            <div className="text-center py-5">
              <i className={`fas ${isLikelyBarcode(searchTerm) ? 'fa-barcode' : 'fa-exclamation-circle'} fa-3x text-muted mb-3`}></i>
              <h5 className="text-muted">
                {isLikelyBarcode(searchTerm) ? 'No product found with this barcode' : 'No products found'}
              </h5>
              <p className="text-muted">
                {isLikelyBarcode(searchTerm) 
                  ? `Barcode "${searchTerm}" not found in inventory`
                  : 'Try a different search term or barcode'
                }
              </p>
            </div>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const productId = product.id || product._id;
            const isLoading = loadingProducts.has(productId);

            return (
              <div key={productId} className="col-6 col-sm-4 col-md-3 col-lg-2 col-xl-2 mb-3">
                <div style={{ position: 'relative' }}>
                  <ProductCard
                    product={product}
                    cartQuantity={cartMap[productId] || 0}
                    onQuantityChange={handleQuantityChange}
                  />
                  {isLoading && (
                    <div
                      className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        borderRadius: '12px',
                        zIndex: 10
                      }}
                    >
                      <div className="spinner-border text-primary" style={{ width: '2rem', height: '2rem' }}>
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasSearched && filteredProducts.length > 0 && (
        <div className="row mt-3">
          <div className="col-12">
            <div className="text-center text-muted">
              <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} me-1`}></i>
              Found {filteredProducts.length} products for "{searchTerm}"
              {searchType === 'barcode' && <span className="badge bg-success ms-2">Auto-Added to Cart</span>}
            </div>
          </div>
        </div>
      )}

      <Modal
        show={checkoutVisible}
        onHide={() => setCheckoutVisible(false)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center">
            <i className="fas fa-shopping-cart me-2"></i>
            Checkout
            <span className="badge bg-primary ms-2">{cartItemCount} items</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-semibold mb-0">Order Summary</h6>
              {cartItemCount > 0 && (
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={handleClearCart}
                  title="Clear all items"
                >
                  <i className="fas fa-trash me-1"></i>
                  Clear Cart
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-4">
                <i className="fas fa-shopping-cart fa-3x text-muted mb-3"></i>
                <h6 className="text-muted">Your cart is empty</h6>
                <p className="text-muted mb-0">Add some products to get started</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover">
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: '0.9rem' }}>Product</th>
                      <th style={{ fontSize: '0.9rem' }} className="text-center">Qty</th>
                      <th style={{ fontSize: '0.9rem' }} className="text-end">Price</th>
                      <th style={{ fontSize: '0.9rem' }} className="text-end">Total</th>
                      <th style={{ fontSize: '0.9rem', width: '60px' }} className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => {
                      const itemPrice = item.salePrice || item.price || 0;
                      const itemTotal = itemPrice * (item.quantity || 1);
                      const itemId = item.id || item._id;

                      return (
                        <tr key={itemId}>
                          <td style={{ fontSize: '0.85rem', maxWidth: '180px' }}>
                            <div className="text-truncate" title={item.name}>
                              <strong>{item.name}</strong>
                              {item.barcode && (
                                <div className="text-muted small">
                                  <i className="fas fa-barcode me-1"></i>
                                  {item.barcode}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-center" style={{ fontSize: '0.85rem' }}>
                            <span className="badge bg-secondary px-2 py-1">
                              {item.quantity || 1}
                            </span>
                          </td>
                          <td className="text-end" style={{ fontSize: '0.85rem' }}>
                            {KSH(itemPrice)}
                          </td>
                          <td className="text-end fw-semibold" style={{ fontSize: '0.85rem' }}>
                            {KSH(itemTotal)}
                          </td>
                          <td className="text-center">
                            <button
                              className="btn btn-outline-danger btn-sm rounded-circle"
                              onClick={() => handleRemoveItem(itemId, item.name)}
                              title={`Remove ${item.name}`}
                              style={{ width: '28px', height: '28px', padding: '0' }}
                            >
                              <i className="fas fa-times" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <td colSpan="2" className="fw-semibold">
                        <i className="fas fa-shopping-bag me-1"></i>
                        Total Items: {cartItemCount}
                      </td>
                      <td className="text-end fw-bold fs-6">
                        Grand Total:
                      </td>
                      <td className="text-end fw-bold fs-5 text-success">
                        {KSH(cartTotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <>
              <hr className="my-4" />
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">
                  <i className="fas fa-credit-card me-2"></i>
                  Payment Method
                </Form.Label>
                <Form.Select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  size="lg"
                >
                  <option value="">Select payment method</option>
                  <option value="cash">💵 Cash</option>
                  <option value="mpesa">📱 M-Pesa</option>
                </Form.Select>
              </Form.Group>

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
                    />
                  </div>
                  {paymentData.cashAmount && Number(paymentData.cashAmount) >= cartTotal && (
                    <div className="mt-2 p-3 bg-success bg-opacity-10 rounded border-start border-success border-4">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-success fw-semibold">
                          <i className="fas fa-check-circle me-1"></i>
                          Change to give:
                        </span>
                        <span className="text-success fw-bold fs-5">
                          {KSH(Number(paymentData.cashAmount) - cartTotal)}
                        </span>
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
                      placeholder="07XXXXXXXX or 2547XXXXXXXX"
                      value={paymentData.mpesaPhone}
                      onChange={(e) => setPaymentData({ ...paymentData, mpesaPhone: e.target.value })}
                    />
                  </div>
                </Form.Group>
              )}
            </>
          )}
        </Modal.Body>

        {cart.length > 0 && (
          <Modal.Footer className="bg-light">
            <Button
              variant="outline-secondary"
              onClick={() => setCheckoutVisible(false)}
              size="lg"
            >
              <i className="fas fa-arrow-left me-2"></i>
              Continue Shopping
            </Button>
            <Button
              style={CTA}
              onClick={completeCheckout}
              disabled={!paymentType}
              size="lg"
              className="px-4"
            >
              <i className="fas fa-check me-2"></i>
              Complete Order - {KSH(cartTotal)}
            </Button>
          </Modal.Footer>
        )}

        {cart.length === 0 && (
          <Modal.Footer>
            <Button
              variant="primary"
              onClick={() => setCheckoutVisible(false)}
              size="lg"
            >
              <i className="fas fa-arrow-left me-2"></i>
              Back to Shopping
            </Button>
          </Modal.Footer>
        )}
      </Modal>

      {cartItemCount > 0 && (
        <div className="position-fixed bottom-0 end-0 m-4" style={{ zIndex: 999 }}>
          <button
            className="btn btn-success rounded-circle shadow-lg border-0"
            onClick={() => setCheckoutVisible(true)}
            title="View Cart & Checkout"
            style={{
              width: '70px',
              height: '70px',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <div className="position-relative">
              <i className="fas fa-shopping-cart"></i>
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                {cartItemCount}
              </span>
            </div>
          </button>
        </div>
      )}

      <style jsx>{`
        @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css');

        .table-hover tbody tr:hover {
          background-color: rgba(0, 123, 255, 0.05);
        }

        .btn-outline-danger:hover {
          transform: scale(1.05);
        }

        .product-card:hover {
          border-color: #007bff !important;
        }

        /* Enhanced barcode scanner animation */
        .input-group-text i.fa-barcode {
          animation: barcodeGlow 1.5s ease-in-out infinite alternate;
        }

        @keyframes barcodeGlow {
          from { 
            color: #28a745; 
            transform: scale(1);
          }
          to { 
            color: #007bff; 
            transform: scale(1.1);
          }
        }

        /* Search input focus styles */
        .form-control:focus {
          border-color: #007bff;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
        }

        /* Product card barcode styling */
        .product-card .text-muted.small {
          opacity: 0.7;
          transition: opacity 0.2s;
        }

        .product-card:hover .text-muted.small {
          opacity: 1;
        }

        /* Toast notification enhancements for barcode scanning */
        .Toastify__toast--info {
          background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
        }

        .Toastify__toast--success {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        }

        /* Cart button pulse animation when items are added */
        @keyframes cartPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }

        .cart-added {
          animation: cartPulse 0.3s ease-in-out;
        }

        /* Scanning indicator */
        .scanning-active {
          box-shadow: 0 0 10px rgba(40, 167, 69, 0.5);
          border-color: #28a745 !important;
        }
      `}</style>
    </div>
  );
}