// src/components/pos/CartItems.jsx
import React from 'react';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function CartItems({ cart, onRemoveItem }) {
  if (!cart || cart.length === 0) {
    return (
      <div className="text-center py-5">
        <i className="fas fa-shopping-cart fa-3x text-muted mb-3" />
        <h6 className="text-muted">Your cart is empty</h6>
        <p className="text-muted mb-0 small">Add some products to get started</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th style={{ fontSize: '0.8rem', width: '50%' }}>Product</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Type</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Qty</th>
            <th style={{ fontSize: '0.8rem' }} className="text-end">Total</th>
            <th style={{ fontSize: '0.8rem', width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {cart.map(item => {
            const itemPrice = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
            const itemTotal = itemPrice * (item.quantity || 1);
            const itemId = item.id || item._id;
            const cartKey = `${itemId}_${item.priceType}`;
            return (
              <tr key={cartKey}>
                <td style={{ fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="cart-product-name" title={item.name} style={{ fontSize: '1.01rem', fontWeight: 600 }}>{item.name}</div>
                    <div className={`small ${item.priceType === 'Retail' ? 'text-success' : 'text-info'}`}>{KSH(itemPrice)}</div>
                    {item.barcode && <div className="text-muted" style={{ fontSize: '0.65rem' }}><i className="fas fa-barcode me-1" />{item.barcode}</div>}
                  </div>
                </td>
                <td className="text-center" style={{ fontSize: '0.7rem' }}>
                  <span className={`badge ${item.priceType === 'Retail' ? 'bg-success' : 'bg-info'} px-2 py-1`}>{item.priceType === 'Retail' ? 'Retail' : 'Wholesale'}</span>
                </td>
                <td className="text-center" style={{ fontSize: '0.75rem' }}>
                  <span className="badge bg-secondary px-2 py-1">{item.quantity || 1}</span>
                </td>
                <td className="text-end fw-semibold" style={{ fontSize: '0.75rem' }}>{KSH(itemTotal)}</td>
                <td className="text-center">
                  <button className="remove-circle-btn" onClick={() => onRemoveItem(cartKey, item)} title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} type="button">×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}