// src/components/pos/PaymentForm.jsx
import React from 'react';
import { Form } from 'react-bootstrap';

const KSH = (amt) => `Ksh ${Number(amt || 0).toLocaleString()}`;

export default function PaymentForm({ paymentType, setPaymentType, paymentData, setPaymentData, cartTotal, setCurrentOrderId }) {
  const cashActive = { backgroundColor: '#FF8C00', border: '2px solid #FF6600', color: '#fff' };
  const cashInactive = { backgroundColor: '#FFEBD6', border: '2px solid #FFA500', color: '#1f1f1f' };
  const mpesaActive = { backgroundColor: '#22B14C', border: '2px solid #16A335', color: '#fff' };
  const mpesaInactive = { backgroundColor: '#E6F8EA', border: '2px solid #22B14C', color: '#1f1f1f' };
  const bothActive = { backgroundColor: '#0056B3', border: '2px solid #004494', color: '#fff' };
  const bothInactive = { backgroundColor: '#E7F1FF', border: '2px solid #0078D4', color: '#1f1f1f' };

  const handleMpesaInputChange = (raw) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 9);
    setPaymentData({ ...paymentData, mpesaPhone: digits ? `254${digits}` : '' });
  };

  const mpesaValueWithoutPrefix = paymentData.mpesaPhone ? paymentData.mpesaPhone.replace(/^254/, '') : '';

  return (
    <>
      <div className="mb-3">
        <div className="fw-semibold mb-2" style={{ fontSize: '0.95rem' }}>
          <i className="fas fa-credit-card me-2" />Payment Method
        </div>
        <div className="row g-2">
          <div className="col-4">
            <button type="button" className="btn w-100" onClick={() => { setPaymentType('cash'); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} style={paymentType === 'cash' ? cashActive : cashInactive}><i className="fas fa-money-bill-wave d-block mb-1" style={{ fontSize: '1.2rem' }} />Cash</button>
          </div>
          <div className="col-4">
            <button type="button" className="btn w-100" onClick={() => { setPaymentType('mpesa'); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} style={paymentType === 'mpesa' ? mpesaActive : mpesaInactive}><i className="fas fa-mobile-alt d-block mb-1" style={{ fontSize: '1.2rem' }} />M-Pesa</button>
          </div>
          <div className="col-4">
            <button type="button" className="btn w-100" onClick={() => { setPaymentType('both'); setPaymentData({ cashAmount: '', mpesaPhone: '', mpesaAmount: '' }); setCurrentOrderId(null); }} style={paymentType === 'both' ? bothActive : bothInactive}><i className="fas fa-exchange-alt d-block mb-1" style={{ fontSize: '1.2rem' }} />Hybrid</button>
          </div>
        </div>
      </div>

      {paymentType === 'cash' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Cash Amount Given</Form.Label>
          <div className="input-group input-group-lg">
            <span className="input-group-text">Ksh</span>
            <Form.Control type="number" value={paymentData.cashAmount} onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} placeholder="Enter amount received" min={cartTotal} style={{ fontSize: '1.1rem' }} />
          </div>
          {paymentData.cashAmount && Number(paymentData.cashAmount) >= cartTotal && (
            <div className="mt-2 p-2 bg-success bg-opacity-10 rounded border-start border-success border-3">
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-success fw-semibold"><i className="fas fa-check-circle me-1" />Change:</span>
                <span className="text-success fw-bold fs-5">{KSH(Number(paymentData.cashAmount) - cartTotal)}</span>
              </div>
            </div>
          )}
        </Form.Group>
      )}

      {paymentType === 'mpesa' && (
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">M-Pesa Phone Number</Form.Label>
          <div className="input-group input-group-lg">
            <span className="input-group-text">📱</span>
            <span className="input-group-text">254</span>
            <Form.Control
              type="tel"
              placeholder="7XXXXXXXX"
              value={mpesaValueWithoutPrefix}
              onChange={(e) => handleMpesaInputChange(e.target.value)}
              style={{ fontSize: '1.1rem' }}
              inputMode="numeric"
              maxLength={9}
            />
          </div>
        </Form.Group>
      )}

      {paymentType === 'both' && (
        <>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Cash Amount</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">Ksh</span>
              <Form.Control type="number" value={paymentData.cashAmount} onChange={(e) => setPaymentData({ ...paymentData, cashAmount: e.target.value })} placeholder="Enter cash amount" min={0} style={{ fontSize: '1.1rem' }} />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">M-Pesa Amount</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">Ksh</span>
              <Form.Control type="number" value={paymentData.mpesaAmount} onChange={(e) => setPaymentData({ ...paymentData, mpesaAmount: e.target.value })} placeholder="Enter M-Pesa amount" min={0} style={{ fontSize: '1.1rem' }} />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">M-Pesa Phone Number</Form.Label>
            <div className="input-group input-group-lg">
              <span className="input-group-text">📱</span>
              <span className="input-group-text">254</span>
              <Form.Control
                type="tel"
                placeholder="7XXXXXXXX"
                value={mpesaValueWithoutPrefix}
                onChange={(e) => handleMpesaInputChange(e.target.value)}
                style={{ fontSize: '1.1rem' }}
                inputMode="numeric"
                maxLength={9}
              />
            </div>
          </Form.Group>
        </>
      )}
    </>
  );
}