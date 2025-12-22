// ProductsGrid.jsx
import React from 'react';
import ProductCard from './ProductCard';

function getPid(product) {
  if (!product) return '';
  return String(product.id ?? product._id ?? product.productId ?? product.sku ?? product.barcode ?? product.inventoryId ?? product.inventory_id ?? '');
}

export default function ProductsGrid({
  hasSearched,
  filteredProducts,
  searchTerm,
  isLikelyBarcode,
  cart,
  onQuantityChange,
  loadingProducts
}) {
  const safeCart = Array.isArray(cart) ? cart : [];
  const cartByProduct = safeCart.reduce((acc, item) => {
    const pid = getPid(item) || String(item.id || item._id || '');
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(item);
    return acc;
  }, {});

  // outer wrapper provides horizontal breathing room so cards don't hug the viewport edge
  const outerClass = 'w-100 px-3';

  if (Array.isArray(filteredProducts) && filteredProducts.length > 0) {
    return (
      <div className={outerClass}>
        <div className="row g-1">
          {filteredProducts.map(product => {
            const pid = getPid(product) || '';
            const isLoading = loadingProducts && typeof loadingProducts.has === 'function'
              ? loadingProducts.has(pid)
              : loadingProducts && Boolean(loadingProducts[pid]);
            const cartItems = cartByProduct[pid] || [];
            return (
              <div key={pid || `${product.barcode || Math.random()}`} className="col-12 px-2">
                <div style={{ position: 'relative' }}>
                  {/* pass showQuantityBadge=false to stop rendering the "(n)" cart counts on the Add buttons */}
                  <ProductCard product={product} cartItems={cartItems} onQuantityChange={onQuantityChange} showQuantityBadge={false} />
                  {isLoading && (
                    <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 6, zIndex: 10 }}>
                      <div className="spinner-border text-primary" style={{ width: '1.2rem', height: '1.2rem' }}>
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div className={outerClass}>
        <div className="row">
          <div className="col-12 px-2">
            <div className="text-center py-5">
              <div className="mb-4">
                <i className="fas fa-search fa-3x text-muted mb-2" />
                <i className="fas fa-barcode fa-3x text-muted" />
                <i className="fas fa-shopping-cart fa-3x text-success" />
              </div>
              <h5 className="text-muted">Search for products or scan barcodes</h5>
              <p className="text-muted">
                <small className="text-success"><i className="fas fa-magic me-1" /><strong>Barcode scanner ready:</strong> Scan any barcode to instantly add items to your cart!</small>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      <div className="row">
        <div className="col-12 px-2">
          <div className="text-center py-5">
            <i className={`fas ${isLikelyBarcode(searchTerm) ? 'fa-barcode' : 'fa-exclamation-circle'} fa-3x text-muted mb-3`} />
            <h5 className="text-muted">{isLikelyBarcode(searchTerm) ? 'No product found with this barcode' : 'No products found'}</h5>
            <p className="text-muted">{isLikelyBarcode(searchTerm) ? `Barcode "${searchTerm}" not found in inventory` : 'Try a different search term or barcode'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
