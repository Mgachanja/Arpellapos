// src/components/pos/SearchTools.jsx
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUndoAlt } from '@fortawesome/free-solid-svg-icons';

export default function SearchTools({ loading, onRefresh, onClear, defaultPriceType, setDefaultPriceType }) {
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Search Tools</div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh product index"
              aria-label="Refresh products"
              style={{ minWidth: 0, padding: '6px 8px' }}
            >
              {loading ? <span className="spinner-border spinner-border-sm" /> : <FontAwesomeIcon icon={faUndoAlt} />}
            </button>

            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onClear}
              title="Clear search results"
              aria-label="Clear search"
              style={{ padding: '6px 10px' }}
            >
              <i className="fas fa-times me-1" /> Clear
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="defaultPriceType" style={{ margin: 0, fontSize: '0.85rem', color: '#6c757d' }}>Default scan price:</label>
          <select id="defaultPriceType" value={defaultPriceType} onChange={(e) => setDefaultPriceType(e.target.value)} className="form-select form-select-sm" style={{ width: 140 }}>
            <option value="Retail">Retail</option>
            <option value="Discounted">Wholesale</option>
          </select>
        </div>
      </div>
    </div>
  );
}