import React, { useState, useEffect } from 'react';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function ProductCard({
  product = {},
  cartItems = [],
  onQuantityChange = () => {}
}) {
  const normalize = (p) => {
    const id = p.id ?? p._id ?? p.productId ?? p.sku ?? null;
    return {
      ...p,
      id,
      name:
        p.name ??
        p.productName ??
        p.title ??
        p.itemName ??
        'Unnamed product',
      barcode: p.barcode ?? p.sku ?? '',
      price: Number(p.price ?? p.retailPrice ?? 0),
      priceAfterDiscount: Number(p.priceAfterDiscount ?? p.wholesalePrice ?? 0)
    };
  };

  const safe = normalize(product);
  const pid = String(safe.id);

  const retailItem = cartItems.find(i => i.priceType === 'Retail');
  const wholesaleItem = cartItems.find(i => i.priceType === 'Discounted');

  const [retailQty, setRetailQty] = useState(retailItem?.quantity || '');
  const [wholesaleQty, setWholesaleQty] = useState(wholesaleItem?.quantity || '');

  useEffect(() => setRetailQty(retailItem?.quantity || ''), [retailItem]);
  useEffect(() => setWholesaleQty(wholesaleItem?.quantity || ''), [wholesaleItem]);

  const apply = (type, qty) => {
    onQuantityChange(pid, type, Number(qty || 0), safe);
  };

  return (
    <div className="border rounded bg-white shadow-sm mb-2 p-2 product-card">

      <style>{`
        .product-grid {
          display: grid;
          grid-template-columns: 2.5fr 1.2fr 1.2fr;
          column-gap: 12px;
          align-items: start;
        }

        .qty-input::-webkit-inner-spin-button,
        .qty-input::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .qty-input {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* DESKTOP */}
      <div className="d-none d-md-block">
        <div className="product-grid">

          {/* NAME COLUMN */}
          <div>
            <div className="fw-bold" style={{ fontSize: '0.95rem', lineHeight: 1.2 }}>
              {safe.name}
            </div>
            {safe.barcode && (
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                {safe.barcode}
              </div>
            )}
          </div>

          {/* RETAIL COLUMN */}
          <div>
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>Retail</div>
            <div className="fw-bold text-success mb-1">{KSH(safe.price)}</div>
            <div className="d-flex gap-1">
              <input
                type="number"
                className="form-control form-control-sm qty-input"
                value={retailQty}
                onChange={e => setRetailQty(e.target.value)}
                style={{ height: 38 }}
              />
              <button
                className="btn btn-success btn-sm"
                style={{ height: 38, minWidth: 60 }}
                onClick={() => apply('Retail', retailQty)}
              >
                Add
              </button>
            </div>
          </div>

          {/* WHOLESALE COLUMN */}
          <div>
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>Wholesale</div>
            <div className="fw-bold text-info mb-1">
              {KSH(safe.priceAfterDiscount || safe.price)}
            </div>
            <div className="d-flex gap-1">
              <input
                type="number"
                className="form-control form-control-sm qty-input"
                value={wholesaleQty}
                onChange={e => setWholesaleQty(e.target.value)}
                style={{ height: 38 }}
              />
              <button
                className="btn btn-info btn-sm"
                style={{ height: 38, minWidth: 60 }}
                onClick={() => apply('Discounted', wholesaleQty)}
              >
                Add
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* MOBILE (unchanged logic, stacked) */}
      <div className="d-md-none">
        <div className="fw-bold mb-1">{safe.name}</div>

        <div className="mb-2">
          <div className="d-flex justify-content-between">
            <span className="text-success">Retail</span>
            <span className="fw-bold">{KSH(safe.price)}</span>
          </div>
          <div className="d-flex gap-1">
            <input
              type="number"
              className="form-control form-control-sm qty-input"
              value={retailQty}
              onChange={e => setRetailQty(e.target.value)}
            />
            <button
              className="btn btn-success btn-sm"
              onClick={() => apply('Retail', retailQty)}
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <div className="d-flex justify-content-between">
            <span className="text-info">Wholesale</span>
            <span className="fw-bold">
              {KSH(safe.priceAfterDiscount || safe.price)}
            </span>
          </div>
          <div className="d-flex gap-1">
            <input
              type="number"
              className="form-control form-control-sm qty-input"
              value={wholesaleQty}
              onChange={e => setWholesaleQty(e.target.value)}
            />
            <button
              className="btn btn-info btn-sm"
              onClick={() => apply('Discounted', wholesaleQty)}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
