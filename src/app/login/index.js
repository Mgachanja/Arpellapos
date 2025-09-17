// src/pages/Login.js
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, selectUser } from '../../redux/slices/userSlice';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Form, Button, Container, Row, Col, InputGroup, Spinner } from 'react-bootstrap';
import { AiOutlineEye, AiOutlineEyeInvisible, AiOutlinePhone, AiOutlineLock, AiOutlineShop } from 'react-icons/ai';
import logo from '../../assets/logo.jpeg';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentUser = useSelector(selectUser);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loading = useSelector(state => state.user.loading);
  const error = useSelector(state => state.user.error);

  // If already logged in, redirect
  if (currentUser) {
    navigate('/app/dashboard', { replace: true });
  }

  const validatePhone = (p) => {
    const s = String(p || '');
    // Accepts 2547XXXXXXXX format (12 digits)
    return /^2547\d{8}$/.test(s);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validatePhone(phoneNumber)) {
      toast.error('Phone number must be in 2547XXXXXXXX format');
      return;
    }
    if (!password || password.length < 1) {
      toast.error('Password is required');
      return;
    }

    try {
      const payload = { phoneNumber: phoneNumber.trim(), password };
      const result = await dispatch(loginUser(payload)).unwrap();
      toast.success(`Welcome ${result[0].firstName || result[0].userName || 'User'}`);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      // err is the rejected value from thunk
      toast.error(err || 'Login failed');
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Container 
      fluid 
      className="vh-100 position-relative p-0" 
      style={{ 
        background: 'linear-gradient(135deg, #f6f3ee 0%, #e8e4dc 100%)',
        overflow: 'hidden'
      }}
    >
      {/* Background decorative elements */}
      <div 
        style={{
          position: 'absolute',
          top: '-10%',
          right: '-10%',
          width: '40%',
          height: '40%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          zIndex: 0
        }}
      />
      <div 
        style={{
          position: 'absolute',
          bottom: '-15%',
          left: '-15%',
          width: '50%',
          height: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
          borderRadius: '50%',
          zIndex: 0
        }}
      />

      <Row className="h-100 g-0" style={{ zIndex: 1 }}>
        {/* Left side - Image */}
        <Col lg={6} className="d-none d-lg-flex align-items-center justify-content-center p-5">
          <div className="text-center">
            <div 
              className="mx-auto mb-4 d-flex align-items-center justify-content-center"
              style={{
                width: '300px',
                height: '300px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,249,250,0.8) 100%)',
                borderRadius: '30px',
                boxShadow: '0 20px 60px rgba(0,123,255,0.2)',
                border: '1px solid rgba(255,255,255,0.3)'
              }}
            >
              <img 
                src={logo}
                alt="Arpella POS Logo" 
                style={{
                  width: '250px',
                  height: '250px',
                  borderRadius: '20px',
                  objectFit: 'cover',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                }}
                onError={(e) => {
                  // Fallback if image doesn't load
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div 
                className="d-none align-items-center justify-content-center"
                style={{ width: '100%', height: '100%' }}
              >
                <AiOutlineShop size={120} color="#007bff" />
              </div>
            </div>
            <h2 className="mb-3 fw-bold" style={{ color: '#2c3e50' }}>
              Arpella POS
            </h2>
            <p className="text-muted fs-5">
              Your complete point-of-sale solution
            </p>
          </div>
        </Col>

        {/* Right side - Login Form */}
        <Col lg={6} xs={12} className="d-flex align-items-center justify-content-center p-4">
          <div style={{ width: '100%', maxWidth: '400px' }}>
            {/* Mobile header (visible only on small screens) */}
            <div className="text-center mb-5 d-lg-none">
              <div 
                className="mx-auto mb-3 d-flex align-items-center justify-content-center"
                style={{
                  width: '80px',
                  height: '80px',
                  background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                  borderRadius: '20px',
                  boxShadow: '0 8px 25px rgba(0,123,255,0.3)'
                }}
              >
                <AiOutlineShop size={40} color="white" />
              </div>
              <h3 className="mb-1 fw-bold" style={{ color: '#2c3e50' }}>
                Welcome Back
              </h3>
              <p className="text-muted mb-0">Sign in to Arpella POSpush.     </p>
            </div>

            {/* Desktop header */}
            <div className="mb-5 d-none d-lg-block">
              <h3 className="mb-2 fw-bold" style={{ color: '#2c3e50' }}>
                Welcome Back
              </h3>
              <p className="text-muted mb-0">Sign in to your account</p>
            </div>

            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-4">
                <Form.Label className="fw-semibold mb-2" style={{ color: '#495057' }}>
                  <AiOutlinePhone size={16} className="me-2" />
                  Phone Number
                </Form.Label>
                <InputGroup>
                  <InputGroup.Text 
                    style={{ 
                      background: '#f8f9fa', 
                      border: '2px solid #e9ecef',
                      borderRight: 'none'
                    }}
                  >
                    +
                  </InputGroup.Text>
                  <Form.Control
                    type="tel"
                    placeholder="2547XXXXXXXX"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\s+/g, ''))}
                    required
                    style={{
                      border: '2px solid #e9ecef',
                      borderLeft: 'none',
                      padding: '12px 16px',
                      fontSize: '16px',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#007bff';
                      e.target.previousElementSibling.style.borderColor = '#007bff';
                      e.target.style.boxShadow = '0 0 0 0.2rem rgba(0,123,255,0.25)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e9ecef';
                      e.target.previousElementSibling.style.borderColor = '#e9ecef';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </InputGroup>
                <Form.Text className="text-muted small mt-1">
                  Enter your phone number starting with 254
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label className="fw-semibold mb-2" style={{ color: '#495057' }}>
                  <AiOutlineLock size={16} className="me-2" />
                  Password
                </Form.Label>
                <InputGroup>
                  <Form.Control
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{
                      border: '2px solid #e9ecef',
                      borderRight: 'none',
                      padding: '12px 16px',
                      fontSize: '16px',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#007bff';
                      e.target.nextElementSibling.style.borderColor = '#007bff';
                      e.target.style.boxShadow = '0 0 0 0.2rem rgba(0,123,255,0.25)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e9ecef';
                      e.target.nextElementSibling.style.borderColor = '#e9ecef';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <Button
                    variant="outline-secondary"
                    onClick={togglePasswordVisibility}
                    style={{
                      background: '#f8f9fa',
                      border: '2px solid #e9ecef',
                      borderLeft: 'none',
                      padding: '12px 16px',
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '50px'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#e9ecef';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#f8f9fa';
                    }}
                  >
                    {showPassword ? (
                      <AiOutlineEyeInvisible size={20} color="#6c757d" />
                    ) : (
                      <AiOutlineEye size={20} color="#6c757d" />
                    )}
                  </Button>
                </InputGroup>
              </Form.Group>

              <div className="d-grid mb-3">
                <Button 
                  type="submit" 
                  disabled={loading}
                  style={{
                    background: loading 
                      ? 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)'
                      : 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
                    border: 'none',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '600',
                    borderRadius: '10px',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    minHeight: '48px'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 8px 25px rgba(0,123,255,0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 15px rgba(0,123,255,0.2)';
                    }
                  }}
                >
                  {loading ? (
                    <div className="d-flex align-items-center justify-content-center">
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                        className="me-2"
                        style={{ width: '18px', height: '18px' }}
                      />
                      Signing in...
                    </div>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </div>

              {error && (
                <div 
                  className="mt-3 p-3 text-center small"
                  style={{
                    background: 'rgba(220, 53, 69, 0.1)',
                    color: '#dc3545',
                    borderRadius: '8px',
                    border: '1px solid rgba(220, 53, 69, 0.2)'
                  }}
                >
                  {error}
                </div>
              )}
            </Form>

            {/* Footer */}
            <div className="text-center mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.3)' }}>
              <small className="text-muted">
                Secure login powered by Arpella
              </small>
            </div>
          </div>
        </Col>
      </Row>

      {/* Loading overlay  */}
      {loading && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            background: 'rgba(246, 243, 238, 0.9)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999
          }}
        >
          <div className="text-center">
            <div className="mb-4">
              <Spinner
                animation="border"
                style={{
                  width: '4rem',
                  height: '4rem',
                  color: '#007bff',
                  borderWidth: '4px'
                }}
              />
            </div>
            <div className="fw-bold mb-2" style={{ color: '#495057', fontSize: '18px' }}>
              Authenticating...
            </div>
            <div className="text-muted">
              Please wait while we verify your credentials
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}