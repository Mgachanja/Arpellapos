import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  InputGroup,
  Row,
  Col,
  Badge,
  Pagination,
  Nav,
  Tab,
  Container,
  Spinner,
  Alert
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import indexedDb from '../../services/indexedDB';
import constants from '../constants';
import axios from 'axios';

const formatCurrency = (amount) => {
  const num = Number(amount || 0);
  const sign = num < 0 ? '-' : '';
  return `${sign}Ksh ${Math.abs(num).toLocaleString()}`;
};

const getDayKey = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const formatTime = (timestamp) => {
  try {
    const date = new Date(Number(timestamp) || timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const normalizePaymentType = (order) => {
  const type = String(
    order.paymentType || 
    order.orderData?.orderPaymentType || 
    order.payment || 
    ''
  ).toLowerCase();
  
  if (type.includes('hybrid') || type.includes('both')) return 'hybrid';
  if (type.includes('mpesa') || type.includes('m-pesa')) return 'mpesa';
  return 'cash';
};

const calculateOrderTotal = (order) => {
  if (order.cartTotal) return Number(order.cartTotal);
  if (order.total) return Number(order.total);
  if (order.orderData?.total) return Number(order.orderData.total);
  
  const cart = order.cart || order.orderItems || order.items || [];
  return cart.reduce((sum, item) => {
    const price = Number(item.price || item.unitPrice || item.salePrice || 0);
    const qty = Number(item.quantity || item.qty || 1);
    return sum + (price * qty);
  }, 0);
};

export default function OrderManagement() {
  const baseUrl = constants?.baseUrl || '/api';
  
  const [selectedDate, setSelectedDate] = useState(() => getDayKey());
  const [orders, setOrders] = useState([]);
  const [startingCapital, setStartingCapital] = useState(0);
  const [capitalInput, setCapitalInput] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [paymentFilter, setPaymentFilter] = useState('all');
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  
  const [serverOrders, setServerOrders] = useState([]);
  const [serverPage, setServerPage] = useState(1);
  const [serverPageSize, setServerPageSize] = useState(50);
  const [serverHasMore, setServerHasMore] = useState(true);
  const [serverLoading, setServerLoading] = useState(false);
  const [newOrdersAvailable, setNewOrdersAvailable] = useState(false);
  
  const mountedRef = useRef(true);
  const pollIntervalRef = useRef(null);
  const lastServerTimestampRef = useRef(null);

  // Load orders for selected date
  const loadOrders = useCallback(async (dateKey) => {
    try {
      const allOrders = await indexedDb.getAllOrders({ limit: 5000, reverse: true });
      if (!mountedRef.current) return;

      const dayStart = new Date(`${dateKey}T00:00:00`).getTime();
      const dayEnd = new Date(`${dateKey}T23:59:59.999`).getTime();

      const filtered = allOrders
        .filter(order => {
          const timestamp = Number(
            order.createdAt || 
            order.orderData?.createdAt || 
            order.updatedAt || 
            0
          );
          return timestamp >= dayStart && timestamp <= dayEnd;
        })
        .map(order => ({
          ...order,
          paymentType: normalizePaymentType(order),
          timestamp: Number(order.createdAt || order.orderData?.createdAt || order.updatedAt || 0)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setOrders(filtered);
      setCurrentPage(1);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load sales data');
    }
  }, []);

  // Load starting capital for selected date
  const loadStartingCapital = useCallback((dateKey) => {
    try {
      const stored = localStorage.getItem(`capital:${dateKey}`);
      const amount = Number(stored || 0);
      setStartingCapital(amount);
      setCapitalInput(amount > 0 ? String(amount) : '');
    } catch {
      setStartingCapital(0);
      setCapitalInput('');
    }
  }, []);

  // Save starting capital
  const saveStartingCapital = useCallback(() => {
    try {
      const amount = Number(capitalInput || 0);
      localStorage.setItem(`capital:${selectedDate}`, String(amount));
      setStartingCapital(amount);
      toast.success('Starting capital saved');
    } catch {
      toast.error('Failed to save starting capital');
    }
  }, [capitalInput, selectedDate]);

  // Date navigation
  const navigateDate = useCallback((direction) => {
    const current = new Date(`${selectedDate}T00:00:00`);
    current.setDate(current.getDate() + direction);
    const newDate = getDayKey(current);
    setSelectedDate(newDate);
    loadOrders(newDate);
    loadStartingCapital(newDate);
  }, [selectedDate, loadOrders, loadStartingCapital]);

  const goToToday = useCallback(() => {
    const today = getDayKey();
    setSelectedDate(today);
    loadOrders(today);
    loadStartingCapital(today);
  }, [loadOrders, loadStartingCapital]);

  // Filter and paginate orders
  const filteredOrders = useMemo(() => {
    if (paymentFilter === 'all') return orders;
    return orders.filter(order => order.paymentType === paymentFilter);
  }, [orders, paymentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, safePage, pageSize]);

  // Calculate totals with working capital deduction
  const totals = useMemo(() => {
    const salesTotals = filteredOrders.reduce((acc, order) => {
      const total = calculateOrderTotal(order);
      const payment = order.paymentType;

      if (payment === 'hybrid') {
        const paymentData = order.paymentData || order.orderData?.paymentData || {};
        acc.cash += Number(paymentData.cashAmount || paymentData.cash || 0);
        acc.mpesa += Number(paymentData.mpesaAmount || paymentData.mpesa || 0);
      } else if (payment === 'mpesa') {
        acc.mpesa += total;
      } else {
        acc.cash += total;
      }
      
      acc.grand += total;
      return acc;
    }, { cash: 0, mpesa: 0, grand: 0 });

    // Deduct starting capital from cash and grand total
    return {
      cashGross: salesTotals.cash,
      mpesa: salesTotals.mpesa,
      cashNet: salesTotals.cash - startingCapital,
      grandNet: salesTotals.grand - startingCapital,
      capital: startingCapital
    };
  }, [filteredOrders, startingCapital]);

  // Server orders - fetch page
  const fetchServerOrders = useCallback(async (page, size) => {
    setServerLoading(true);
    try {
      const response = await axios.get(`${baseUrl}/paged-orders`, {
        params: { pageNumber: page, pageSize: size }
      });

      const data = response.data;
      let items = [];
      
      if (Array.isArray(data)) items = data;
      else if (Array.isArray(data.items)) items = data.items;
      else if (Array.isArray(data.data)) items = data.data;
      else if (Array.isArray(data.orders)) items = data.orders;

      setServerOrders(items);
      setServerHasMore(items.length >= size);
      setServerPage(page);

      if (page === 1 && items.length > 0) {
        const latestTimestamp = Math.max(
          ...items.map(order => Number(order.createdAt || order.created_at || order.timestamp || 0))
        );
        if (!lastServerTimestampRef.current) {
          lastServerTimestampRef.current = latestTimestamp;
        }
      }
    } catch (error) {
      console.error('Failed to fetch server orders:', error);
      toast.error('Failed to load server orders');
    } finally {
      setServerLoading(false);
    }
  }, [baseUrl]);

  // Poll for new server orders
  const checkForNewOrders = useCallback(async () => {
    if (!lastServerTimestampRef.current) return;

    try {
      let foundNew = false;
      let highestTimestamp = lastServerTimestampRef.current;

      for (let page = 1; page <= 5; page++) {
        const response = await axios.get(`${baseUrl}/paged-orders`, {
          params: { pageNumber: page, pageSize: serverPageSize }
        });

        const data = response.data;
        let items = [];
        
        if (Array.isArray(data)) items = data;
        else if (Array.isArray(data.items)) items = data.items;
        else if (Array.isArray(data.data)) items = data.data;
        else if (Array.isArray(data.orders)) items = data.orders;

        if (items.length === 0) break;

        for (const order of items) {
          const timestamp = Number(order.createdAt || order.created_at || order.timestamp || 0);
          if (timestamp > lastServerTimestampRef.current) {
            foundNew = true;
            highestTimestamp = Math.max(highestTimestamp, timestamp);
          }
        }

        if (foundNew || items.length < serverPageSize) break;
      }

      if (foundNew) {
        lastServerTimestampRef.current = highestTimestamp;
        setNewOrdersAvailable(true);
        toast.info('New orders available from server', { autoClose: 3000 });
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, [baseUrl, serverPageSize]);

  // Setup polling
  useEffect(() => {
    pollIntervalRef.current = setInterval(checkForNewOrders, 60000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkForNewOrders]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    loadOrders(selectedDate);
    loadStartingCapital(selectedDate);
    fetchServerOrders(1, serverPageSize);

    // Listen for storage changes (cross-tab sync)
    const handleStorageChange = (event) => {
      if (event.key?.startsWith('arpella-orders-msg-')) {
        try {
          const message = JSON.parse(event.newValue);
          if (['order-put', 'order-updated', 'order-deleted', 'orders-cleared'].includes(message.type)) {
            loadOrders(selectedDate);
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [selectedDate, loadOrders, loadStartingCapital, fetchServerOrders, serverPageSize]);

  // Order modal handlers
  const openOrderDetails = useCallback((order) => {
    setSelectedOrder(order);
    setShowOrderModal(true);
  }, []);

  const closeOrderDetails = useCallback(() => {
    setSelectedOrder(null);
    setShowOrderModal(false);
  }, []);

  // Export functions
  const exportDaySales = useCallback(() => {
    try {
      const data = JSON.stringify(orders, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-${selectedDate}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Export complete');
    } catch {
      toast.error('Export failed');
    }
  }, [orders, selectedDate]);

  const exportServerPage = useCallback(() => {
    try {
      const data = JSON.stringify(serverOrders, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `server-orders-page${serverPage}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Export complete');
    } catch {
      toast.error('Export failed');
    }
  }, [serverOrders, serverPage]);

  // Clear day sales
  const clearDaySales = useCallback(async () => {
    if (!window.confirm(`Clear all sales for ${selectedDate}? This cannot be undone.`)) return;

    try {
      const orderIds = orders.map(o => o.orderId).filter(Boolean);
      await Promise.all(orderIds.map(id => indexedDb.deleteOrder(id).catch(() => {})));
      toast.success(`Cleared sales for ${selectedDate}`);
      loadOrders(selectedDate);
    } catch {
      toast.error('Failed to clear sales');
    }
  }, [orders, selectedDate, loadOrders]);

  return (
    <Container fluid className="py-4">
      <Row className="mb-3 align-items-center">
        <Col>
          <h3>Sales Management</h3>
          <p className="text-muted mb-0">View and manage daily sales transactions</p>
        </Col>
        <Col xs="auto">
          <Button 
            variant="primary" 
            onClick={() => window.location.hash = '#/app/dashboard/pos'}
          >
            Open POS
          </Button>
        </Col>
      </Row>

      <Tab.Container defaultActiveKey="daily">
        <Nav variant="tabs" className="mb-4">
          <Nav.Item>
            <Nav.Link eventKey="daily">Daily Sales</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="server">
              Server Records
              {newOrdersAvailable && (
                <Badge bg="danger" className="ms-2">New</Badge>
              )}
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey="daily">
            {/* Date Navigation */}
            <Row className="mb-3 align-items-center">
              <Col md={6}>
                <div className="d-flex gap-2 align-items-center">
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    onClick={() => navigateDate(-1)}
                  >
                    ← Previous
                  </Button>
                  <Button 
                    variant="outline-primary" 
                    size="sm" 
                    onClick={goToToday}
                  >
                    Today
                  </Button>
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    onClick={() => navigateDate(1)}
                  >
                    Next →
                  </Button>
                  <Form.Control
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      loadOrders(e.target.value);
                      loadStartingCapital(e.target.value);
                    }}
                    style={{ maxWidth: 180 }}
                  />
                </div>
              </Col>
              <Col md={6} className="text-md-end mt-2 mt-md-0">
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  onClick={exportDaySales}
                  className="me-2"
                >
                  Export
                </Button>
                <Button 
                  variant="outline-danger" 
                  size="sm" 
                  onClick={clearDaySales}
                >
                  Clear Day
                </Button>
              </Col>
            </Row>

            {/* Controls */}
            <Row className="mb-3">
              <Col md={6}>
                <InputGroup style={{ maxWidth: 300 }}>
                  <InputGroup.Text>Filter</InputGroup.Text>
                  <Form.Select 
                    value={paymentFilter} 
                    onChange={(e) => {
                      setPaymentFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="all">All Payments</option>
                    <option value="cash">Cash Only</option>
                    <option value="mpesa">M-Pesa Only</option>
                    <option value="hybrid">Hybrid Only</option>
                  </Form.Select>
                </InputGroup>
              </Col>
              <Col md={6}>
                <InputGroup style={{ maxWidth: 380, marginLeft: 'auto' }}>
                  <InputGroup.Text>Starting Capital</InputGroup.Text>
                  <Form.Control
                    type="number"
                    value={capitalInput}
                    onChange={(e) => setCapitalInput(e.target.value)}
                    placeholder="0"
                  />
                  <Button 
                    variant="outline-primary" 
                    onClick={saveStartingCapital}
                  >
                    Save
                  </Button>
                </InputGroup>
              </Col>
            </Row>

            {/* Sales Table */}
            <Table hover responsive bordered>
              <thead className="table-light">
                <tr>
                  <th style={{ width: 100 }}>Time</th>
                  <th>Order ID</th>
                  <th style={{ width: 150 }}>Payment</th>
                  <th className="text-end" style={{ width: 130 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map((order) => {
                  const amount = calculateOrderTotal(order);
                  const payment = order.paymentType;

                  return (
                    <tr 
                      key={order.orderId || order.timestamp} 
                      onClick={() => openOrderDetails(order)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{formatTime(order.timestamp)}</td>
                      <td className="font-monospace small">
                        {String(order.orderId || '').slice(0, 24)}
                      </td>
                      <td>
                        {payment === 'cash' && <Badge bg="success">Cash</Badge>}
                        {payment === 'mpesa' && <Badge bg="primary">M-Pesa</Badge>}
                        {payment === 'hybrid' && <Badge bg="warning" text="dark">Hybrid</Badge>}
                      </td>
                      <td className="text-end fw-semibold">{formatCurrency(amount)}</td>
                    </tr>
                  );
                })}
                {paginatedOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">
                      No sales recorded for this date
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="table-light">
                <tr>
                  <td colSpan={2} className="fw-bold">SALES TOTALS</td>
                  <td>
                    <div className="small">
                      <div>Cash Sales: <span className="fw-semibold">{formatCurrency(totals.cashGross)}</span></div>
                      <div>M-Pesa: <span className="fw-semibold">{formatCurrency(totals.mpesa)}</span></div>
                    </div>
                  </td>
                  <td className="text-end fw-bold">{formatCurrency(totals.cashGross + totals.mpesa)}</td>
                </tr>
                {totals.capital > 0 && (
                  <tr>
                    <td colSpan={2} className="fw-bold text-danger">LESS: Working Capital</td>
                    <td>
                      <div className="small text-danger">
                        <div>Starting Capital</div>
                      </div>
                    </td>
                    <td className="text-end fw-bold text-danger">-{formatCurrency(totals.capital)}</td>
                  </tr>
                )}
                <tr className="table-info">
                  <td colSpan={2} className="fw-bold fs-6">NET SALe</td>
                  <td>
                    <div className="small">
                      <div>Cash Net: <span className={`fw-semibold ${totals.cashNet < 0 ? 'text-danger' : ''}`}>
                        {formatCurrency(totals.cashNet)}
                      </span></div>
                      <div>M-Pesa: <span className="fw-semibold">{formatCurrency(totals.mpesa)}</span></div>
                    </div>
                  </td>
                  <td className={`text-end fw-bold fs-5 ${totals.grandNet < 0 ? 'text-danger' : 'text-success'}`}>
                    {formatCurrency(totals.grandNet)}
                  </td>
                </tr>
              </tfoot>
            </Table>

            {/* Pagination */}
            <Row className="align-items-center">
              <Col>
                <small className="text-muted">
                  Showing {paginatedOrders.length} of {filteredOrders.length} transactions
                </small>
              </Col>
              <Col xs="auto">
                <div className="d-flex gap-2 align-items-center">
                  <Form.Select 
                    size="sm" 
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{ width: 80 }}
                  >
                    {[10, 20, 50, 100].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </Form.Select>
                  <Pagination size="sm" className="mb-0">
                    <Pagination.First 
                      onClick={() => setCurrentPage(1)}
                      disabled={safePage === 1}
                    />
                    <Pagination.Prev 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    />
                    <Pagination.Item active>{safePage}</Pagination.Item>
                    <Pagination.Next 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                    />
                    <Pagination.Last 
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safePage === totalPages}
                    />
                  </Pagination>
                </div>
              </Col>
            </Row>
          </Tab.Pane>

          <Tab.Pane eventKey="server">
            {/* Server Controls */}
            <Row className="mb-3 align-items-center">
              <Col md={6}>
                <InputGroup style={{ maxWidth: 250 }}>
                  <InputGroup.Text>Page Size</InputGroup.Text>
                  <Form.Select 
                    value={serverPageSize}
                    onChange={(e) => {
                      const newSize = Number(e.target.value);
                      setServerPageSize(newSize);
                      setServerPage(1);
                      fetchServerOrders(1, newSize);
                    }}
                  >
                    {[10, 20, 50, 100, 200].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </Form.Select>
                </InputGroup>
              </Col>
              <Col md={6} className="text-md-end">
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  onClick={() => {
                    setNewOrdersAvailable(false);
                    fetchServerOrders(1, serverPageSize);
                  }}
                  className="me-2"
                >
                  Refresh
                </Button>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={exportServerPage}
                >
                  Export Page
                </Button>
              </Col>
            </Row>

            {newOrdersAvailable && (
              <Alert variant="info" dismissible onClose={() => setNewOrdersAvailable(false)}>
                New orders are available. Click Refresh to load them.
              </Alert>
            )}

            {/* Server Orders Table */}
            <Table hover responsive bordered>
              <thead className="table-light">
                <tr>
                  <th style={{ width: 100 }}>Time</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th style={{ width: 150 }}>Payment</th>
                  <th className="text-end" style={{ width: 130 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {serverOrders.map((order, index) => {
                  const amount = calculateOrderTotal(order);
                  const payment = normalizePaymentType(order);
                  const timestamp = Number(
                    order.createdAt || 
                    order.created_at || 
                    order.timestamp || 
                    Date.now()
                  );

                  return (
                    <tr 
                      key={index}
                      onClick={() => openOrderDetails(order)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{formatTime(timestamp)}</td>
                      <td className="font-monospace small">
                        {String(order._id || order.id || order.orderId || '').slice(0, 24)}
                      </td>
                      <td>{order.customerName || order.customer || order.user || 'Walk-in'}</td>
                      <td>
                        {payment === 'cash' && <Badge bg="success">Cash</Badge>}
                        {payment === 'mpesa' && <Badge bg="primary">M-Pesa</Badge>}
                        {payment === 'hybrid' && <Badge bg="warning" text="dark">Hybrid</Badge>}
                      </td>
                      <td className="text-end fw-semibold">{formatCurrency(amount)}</td>
                    </tr>
                  );
                })}
                {serverOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      {serverLoading ? (
                        <><Spinner size="sm" className="me-2" />Loading...</>
                      ) : (
                        'No server orders found'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>

            {/* Server Pagination */}
            <Row className="align-items-center">
              <Col>
                <small className="text-muted">
                  Page {serverPage} {!serverHasMore && '(last page)'}
                </small>
              </Col>
              <Col xs="auto">
                <div className="d-flex gap-2">
                  <Button 
                    variant="outline-secondary" 
                    size="sm"
                    onClick={() => {
                      const prev = Math.max(1, serverPage - 1);
                      setServerPage(prev);
                      fetchServerOrders(prev, serverPageSize);
                    }}
                    disabled={serverPage === 1 || serverLoading}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline-secondary" 
                    size="sm"
                    onClick={() => {
                      const next = serverPage + 1;
                      setServerPage(next);
                      fetchServerOrders(next, serverPageSize);
                    }}
                    disabled={!serverHasMore || serverLoading}
                  >
                    Next
                  </Button>
                </div>
              </Col>
            </Row>
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>

      {/* Order Details Modal */}
      <Modal show={showOrderModal} onHide={closeOrderDetails} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Order Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrder && (
            <>
              <Row className="mb-3">
                <Col md={4}>
                  <small className="text-muted d-block">Date & Time</small>
                  <strong>
                    {new Date(
                      selectedOrder.createdAt || 
                      selectedOrder.created_at || 
                      selectedOrder.timestamp || 
                      Date.now()
                    ).toLocaleString()}
                  </strong>
                </Col>
                <Col md={4}>
                  <small className="text-muted d-block">Payment Method</small>
                  <div className="mt-1">
                    {selectedOrder.paymentType === 'cash' && <Badge bg="success">Cash</Badge>}
                    {selectedOrder.paymentType === 'mpesa' && <Badge bg="primary">M-Pesa</Badge>}
                    {selectedOrder.paymentType === 'hybrid' && <Badge bg="warning" text="dark">Hybrid</Badge>}
                  </div>
                </Col>
                <Col md={4} className="text-end">
                  <small className="text-muted d-block">Total Amount</small>
                  <strong className="fs-5">{formatCurrency(calculateOrderTotal(selectedOrder))}</strong>
                </Col>
              </Row>

              {(selectedOrder.paymentType === 'mpesa' || selectedOrder.paymentType === 'hybrid') && (
<Alert variant="info">
<strong>M-Pesa Phone:</strong>{' '}
{selectedOrder.paymentData?.mpesaPhone ||
selectedOrder.customerPhone ||
selectedOrder.orderData?.phoneNumber ||
'Not provided'}
</Alert>
)}
<hr />

          <h6 className="mb-3">Items Purchased</h6>
          <Table bordered size="sm">
            <thead className="table-light">
              <tr>
                <th>Item</th>
                <th className="text-center" style={{ width: 80 }}>Qty</th>
                <th className="text-end" style={{ width: 120 }}>Unit Price</th>
                <th className="text-end" style={{ width: 120 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(selectedOrder.cart || selectedOrder.orderItems || selectedOrder.items || []).map((item, index) => {
                const name = item.name || 
                            item.productName || 
                            item.product?.name || 
                            item.product?.title || 
                            `Item ${index + 1}`;
                const quantity = Number(item.quantity || item.qty || 1);
                const unitPrice = Number(
                  item.price || 
                  item.unitPrice || 
                  item.salePrice || 
                  item.product?.price || 
                  0
                );
                const lineTotal = unitPrice * quantity;

                return (
                  <tr key={index}>
                    <td>{name}</td>
                    <td className="text-center">{quantity}</td>
                    <td className="text-end">{formatCurrency(unitPrice)}</td>
                    <td className="text-end fw-semibold">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="table-light">
              <tr>
                <td colSpan={3} className="text-end fw-bold">TOTAL</td>
                <td className="text-end fw-bold fs-6">
                  {formatCurrency(calculateOrderTotal(selectedOrder))}
                </td>
              </tr>
            </tfoot>
          </Table>

          <div className="mt-3 text-muted small">
            <strong>Order ID:</strong>{' '}
            <span className="font-monospace">{selectedOrder.orderId || selectedOrder._id || selectedOrder.id || 'N/A'}</span>
          </div>
        </>
      )}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={closeOrderDetails}>
        Close
      </Button>
    </Modal.Footer>
  </Modal>
</Container>);
}