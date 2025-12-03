// src/components/HeldSales.jsx
import React from 'react';
import { Modal, Button, ListGroup, Badge } from 'react-bootstrap';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function HeldSales({
  show = false,
  onHide = () => {},
  heldSales = [],
  onHoldSale = () => {},
  onRetrieveSale = () => {},
  onDeleteSale = () => {}
}) {
  // normalize heldSales: array | object map -> array
  let normalized = [];
  if (Array.isArray(heldSales)) normalized = heldSales;
  else if (heldSales && typeof heldSales === 'object') {
    try { normalized = Object.values(heldSales); } catch (e) { normalized = []; }
  } else normalized = [];

  const safeHeldSales = normalized.filter(s => s && typeof s === 'object');

  const getItemsArray = (sale) => {
    if (!sale) return [];
    const i = sale.items;
    return Array.isArray(i) ? i : [];
  };

  const calculateTotal = (items) => {
    const arr = Array.isArray(items) ? items : [];
    return arr.reduce((sum, it) => {
      const price = it?.priceType === 'Retail'
        ? (Number(it?.price) || 0)
        : (Number(it?.priceAfterDiscount) || Number(it?.price) || 0);
      const qty = Number(it?.quantity) || 1;
      return sum + price * qty;
    }, 0);
  };

  // Dev diagnostics (remove after root cause)
  if (process.env.NODE_ENV !== 'production') {
    if (!Array.isArray(heldSales)) {
      // eslint-disable-next-line no-console
      console.warn('HeldSales: non-array heldSales received (auto-normalized).', heldSales);
    }
    safeHeldSales.forEach((s, i) => {
      if (s && s.items != null && !Array.isArray(s.items)) {
        // eslint-disable-next-line no-console
        console.warn(`HeldSales: sale.items not array at index ${i} (id:${s.id ?? s._id ?? s.saleId})`, s.items);
      }
    });
  }

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
            {safeHeldSales.map((sale, idx) => {
              const id = sale?.id ?? sale?._id ?? sale?.saleId ?? idx;
              const items = getItemsArray(sale);
              const total = calculateTotal(items);
              const ts = sale?.timestamp ? new Date(sale.timestamp) : null;
              const displayName = sale?.name || `Sale ${idx + 1}`;

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

                  {items.length > 0 && (
                    <div className="mb-2 small text-muted">
                      {items.slice(0, 3).map((it, i) => {
                        const qty = Number(it?.quantity) || 1;
                        const price = it?.priceType === 'Retail'
                          ? Number(it?.price) || 0
                          : Number(it?.priceAfterDiscount) || Number(it?.price) || 0;
                        return <div key={i}>• {it?.name || it?.productName || 'Item'} x{qty} - {KSH(price * qty)}</div>;
                      })}
                      {items.length > 3 && <div className="text-muted fst-italic">... and {items.length - 3} more</div>}
                    </div>
                  )}

                  <div className="d-flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-grow-1"
                      onClick={() => { try { onRetrieveSale(id); } catch (e) {} }}
                    >
                      <i className="fas fa-shopping-cart me-1" /> Retrieve
                    </Button>

                    {/* clearer, readable delete button */}
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
