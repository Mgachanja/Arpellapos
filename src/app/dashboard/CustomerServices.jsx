import React, { useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { printOrderReceipt } from '../thermalPrinter/thermalPrinter';
import { selectAllProducts } from '../../redux/slices/productSlice';

export default function CustomerServices() {
  const [orderId, setOrderId] = useState('');
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(false);

  const products = useSelector(selectAllProducts);

  const productsMap = useMemo(() => {
    const map = {};
    if (products && Array.isArray(products)) {
      products.forEach(p => {
        if (p.id) map[p.id] = p;
        if (p._id) map[p._id] = p;
        if (p.productId) map[p.productId] = p;
        if (p.inventoryId) map[p.inventoryId] = p;
      });
    }
    return map;
  }, [products]);

  // Resolve order items with product details
  const resolvedItems = useMemo(() => {
    if (!orderData) return [];
    const items = orderData.orderitems || orderData.items || [];
    return items.map(item => {
      const product = productsMap[item.productId] || {};
      
      let price = 0;
      if (item.priceType === 'Retail') {
        price = Number(product.price) || 0;
      } else if (item.priceType === 'Wholesale') {
        price = Number(product.wholesalePrice) || Number(product.price) || 0;
      } else {
        price = Number(product.priceAfterDiscount) || Number(product.price) || 0;
      }
      
      return {
        ...item,
        name: item.productName || item.name || product.name || 'Unknown Item',
        salePrice: Number(item.salePrice || item.price || price),
        price: Number(item.salePrice || item.price || price)
      };
    });
  }, [orderData, productsMap]);

  const handleSearch = async (e) => {
    if (e.key === 'Enter') {
      if (!orderId.trim()) return;
      setLoading(true);
      try {
        const response = await api.get(`https://api.arpellastore.com/order/${orderId.trim()}`);
        if (response.data) {
          setOrderData(response.data);
          toast.success('Order found!');
        } else {
          setOrderData(null);
          toast.info('No order found with that ID.');
        }
      } catch (err) {
        console.error('Error fetching order:', err);
        setOrderData(null);
        toast.error('Failed to fetch order. Please check the ID or try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleReprintReceipt = async () => {
    if (!orderData) return;
    try {
      const receiptData = {
        cart: resolvedItems,
        cartTotal: orderData.total || 0,
        paymentType: orderData.orderPaymentType || 'cash',
        paymentData: {
          cashAmount: orderData.total || 0,
          mpesaAmount: 0,
          change: 0
        },
        user: { fullName: orderData.userId || 'Staff' },
        orderNumber: orderData.orderid || orderData.orderId || orderData.id,
        customerPhone: orderData.phoneNumber || 'Walk-in',
        buyerPin: orderData.buyerPin || '',
        storeSettings: {
          storeName: 'ARPELLA STORE LIMITED',
          storeAddress: 'Ngong, Matasia',
          storePhone: '+254 7xx xxx xxx',
          pin: 'P052336649L',
          receiptFooter: 'Thank you for your business!'
        }
      };
      
      const res = await printOrderReceipt(receiptData);
      if (res?.success) {
        toast.success('Receipt reprinted successfully.');
      } else {
        toast.warning(`Receipt printing failed: ${res?.message}`);
      }
    } catch (err) {
      toast.error('Error reprinting receipt.');
      console.error(err);
    }
  };

  const handleProcessReturn = () => {
    // Stub for processing returns
    toast.info('Return process initiated. (Feature coming soon)');
  };

  return (
    <div className="container-fluid py-4">
      <h2 className="mb-4">Customer Services</h2>
      
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <label className="form-label fw-bold">Search Order</label>
          <input 
            type="text" 
            className="form-control form-control-lg" 
            placeholder="Scan barcode or type Order ID and press Enter..." 
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyDown={handleSearch}
            disabled={loading}
          />
          {loading && <div className="mt-2 text-muted">Searching...</div>}
        </div>
      </div>

      {orderData && (
        <div className="card shadow-sm">
          <div className="card-header bg-white">
            <h5 className="mb-0">Order Details: {orderData.orderid || orderData.orderId || orderData.id}</h5>
          </div>
          <div className="card-body">
            <div className="row mb-4">
              <div className="col-md-6">
                <p><strong>Date:</strong> {new Date(orderData.createdAt || orderData.date).toLocaleString()}</p>
                <p><strong>Customer Phone:</strong> {orderData.phoneNumber}</p>
                <p><strong>Payment Type:</strong> {orderData.orderPaymentType}</p>
              </div>
              <div className="col-md-6">
                <p><strong>Total:</strong> Ksh {Number(orderData.total || 0).toLocaleString()}</p>
                <p><strong>Status:</strong> {orderData.status || 'Completed'}</p>
              </div>
            </div>

            <h6 className="fw-bold">Items</h6>
            <div className="table-responsive">
              <table className="table table-bordered">
                <thead className="table-light">
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedItems.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>Ksh {Number(item.salePrice).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${item.priceType === 'Wholesale' ? 'bg-primary' : item.priceType === 'Discounted' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                          {item.priceType || 'Retail'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={handleReprintReceipt}>
                <i className="fas fa-print me-2"></i> Reprint Receipt
              </button>
              <button className="btn btn-warning" onClick={handleProcessReturn}>
                <i className="fas fa-undo me-2"></i> Process Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
