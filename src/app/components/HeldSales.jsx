// src/components/HeldSales.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Modal, Button, ListGroup, Badge } from 'react-bootstrap';
import CartItems from './CartItems';
import PaymentForm from './PaymentForm';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function HeldSales({
  show = false,
  onHide = () => {},
  heldSales = [],
  onHoldSale = () => {},
  onRetrieveSale = () => {},
  onDeleteSale = () => {},
  onCheckoutSale = () => {}
}) {
  // normalize heldSales: array | object map -> array
  let normalized = [];
  if (Array.isArray(heldSales)) normalized = heldSales;
  else if (heldSales && typeof heldSales === 'object') {
    try { normalized = Object.values(heldSales); } catch (e) { normalized = []; }
  } else normalized = [];

  const safeHeldSales = normalized.filter(s => s && typeof s === 'object');

  // local copy so user can edit (remove items) inside modal without touching storage
  const [localSalesMap, setLocalSalesMap] = useState({}); // key -> sale object
  // track payment state per sale (so each sale has independent paymentType/paymentData/currentOrderId)
  const [paymentState, setPaymentState] = useState({}); // id -> { paymentType, paymentData, currentOrderId, processing }

  // initialize local copies when modal opens or heldSales changes
  useEffect(() => {
    if (!show) return;
    const map = {};
    safeHeldSales.forEach((s, idx) => {
      const id = s?.id ?? s?._id ?? s?.saleId ?? String(idx);
      // deep clone to avoid accidental mutation
      map[id] = JSON.parse(JSON.stringify({
        ...s,
        items: Array.isArray(s.items) ? s.items.slice() : []
      }));
    });
    setLocalSalesMap(map);

    const pmap = {};
    Object.keys(map).forEach(id => {
      const sale = map[id];
      pmap[id] = {
        paymentType: sale?.paymentType || sale?.payment?.method || 'cash',
        paymentData: sale?.paymentData || sale?.payment || { cashAmount: '', mpesaPhone: '', mpesaAmount: '' },
        currentOrderId: sale?.currentOrderId || null,
        processing: false
      };
    });
    setPaymentState(pmap);
  }, [show, heldSales]); // eslint-disable-line react-hooks/exhaustive-deps

  const getItemsArray = (sale) => {
    if (!sale) return [];
    const i = sale.items;
    return Array.isArray(i) ? i : [];
  };

  const calculateTotal = useCallback((items) => {
    const arr = Array.isArray(items) ? items : [];
    return arr.reduce((sum, it) => {
      const price = it?.priceType === 'Retail'
        ? (Number(it?.price) || 0)
        : (Number(it?.priceAfterDiscount) || Number(it?.price) || 0);
      const qty = Number(it?.quantity) || 1;
      return sum + price * qty;
    }, 0);
  }, []);

  // remove an item from local sale (used by CartItems remove button)
  const handleRemoveItemFromLocal = useCallback((saleId, cartKey, item) => {
    setLocalSalesMap(prev => {
      const copy = { ...prev };
      const sale = copy[saleId];
      if (!sale || !Array.isArray(sale.items)) return prev;
      // find index by matching id and priceType (cartKey is formatted as `${itemId}_${priceType}`)
      const [maybeId, maybeType] = (cartKey || '').split('_');
      const idx = sale.items.findIndex(it => {
        const itId = it.id || it._id || String(it.productId || '');
        const itType = it.priceType;
        return String(itId) === String(maybeId) && String(itType) === String(maybeType);
      });
      if (idx >= 0) {
        sale.items.splice(idx, 1);
      }
      copy[saleId] = { ...sale };
      return copy;
    });
  }, []);

  const setPaymentForSale = useCallback((saleId, updater) => {
    setPaymentState(prev => {
      const copy = { ...prev };
      const cur = copy[saleId] || { paymentType: 'cash', paymentData: { cashAmount: '', mpesaPhone: '', mpesaAmount: '' }, currentOrderId: null, processing: false };
      const next = typeof updater === 'function' ? updater(cur) : { ...cur, ...updater };
      copy[saleId] = next;
      return copy;
    });
  }, []);

  const handleCheckout = useCallback(async (saleId) => {
    const sale = localSalesMap[saleId];
    if (!sale) { return; }

    const pstate = paymentState[saleId] || {};
    const paymentType = pstate.paymentType || 'cash';
    const paymentData = pstate.paymentData || { cashAmount: '', mpesaPhone: '', mpesaAmount: '' };

    // validation mirrors cart logic (basic)
    const total = calculateTotal(getItemsArray(sale));
    if (!paymentType) { window.Toast?.error?.('Please select a payment method'); return; } // optional global toast
    if (paymentType === 'cash') {
      const cashVal = Number(paymentData.cashAmount);
      if (!paymentData.cashAmount || Number.isNaN(cashVal) || cashVal < total) {
        window.Toast?.error?.('Please enter a valid cash amount (>= total)');
        return;
      }
    }
    if (paymentType === 'mpesa' && (!paymentData.mpesaPhone || !String(paymentData.mpesaPhone).trim())) {
      window.Toast?.error?.('Please enter M-Pesa phone number');
      return;
    }

    // mark processing
    setPaymentForSale(saleId, (s) => ({ ...s, processing: true }));

    try {
      // Hand off to parent: parent should restore sale to cart/store, then call existing checkout flows.
      await onCheckoutSale(saleId, { paymentType, paymentData, sale });

      // optional: close modal on success (parent can also choose)
      // onHide();
    } catch (err) {
      // bubble up error via toast in parent; keep local state
      // eslint-disable-next-line no-console
      console.error('Held sale checkout failed', err);
    } finally {
      setPaymentForSale(saleId, (s) => ({ ...s, processing: false }));
    }
  }, [localSalesMap, paymentState, onCheckoutSale, calculateTotal, setPaymentForSale]);

  // Helper: format id for display
  const saleDisplayId = (sale, idx) => sale?.name || sale?.id || sale?._id || sale?.saleId || `Sale ${idx + 1}`;

  return (
    <Modal show={!!show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-pause-circle me-2" />
          Held Sales
          {safeHeldSales.length > 0 && <Badge bg="primary" className="ms-2">{safeHeldSales.length}</Badge>}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {safeHeldSales.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="fas fa-inbox fa-3x mb-3" />
            <h5 className="text-muted">No held sales</h5>
            <p className="text-muted small mb-0">Hold a sale to save it for later</p>
          </div>
        ) : (
          <ListGroup>
            {safeHeldSales.map((origSale, idx) => {
              const id = origSale?.id ?? origSale?._id ?? origSale?.saleId ?? String(idx);
              const sale = localSalesMap[id] || origSale;
              const items = getItemsArray(sale);
              const total = calculateTotal(items);
              const ts = sale?.timestamp ? new Date(sale.timestamp) : null;
              const displayName = saleDisplayId(sale, idx);
              const pstate = paymentState[id] || { paymentType: 'cash', paymentData: { cashAmount: '', mpesaPhone: '', mpesaAmount: '' }, currentOrderId: null, processing: false };

              return (
                <ListGroup.Item key={id} className="mb-2">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="mb-1 fw-bold">{displayName}</h6>
                      <small className="text-muted">
                        <i className="fas fa-clock me-1" />
                        {ts ? ts.toLocaleString() : 'Unknown time'}
                      </small>
                    </div>
                    <div className="text-end">
                      <div className="fw-bold text-success">{KSH(total)}</div>
                      <small className="text-muted">{items.length} {items.length === 1 ? 'item' : 'items'}</small>
                    </div>
                  </div>

                  {/* Items list - reuses CartItems component but hooked to local removal */}
                  <div className="mb-3">
                    <CartItems cart={items} onRemoveItem={(cartKey, item) => handleRemoveItemFromLocal(id, cartKey, item)} />
                  </div>

                  {/* Payment controls (mirrors PaymentForm behaviour) */}
                  <div className="mb-3">
                    <PaymentForm
                      paymentType={pstate.paymentType}
                      setPaymentType={(pt) => setPaymentForSale(id, (s) => ({ ...s, paymentType: pt }))}
                      paymentData={pstate.paymentData}
                      setPaymentData={(pd) => setPaymentForSale(id, (s) => ({ ...s, paymentData: pd }))}
                      cartTotal={total}
                      setCurrentOrderId={(oid) => setPaymentForSale(id, (s) => ({ ...s, currentOrderId: oid }))}
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      className="flex-grow-1"
                      onClick={() => handleCheckout(id)}
                      disabled={pstate.processing || items.length === 0}
                    >
                      {pstate.processing ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check-circle me-1" /> Checkout - {KSH(total)}
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => { try { onRetrieveSale(id); } catch (e) {} }}
                    >
                      <i className="fas fa-shopping-cart me-1" /> Restore to Cart
                    </Button>

                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => { try { onDeleteSale(id); } catch (e) {} }}
                    >
                      <i className="fas fa-trash me-1" /> Delete
                    </Button>
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
