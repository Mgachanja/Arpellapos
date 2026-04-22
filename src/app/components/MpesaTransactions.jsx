// src/app/components/MpesaTransactions.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Button, Spinner, ListGroup, Badge } from 'react-bootstrap';
import api from '../../services/api';

const KSH = (v) => `Ksh ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MpesaTransactions({ show = false, onHide = () => {}, onApply = () => {} }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/payments');
      const data = res?.data;
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setTransactions(list);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) fetchTransactions();
    else {
      setTransactions([]);
      setError(null);
      setApplying(null);
    }
  }, [show, fetchTransactions]);

  const handleApply = async (tx) => {
    setApplying(tx.transactionId);
    try {
      await onApply(tx);
      onHide();
    } catch (err) {
      // error toasted by parent
    } finally {
      setApplying(null);
    }
  };

  return (
    <Modal show={!!show} onHide={onHide} size="md" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-mobile-alt me-2" />
          M-Pesa Transactions
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading transactions...
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-4 text-danger">
            <i className="fas fa-exclamation-circle me-2" />
            {error}
            <div className="mt-3">
              <Button variant="outline-secondary" size="sm" onClick={fetchTransactions}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && transactions.length === 0 && (
          <div className="text-center py-5 text-muted">
            <i className="fas fa-inbox fa-3x mb-3 d-block" />
            <h6 className="text-muted">No pending M-Pesa transactions</h6>
          </div>
        )}

        {!loading && !error && transactions.length > 0 && (
          <ListGroup>
            {transactions.map((tx, idx) => {
              const txId = tx.transactionId || tx.TransID || tx.transaction_id || `tx-${idx}`;
              const name = (tx.name || tx.Name || tx.customerName || '').trim();
              const amount = tx.transamount ?? tx.TransAmount ?? tx.amount ?? 0;
              const status = tx.status || tx.Status || '';
              const isApplying = applying === txId;

              return (
                <ListGroup.Item key={txId} className="d-flex justify-content-between align-items-start gap-3 py-3">
                  <div className="flex-grow-1">
                    <div className="fw-semibold">{name || 'Unknown'}</div>
                    <div className="text-muted small mt-1">
                      <span className="me-2">
                        <i className="fas fa-receipt me-1" />
                        {txId}
                      </span>
                      {status && (
                        <Badge bg="success" className="ms-1" style={{ fontSize: '0.7rem' }}>
                          {status}
                        </Badge>
                      )}
                    </div>
                    <div className="fw-bold text-success mt-1">{KSH(amount)}</div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    style={{ whiteSpace: 'nowrap' }}
                    disabled={!!applying}
                    onClick={() => handleApply(tx)}
                  >
                    {isApplying ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-1" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-arrow-right me-1" />
                        Send to Order
                      </>
                    )}
                  </Button>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={fetchTransactions} disabled={loading}>
          <i className="fas fa-sync-alt me-1" />
          Refresh
        </Button>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
