import React, { useState, useEffect } from 'react';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function ProductCard({ product = {}, cartItems = [], onQuantityChange = () => {} }) {
  // Defensive normalization (accept many shapes)
  const raw = product || {};
  const normalize = (p) => {
    const id = p.id ?? p._id ?? p.productId ?? p.sku ?? p.inventoryId ?? p.inventory_id ?? null;
    const barcode = String(p.barcode ?? p.sku ?? p.upc ?? p.ean ?? p.code ?? p.externalId ?? '').trim();
    const name =
      p.name
      ?? p.productName
      ?? p.title
      ?? p.displayName
      ?? p.itemName
      ?? p.label
      ?? (p.product && (p.product.name || p.product.title))
      ?? (p.details && (p.details.name || p.details.title))
      ?? (p.data && (p.data.name || p.data.title))
      ?? 'Unnamed product';

    const price = Number(
      p.price
      ?? p.retailPrice
      ?? p.unitPrice
      ?? p.sellingPrice
      ?? (p.prices && (p.prices.retail ?? p.prices.price ?? p.prices[0]?.price))
      ?? p.price_value
      ?? 0
    ) || 0;

    const priceAfterDiscount = Number(
      p.priceAfterDiscount
      ?? p.discountedPrice
      ?? p.wholesalePrice
      ?? p.price_after_discount
      ?? p.discountPrice
      ?? 0
    ) || 0;

    return {
      ...p,
      id,
      _id: p._id ?? id,
      name,
      barcode,
      price,
      priceAfterDiscount
    };
  };

  const safeProduct = normalize(raw);
  const pid = String(safeProduct.id ?? safeProduct._id ?? safeProduct.barcode ?? safeProduct.sku ?? safeProduct.inventoryId ?? '');

  // find cart items for this product (respect priceType)
  const retailCartItem = (Array.isArray(cartItems) ? cartItems : []).find(item =>
    String(item.id ?? item._id) === String(safeProduct.id ?? safeProduct._id) && (item.priceType === 'Retail' || item.priceType === undefined)
  );
  const wholesaleCartItem = (Array.isArray(cartItems) ? cartItems : []).find(item =>
    String(item.id ?? item._id) === String(safeProduct.id ?? safeProduct._id) && (item.priceType === 'Discounted' || item.priceType === 'Wholesale' || item.priceType === 'Bulk')
  );

  const retailQuantity = retailCartItem ? retailCartItem.quantity : 0;
  const wholesaleQuantity = wholesaleCartItem ? wholesaleCartItem.quantity : 0;

  const [retailInput, setRetailInput] = useState(retailQuantity ? String(retailQuantity) : '');
  const [wholesaleInput, setWholesaleInput] = useState(wholesaleQuantity ? String(wholesaleQuantity) : '');

  useEffect(() => setRetailInput(String(retailQuantity || '')), [retailQuantity]);
  useEffect(() => setWholesaleInput(String(wholesaleQuantity || '')), [wholesaleQuantity]);

  const applyRetail = () => {
    const v = parseInt((retailInput || '0'), 10);
    const qty = Number.isFinite(v) ? Math.max(0, v) : 0;
    onQuantityChange(safeProduct.id ?? safeProduct._id ?? pid, 'Retail', qty, safeProduct);
  };

  const applyWholesale = () => {
    const v = parseInt((wholesaleInput || '0'), 10);
    const qty = Number.isFinite(v) ? Math.max(0, v) : 0;
    // use 'Discounted' to match your reducer/handlers
    onQuantityChange(safeProduct.id ?? safeProduct._id ?? pid, 'Discounted', qty, safeProduct);
  };

  return (
    <div
      className="product-card p-3 rounded-3 shadow-sm border-0 h-100 d-flex flex-column"
      style={{ background: 'linear-gradient(135deg,#fff 0%,#f8f9fa 100%)', border: '1px solid #e9ecef', minHeight: 200 }}
      data-product-id={pid}
      aria-label={safeProduct.name}
    >
      <div className="flex-grow-1 mb-3">
        <h6 className="product-name fw-semibold text-dark mb-2 lh-sm" style={{ fontSize: '0.9rem', minHeight: '2.4rem', overflow: 'hidden' }}>
          {safeProduct.name}
        </h6>

        <div className="mb-2">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="small text-muted">Retail:</span>
            <span className="fw-bold text-success" style={{ fontSize: '0.9rem' }}>{KSH(safeProduct.price)}</span>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <span className="small text-muted">Wholesale:</span>
            <span className="fw-bold text-info" style={{ fontSize: '0.9rem' }}>{KSH(safeProduct.priceAfterDiscount || safeProduct.price)}</span>
          </div>
        </div>

        {(safeProduct.barcode || safeProduct.sku) && (
          <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-barcode me-1" />{safeProduct.barcode || safeProduct.sku}
          </div>
        )}
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
