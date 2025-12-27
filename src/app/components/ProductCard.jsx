// src/app/components/ProductCard.jsx
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
        /* Layout: name slightly wider but still compact so controls get room */
        .product-grid {
          display: grid;
          grid-template-columns: 1.05fr minmax(140px, 1fr) minmax(120px, 1fr);
          column-gap: 12px;
          align-items: start;
        }

        /* Name: clamp to 2 lines with ellipsis, a touch more width */
        .product-name {
          font-size: 0.95rem;
          line-height: 1.15;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          min-height: calc(2 * 1.15rem);
          word-break: break-word;
        }

        .product-barcode {
          font-size: 0.68rem;
          color: rgba(0,0,0,0.55);
          margin-top: 4px;
        }

        /* Control columns: keep price at top, input/button at bottom */
        .control-col {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 62px; /* keep consistent spacing */
        }

        .price-top {
          font-weight: 700;
        }

        /* Qty row: input takes available width; Add button smaller */
        .qty-row {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 6px;
        }

        /* Keep input width behavior, reduce height slightly */
        .qty-input {
          -moz-appearance: textfield;
          -webkit-appearance: none;
          appearance: none;
          flex: 1 1 auto;
          min-width: 0;
          height: 34px; /* slightly smaller */
          padding: 6px 8px;
          font-size: 0.9rem;
        }

        .qty-input::-webkit-inner-spin-button,
        .qty-input::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        /* Smaller Add button (both height & width) */
        .qty-btn {
          height: 30px;
          min-width: 46px; /* narrower */
          padding-left: 8px;
          padding-right: 8px;
          font-size: 0.85rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        /* mobile adjustments: stacked layout, keep smaller heights */
        @media (max-width: 767.98px) {
          .product-grid {
            grid-template-columns: 1fr;
          }
          .control-col {
            margin-top: 6px;
          }
          .qty-input { height: 36px; }
          .qty-btn { height: 32px; min-width: 56px; }
        }

        .product-card { width: 100%; box-sizing: border-box; }
      `}</style>

      {/* DESKTOP */}
      <div className="d-none d-md-block">
        <div className="product-grid">

          {/* NAME */}
          <div>
            <div className="product-name fw-bold" title={safe.name}>
              {safe.name}
            </div>
            {safe.barcode && (
              <div className="product-barcode">{safe.barcode}</div>
            )}
          </div>

          {/* RETAIL */}
          <div className="control-col">
            <div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Retail</div>
              <div className="price-top text-success" style={{ fontSize: '0.93rem' }}>{KSH(safe.price)}</div>
            </div>

            <div className="qty-row">
              <input
                type="number"
                className="form-control form-control-sm qty-input"
                value={retailQty}
                onChange={e => setRetailQty(e.target.value)}
                aria-label={`Retail quantity for ${safe.name}`}
              />
              <button
                className="btn btn-success btn-sm qty-btn"
                onClick={() => apply('Retail', retailQty)}
                aria-label={`Add retail ${safe.name}`}
                type="button"
              >
                Add
              </button>
            </div>
          </div>

          {/* WHOLESALE */}
          <div className="control-col">
            <div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Wholesale</div>
              <div className="price-top text-info" style={{ fontSize: '0.93rem' }}>
                {KSH(safe.priceAfterDiscount || safe.price)}
              </div>
            </div>

            <div className="qty-row">
              <input
                type="number"
                className="form-control form-control-sm qty-input"
                value={wholesaleQty}
                onChange={e => setWholesaleQty(e.target.value)}
                aria-label={`Wholesale quantity for ${safe.name}`}
              />
              <button
                className="btn btn-info btn-sm qty-btn"
                onClick={() => apply('Discounted', wholesaleQty)}
                aria-label={`Add wholesale ${safe.name}`}
                type="button"
              >
                Add
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* MOBILE: stacked with same rules (price on top, controls bottom) */}
      <div className="d-md-none">
        <div className="product-name fw-bold mb-1" style={{ fontSize: '0.95rem' }} title={safe.name}>
          {safe.name}
        </div>

        <div className="mb-2">
          <div className="d-flex justify-content-between">
            <span className="text-success">Retail</span>
            <span className="fw-bold">{KSH(safe.price)}</span>
          </div>
          <div className="qty-row mt-1">
            <input
              type="number"
              className="form-control form-control-sm qty-input"
              value={retailQty}
              onChange={e => setRetailQty(e.target.value)}
              aria-label={`Retail quantity for ${safe.name}`}
            />
            <button
              className="btn btn-success btn-sm qty-btn"
              onClick={() => apply('Retail', retailQty)}
              type="button"
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
          <div className="qty-row mt-1">
            <input
              type="number"
              className="form-control form-control-sm qty-input"
              value={wholesaleQty}
              onChange={e => setWholesaleQty(e.target.value)}
              aria-label={`Wholesale quantity for ${safe.name}`}
            />
            <button
              className="btn btn-info btn-sm qty-btn"
              onClick={() => apply('Discounted', wholesaleQty)}
              type="button"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
