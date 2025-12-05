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

  // If we have products to show, show them regardless of hasSearched:
  if (Array.isArray(filteredProducts) && filteredProducts.length > 0) {
    return (
      <>
        {filteredProducts.map(product => {
          const pid = getPid(product) || '';
          const isLoading = loadingProducts && typeof loadingProducts.has === 'function'
            ? loadingProducts.has(pid)
            : loadingProducts && Boolean(loadingProducts[pid]);
          const cartItems = cartByProduct[pid] || [];
          return (
            <div key={pid || `${product.barcode || Math.random()}`} className="col-6 col-sm-4 col-md-6 col-lg-4 col-xl-3 mb-3">
              <div style={{ position: 'relative' }}>
                <ProductCard product={product} cartItems={cartItems} onQuantityChange={onQuantityChange} />
                {isLoading && (
                  <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 12, zIndex: 10 }}>
                    <div className="spinner-border text-primary" style={{ width: '2rem', height: '2rem' }}>
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // No filtered products to show => fall back to the previous UX logic:
  if (!hasSearched) {
    return (
      <div className="col-12">
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
    );
  }

  // If user has searched but nothing matched:
  return (
    <div className="col-12">
      <div className="text-center py-5">
        <i className={`fas ${isLikelyBarcode(searchTerm) ? 'fa-barcode' : 'fa-exclamation-circle'} fa-3x text-muted mb-3`} />
        <h5 className="text-muted">{isLikelyBarcode(searchTerm) ? 'No product found with this barcode' : 'No products found'}</h5>
        <p className="text-muted">{isLikelyBarcode(searchTerm) ? `Barcode "${searchTerm}" not found in inventory` : 'Try a different search term or barcode'}</p>
      </div>
    </div>
  );
}
