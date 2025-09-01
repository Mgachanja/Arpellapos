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

// Import thermal printer service
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

// Enhanced Product Card Component
function ProductCard({ product, cartQuantity, onQuantityChange }) {
  const productId = product.id || product._id;

  const handleIncrement = () => {
    onQuantityChange(productId, (cartQuantity || 0) + 1);
  };

  const handleDecrement = () => {
    if (cartQuantity > 1) {
      onQuantityChange(productId, cartQuantity - 1);
    } else if (cartQuantity === 1) {
      onQuantityChange(productId, 0); // This will remove from cart
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
      {/* Product Info */}
      <div className="flex-grow-1 mb-3">
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm"
            style={{ fontSize: '0.9rem', minHeight: '2.4rem' }}>
          {product.name}
        </h6>
        <div className="product-price fw-bold text-success mb-0"
             style={{ fontSize: '1rem' }}>
          {KSH(product.salePrice || product.price || 0)}
        </div>
      </div>

      {/* Quantity Controls */}
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

  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [paymentType, setPaymentType] = useState('');
  const [paymentData, setPaymentData] = useState({ cashAmount: '', mpesaPhone: '' });

  // Loading states for individual products during validation
  const [loadingProducts, setLoadingProducts] = useState(new Set());

  // coordinates (non-blocking; fallback to 0,0)
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

  // Helper to extract inventoryId from product
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

  // Fetch initial data
  useEffect(() => {
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(async () => {
        const all = await indexedDb.getAllProducts();
        setProducts(all);
      })
      .catch(() => toast.error('Failed to sync products'));
  }, [dispatch]);

  // Search function - only by name and barcodes
  const performSearch = useCallback(async (term) => {
    if (!term || term.trim().length === 0) {
      setFilteredProducts([]);
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    const searchTerm = term.toLowerCase().trim();

    try {
      // Search by name using IndexedDB
      const nameResults = await indexedDb.searchByName(searchTerm, 100);

      // Search by barcode using IndexedDB
      const barcodeResult = await indexedDb.getProductByBarcode(term);

      // Combine results and remove duplicates
      const allResults = [...nameResults];
      if (barcodeResult && !allResults.find(p => (p.id || p._id) === (barcodeResult.id || barcodeResult._id))) {
        allResults.unshift(barcodeResult); // Add barcode match at the beginning
      }

      setFilteredProducts(allResults);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
      setFilteredProducts([]);
    }
  }, []);

  // Debounced search
  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  // Handle search input change
  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  // Refresh products
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

  // Set loading state for a product
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

  // Handle quantity changes with inventory validation
  const handleQuantityChange = async (productId, newQuantity) => {
    try {
      console.log('handleQuantityChange called:', { productId, newQuantity });

      // Find the product to get inventoryId
      const product = filteredProducts.find(p => (p.id || p._id) === productId);
      if (!product) {
        console.error('Product not found:', productId);
        toast.error('Product not found');
        return;
      }

      console.log('Found product:', product);

      if (newQuantity === 0) {
        // Remove from cart - no validation needed
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

      // Set loading state
      setProductLoading(productId, true);

      if (newQuantity > currentCartQty) {
        // Adding items - validate with server using inventoryId
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
          // Continue with the operation despite warning
        }
      } else {
        // Reducing quantity - validate with cached/local data if available
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
        // Update existing item quantity
        console.log('Updating cart item. Current:', currentCartQty, 'New:', newQuantity);
        dispatch(updateCartItemQuantity({ productId, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        // Add new item to cart
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

  // Remove specific item from cart
  const handleRemoveItem = (productId, productName) => {
    if (window.confirm(`Remove "${productName}" from cart?`)) {
      dispatch(removeItemFromCart(productId));
      toast.success('Item removed from cart');
    }
  };

  // Clear entire cart
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

  // Attempt to obtain browser geolocation once (non-blocking)
  useEffect(() => {
    if (navigator && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => {
          // fail silently; coords remain 0,0
          console.warn('Geolocation unavailable:', err?.message || err);
        },
        { timeout: 3000 }
      );
    }
  }, []);

  // Complete checkout with thermal printing
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

    // Build the payload
    const payload = {
      userId: (user && (user.phone || user.userName)) || 'unknown',
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

    try {
      toast.info('Processing payment...');

      // Perform POST to /orders with the exact payload
      const res = await api.post('/order', payload);

      toast.success('Order completed successfully!');

      // Prepare data for thermal printer
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

      // Print receipt using thermal printer
      try {
        await printOrderReceipt(orderData);
        toast.success('Receipt printed successfully!');
      } catch (printError) {
        console.error('Failed to print receipt:', printError);
        toast.warning('Order completed but receipt printing failed. Check printer connection.');
      }

      // Clear cart
      dispatch(clearCart());

      // reset checkout modal & form
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
      // prefer backend message if provided
      const msg = err?.response?.data?.message || err?.message || 'Checkout failed. Please try again.';
      toast.error(msg);
    }
  };

  return (
    <div className="container-fluid py-4" style={{
      background: '#f8f9fa',
      minHeight: '100vh',
      maxWidth: '100%',
      overflow: 'hidden'
    }}>
      {/* Header Section */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex flex-column flex-md-row gap-3 align-items-center">
            <div className="flex-grow-1">
              <div className="input-group input-group-lg">
                <span className="input-group-text bg-white border-end-0">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search products by name or barcode..."
                  className="form-control border-start-0 ps-0"
                  style={{ fontSize: '1rem' }}
                />
              </div>
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

      {/* Products Grid */}
      <div className="row" style={{ maxWidth: '100%', margin: 0 }}>
        {!hasSearched ? (
          <div className="col-12">
            <div className="text-center py-5">
              <i className="fas fa-search fa-3x text-muted mb-3"></i>
              <h5 className="text-muted">Search for products</h5>
              <p className="text-muted">Enter a product name or scan/type a barcode to find products</p>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="col-12">
            <div className="text-center py-5">
              <i className="fas fa-exclamation-circle fa-3x text-muted mb-3"></i>
              <h5 className="text-muted">No products found</h5>
              <p className="text-muted">Try a different search term or barcode</p>
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

      {/* Results Info */}
      {hasSearched && filteredProducts.length > 0 && (
        <div className="row mt-3">
          <div className="col-12">
            <div className="text-center text-muted">
              Found {filteredProducts.length} products for "{searchTerm}"
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
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
          {/* Cart Items Table */}
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

          {/* Payment Method - Only show if cart has items */}
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

              {/* Cash Payment Fields */}
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

              {/* M-Pesa Payment Fields */}
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

      {/* Floating Cart Button */}
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

      {/* Add Font Awesome for icons */}
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
      `}</style>
    </div>
  );
}