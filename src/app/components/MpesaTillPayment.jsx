// src/components/pos/MpesaTillPayment.jsx
import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;
const PAYMENTS_API = 'https://api.arpellastore.com/payments';

export default function MpesaTillPayment({ show, onHide, cartTotal, onSubmit }) {
  const [transactionId, setTransactionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState(null);
  const [error, setError] = useState('');

  // Payments API state
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsData, setPaymentsData] = useState(null);
  const [paymentsError, setPaymentsError] = useState('');

  // Reset + fetch when modal opens
  useEffect(() => {
    if (show) {
      setTransactionId('');
      setTransactionDetails(null);
      setError('');
      setLoading(false);
      setVerifying(false);
      fetchPayments();
    }
  }, [show]);

  // GET https://api.arpellastore.com/payments
  const fetchPayments = async () => {
    setPaymentsLoading(true);
    setPaymentsError('');
    setPaymentsData(null);

    try {
      const res = await fetch(PAYMENTS_API, {
        method: 'GET',
        credentials: 'include', // safe even if not needed
        headers: {
          Accept: 'application/json'
        }
      });

      const contentType = res.headers.get('content-type') || '';
      const body = contentType.includes('application/json')
        ? await res.json()
        : await res.text();

      setPaymentsData({
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        body
      });
    } catch (err) {
      setPaymentsError(err.message || 'Failed to fetch payments');
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleVerifyTransaction = async () => {
    if (!transactionId.trim()) {
      setError('Please enter an M-Pesa transaction code');
      return;
    }

    const txnCode = transactionId.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(txnCode)) {
      setError('Invalid M-Pesa code format (10 characters)');
      return;
    }

    setError('');
    setVerifying(true);

    try {
      await new Promise(r => setTimeout(r, 1500)); // simulate
      setTransactionDetails({
        transactionId: txnCode,
        amount: cartTotal,
        phoneNumber: '254712345678',
        status: 'completed'
      });
      toast.success('Transaction verified');
    } catch {
      setError('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!transactionDetails) {
      setError('Verify transaction first');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(transactionDetails.transactionId);
      onHide();
    } catch {
      setError('Payment processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Header closeButton className="bg-success text-white">
        <Modal.Title>M-Pesa Till Payment</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Alert variant="info">
          Till Number: <strong>5678901</strong><br />
          Amount: <strong>{KSH(cartTotal)}</strong>
        </Alert>

        {/* PAYMENTS API PREVIEW */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>/payments response</strong>
            <Button size="sm" variant="outline-secondary" onClick={fetchPayments}>
              Refresh
            </Button>
          </div>

          <div className="small text-muted mb-2">
            ⚠ This part is still pending — raw server response shown below
          </div>

          <div
            style={{
              maxHeight: 220,
              overflow: 'auto',
              background: '#f8f9fa',
              border: '1px solid #ddd',
              padding: 8,
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 12
            }}
          >
            {paymentsLoading && <Spinner size="sm" />}
            {paymentsError && <span className="text-danger">{paymentsError}</span>}
            {paymentsData &&
              JSON.stringify(paymentsData, null, 2)}
          </div>
        </div>

        {/* TRANSACTION INPUT */}
        <Form.Group className="mb-3">
          <Form.Label>M-Pesa Transaction Code</Form.Label>
          <div className="d-flex gap-2">
            <Form.Control
              value={transactionId}
              maxLength={10}
              onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
            />
            <Button onClick={handleVerifyTransaction} disabled={verifying}>
              {verifying ? <Spinner size="sm" /> : 'Verify'}
            </Button>
          </div>
        </Form.Group>

        {transactionDetails && (
          <Alert variant="success">
            Verified: {transactionDetails.transactionId}
          </Alert>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="success" onClick={handleSubmit} disabled={!transactionDetails || loading}>
          {loading ? <Spinner size="sm" /> : 'Complete Order'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
