// src/components/pos/SearchHeader.jsx
import React from 'react';

export default function SearchHeader({ searchTerm = '', setSearchTerm, searchInputRef }) {
  return (
    <div className="mb-2 search-header-fixed">
      <div className="d-flex gap-3 align-items-center">
        <div className="flex-grow-1">
          <div className="input-group input-group-lg">
            <span className="input-group-text bg-white border-end-0">
              <i className="fas fa-search text-muted" />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products by name or scan barcode..."
              className="form-control border-start-0 border-end-0 ps-0"
              autoComplete="off"
              spellCheck={false}
              style={{ fontSize: '1rem' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}