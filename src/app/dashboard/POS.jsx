// src/app/dashboard/POS.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  selectProductsLoading,
} from '../../redux/slices/productSlice';
import { extractId } from '../../redux/slices/productsSlice-helpers';

import indexedDb from '../../services/indexedDB';
import {
  validateAndAddToCart,
  validateCartQuantityChange,
} from '../../services/cartService';
import api from '../../services/api';
import { selectUser } from '../../redux/slices/userSlice';
import { printOrderReceipt } from '../thermalPrinter/thermalPrinter';
import heldSalesService from '../../services/heldSalesService';

import SearchHeader from '../components/SearchHeader';
import SearchTools from '../components/SearchTools';
import ProductsGrid from '../components/ProductsGrid';
import CartItems from '../components/CartItems';
import PaymentForm from '../components/PaymentForm';
import HeldSales from '../components/HeldSales';
import MpesaTransactions from '../components/MpesaTransactions';
import { mapCartToReceiptItems } from '../../utils/orderUtils';

const CTA = { background: '#FF7F50', color: '#fff' };
const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

function useDebouncedCallback(fn, wait) {
  const timer = useRef(null);
  return useCallback(
    (...args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), wait);
    },
    [fn, wait]
  );
}

export default function POS() {
  const [pendingOrderData, setPendingOrderData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchType, setSearchType] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [paymentData, setPaymentData] = useState({
    cashAmount: '',
    mpesaPhone: '',
    mpesaAmount: '',
    mpesaCode: '',
  });
  const [loadingProducts, setLoadingProducts] = useState(new Set());
  const [processingOrder, setProcessingOrder] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [defaultPriceType, setDefaultPriceType] = useState('Retail');

  const [showHeldSales, setShowHeldSales] = useState(false);
  const [heldSales, setHeldSales] = useState([]);
  const [showMpesaTx, setShowMpesaTx] = useState(false);

  const [scannedProduct, setScannedProduct] = useState(null);

  const dispatch = useDispatch();
  const rawCart = useSelector(selectCart);
  const loading = useSelector(selectProductsLoading);
  const user = useSelector(selectUser);

  const cart = useMemo(() => {
    if (Array.isArray(rawCart)) return rawCart;

    if (Array.isArray(rawCart?.items)) return rawCart.items;
    if (rawCart?.items && typeof rawCart.items === 'object') return Object.values(rawCart.items);

    if (Array.isArray(rawCart?.cartItems)) return rawCart.cartItems;
    if (rawCart?.cartItems && typeof rawCart.cartItems === 'object') return Object.values(rawCart.cartItems);

    if (Array.isArray(rawCart?.data)) return rawCart.data;

    return [];
  }, [rawCart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  }, [cart]);

  const calculateCartTotal = useCallback(() => {
    return cart.reduce((total, item) => {
      let price;
      if (item?.priceType === 'Retail') {
        price = Number(item.price) || 0;
      } else {
        // Wholesale: use wholesalePrice if available, fall back to priceAfterDiscount then price
        price = Number(item.wholesalePrice) || Number(item.priceAfterDiscount) || Number(item.price) || 0;
      }
      const qty = Number(item?.quantity) || 1;
      return total + price * qty;
    }, 0);
  }, [cart]);

  const currentCartTotal = useMemo(() => calculateCartTotal(), [calculateCartTotal]);

  const searchInputRef = useRef(null);
  const scannerRef = useRef({ buffer: '', firstTime: 0, lastTime: 0, timer: null });
  const barcodeResultsRef = useRef(null);
  const scannedProductTimerRef = useRef(null);
  const SCANNED_PRODUCT_TTL_MS = 15000;

  useEffect(() => {
    console.log('[POS] cart state changed', {
      rawCart,
      cartArray: cart,
      cartItemCount,
      currentCartTotal,
    });
  }, [rawCart, cart, cartItemCount, currentCartTotal]);

  const getInventoryId = useCallback((product) => {
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
    return numericOnly && length >= 8 && length <= 20;
  }, []);

  const setProductLoading = useCallback((productId, isLoading) => {
    setLoadingProducts((prev) => {
      const next = new Set(prev);
      if (isLoading) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const focusSearchInput = useCallback(() => {
    const el = searchInputRef.current;
    if (el?.focus) {
      try {
        el.focus({ preventScroll: true });
      } catch (err) {}
    }
  }, []);

  const clearSearchAndProducts = useCallback(() => {
    if (searchInputRef.current) {
      try {
        searchInputRef.current.value = '';
      } catch (e) {}
    }
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
      console.log('[POS] scanned product TTL expired');
    }, SCANNED_PRODUCT_TTL_MS);
  }, [clearScannedProductTimer]);

  const handleOrderCompletion = useCallback(
    async (orderData, cartSnapshot = null, paymentTypeSnapshot = null, paymentDataSnapshot = null) => {
      toast.success('Order completed');

      const itemsToReceipt = cartSnapshot || cart;
      const usedPaymentType = paymentTypeSnapshot || paymentType;
      const usedPaymentData = paymentDataSnapshot || paymentData;

      const receiptItems = mapCartToReceiptItems(Array.isArray(itemsToReceipt) ? itemsToReceipt : []);
      const cartTotalFromLines = receiptItems.reduce((s, it) => s + (it.lineTotal || 0), 0);
      const actualUser = Array.isArray(user) ? user[0] : user;

      const getCashierName = () => {
        if (!actualUser) return 'Staff';
        const candidates = [
          actualUser.fullName,
          actualUser.full_name,
          actualUser.name,
          actualUser.firstName || actualUser.first_name
            ? `${actualUser.firstName || actualUser.first_name} ${actualUser.lastName || actualUser.last_name || ''}`
            : null,
          actualUser.userName,
          actualUser.username,
          actualUser.email,
        ]
          .filter(Boolean)
          .map((s) => String(s).trim())
          .filter(Boolean);

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
        receiptFooter: 'Thank you for your business!',
      };

      const calculatePaymentDetails = () => {
        const paymentInfo = { cashAmount: 0, mpesaAmount: 0, change: 0 };

        if (usedPaymentType === 'cash') {
          paymentInfo.cashAmount = Number(usedPaymentData.cashAmount) || 0;
          paymentInfo.change = Math.max(0, paymentInfo.cashAmount - cartTotalFromLines);
        } else if (usedPaymentType === 'mpesa') {
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
        email: actualUser?.email || '',
      };

      const rawCustomerPhone =
        usedPaymentType === 'mpesa' || usedPaymentType === 'both'
          ? (usedPaymentData.mpesaPhone || '').trim() || ''
          : (user && (user.phone || user.phoneNumber)) || '';

      const maskedCustomerPhone = rawCustomerPhone ? maskPhoneForReceipt(rawCustomerPhone) : 'Walk-in';

      const receiptData = {
        cart: receiptItems,
        cartTotal: Number.isFinite(cartTotalFromLines) && cartTotalFromLines >= 0 ? cartTotalFromLines : cartTotalFromLines,
        paymentType: usedPaymentType || 'cash',
        paymentData: paymentDetails,
        user: normalizedUser,
        cashier: normalizedUser,
        orderNumber:
          orderData?.orderNumber ||
          orderData?.orderId ||
          orderData?.orderid ||
          orderData?.id ||
          `ORD-${Date.now().toString().slice(-6)}`,
        orderId:
          orderData?.orderNumber ||
          orderData?.orderId ||
          orderData?.orderid ||
          orderData?.id ||
          `ORD-${Date.now().toString().slice(-6)}`,
        customerPhone: maskedCustomerPhone,
        storeSettings,
      };

      try {
        const orderId =
          orderData?.orderid ||
          orderData?.orderId ||
          orderData?.id ||
          orderData?.order_id ||
          receiptData.orderId;

        const totalPaid = (paymentDetails.cashAmount || 0) + (paymentDetails.mpesaAmount || 0);
        const status = totalPaid >= cartTotalFromLines ? 'paid' : 'pending';

        const localOrder = {
          orderId,
          orderData: orderData || {},
          cart: cartSnapshot || cart,
          cartTotal: cartTotalFromLines,
          paymentType: usedPaymentType,
          paymentData: {
            cashAmount: String(paymentDetails.cashAmount || 0),
            mpesaAmount: String(paymentDetails.mpesaAmount || 0),
            mpesaPhone: usedPaymentData.mpesaPhone || '',
            mpesaCode: usedPaymentData.mpesaCode || '',
            change: paymentDetails.change || 0,
          },
          status,
          createdAt: Date.now(),
        };

        await indexedDb.putOrder(localOrder);
        toast.info('Order recorded in sales');
        console.log('[POS] order stored locally', localOrder);
      } catch (err) {
        console.warn('[POS] failed to write order to indexedDb', err);
      }

      if (!cartSnapshot) {
        dispatch(clearCart());
        setPaymentType('');
        setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '', mpesaCode: '' });
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
        setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '', mpesaCode: '' });
        setCurrentOrderId(null);
        setPendingOrderData(null);
        setProcessingOrder(false);
        clearSearchAndProducts();
      }
    },
    [cart, paymentType, paymentData, user, maskPhoneForReceipt, dispatch, clearSearchAndProducts]
  );

  const productsMap = useMemo(() => {
    const map = { byId: {}, byBarcode: {} };
    if (!products || !Array.isArray(products)) return map;

    products.forEach((p) => {
      if (p.id) map.byId[p.id] = p;
      if (p._id) map.byId[p._id] = p;
      if (p.productId) map.byId[p.productId] = p;
      if (p.inventoryId) map.byId[p.inventoryId] = p;
      if (p.invId) map.byId[p.invId] = p;

      if (p.barcode) map.byBarcode[String(p.barcode)] = p;
      if (p.sku) map.byBarcode[String(p.sku)] = p;
      if (Array.isArray(p.barcodes)) {
        p.barcodes.forEach((b) => (map.byBarcode[String(b)] = p));
      }
    });

    return map;
  }, [products]);

  const resolveNumericProductId = useCallback(
    async (ci) => {
      try {
        const candidates = [
          ci.productId,
          ci.id,
          ci._id,
          ci.rawProduct && (ci.rawProduct.id || ci.rawProduct._id),
          ci.inventoryId,
          ci.inventory && (ci.inventory.id || ci.inventory._id),
          ci.invId,
          ci.inventoryIdString,
          ci.sku,
          ci.barcode,
        ];

        for (const v of candidates) {
          if (v === undefined || v === null) continue;
          const n = Number(v);
          if (!Number.isNaN(n) && Number.isFinite(n) && n !== 0) return n;
        }

        if (ci.inventoryId && productsMap.byId[ci.inventoryId]) {
          const match = productsMap.byId[ci.inventoryId];
          const mid = Number(match.id || match._id || match.productId);
          if (!Number.isNaN(mid) && Number.isFinite(mid) && mid !== 0) return mid;
        }

        if (ci.barcode && productsMap.byBarcode[String(ci.barcode)]) {
          const match = productsMap.byBarcode[String(ci.barcode)];
          const mid = Number(match.id || match._id || match.productId);
          if (!Number.isNaN(mid) && Number.isFinite(mid) && mid !== 0) return mid;
        }
      } catch (e) {}

      return null;
    },
    [productsMap]
  );

  const buildOrderItemsResolved = useCallback(
    async (cartArr = []) => {
      const items = await Promise.all(
        (Array.isArray(cartArr) ? cartArr : []).map(async (ci) => {
          const pid = (await resolveNumericProductId(ci)) ?? Number(ci.productId ?? ci.id ?? ci._id) ?? null;

          let cost = 0;
          try {
            const inv = await indexedDb.getLatestInventoryForProduct(pid || ci.id);
            if (inv) cost = Number(inv.stockPrice ?? inv.unitCost ?? inv.cost ?? 0);

            if (!cost && ci.name) {
              const matches = await indexedDb.searchByName(ci.name, 1);
              if (matches.length > 0) {
                const mInv = await indexedDb.getLatestInventoryForProduct(matches[0].id);
                if (mInv) cost = Number(mInv.stockPrice ?? mInv.unitCost ?? mInv.cost ?? 0);
              }
            }
          } catch (e) {
            console.warn('[POS] cost resolve failed', e);
          }

          if (!cost) {
            cost = Number(
              ci.stockPrice ??
                ci.cost ??
                ci.buyingPrice ??
                ci.purchasePrice ??
                (ci.prices && ci.prices.cost) ??
                0
            );
          }

          return {
            productId: pid,
            quantity: Number(ci.quantity) || 1,
            priceType: ci.priceType === 'Discounted' || ci.priceType === 'Wholesale' ? 'Discounted' : 'Retail',
          };
        })
      );

      return items.filter((it) => it.productId !== null && !Number.isNaN(it.productId));
    },
    [resolveNumericProductId]
  );

  const createOrder = useCallback(
    async (overrides = {}) => {
      const pt = overrides.paymentType ?? paymentType;
      const pd = overrides.paymentData ?? paymentData;

      console.log('[POS][createOrder] start', { pt, pd, cart });

      if (!pt) {
        toast.error('Please select a payment method');
        return;
      }

      const currentCartTotalLocal = calculateCartTotal();

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
        if (cashVal + mpesaVal < currentCartTotalLocal) {
          toast.error('Total payment amount must be >= cart total');
          return;
        }
      }

      try {
        setProcessingOrder(true);
        toast.info('Creating order...');

        const resolvedOrderItems = await buildOrderItemsResolved(cart);
        console.log('[POS][createOrder] resolvedOrderItems', resolvedOrderItems);

        if (!Array.isArray(resolvedOrderItems) || resolvedOrderItems.length === 0) {
          toast.error('No valid order items to submit');
          setProcessingOrder(false);
          return;
        }

        const payload = {
          userId: (user && (user.phone || user.userName)) || (pd.mpesaPhone || 'N/A'),
          phoneNumber: pt === 'mpesa' || pt === 'both' ? (pd.mpesaPhone || '').trim() : (user && user.phone) || 'N/A',
          orderPaymentType: pt === 'cash' ? 'Cash' : pt === 'mpesa' ? 'Mpesa' : 'Hybrid',
          latitude: coords?.lat ?? 0,
          longitude: coords?.lng ?? 0,
          buyerPin: 'N/A',
          orderSource: 'POS',
          orderitems: resolvedOrderItems,
        };

        const tx = pd?.mpesaCode || pd?.transactionId || overrides.transactionId;
        if ((pt === 'mpesa' || pt === 'both') && tx) {
          payload.transactionId = String(tx);
        }

        if (pt === 'both') {
          payload.total = Number(pd.cashAmount) || 0;
        }

        const cartSnapshot = JSON.parse(JSON.stringify(cart));
        const paymentTypeSnapshot = pt;
        const paymentDataSnapshot = JSON.parse(JSON.stringify(pd));

        console.log('[POS][createOrder] payload', payload);

        const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
        console.log('[POS][createOrder] response', res?.data);

        const orderId = res?.data?.orderid || res?.data?.orderId || res?.data?.id || res?.data?.order_id;

        if (orderId) {
          setCurrentOrderId(orderId);
          toast.success(`Order created. ID: ${orderId}`);
          if (pt === 'cash') {
            await handleOrderCompletion(res.data);
          } else {
            setPendingOrderData({
              orderData: res.data,
              cartSnapshot,
              paymentTypeSnapshot,
              paymentDataSnapshot,
            });
            toast.info(pt === 'both' ? 'Hybrid order created. Confirm M-Pesa payment.' : 'M-Pesa order created. Confirm payment.');
          }
        } else {
          toast.success('Order created.');
          if (pt === 'cash') {
            await handleOrderCompletion(res.data);
          } else {
            setPendingOrderData({
              orderData: res.data,
              cartSnapshot,
              paymentTypeSnapshot,
              paymentDataSnapshot,
            });
            toast.info(pt === 'both' ? 'Hybrid order created. Confirm M-Pesa payment.' : 'M-Pesa order created. Confirm payment.');
          }
        }
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || 'Order failed';
        console.error('[POS][createOrder] error', err);
        toast.error(msg);
        setProcessingOrder(false);
      }
    },
    [paymentType, paymentData, coords, cart, user, calculateCartTotal, handleOrderCompletion, buildOrderItemsResolved]
  );

  const handleC2BTransaction = useCallback(
    async (tx) => {
      if (!cart || cart.length === 0) {
        toast.error('Cart is empty – add items before applying an M-Pesa transaction');
        throw new Error('empty cart');
      }

      try {
        setProcessingOrder(true);
        toast.info('Submitting C2B order...');

        const resolvedOrderItems = await buildOrderItemsResolved(cart);
        if (!Array.isArray(resolvedOrderItems) || resolvedOrderItems.length === 0) {
          toast.error('No valid order items to submit');
          setProcessingOrder(false);
          throw new Error('no valid items');
        }

        const txId = tx.transactionId || tx.TransID || tx.transaction_id || '';

        const payload = {
          userId: (user && (user.phone || user.userName)) || 'N/A',
          phoneNumber: (user && user.phone) || 'N/A',
          orderPaymentType: 'c2b',
          transactionId: txId,
          latitude: coords?.lat ?? 0,
          longitude: coords?.lng ?? 0,
          buyerPin: 'N/A',
          orderSource: 'POS',
          orderitems: resolvedOrderItems,
        };

        const cartSnapshot = JSON.parse(JSON.stringify(cart));

        const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
        await handleOrderCompletion(res.data, cartSnapshot, 'mpesa', {});
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || 'C2B order failed';
        console.error('[POS][handleC2BTransaction] error', err);
        toast.error(msg);
        setProcessingOrder(false);
        throw err;
      }
    },
    [cart, user, coords, buildOrderItemsResolved, handleOrderCompletion]
  );

  const completeCheckout = useCallback(
    async (overrides = {}) => {
      const pt = overrides.paymentType ?? paymentType;
      const pd = overrides.paymentData ?? paymentData;

      console.log('[POS][completeCheckout] start', { pt, pd, cart });

      if (!pt) {
        toast.error('Please select a payment method');
        return;
      }

      const currentCartTotalLocal = calculateCartTotal();

      if (pt === 'cash') {
        const cashVal = Number(pd.cashAmount);
        if (!pd.cashAmount || Number.isNaN(cashVal) || cashVal < currentCartTotalLocal) {
          toast.error('Please enter a valid cash amount (>= total)');
          return;
        }
      }

      if (pt === 'mpesa' && (!pd.mpesaPhone || pd.mpesaPhone.trim().length === 0)) {
        toast.error('Please enter M-Pesa phone number');
        return;
      }

      try {
        setProcessingOrder(true);
        toast.info(pt === 'mpesa' ? 'Creating M-Pesa order...' : 'Processing payment...');

        const resolvedOrderItems = await buildOrderItemsResolved(cart);
        console.log('[POS][completeCheckout] resolvedOrderItems', resolvedOrderItems);

        if (!Array.isArray(resolvedOrderItems) || resolvedOrderItems.length === 0) {
          toast.error('No valid order items to submit');
          setProcessingOrder(false);
          return;
        }

        const payload = {
          userId: (user && (user.phone || user.userName)) || (pd.mpesaPhone || 'N/A'),
          phoneNumber: pt === 'mpesa' ? (pd.mpesaPhone || '').trim() : (user && user.phone) || 'N/A',
          orderPaymentType: pt === 'cash' ? 'Cash' : 'Mpesa',
          latitude: coords?.lat ?? 0,
          longitude: coords?.lng ?? 0,
          buyerPin: 'N/A',
          orderSource: 'POS',
          orderitems: resolvedOrderItems,
        };

        const tx = pd?.mpesaCode || pd?.transactionId || overrides.transactionId;
        if (pt === 'mpesa' && tx) {
          payload.transactionId = String(tx);
        }

        const cartSnapshot = JSON.parse(JSON.stringify(cart));
        const paymentTypeSnapshot = pt;
        const paymentDataSnapshot = JSON.parse(JSON.stringify(pd));

        console.log('[POS][completeCheckout] payload', payload);

        const res = await api.post('/order', payload, { headers: { 'Content-Type': 'application/json' } });
        console.log('[POS][completeCheckout] response', res?.data);

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
            paymentDataSnapshot,
          });

          setProcessingOrder(false);
        } else {
          await handleOrderCompletion(res.data);
        }
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || 'Checkout failed';
        console.error('[POS][completeCheckout] error', err);
        toast.error(msg);
        setProcessingOrder(false);
      }
    },
    [paymentType, paymentData, coords, cart, user, calculateCartTotal, handleOrderCompletion, buildOrderItemsResolved]
  );

  const handleCheckoutSale = useCallback(
    async (saleId, opts = {}) => {
      const sale = opts.sale || heldSalesService.retrieveHeldSale(saleId);
      console.log('[POS][handleCheckoutSale] sale', saleId, sale);

      if (!sale) {
        toast.error('Sale not found');
        return;
      }

      dispatch(clearCart());

      if (Array.isArray(sale.items)) {
        sale.items.forEach((it) => {
          const normalizedItem = {
            ...it,
            id: it.id ?? it._id ?? it.productId ?? null,
            productId: it.productId ?? it.id ?? it._id ?? null,
            quantity: Number(it.quantity) || 1,
          };

          console.log('[POS][handleCheckoutSale] restoring item', normalizedItem);

          dispatch(
            addItemToCart({
              product: normalizedItem,
              item: normalizedItem,
              quantity: normalizedItem.quantity,
              id: normalizedItem.id,
              productId: normalizedItem.productId,
              name: normalizedItem.name,
              productName: normalizedItem.productName,
              price: normalizedItem.price,
              priceAfterDiscount: normalizedItem.priceAfterDiscount,
              priceType: normalizedItem.priceType,
            })
          );
        });
      }

      const overrides = {
        paymentType: opts.paymentType ?? sale.paymentType ?? 'cash',
        paymentData: opts.paymentData ?? sale.paymentData ?? { cashAmount: '', mpesaPhone: '', mpesaAmount: '' },
      };

      setPaymentData(overrides.paymentData);
      setPaymentType(overrides.paymentType);
      setCurrentOrderId(null);

      await new Promise((res) => setTimeout(res, 0));

      try {
        if (overrides.paymentType === 'both') {
          await createOrder(overrides);
        } else {
          await completeCheckout(overrides);
        }

        try {
          heldSalesService.deleteHeldSale(saleId);
        } catch (e) {}

        setHeldSales(heldSalesService.getAllHeldSales());
        setShowHeldSales(false);
      } catch (err) {
        console.error('[POS][handleCheckoutSale] error', err);
        toast.error(err?.message || 'Checkout failed');
      }
    },
    [dispatch, createOrder, completeCheckout]
  );

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
          if (
            remoteData.paid === true ||
            String(remoteData.paymentStatus || '').toLowerCase() === 'paid' ||
            String(remoteData.status || '').toLowerCase() === 'paid' ||
            String(remoteData.status || '').toLowerCase() === 'completed'
          ) {
            paid = true;
          }
        }
      } catch (err) {}

      if (!paid) {
        try {
          const orderResp = await api.get(`/order/${currentOrderId}`);
          const od = orderResp?.data || {};
          if (paymentType === 'mpesa' || paymentType === 'both') {
            const statusVal = od?.status || od?.paymentStatus || (od.payment && od.payment.status) || null;
            if (statusVal && String(statusVal).toLowerCase() === 'completed') paid = true;
          } else {
            if (
              od &&
              (od.paid === true ||
                String(od.status || '').toLowerCase() === 'paid' ||
                String(od.paymentStatus || '').toLowerCase() === 'paid')
            ) {
              paid = true;
            } else if (
              od &&
              od.payment &&
              (od.payment.paid === true || String(od.payment.status || '').toLowerCase() === 'paid')
            ) {
              paid = true;
            }
          }
        } catch (err) {}
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
      console.error('[POS][checkPaymentStatus] error', err);
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
      console.error('[POS] Failed to load held sales:', error);
      setHeldSales([]);
    }
  }, []);

  useEffect(() => {
    dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: false }))
      .unwrap()
      .then(async () => {
        const all = await indexedDb.getAllProducts();
        setProducts(all);
        console.log('[POS] products synced', all?.length || 0);
      })
      .catch((err) => {
        console.error('[POS] failed to sync products', err);
        toast.error('Failed to sync products');
      });
  }, [dispatch]);

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

  const handleBarcodeScanned = useCallback(
    async (barcode) => {
      try {
        console.log('[POS][SCAN] barcode', barcode);
        const raw = await indexedDb.getProductByBarcode(barcode);
        console.log('[POS][SCAN] raw product', raw);

        if (!raw) {
          toast.error(`No product found with barcode: ${barcode}`);
          return;
        }

        const normalized = {
          id: raw.id ?? raw._id ?? raw.productId ?? raw.skuId ?? raw.sku ?? raw.inventoryId ?? raw.product_id ?? null,
          _id: raw._id ?? raw.id ?? raw.productId ?? null,
          name:
            raw.name ??
            raw.productName ??
            raw.title ??
            raw.displayName ??
            raw.itemName ??
            raw.label ??
            (raw.product && (raw.product.name || raw.product.title)) ??
            (raw.details && (raw.details.name || raw.details.title)) ??
            (raw.data && (raw.data.name || raw.data.title)) ??
            'Unnamed product',
          barcode: raw.barcode ?? raw.sku ?? raw.upc ?? raw.ean ?? raw.code ?? raw.externalId ?? '',
          price:
            Number(
              raw.price ??
                raw.retailPrice ??
                raw.unitPrice ??
                raw.sellingPrice ??
                (raw.prices && (raw.prices.retail ?? raw.prices.price ?? raw.prices[0]?.price)) ??
                raw.price_value ??
                0
            ) || 0,
          priceAfterDiscount:
            Number(
              raw.priceAfterDiscount ??
                raw.discountedPrice ??
                raw.wholesalePrice ??
                raw.price_after_discount ??
                raw.discountPrice ??
                0
            ) || 0,
          rawProduct: raw,
          ...raw,
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
          try {
            searchInputRef.current.value = '';
          } catch (e) {}
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
              console.warn('[POS][SCAN] scroll/focus failed', e);
            }
          }, 60);
        });

        toast.success(`${normalized.name} - Ready to add to cart`, { autoClose: 1800 });
      } catch (error) {
        console.error('[POS][SCAN] error', error);
        toast.error(`Failed to process barcode: ${error?.message || 'Unexpected error'}`);
        setLoadingProducts(new Set());
      }
    },
    [startScannedProductTimer]
  );

  useEffect(() => {
    const THRESHOLD_AVG_MS = 80;
    const CLEAR_TIMEOUT = 800;
    const MIN_BARCODE_LENGTH = 8;

    const onKeyDown = (e) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      const now = Date.now();
      const s = scannerRef.current;
      const target = e.target;
      const targetIsEditable =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
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
        if (s.lastTime && now - s.lastTime > 150) {
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
      if (!paymentType || cart.length === 0 || processingOrder) return;
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

  const performSearch = useCallback(
    async (term) => {
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
          nameResults.forEach((product) => {
            const pid = product.id || product._id;
            if (!allResults.find((p) => (p.id || p._id) === pid)) allResults.push(product);
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
        console.error('[POS][search] error', error);
        toast.error('Search failed');
        setFilteredProducts([]);
        setSearchType('');
      }
    },
    [isLikelyBarcode, scannedProduct]
  );

  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  const handleSetSearchTerm = useCallback((val) => {
    setSearchTerm(val);
  }, []);

  const handleClearCart = useCallback(() => {
    if (cartItemCount === 0) {
      toast.info('Cart is already empty');
      requestAnimationFrame(() => {
        try {
          if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
        } catch (e) {}
      });
      return;
    }

    console.log('[POS] clearing cart');
    dispatch(clearCart());
    toast.success('Cart cleared');
    setCurrentOrderId(null);
    setPendingOrderData(null);
    setPaymentType('');
    setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '', mpesaCode: '' });
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

  const handleQuantityChange = useCallback(
    async (productId, priceType, newQuantity, productData = null) => {
      console.log('[POS][qtyChange] called', { productId, priceType, newQuantity, productData });

      try {
        const product = productData || (filteredProducts || []).find((p) => extractId(p) === productId);
        if (!product) {
          console.warn('[POS][qtyChange] product not found', { productId, filteredProducts });
          toast.error('Product not found');
          return;
        }

        const existingCartItem = cart.find(
          (item) => extractId(item) === String(productId) && item.priceType === priceType
        );

        console.log('[POS][qtyChange] existingCartItem', existingCartItem);

        if (newQuantity === 0) {
          if (existingCartItem) {
            const cartItemId = `${productId}_${priceType}`;
            console.log('[POS][qtyChange] remove item', { cartItemId, productId, priceType });

            dispatch(removeItemFromCart(cartItemId));

            toast.success('Removed from cart');
            requestAnimationFrame(() => {
              try {
                if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
              } catch (e) {}
            });
          }
          return;
        }

        const currentCartQty = existingCartItem ? Number(existingCartItem.quantity) || 0 : 0;
        const inventoryId = getInventoryId(product);

        console.log('[POS][qtyChange] resolved data', {
          currentCartQty,
          inventoryId,
          productId,
          productName: product.name || product.productName,
          product,
        });

        if (!inventoryId) {
          toast.error('Cannot validate stock - inventory ID missing');
          console.warn('[POS][qtyChange] missing inventoryId', product);
          return;
        }

        setProductLoading(productId, true);

        if (newQuantity > currentCartQty) {
          const qtyToAdd = newQuantity - currentCartQty;
          console.log('[POS][qtyChange] adding qty', { qtyToAdd });

          try {
            const validation = await validateAndAddToCart({
              productId,
              inventoryId,
              qty: qtyToAdd,
              currentCartQty,
            });

            console.log('[POS][qtyChange] validateAndAddToCart result', validation);

            if (validation.status === 'conflict' || validation.status === 'error') {
              toast.error(validation.message);
              setProductLoading(productId, false);
              return;
            }
            if (validation.status === 'warning') toast.warning(validation.message);
          } catch (validationError) {
            console.warn('[POS][qtyChange] validateAndAddToCart failed, continuing', validationError);
          }
        } else {
          try {
            const validation = await validateCartQuantityChange({
              productId,
              inventoryId,
              newQty: newQuantity,
              currentCartQty,
            });

            console.log('[POS][qtyChange] validateCartQuantityChange result', validation);

            if (validation.status === 'conflict' || validation.status === 'error') {
              toast.error(validation.message);
              setProductLoading(productId, false);
              return;
            }
          } catch (validationError) {
            console.warn('[POS][qtyChange] validateCartQuantityChange failed, continuing', validationError);
          }
        }

        const payload = {
          product: {
            ...product,
            id: productId,
            _id: productId,
            productId,
            priceType,
            price: product.price,
            priceAfterDiscount: product.priceAfterDiscount,
            barcode: product.barcode,
          },
          item: {
            ...product,
            id: productId,
            _id: productId,
            productId,
            priceType,
          },
          quantity: newQuantity,
          id: productId,
          productId,
          priceType,
          name: product.name || product.productName,
          productName: product.productName || product.name,
          price: product.price,
          priceAfterDiscount: product.priceAfterDiscount,
        };

        console.log('[POS][qtyChange] dispatch add/update payload', payload);

        if (existingCartItem) {
          const cartKey = `${productId}_${priceType}`;
          dispatch(updateCartItemQuantity({ productId: cartKey, quantity: newQuantity }));
          toast.success('Cart updated');
        } else {
          dispatch(addItemToCart(payload));
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
        console.error('[POS][qtyChange] error', error);
        toast.error(`Failed to update cart: ${error?.message || 'Unexpected error'}`);
        setProductLoading(productId, false);
      }
    },
    [
      filteredProducts,
      cart,
      getInventoryId,
      setProductLoading,
      dispatch,
      focusSearchInput,
      clearSearchAndProducts,
      clearScannedProductTimer,
    ]
  );

    const handleRemoveItem = useCallback(
      (cartKey, item) => {
        if (!cartKey) {
          toast.error('Invalid cart item key');
          return;
        }
        console.log('[POS][removeItem] call', { cartKey, item });
        try {
          dispatch(removeItemFromCart(cartKey));
          toast.success('Item removed from cart');
        } catch (err) {
          console.error('[POS][removeItem] error', err);
          toast.error('Failed to remove item');
        } finally {
          requestAnimationFrame(() => {
            try {
              if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
            } catch (e) {}
          });
        }
      },
      [dispatch]
    );

  const refresh = useCallback(async () => {
    try {
      await dispatch(fetchAndIndexAllProducts({ pageSize: 200, force: true })).unwrap();
      const all = await indexedDb.getAllProducts();
      setProducts(all);
      toast.success('Products refreshed successfully');
      console.log('[POS] refresh complete', all?.length || 0);
    } catch (err) {
      console.error('[POS] refresh failed', err);
      toast.error('Failed to refresh products');
    }
  }, [dispatch]);

  const displayedProducts = scannedProduct && !String(searchTerm || '').trim()
    ? [scannedProduct]
    : barcodeResultsRef.current && !String(searchTerm || '').trim()
      ? barcodeResultsRef.current
      : filteredProducts || [];

  const safeHeldSales = Array.isArray(heldSales) ? heldSales : [];

  return (
    <div
      className="container-fluid py-4"
      style={{ background: '#f8f9fa', minHeight: '100vh', maxWidth: '100%', overflow: 'hidden' }}
    >
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
                isFetching={loading}
              />
            </div>

            {hasSearched && displayedProducts.length > 0 && (
              <div className="row mt-3">
                <div className="col-12">
                  <div className="text-center text-muted">
                    <i className={`fas ${searchType === 'barcode' ? 'fa-barcode' : 'fa-search'} me-1`} />
                    {(() => {
                      const count = displayedProducts.length;
                      const label =
                        searchTerm && searchTerm.trim()
                          ? searchTerm
                          : scannedProduct
                            ? scannedProduct.name || 'recent scan'
                            : barcodeResultsRef.current
                              ? 'recent scan'
                              : '';
                      return `Found ${count} products${label ? ` for "${label}"` : ''}`;
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-xl-8 col-lg-7 col-md-6 col-12">
          <div
            className="cart-sidebar h-100 bg-white rounded-3 shadow-sm p-4 position-sticky"
            style={{
              top: 20,
              maxHeight: 'calc(100% - 150px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
              <h5 className="fw-semibold mb-0 d-flex align-items-center">
                <i className="fas fa-shopping-cart me-2" />Cart
                {cartItemCount > 0 && <span className="badge bg-primary ms-2">{cartItemCount} items</span>}
              </h5>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-success btn-sm"
                  onClick={() => setShowMpesaTx(true)}
                  title="View M-Pesa transactions"
                  aria-label="M-Pesa transactions"
                >
                  <i className="fas fa-mobile-alt me-1" />
                  M-Pesa Txns
                </button>

                <button
                  className="btn btn-outline-warning btn-sm"
                  onClick={() => setShowHeldSales(true)}
                  title="View held sales"
                  aria-label="Held sales"
                >
                  <i className="fas fa-list me-1" />
                  Held Sales
                  {safeHeldSales.length > 0 && (
                    <span className="badge bg-warning text-dark ms-1">{safeHeldSales.length}</span>
                  )}
                </button>

                {cartItemCount > 0 && (
                  <>
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => {
                        if (cart.length === 0) {
                          toast.error('Cart is empty - nothing to hold');
                          return;
                        }

                        try {
                          const existingSales = heldSalesService.getAllHeldSales();
                          const salesArray = Array.isArray(existingSales) ? existingSales : [];
                          const saleNumber = salesArray.length + 1;
                          const saleName = `Sale ${saleNumber}`;

                          console.log('[POS] holding sale', { saleName, cart, paymentData });

                          heldSalesService.holdSale(saleName, cart, paymentData);
                          const updatedSales = heldSalesService.getAllHeldSales();
                          setHeldSales(Array.isArray(updatedSales) ? updatedSales : []);
                          dispatch(clearCart());
                          setPaymentType('');
                          setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '', mpesaCode: '' });
                          setCurrentOrderId(null);
                          setPendingOrderData(null);
                          toast.success(`${saleName} held successfully`);
                          clearSearchAndProducts();
                        } catch (error) {
                          console.error('[POS] hold sale failed', error);
                          toast.error('Failed to hold sale');
                        }
                      }}
                      title="Hold this sale"
                      aria-label="Hold this sale"
                    >
                      <i className="fas fa-pause-circle me-1" />
                      Hold This Sale
                    </button>

                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => {
                        dispatch(clearCart());
                        toast.success('Cart cleared');
                        setCurrentOrderId(null);
                        setPendingOrderData(null);
                        setPaymentType('');
                        setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '', mpesaCode: '' });
                        clearSearchAndProducts();
                      }}
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
              <CartItems cart={cart} onRemoveItem={handleRemoveItem} />
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
                        <small>
                          Order ID: <strong>{currentOrderId}</strong>
                        </small>
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
                    <div className="text-center mt-2 small text-muted">Confirm payment to finalize order</div>
                  </div>
                )}

                <Button
                  style={{
                    ...CTA,
                    width: '100%',
                    padding: '14px',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                  }}
                  onClick={paymentType === 'both' ? () => createOrder() : () => completeCheckout()}
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
        onRetrieveSale={(saleId) => {
          try {
            const sale = heldSalesService.retrieveHeldSale(saleId);
            console.log('[POS][HeldSales] retrieve sale', saleId, sale);

            if (!sale) {
              toast.error('Sale not found');
              return;
            }

            dispatch(clearCart());

            if (Array.isArray(sale.items)) {
              sale.items.forEach((item) => {
                const normalizedItem = {
                  ...item,
                  id: item.id ?? item._id ?? item.productId ?? null,
                  productId: item.productId ?? item.id ?? item._id ?? null,
                  quantity: Number(item.quantity) || 1,
                };

                console.log('[POS][HeldSales] restoring item', normalizedItem);

                dispatch(
                  addItemToCart({
                    product: normalizedItem,
                    item: normalizedItem,
                    quantity: normalizedItem.quantity,
                    id: normalizedItem.id,
                    productId: normalizedItem.productId,
                    name: normalizedItem.name,
                    productName: normalizedItem.productName,
                    price: normalizedItem.price,
                    priceAfterDiscount: normalizedItem.priceAfterDiscount,
                    priceType: normalizedItem.priceType,
                  })
                );
              });
            }

            if (sale.paymentData) setPaymentData(sale.paymentData);
            heldSalesService.deleteHeldSale(saleId);
            setHeldSales(heldSalesService.getAllHeldSales());
            toast.success(`${sale.name} retrieved`);
            setShowHeldSales(false);
            clearSearchAndProducts();
          } catch (error) {
            console.error('[POS][HeldSales] retrieve failed', error);
            toast.error('Failed to retrieve sale');
          }
        }}
        onDeleteSale={(saleId) => {
          try {
            const sale = heldSalesService.retrieveHeldSale(saleId);
            heldSalesService.deleteHeldSale(saleId);
            setHeldSales(heldSalesService.getAllHeldSales());
            toast.success(`${sale?.name || 'Sale'} deleted`);
          } catch (error) {
            console.error('[POS][HeldSales] delete failed', error);
            toast.error('Failed to delete sale');
          }
        }}
        onCheckoutSale={(saleId, opts) => handleCheckoutSale(saleId, opts)}
      />

      <MpesaTransactions
        show={showMpesaTx}
        onHide={() => setShowMpesaTx(false)}
        onApply={handleC2BTransaction}
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