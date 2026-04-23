import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { useSendOtpMutation, useResetPasswordMutation } from '../../services/rtkApi';

export default function ForgotPasswordModal({ show, onHide }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [retryCount, setRetryCount] = useState(0);
  const [retryTimer, setRetryTimer] = useState(0);
  const [error, setError] = useState(null);

  const [sendOtpApi, { isLoading: isSendingOtp }] = useSendOtpMutation();
  const [resetPasswordApi, { isLoading: isResettingPassword }] = useResetPasswordMutation();

  const loading = isSendingOtp || isResettingPassword;

  useEffect(() => {
    let timer;
    if (retryTimer > 0) {
      timer = setInterval(() => setRetryTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [retryTimer]);

  const normalizePhone = (p) => {
    let cleaned = p.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.slice(1);
    }
    if (cleaned.length > 12) {
      cleaned = cleaned.slice(0, 12);
    }
    return cleaned;
  };

  const handlePhoneChange = (e) => {
    setPhone(normalizePhone(e.target.value));
  };

  const sendOtp = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      setError('Invalid phone number format. Must be like 2547XXXXXXXX');
      return;
    }
    if (retryCount >= 3) {
      setError('Maximum retries reached. Please try again later.');
      return;
    }
    if (retryTimer > 0) {
      setError(`Please wait ${retryTimer} seconds before trying again.`);
      return;
    }

    setError(null);
    try {
      await sendOtpApi(normalizedPhone).unwrap();
      setRetryCount(prev => prev + 1);
      setRetryTimer(180);
      setStep(2);
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to send OTP');
    }
  };

  const handleVerifyOtp = () => {
    if (!otp || otp.length < 4) {
      setError('OTP must be at least 4 characters long');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleResetPassword = async () => {
    if (!otp || otp.length < 4) {
      setError('OTP must be at least 4 characters long');
      return;
    }
    const pwdRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
    if (!pwdRegex.test(newPassword)) {
      setError('Password must be at least 8 characters, 1 uppercase, 1 lowercase, 1 number and 1 special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    try {
      const payload = {
        otp,
        userId: normalizePhone(phone),
        newpassword: newPassword,
        confirmPassword: confirmPassword
      };
      await resetPasswordApi(payload).unwrap();
      toast.success('Password reset successful!');
      handleClose();
    } catch (err) {
      // Handle fallback to PUT if 405 Method Not Allowed
      if (err?.status === 405 || err?.status === 404) {
        try {
          const payload = {
            otp,
            userId: normalizePhone(phone),
            newpassword: newPassword,
            confirmPassword: confirmPassword
          };
          // The direct fetch fallback to PUT
          const token = localStorage.getItem('token') || '';
          const response = await fetch(`https://arpellabackend-712ca7946927.herokuapp.com/api/reset-password?otp=${otp}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'Failed to reset password');
          }
          toast.success('Password reset successful!');
          handleClose();
          return;
        } catch (fallbackErr) {
          setError(fallbackErr?.message || 'Failed to reset password');
          return;
        }
      }
      setError(err?.data?.message || err?.message || 'Failed to reset password');
    }
  };

  const handleClose = () => {
    setStep(1);
    setPhone('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} centered backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>Reset Password</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        
        {step === 1 && (
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Phone Number</Form.Label>
              <Form.Control
                type="tel"
                placeholder="2547XXXXXXXX"
                value={phone}
                onChange={handlePhoneChange}
                disabled={loading || retryTimer > 0}
              />
              <Form.Text className="text-muted">
                {retryTimer > 0 ? `You can resend OTP in ${retryTimer} seconds.` : 'Enter the phone number associated with your account.'}
              </Form.Text>
            </Form.Group>
            <Button 
              variant="primary" 
              className="w-100" 
              onClick={sendOtp} 
              disabled={loading || retryTimer > 0}
            >
              {loading ? <Spinner size="sm" animation="border" /> : 'Send OTP'}
            </Button>
          </Form>
        )}

        {step === 2 && (
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Enter OTP</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter OTP received via SMS"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </Form.Group>
            <Button 
              variant="primary" 
              className="w-100 mb-2" 
              onClick={handleVerifyOtp}
            >
              Verify OTP
            </Button>
            <Button 
              variant="link" 
              className="w-100 text-decoration-none" 
              onClick={sendOtp} 
              disabled={loading || retryTimer > 0}
            >
              {retryTimer > 0 ? `Resend OTP (${retryTimer}s)` : 'Resend OTP'}
            </Button>
          </Form>
        )}

        {step === 3 && (
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>New Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Confirm Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Form.Group>
            <Button 
              variant="primary" 
              className="w-100" 
              onClick={handleResetPassword}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" animation="border" /> : 'Reset Password'}
            </Button>
          </Form>
        )}
      </Modal.Body>
    </Modal>
  );
}
