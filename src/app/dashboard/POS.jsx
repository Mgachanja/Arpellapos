// src/screens/Index.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from 'react-bootstrap';
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
import { printOrderReceipt } from '../thermalPrinter/thermalPrinter';
import heldSalesService from '../../services/heldSalesService';

// Import modular components
import SearchHeader from '../components/SearchHeader';
import SearchTools from '../components/SearchTools';
import ProductsGrid from '../components/ProductsGrid';
import CartItems from '../components/CartItems';
import PaymentForm from '../components/PaymentForm';
import HeldSales from '../components/HeldSales';
import MpesaTillPayment from '../components/MpesaTillPayment';

const CTA = { background: '#FF7F50', color: '#fff' };
const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), wait);
  }, [fn, wait]);
}

export default function POS() {
  const [pendingOrderData, setPendingOrderData] = useState(null);
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
  
  // Held Sales State
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [heldSales, setHeldSales] = useState([]);

  // MPesa Till Payment State
  const [showMpesaTillModal, setShowMpesaTillModal] = useState(false);

  // pinned scanned product
  const [scannedProduct, setScannedProduct] = useState(null);

  const dispatch = useDispatch();
  const cart = useSelector(selectCart) || [];
  const cartItemCount = useSelector(selectCartItemCount);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  const searchInputRef = useRef(null);
  const scannerRef = useRef({ buffer: '', firstTime: 0, lastTime: 0, timer: null });
  const barcodeResultsRef = useRef(null);

  const scannedProductTimerRef = useRef(null);
  const SCANNED_PRODUCT_TTL_MS = 15000;

  const getInventoryId = useCallback((product) => {
    return product?.inventoryId || product?.inventory?.id || product?.inventory?._id || product?.inventory_id || product?.invId || product?.inventoryIdString || null;
  }, []);

  const isLikelyBarcode = useCallback((term) => {
    if (!term) return false;
    const numericOnly = /^\d+$/.test(term.trim());
    const length = term.trim().length;
    return numericOnly && length >= 8 && length <= 20;
  }, []);

  const setProductLoading = useCallback((productId, isLoading) => {
    setLoadingProducts(prev => {
      const next = new Set(prev);
      if (isLoading) next.add(productId); else next.delete(productId);
      return next;
    });
  }, []);

  const calculateCartTotal = useCallback(() => {
    return (Array.isArray(cart) ? cart : []).reduce((total, item) => {
      const price = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
      return total + price * (item.quantity || 1);
    }, 0);
  }, [cart]);

  const focusSearchInput = useCallback(() => {
    const el = searchInputRef.current;
    if (el?.focus) try { el.focus({ preventScroll: true }); } catch (err) {}
  }, []);

  const clearSearchAndProducts = useCallback(() => {
    if (searchInputRef.current) try { searchInputRef.current.value = ''; } catch (e) {}
    setSearchTerm(''); 
    setFilteredProducts([]); 
    setHasSearched(false); 
    setSearchType(''); 
    barcodeResultsRef.current = null;
    requestAnimationFrame(() => { 
      try { 
        if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); 
        else focusSearchInput(); 
      } catch (e) {} 
    });
  }, [focusSearchInput]);

  const maskPhoneForReceipt = useCallback((rawPhone) => {
    if (!rawPhone) return 'Walk-in';
    const s = String(rawPhone).trim();
    if (s.length < 6) return s;
    const idx = s.length - 6;
    return s.substring(0, idx) + '***' + s.substring(s.length - 3);
  }, []);

  const handleOrderCompletion = useCallback(async (orderData, cartSnapshot = null, paymentTypeSnapshot = null, paymentDataSnapshot = null) => {
    toast.success('Order completed');
  
    const itemsToReceipt = cartSnapshot || cart;
    const usedPaymentType = paymentTypeSnapshot || paymentType;
    const usedPaymentData = paymentDataSnapshot || paymentData;
  
    const receiptItems = (Array.isArray(itemsToReceipt) ? itemsToReceipt : []).map(ci => {
      const sellingPrice = ci.priceType === 'Retail' ? (ci.price || 0) : (ci.priceAfterDiscount || ci.price || 0);
      const quantity = ci.quantity || 1;
      const lineTotal = sellingPrice * quantity;
      return { 
        name: ci.name || ci.productName || 'Item', 
        productName: ci.name || ci.productName || 'Item', 
        salePrice: sellingPrice, 
        sellingPrice, 
        price: sellingPrice, 
        quantity, 
        qty: quantity, 
        lineTotal, 
        total: lineTotal, 
        priceType: ci.priceType, 
        barcode: ci.barcode || '' 
      };
    });
  
    const cartTotalFromLines = receiptItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
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
    const storeSettings = { 
      storeName: 'ARPELLA STORE LIMITED', 
      storeAddress: 'Ngong, Matasia', 
      storePhone: '+254 7xx xxx xxx', 
      pin: 'P052336649L', 
      receiptFooter: 'Thank you for your business!' 
    };
  
    const calculatePaymentDetails = () => {
      const paymentInfo = { cashAmount: 0, mpesaAmount: 0, change: 0 };
      if (usedPaymentType === 'cash') { 
        paymentInfo.cashAmount = Number(usedPaymentData.cashAmount) || 0; 
        paymentInfo.change = Math.max(0, paymentInfo.cashAmount - cartTotalFromLines); 
      } else if (usedPaymentType === 'mpesa' || usedPaymentType === 'mpesaTill') { 
        paymentInfo.mpesaAmount = Number(usedPaymentData.mpesaAmount) || cartTotalFromLines; 
      } else if (usedPaymentType === 'both') { 
        paymentInfo.cashAmount = Number(usedPaymentData.cashAmount) || 0; 
        paymentInfo.mpesaAmount = Number(usedPaymentData.mpesaAmount) || 0; 
        const totalPaid = paymentInfo.cashAmount + paymentInfo.mpesaAmount; 
        paymentInfo.change = Math.max(0, totalPaid - cartTotalFromLines); 
      }
      return paymentInfo;
    };
  
    const paymentDetails = calculatePaymentDetails();
  
    const normalizedUser = {
      id: actualUser?.id || actualUser?._id || actualUser?.userId || null,
      fullName: cashierName, 
      full_name: cashierName, 
      name: cashierName,
      firstName: actualUser?.firstName || actualUser?.first_name || '', 
      first_name: actualUser?.firstName || actualUser?.first_name || '',
      lastName: actualUser?.lastName || actualUser?.last_name || '', 
      last_name: actualUser?.lastName || actualUser?.last_name || '',
      userName: actualUser?.userName || actualUser?.username || cashierName, 
      username: actualUser?.userName || actualUser?.username || cashierName,
      phone: actualUser?.phone || actualUser?.phoneNumber || actualUser?.mobile || '', 
      phoneNumber: actualUser?.phone || actualUser?.phoneNumber || actualUser?.mobile || '', 
      email: actualUser?.email || ''
    };
  
    const rawCustomerPhone = (usedPaymentType === 'mpesa' || usedPaymentType === 'both' || usedPaymentType === 'mpesaTill') ? (usedPaymentData.mpesaPhone || '').trim() || '' : (user && (user.phone || user.phoneNumber)) || '';
    const maskedCustomerPhone = rawCustomerPhone ? maskPhoneForReceipt(rawCustomerPhone) : 'Walk-in';
  
    const receiptData = {
      cart: receiptItems,
      cartTotal: Number.isFinite(cartTotalFromLines) && cartTotalFromLines >= 0 ? cartTotalFromLines : cartTotalFromLines,
      paymentType: usedPaymentType || 'cash',
      paymentData: paymentDetails,
      user: normalizedUser, 
      cashier: normalizedUser,
      orderNumber: orderData?.orderNumber || orderData?.orderId || orderData?.orderid || orderData?.id || `ORD-${Date.now().toString().slice(-6)}`,
      orderId: orderData?.orderNumber || orderData?.orderId || orderData?.orderid || orderData?.id || `ORD-${Date.now().toString().slice(-6)}`,
      customerPhone: maskedCustomerPhone,
      storeSettings
    };
  
    if (!cartSnapshot) {
      dispatch(clearCart());
      setPaymentType(''); 
      setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); 
      setCurrentOrderId(null); 
      
      setProcessingOrder(false);
      setPendingOrderData(null);
      clearSearchAndProducts();
    }
  
    if (paymentDetails.change > 0) {
      toast.info(`Change: ${KSH(paymentDetails.change)}`, { autoClose: 5000, position: 'top-center' });
    }
  
    try {
      const res = await printOrderReceipt(receiptData, null, storeSettings);
      if (res?.success) toast.success('Receipt printed successfully'); 
      else toast.warning(`Receipt printing: ${res?.message || 'failed'}`);
    } catch (err) {
      toast.error('Receipt printing failed - check printer');
    }
  
    if (cartSnapshot) {
      dispatch(clearCart());
      setPaymentType(''); 
      setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); 
      setCurrentOrderId(null); 
      setPendingOrderData(null);
      setProcessingOrder(false);
      setPendingOrderData(null);
      clearSearchAndProducts();
    }
  }, [cart, paymentType, paymentData, user, maskPhoneForReceipt, dispatch, clearSearchAndProducts]);

  const createOrder = useCallback(async (overrides = {}) => {
    const pt = overrides.paymentType ?? paymentType;
    const pd = overrides.paymentData ?? paymentData;
  
    if (!pt) {
      toast.error('Please select a payment method');
      return;
    }
  
    const currentCartTotal = calculateCartTotal();
  
    if (pt === 'both') {
      const cashVal = Number(pd.cashAmount) || 0;
      const mpesaVal = Number(pd.mpesaAmount) || 0;
      if (!pd.mpesaPhone || pd.mpesaPhone.trim().length === 0) {
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
      order: {
        userId: pt === 'mpesa' || pt === 'both' ? (pd.mpesaPhone || '').trim() : (user && (user.phone || user.userName)) || '',
        phoneNumber: pt === 'mpesa' || pt === 'both' ? (pd.mpesaPhone || '').trim() : (user && user.phone) || 'N/A',
        orderPaymentType: pt === 'cash' ? 'Cash' : pt === 'mpesa' ? 'Mpesa' : 'Hybrid',
        latitude: coords?.lat ?? 0,
        longitude: coords?.lng ?? 0,
        buyerPin: 'N/A',
        orderSource: 'POS',
        orderitems: (Array.isArray(cart) ? cart : []).map(ci => ({
          productId: Number(ci.id || ci._id),
          quantity: ci.quantity,
          priceType: ci.priceType
        }))
      }
    };
  
    if (pt === 'both') {
      payload.order.total = Number(pd.mpesaAmount) || 0;
      payload.order.cashAmount = Number(pd.cashAmount) || 0;
    }
    if (pt === 'cash') payload.order.cashAmount = Number(pd.cashAmount) || 0;
  
    try {
      setProcessingOrder(true);
      toast.info('Creating order...');
      
      const cartSnapshot = JSON.parse(JSON.stringify(cart));
      const paymentTypeSnapshot = pt;
      const paymentDataSnapshot = JSON.parse(JSON.stringify(pd));
      
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      
      try {
        const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id || `ORD-${Date.now().toString().slice(-6)}`;
        const cartSnap = cartSnapshot || JSON.parse(JSON.stringify(cart));
        const usedPaymentType = paymentTypeSnapshot || paymentType;
        const usedPaymentData = paymentDataSnapshot || paymentData;
        const cartTotal = (Array.isArray(cartSnap) ? cartSnap : []).reduce((s, it) => {
          const price = it.priceType === 'Retail' ? (it.price || 0) : (it.priceAfterDiscount || it.price || 0);
          return s + price * (it.quantity || 1);
        }, 0);
        const cash = Number(usedPaymentData?.cashAmount) || 0;
        const mpesa = Number(usedPaymentData?.mpesaAmount) || 0;
        const totalPaid = usedPaymentType === 'cash' ? cash : usedPaymentType === 'mpesa' ? mpesa : cash + mpesa;
        const status = totalPaid >= cartTotal ? 'paid' : 'pending';
      
        const localOrder = {
          orderId,
          orderData: res.data || {},
          cart: cartSnap,
          cartTotal,
          paymentType: usedPaymentType,
          paymentData: usedPaymentData,
          status,
          createdAt: Date.now()
        };
      
        await indexedDb.putOrder(localOrder);
        toast.info('Order cached locally');
      } catch (err) {
        console.warn('Failed to write order to indexedDb', err);
      }
      
      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      
      if (orderId) {
        setCurrentOrderId(orderId);
        toast.success(`Order created. ID: ${orderId}`);
        
        if (pt !== 'both') {
          await handleOrderCompletion(res.data);
        } else {
          setPendingOrderData({
            orderData: res.data,
            cartSnapshot,
            paymentTypeSnapshot,
            paymentDataSnapshot
          });
          toast.info('Hybrid order created. Confirm M-Pesa payment.');
        }
      } else {
        toast.success('Order created.');
        if (pt !== 'both') await handleOrderCompletion(res.data);
        else {
          setPendingOrderData({
            orderData: res.data,
            cartSnapshot,
            paymentTypeSnapshot,
            paymentDataSnapshot
          });
        }
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Order failed';
      toast.error(msg);
      setProcessingOrder(false);
    }
  }, [paymentType, paymentData, coords, cart, user, calculateCartTotal, handleOrderCompletion]);
  
  const completeCheckout = useCallback(async (overrides = {}) => {
    const pt = overrides.paymentType ?? paymentType;
    const pd = overrides.paymentData ?? paymentData;
  
    if (!pt) {
      toast.error('Please select a payment method');
      return;
    }
  
    const currentCartTotal = calculateCartTotal();
  
    if (pt === 'cash') {
      const cashVal = Number(pd.cashAmount);
      if (!pd.cashAmount || Number.isNaN(cashVal) || cashVal < currentCartTotal) {
        toast.error('Please enter a valid cash amount (>= total)');
        return;
      }
    }
  
    if (pt === 'mpesa' && (!pd.mpesaPhone || pd.mpesaPhone.trim().length === 0)) {
      toast.error('Please enter M-Pesa phone number');
      return;
    }
  
    const payload = {
      order: {
        userId: pt === 'mpesa' ? (pd.mpesaPhone || '').trim() : (user && (user.phone || user.userName)) || '',
        phoneNumber: pt === 'mpesa' ? pd.mpesaPhone.trim() : (user && user.phone) || 'N/A',
        orderPaymentType: pt === 'cash' ? 'Cash' : 'Mpesa',
        latitude: coords?.lat ?? 0,
        longitude: coords?.lng ?? 0,
        buyerPin: 'N/A',
        orderSource: 'POS',
        orderitems: (Array.isArray(cart) ? cart : []).map(ci => ({
          productId: Number(ci.id || ci._id),
          quantity: ci.quantity,
          priceType: ci.priceType
        }))
      }
    };
  
    if (pt === 'cash') payload.order.cashAmount = Number(pd.cashAmount) || 0;
  
    try {
      setProcessingOrder(true);
      toast.info(pt === 'mpesa' ? 'Creating M-Pesa order...' : 'Processing payment...');
      
      const cartSnapshot = JSON.parse(JSON.stringify(cart));
      const paymentTypeSnapshot = pt;
      const paymentDataSnapshot = JSON.parse(JSON.stringify(pd));
      
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      
      try {
        const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id || `ORD-${Date.now().toString().slice(-6)}`;
        const cartSnap = cartSnapshot || JSON.parse(JSON.stringify(cart));
        const usedPaymentType = paymentTypeSnapshot || paymentType;
        const usedPaymentData = paymentDataSnapshot || paymentData;
        const cartTotal = (Array.isArray(cartSnap) ? cartSnap : []).reduce((s, it) => {
          const price = it.priceType === 'Retail' ? (it.price || 0) : (it.priceAfterDiscount || it.price || 0);
          return s + price * (it.quantity || 1);
        }, 0);
        const cash = Number(usedPaymentData?.cashAmount) || 0;
        const mpesa = Number(usedPaymentData?.mpesaAmount) || 0;
        const totalPaid = usedPaymentType === 'cash' ? cash : usedPaymentType === 'mpesa' ? mpesa : cash + mpesa;
        const status = totalPaid >= cartTotal ? 'paid' : 'pending';
      
        const localOrder = {
          orderId,
          orderData: res.data || {},
          cart: cartSnap,
          cartTotal,
          paymentType: usedPaymentType,
          paymentData: usedPaymentData,
          status,
          createdAt: Date.now()
        };
      
        await indexedDb.putOrder(localOrder);
        toast.info('Order cached locally');
      } catch (err) {
        console.warn('Failed to write order to indexedDb', err);
      }
      
      const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;
      
      if (pt === 'mpesa') {
        if (orderId) {
          setCurrentOrderId(orderId);
          toast.success(`M-Pesa order created. ID: ${orderId}`);
        } else {
          toast.success('M-Pesa order created.');
        }
        
        setPendingOrderData({
          orderData: res.data,
          cartSnapshot,
          paymentTypeSnapshot,
          paymentDataSnapshot
        });
        
        setProcessingOrder(false);
      } else {
        await handleOrderCompletion(res.data);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Checkout failed';
      toast.error(msg);
      setProcessingOrder(false);
    }
  }, [paymentType, paymentData, coords, cart, user, calculateCartTotal, handleOrderCompletion]);
  
  const handleMpesaTillPayment = useCallback(async (transactionId) => {
    try {
      setProcessingOrder(true);
      toast.info('Processing MPesa Till payment...');
      
      const cartSnapshot = JSON.parse(JSON.stringify(cart));
      const paymentTypeSnapshot = 'mpesaTill';
      const paymentDataSnapshot = { mpesaPhone: user?.phone || 'N/A', transactionId };
      
      const payload = {
        order: {
          userId: (user && (user.phone || user.userName)) || '',
          phoneNumber: (user && user.phone) || 'N/A',
          orderPaymentType: 'c2b',
          latitude: coords?.lat ?? 0,
          longitude: coords?.lng ?? 0,
          buyerPin: 'N/A',
          orderSource: 'POS',
          orderitems: (Array.isArray(cart) ? cart : []).map(ci => ({
            productId: Number(ci.id || ci._id),
            quantity: ci.quantity,
            priceType: ci.priceType
          }))
        },
        transactionId: transactionId
      };
      
      const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
      
      try {
        const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id || `ORD-${Date.now().toString().slice(-6)}`;
        const cartSnap = cartSnapshot || JSON.parse(JSON.stringify(cart));
        const usedPaymentType = paymentTypeSnapshot;
        const usedPaymentData = paymentDataSnapshot;
        
        const cartTotal = (Array.isArray(cartSnap) ? cartSnap : []).reduce((s, it) => {
          const price = it.priceType === 'Retail' ? (it.price || 0) : (it.priceAfterDiscount || it.price || 0);
          return s + price * (it.quantity || 1);
        }, 0);
        
        const localOrder = {
          orderId,
          orderData: res.data || {},
          cart: cartSnap,
          cartTotal,
          paymentType: usedPaymentType,
          paymentData: usedPaymentData,
          status: 'paid',
          createdAt: Date.now()
        };
      
        await indexedDb.putOrder(localOrder);
        toast.info('Order cached locally');
      } catch (err) {
        console.warn('Failed to write order to indexedDb', err);
      }
      
      setShowMpesaTillModal(false);
      await handleOrderCompletion(res.data, cartSnapshot, paymentTypeSnapshot, paymentDataSnapshot);
      
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'MPesa Till payment failed';
      toast.error(msg);
      setProcessingOrder(false);
    }
  }, [cart, coords, user, handleOrderCompletion]);

  const handleCheckoutSale = useCallback(async (saleId, opts = {}) => {
    const sale = opts.sale || heldSalesService.retrieveHeldSale(saleId);
    if (!sale) {
      toast.error('Sale not found');
      return;
    }
  
    dispatch(clearCart());
    if (Array.isArray(sale.items)) {
      sale.items.forEach(it => {
        dispatch(addItemToCart({
          product: { ...it, id: it.id ?? it._id ?? it.productId },
          quantity: Number(it.quantity) || 1
        }));
      });
    }
  
    const overrides = {
      paymentType: opts.paymentType ?? sale.paymentType ?? 'cash',
      paymentData: opts.paymentData ?? sale.paymentData ?? { cashAmount: '', mpesaPhone: '', mpesaAmount: '' }
    };
  
    setPaymentData(overrides.paymentData);
    setPaymentType(overrides.paymentType);
    setCurrentOrderId(null);
  
    await new Promise(res => setTimeout(res, 0));
  
    try {
      if (overrides.paymentType === 'both') {
        await createOrder(overrides);
      } else {
        await completeCheckout(overrides);
      }
  
      try { heldSalesService.deleteHeldSale(saleId); } catch (e) {}
      setHeldSales(heldSalesService.getAllHeldSales());
      setShowHeldSales(false);
    } catch (err) {
      toast.error(err?.message || 'Checkout failed');
    }
  }, [dispatch, createOrder, completeCheckout]);
  
  const checkPaymentStatus = useCallback(async () => {
    if (!currentOrderId) { 
      toast.error('No order ID to check'); 
      return; 
    }
    
    try {
      setCheckingPayment(true); 
      toast.info('Checking payment status...');
      let paid = false;
      
      try {
        const response = await api.get(`/payments/${currentOrderId}`);
        const remoteData = response?.data || {};
        if (paymentType === 'mpesa' || paymentType === 'both') {
          const statusVal = remoteData?.status || remoteData?.paymentStatus || remoteData?.state || null;
          if (statusVal && String(statusVal).toLowerCase() === 'completed') paid = true;
        } else {
          if (remoteData.paid === true || 
              String(remoteData.paymentStatus || '').toLowerCase() === 'paid' || 
              String(remoteData.status || '').toLowerCase() === 'paid' || 
              String(remoteData.status || '').toLowerCase() === 'completed') {
            paid = true;
          }
        }
      } catch (err) { /* ignore */ }
  
      if (!paid) {
        try {
          const orderResp = await api.get(`/order/${currentOrderId}`);
          const od = orderResp?.data || {};
          if (paymentType === 'mpesa' || paymentType === 'both') {
            const statusVal = od?.status || od?.paymentStatus || (od.payment && od.payment.status) || null;
            if (statusVal && String(statusVal).toLowerCase() === 'completed') paid = true;
          } else {
            if (od && (od.paid === true || 
                String(od.status || '').toLowerCase() === 'paid' || 
                String(od.paymentStatus || '').toLowerCase() === 'paid')) {
              paid = true;
            } else if (od && od.payment && (od.payment.paid === true || 
                String(od.payment.status || '').toLowerCase() === 'paid')) {
              paid = true;
            }
          }
        } catch (err) { /* ignore */ }
      }
  
      if (paid) { 
        toast.success('Payment confirmed');
        
        if (pendingOrderData) {
          await handleOrderCompletion(
            pendingOrderData.orderData,
            pendingOrderData.cartSnapshot,
            pendingOrderData.paymentTypeSnapshot,
            pendingOrderData.paymentDataSnapshot
          );
        } else {
          await handleOrderCompletion({ orderNumber: currentOrderId });
        }
      } else {
        toast.warning('Payment not confirmed yet');
      }
    } catch (err) {
      toast.error('Payment check failed');
    } finally {
      setCheckingPayment(false);
    }
  }, [currentOrderId, paymentType, pendingOrderData, handleOrderCompletion]);

  useEffect(() => {
    try {
      const loadedSales = heldSalesService.getAllHeldSales();
      setHeldSales(Array.isArray(loadedSales) ? loadedSales : []);
    } catch (error) {
      console.error('Failed to load held sales:', error);
      setHeldSales([]);
    }
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

  const clearScannedProductTimer = useCallback(() => {
    if (scannedProductTimerRef.current) {
      clearTimeout(scannedProductTimerRef.current);
      scannedProductTimerRef.current = null;
    }
  }, []);

  const startScannedProductTimer = useCallback(() => {
    clearScannedProductTimer();
    scannedProductTimerRef.current = setTimeout(() => {
      barcodeResultsRef.current = null;
      setScannedProduct(null);
    }, SCANNED_PRODUCT_TTL_MS);
  }, [clearScannedProductTimer]);

  const handleBarcodeScanned = useCallback(async (barcode) => {
    try {
      const raw = await indexedDb.getProductByBarcode(barcode);
      console.log('[SCAN] raw product from indexedDb:', raw, 'barcode:', barcode);

      if (!raw) {
        toast.error(`No product found with barcode: ${barcode}`);
        return;
      }

      const normalized = {
        id: raw.id ?? raw._id ?? raw.productId ?? raw.skuId ?? raw.sku ?? raw.inventoryId ?? raw.product_id ?? null,
        _id: raw._id ?? raw.id ?? raw.productId ?? null,

        name:
          raw.name
          ?? raw.productName
          ?? raw.title
          ?? raw.displayName
          ?? raw.itemName
          ?? raw.label
          ?? (raw.product && (raw.product.name || raw.product.title))
          ?? (raw.details && (raw.details.name || raw.details.title))
          ?? (raw.data && (raw.data.name || raw.data.title))
          ?? 'Unnamed product',

        barcode:
          raw.barcode ?? raw.sku ?? raw.upc ?? raw.ean ?? raw.code ?? raw.externalId ?? '',

        price: Number(
          raw.price
          ?? raw.retailPrice
          ?? raw.unitPrice
          ?? raw.sellingPrice
          ?? (raw.prices && (raw.prices.retail ?? raw.prices.price ?? raw.prices[0]?.price))
          ?? raw.price_value
          ?? 0
        ) || 0,

        priceAfterDiscount: Number(
          raw.priceAfterDiscount
          ?? raw.discountedPrice
          ?? raw.wholesalePrice
          ?? raw.price_after_discount
          ?? raw.discountPrice
          ?? 0
        ) || 0,

        rawProduct: raw,
        ...raw
      };

      if (normalized.id === null || normalized.id === undefined) {
        normalized.id = `scan-${Date.now()}`;
      }

      setScannedProduct(normalized);
      barcodeResultsRef.current = [normalized];
      setFilteredProducts([normalized]);
      setHasSearched(true);
      setSearchType('barcode');

      if (searchInputRef.current) {
        try { searchInputRef.current.value = ''; } catch (e) {}
      }
      setSearchTerm('');

      startScannedProductTimer();

      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            const selector = `[data-product-id="${String(normalized.id)}"]`;
            const el = document.querySelector(selector);
            if (el && typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const qtyInput = el.querySelector('input.quantity-input');
              if (qtyInput && typeof qtyInput.focus === 'function') {
                qtyInput.focus();
                qtyInput.select && qtyInput.select();
              }
            } else {
              const container = document.querySelector('.products-container');
              if (container) container.scrollTop = 0;
            }
          } catch (e) {
            console.warn('[SCAN] scroll/focus failed', e);
          }
        }, 60);
      });

      toast.success(`${normalized.name} - Ready to add to cart`, { autoClose: 1800 });
    } catch (error) {
      console.error('[SCAN] error', error);
      toast.error(`Failed to process barcode: ${error?.message || 'Unexpected error'}`);
      setLoadingProducts(new Set());
    }
  }, [startScannedProductTimer]);

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
  }, [handleBarcodeScanned]);

  useEffect(() => {
    if (navigator?.geolocation) {
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
      if (!paymentType || (Array.isArray(cart) ? cart.length === 0 : true) || processingOrder) return;
      try { 
        e.preventDefault(); 
        e.stopPropagation(); 
      } catch (err) {}
      if (paymentType === 'both') createOrder(); 
      else completeCheckout();
    };

    window.addEventListener('keydown', handleCheckoutEnter);
    return () => window.removeEventListener('keydown', handleCheckoutEnter);
  }, [paymentType, cart.length, processingOrder, createOrder, completeCheckout]);

  const performSearch = useCallback(async (term) => {
    if (!term || term.trim().length === 0) {
      if (scannedProduct) {
        barcodeResultsRef.current = [scannedProduct];
        setFilteredProducts([scannedProduct]);
        setHasSearched(true);
        setSearchType('barcode');
        return;
      }
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
          const pid = product.id || product._id;
          if (!allResults.find(p => (p.id || p._id) === pid)) allResults.push(product);
        });
        setSearchType(foundByBarcode ? 'both' : 'name');
      }

      setFilteredProducts(allResults);

      if (foundByBarcode && isLikelyBarcode(originalTerm)) {
        barcodeResultsRef.current = allResults.slice();
        if (searchInputRef.current) {
          try { 
            searchInputRef.current.value = ''; 
          } catch (e) {}
        }
        setSearchTerm('');
        requestAnimationFrame(() => { 
          try { 
            if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); 
          } catch (e) {} 
        });
      }
    } catch (error) {
      toast.error('Search failed');
      setFilteredProducts([]);
      setSearchType('');
    }
  }, [isLikelyBarcode, scannedProduct]);

  const debouncedSearch = useDebouncedCallback(performSearch, 300);
  
  useEffect(() => { 
    debouncedSearch(searchTerm); 
  }, [searchTerm, debouncedSearch]);

  const handleSetSearchTerm = useCallback((val) => {
    setSearchTerm(val);
  }, []);

  const handleClearCart = useCallback(() => {
    if ((cartItemCount || 0) === 0) {
      toast.info('Cart is already empty');
      requestAnimationFrame(() => { 
        try { 
          if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); 
        } catch (e) {} 
      });
      return;
    }

    dispatch(clearCart());
    toast.success('Cart cleared');
    setCurrentOrderId(null); 
    setPendingOrderData(null);
    setPaymentType(''); 
    setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
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

  const handleQuantityChange = useCallback(async (productId, priceType, newQuantity, productData = null) => {
    try {
      const product = productData || (filteredProducts || []).find(p => (p.id || p._id) === productId);
      if (!product) { 
        toast.error('Product not found'); 
        return; 
      }

      const existingCartItem = (Array.isArray(cart) ? cart : []).find(item => (item.id || item._id) === productId && item.priceType === priceType);

      if (newQuantity === 0) {
        if (existingCartItem) {
          const cartItemId = `${productId}_${priceType}`;
          try { dispatch(removeItemFromCart(cartItemId)); } catch (e) {}
          try { dispatch(removeItemFromCart({ id: cartItemId })); } catch (e) {}
          try { dispatch(removeItemFromCart({ productId, priceType })); } catch (e) {}
          try { dispatch(updateCartItemQuantity({ productId, quantity: 0 })); } catch (e) {}
          toast.success('Removed from cart');
          requestAnimationFrame(() => { 
            try { 
              if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); 
            } catch (e) {} 
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
          if (validation.status === 'warning') toast.warning(validation.message);
        } catch (validationError) { 
          /* proceed if validation service fails */ 
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
          /* proceed if validation service fails */ 
        }
      }

      if (existingCartItem) {
        dispatch(updateCartItemQuantity({ productId, quantity: newQuantity }));
        toast.success('Cart updated');
      } else {
        dispatch(addItemToCart({ 
          product: { 
            ...product, 
            id: productId, 
            priceType, 
            price: product.price, 
            priceAfterDiscount: product.priceAfterDiscount 
          }, 
          quantity: newQuantity 
        }));
        toast.success(`Added to cart (${priceType === 'Retail' ? 'Retail' : 'Wholesale'})`);
      }

      setProductLoading(productId, false);
      
      clearScannedProductTimer();
      setScannedProduct(null);
      barcodeResultsRef.current = null;
      clearSearchAndProducts();
      
      requestAnimationFrame(() => { 
        try { 
          if (searchInputRef.current) {
            searchInputRef.current.focus({ preventScroll: true }); 
          } else {
            focusSearchInput(); 
          }
        } catch (e) {} 
      });
    } catch (error) {
      toast.error(`Failed to update cart: ${error?.message || 'Unexpected error'}`);
      setProductLoading(productId, false);
    }
  }, [filteredProducts, cart, getInventoryId, setProductLoading, dispatch, focusSearchInput, clearSearchAndProducts, clearScannedProductTimer]);

  const handleRemoveItem = useCallback((cartKey, item) => {
    if (!cartKey) { 
      toast.error('Invalid cart item key'); 
      return; 
    }
    const productId = item?.id || item?._id || null;
    const priceType = item?.priceType || (cartKey.includes('_') ? cartKey.split('_').slice(-1)[0] : null);

    try {
      try { dispatch(removeItemFromCart(cartKey)); } catch (e) {}
      try { dispatch(removeItemFromCart({ id: cartKey })); } catch (e) {}
      if (productId && priceType) {
        try { dispatch(removeItemFromCart({ productId, priceType })); } catch (e) {}
      }
      if (productId) {
        try { dispatch(updateCartItemQuantity({ productId, quantity: 0 })); } catch (e) {}
        try { dispatch(removeItemFromCart(productId)); } catch (e) {}
      }
      toast.success('Item removed from cart');
    } catch (err) {
      toast.error('Failed to remove item');
    } finally {
      requestAnimationFrame(() => { 
        try { 
          if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); 
        } catch (e) {} 
      });
    }
  }, [dispatch]);

  const refresh = useCallback(async () => {
    try {
      await dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: true })).unwrap();
      const all = await indexedDb.getAllProducts();
      setProducts(all);
      toast.success('Products refreshed successfully');
    } catch {
      toast.error('Failed to refresh products');
    }
  }, [dispatch]);

  const handleHoldSale = useCallback(() => {
    if (cart.length === 0) {
      toast.error('Cart is empty - nothing to hold');
      return;
    }

    try {
      const existingSales = heldSalesService.getAllHeldSales();
      const salesArray = Array.isArray(existingSales) ? existingSales : [];
      const saleNumber = salesArray.length + 1;
      const saleName = `Sale ${saleNumber}`;
      
      heldSalesService.holdSale(saleName, cart, paymentData);
      const updatedSales = heldSalesService.getAllHeldSales();
      setHeldSales(Array.isArray(updatedSales) ? updatedSales : []);
      
      dispatch(clearCart());
      setPaymentType('');
      setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' });
      setCurrentOrderId(null);
      setPendingOrderData(null);
      toast.success(`${saleName} held successfully`);
      clearSearchAndProducts();
    } catch (error) {
      console.error('Failed to hold sale:', error);
      toast.error('Failed to hold sale');
    }
  }, [cart, paymentData, dispatch, clearSearchAndProducts]);

  const handleRetrieveSale = useCallback((saleId) => {
    try {
      const sale = heldSalesService.retrieveHeldSale(saleId);
      if (!sale) {
        toast.error('Sale not found');
        return;
      }

      dispatch(clearCart());

      if (Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          dispatch(addItemToCart({ 
            product: item, 
            quantity: item.quantity 
          }));
        });
      }

      if (sale.paymentData) {
        setPaymentData(sale.paymentData);
      }

      heldSalesService.deleteHeldSale(saleId);
      const updatedSales = heldSalesService.getAllHeldSales();
      setHeldSales(Array.isArray(updatedSales) ? updatedSales : []);
      
      toast.success(`${sale.name} retrieved`);
      setShowHeldSales(false);
      clearSearchAndProducts();
    } catch (error) {
      console.error('Failed to retrieve sale:', error);
      toast.error('Failed to retrieve sale');
    }
  }, [dispatch, clearSearchAndProducts]);

  const handleDeleteSale = useCallback((saleId) => {
    try {
      const sale = heldSalesService.retrieveHeldSale(saleId);
      heldSalesService.deleteHeldSale(saleId);
      const updatedSales = heldSalesService.getAllHeldSales();
      setHeldSales(Array.isArray(updatedSales) ? updatedSales : []);
      toast.success(`${sale?.name || 'Sale'} deleted`);
    } catch (error) {
      console.error('Failed to delete sale:', error);
      toast.error('Failed to delete sale');
    }
  }, []);

  const currentCartTotal = calculateCartTotal();
  
  const displayedProducts = (scannedProduct && !String(searchTerm || '').trim())
    ? [scannedProduct]
    : (barcodeResultsRef.current && !String(searchTerm || '').trim() ? barcodeResultsRef.current : (filteredProducts || []));

  const safeHeldSales = Array.isArray(heldSales) ? heldSales : [];

  useEffect(() => {
    return () => {
      if (scannedProductTimerRef.current) {
        clearTimeout(scannedProductTimerRef.current);
        scannedProductTimerRef.current = null;
      }
      if (scannerRef.current?.timer) {
        clearTimeout(scannerRef.current.timer);
        scannerRef.current.timer = null;
      }
    };
  }, []);

  return (
    <div className="container-fluid py-4" style={{ background: '#f8f9fa', minHeight: '100vh', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="row h-100" style={{ minHeight: 'calc(100vh - 2rem)' }}>
        <div className="col-xl-4 col-lg-5 col-md-6 col-12 mb-4">
          <SearchHeader 
            searchTerm={searchTerm} 
            setSearchTerm={handleSetSearchTerm} 
            searchInputRef={searchInputRef} 
          />

          <SearchTools 
            loading={loading} 
            onRefresh={refresh} 
            onClear={clearSearchAndProducts} 
            defaultPriceType={defaultPriceType} 
            setDefaultPriceType={setDefaultPriceType} 
          />

          {scannedProduct && (
            <div className="mb-2 d-flex align-items-center gap-2">
              <div className="badge bg-info text-dark" style={{ padding: '8px 10px', fontSize: 14 }}>
                <i className="fas fa-barcode me-1" /> {scannedProduct.name || 'Scanned item'}
              </div>
              <button 
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  clearScannedProductTimer();
                  setScannedProduct(null);
                  barcodeResultsRef.current = null;
                  clearSearchAndProducts();
                  toast.info('Cleared scanned product');
                }}
              >
                Clear scan
              </button>
            </div>
          )}

          <div className="products-container" style={{ height: 'calc(100vh - 320px)', overflowY: 'auto', paddingRight: 10 }}>
            <div className="row">
              <ProductsGrid 
                hasSearched={hasSearched} 
                filteredProducts={displayedProducts} 
                searchTerm={searchTerm} 
                isLikelyBarcode={isLikelyBarcode} 
                cart={cart} 
                onQuantityChange={handleQuantityChange} 
                loadingProducts={loadingProducts} 
              />
            </div>

            {hasSearched && displayedProducts.length > 0 && (
              <div className="row mt-3">
                <div className="col-12">
                  <div className="text-center text-muted">
                    <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} me-1`} />
                    {(() => {
                      const count = displayedProducts.length;
                      const label = (searchTerm && searchTerm.trim()) ? searchTerm : (scannedProduct ? scannedProduct.name || 'recent scan' : (barcodeResultsRef.current ? 'recent scan' : ''));
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
              <h5 className="fw-semibold mb-0 d-flex align-items-center">
                <i className="fas fa-shopping-cart me-2" />Cart
                {cartItemCount > 0 && <span className="badge bg-primary ms-2">{cartItemCount} items</span>}
              </h5>
              <div className="d-flex gap-2">
                <button 
                  className="btn btn-outline-warning btn-sm" 
                  onClick={() => setShowHeldSales(true)}
                  title="View held sales"
                  aria-label="Held sales"
                >
                  <i className="fas fa-list me-1" />
                  Held Sales
                  {safeHeldSales.length > 0 && <span className="badge bg-warning text-dark ms-1">{safeHeldSales.length}</span>}
                </button>
                {cartItemCount > 0 && (
                  <>
                    <button 
                      className="btn btn-success btn-sm" 
                      onClick={() => setShowMpesaTillModal(true)}
                      title="Pay with M-Pesa Till"
                      aria-label="M-Pesa Till Payment"
                    >
                      <i className="fas fa-mobile-alt me-1" />
                      M-Pesa
                    </button>
                    <button 
                      className="btn btn-warning btn-sm" 
                      onClick={handleHoldSale}
                      title="Hold this sale"
                      aria-label="Hold this sale"
                    >
                      <i className="fas fa-pause-circle me-1" />
                      Hold This Sale
                    </button>
                    <button 
                      className="btn btn-outline-danger btn-sm" 
                      onClick={handleClearCart} 
                      title="Clear all items" 
                      aria-label="Clear cart"
                    >
                      <i className="fas fa-trash me-1" /> Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="cart-items flex-grow-1" style={{ overflowY: 'auto', marginBottom: 20 }}>
              <CartItems 
                cart={cart} 
                onRemoveItem={handleRemoveItem}
              />
            </div>

            {cart.length > 0 && (
              <div className="cart-checkout border-top pt-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-bold fs-4">
                    <i className="fas fa-shopping-bag me-1" />Total:
                  </span>
                  <span className="fw-bold fs-3 text-success">{KSH(currentCartTotal)}</span>
                </div>

                <PaymentForm 
                  paymentType={paymentType} 
                  setPaymentType={setPaymentType} 
                  paymentData={paymentData} 
                  setPaymentData={setPaymentData} 
                  cartTotal={currentCartTotal}
                  setCurrentOrderId={setCurrentOrderId}
                />

                {currentOrderId && (paymentType === 'mpesa' || paymentType === 'both') && (
                  <div className="alert alert-warning py-2 mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <i className="fas fa-clock me-2" />
                        <small>Order ID: <strong>{currentOrderId}</strong></small>
                      </div>
                      <div>
                        <Button 
                          variant="outline-success" 
                          size="sm" 
                          onClick={checkPaymentStatus} 
                          disabled={checkingPayment}
                        >
                          {checkingPayment ? (
                            <> 
                              <span className="spinner-border spinner-border-sm me-2" /> 
                              Checking... 
                            </>
                          ) : (
                            <> 
                              <i className="fas fa-check-circle me-2" /> 
                              Confirm 
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="text-center mt-2 small text-muted">
                      Confirm payment to finalize order
                    </div>
                  </div>
                )}

                <Button 
                  style={{ ...CTA, width: '100%', padding: '14px', fontSize: '1.1rem', fontWeight: 600 }} 
                  onClick={paymentType === 'both' ? createOrder : completeCheckout} 
                  disabled={!paymentType || processingOrder} 
                  size="lg"
                >
                  {processingOrder ? (
                    <> 
                      <span className="spinner-border spinner-border-sm me-2" /> 
                      Processing... 
                    </>
                  ) : (
                    <> 
                      <i className="fas fa-check me-2" />
                      {paymentType === 'both' ? 'Create Order' : 'Complete Order'} - {KSH(currentCartTotal)} 
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <HeldSales 
        show={showHeldSales}
        onHide={() => setShowHeldSales(false)}
        heldSales={safeHeldSales}
        onRetrieveSale={handleRetrieveSale}
        onDeleteSale={handleDeleteSale}
        onCheckoutSale={handleCheckoutSale} 
      />

      <MpesaTillPayment
        show={showMpesaTillModal}
        onHide={() => setShowMpesaTillModal(false)}
        cartTotal={currentCartTotal}
        onSubmit={handleMpesaTillPayment}
      />

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