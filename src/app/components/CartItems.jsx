import React from 'react';
import { extractId } from '../../redux/slices/productsSlice-helpers';
import { useDispatch } from 'react-redux';
import { toggleApplyDiscount, toggleApplyDiscountAll } from '../../redux/slices/productSlice';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function CartItems({ cart, onRemoveItem }) {
  const dispatch = useDispatch();

  const applicableItems = cart?.filter(item => item.priceAfterDiscount && Number(item.priceAfterDiscount) > 0) || [];
  const allDiscounted = applicableItems.length > 0 && applicableItems.every(item => item.applyDiscount);
  const handleToggleAll = () => {
    if (applicableItems.length > 0) {
      dispatch(toggleApplyDiscountAll({ apply: !allDiscounted }));
    }
  };

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
            <th style={{ fontSize: '0.8rem', width: '40%' }}>Product</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Discount</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Type</th>
            <th style={{ fontSize: '0.8rem' }} className="text-center">Qty</th>
            <th style={{ fontSize: '0.8rem' }} className="text-end">Total</th>
            <th style={{ fontSize: '0.8rem', width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {cart.map(item => {
            let itemPrice = item.priceType === 'Retail' 
              ? (item.price || 0) 
              : (Number(item.wholesalePrice) || item.price || 0);
            if (item.applyDiscount && item.priceAfterDiscount && Number(item.priceAfterDiscount) > 0) {
              itemPrice = Number(item.priceAfterDiscount);
            }

            const itemTotal = itemPrice * (item.quantity || 1);
            const itemId = extractId(item);
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
                <td className="text-center" style={{ fontSize: '0.75rem' }}>
                  {item.priceAfterDiscount && Number(item.priceAfterDiscount) > 0 ? (
                    <input 
                      type="checkbox" 
                      className="form-check-input" 
                      checked={!!item.applyDiscount}
                      onChange={() => dispatch(toggleApplyDiscount(cartKey))}
                      title="Apply Discount"
                    />
                  ) : (
                    <span className="text-muted">-</span>
                  )}
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
      <div className="d-flex justify-content-between align-items-center mt-2 px-2">
        <div className="form-check form-switch">
          <input 
            className="form-check-input" 
            type="checkbox" 
            id="applyDiscountAll" 
            checked={allDiscounted}
            onChange={handleToggleAll}
            disabled={applicableItems.length === 0}
          />
          <label className="form-check-label small" htmlFor="applyDiscountAll">
            Apply discount on all applicable products ({applicableItems.length} available)
          </label>
        </div>
      </div>
    </div>
  );
}