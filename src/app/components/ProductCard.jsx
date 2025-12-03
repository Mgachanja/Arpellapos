// src/components/pos/ProductCard.jsx
import React, { useState, useEffect } from 'react';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function ProductCard({ product = {}, cartItems = [], onQuantityChange = () => {} }) {
  // defensive normalization
  const safeProduct = product || {};
  const safeCartItems = Array.isArray(cartItems) ? cartItems : [];

  const productId = safeProduct.id || safeProduct._id;
  const retailPrice = Number(safeProduct.price) || 0;
  const wholesalePrice = Number(safeProduct.priceAfterDiscount) || Number(safeProduct.price) || 0;

  const retailCartItem = safeCartItems.find(item =>
    (item.id || item._id) === productId && item.priceType === 'Retail'
  );
  const wholesaleCartItem = safeCartItems.find(item =>
    (item.id || item._id) === productId && item.priceType === 'Discounted'
  );

  const retailQuantity = retailCartItem ? retailCartItem.quantity : 0;
  const wholesaleQuantity = wholesaleCartItem ? wholesaleCartItem.quantity : 0;

  const [retailInput, setRetailInput] = useState(retailQuantity ? String(retailQuantity) : '');
  const [wholesaleInput, setWholesaleInput] = useState(wholesaleQuantity ? String(wholesaleQuantity) : '');

  useEffect(() => setRetailInput(String(retailQuantity || '')), [retailQuantity]);
  useEffect(() => setWholesaleInput(String(wholesaleQuantity || '')), [wholesaleQuantity]);

  const applyRetail = () => {
    const v = parseInt(retailInput || '0', 10);
    const qty = Number.isFinite(v) ? Math.max(0, v) : 0;
    onQuantityChange(productId, 'Retail', qty, safeProduct);
  };

  const applyWholesale = () => {
    const v = parseInt(wholesaleInput || '0', 10);
    const qty = Number.isFinite(v) ? Math.max(0, v) : 0;
    onQuantityChange(productId, 'Discounted', qty, safeProduct);
  };

  return (
    <div className="product-card p-3 rounded-3 shadow-sm border-0 h-100 d-flex flex-column"
         style={{ background: 'linear-gradient(135deg,#fff 0%,#f8f9fa 100%)', border: '1px solid #e9ecef', minHeight: 200 }}>
      <div className="flex-grow-1 mb-3">
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm" style={{ fontSize: '0.9rem', minHeight: '2.4rem', overflow: 'hidden' }}>
          {safeProduct.name || 'Unnamed product'}
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

        {safeProduct.barcode && <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}><i className="fas fa-barcode me-1" />{safeProduct.barcode}</div>}
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
