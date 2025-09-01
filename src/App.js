// src/App.js
import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ErrorBoundary } from 'react-error-boundary';

// Pages & Layouts
import Dashboard from './app/dashboard/index';
import POS from './app/dashboard/POS';
import LoginPage from './app/login';

import ThermalPrinterSettings from './app/thermalPrinter/index.jsx';

// Selectors from Redux
import { selectUser } from './redux/slices/userSlice';

// Error boundary fallback component
function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="text-center">
        <h2 className="text-danger mb-3">Something went wrong</h2>
        <p className="text-muted mb-4">
          {error?.message || 'An unexpected error occurred'}
        </p>
        <div>
          <button
            className="btn btn-primary me-2"
            onClick={resetErrorBoundary}
          >
            Try again
          </button>
          <button
            className="btn btn-outline-secondary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
        <details className="mt-4 text-start">
          <summary className="btn btn-link">View error details</summary>
          <pre className="text-danger small mt-2">{error?.stack}</pre>
        </details>
      </div>
    </div>
  );
}

// Auth check utility
function isAuthorized(user) {
  return user && String(user.role || '').toLowerCase() !== 'customer';
}

/**
 * InnerRoutes component — runs inside Router so hooks like useLocation work.
 * Receives authed from parent (computed outside Router).
 */
function InnerRoutes({ authed }) {
  const user = useSelector(selectUser);
  const location = useLocation();

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error('App Error:', error, errorInfo);
      }}
      onReset={() => {
        window.location.reload();
      }}
    >
      <div className="App">
        <Routes>
          {/* Root redirect - handles both index and explicit "/" */}
          <Route 
            index 
            element={
              authed ? (
                <Navigate to="/app/dashboard/pos" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/" 
            element={
              authed ? (
                <Navigate to="/app/dashboard/pos" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />

          {/* Login screen */}
          <Route 
            path="/login" 
            element={
              authed ? (
                <Navigate to="/app/dashboard/pos" replace />
              ) : (
                <LoginPage />
              )
            } 
          />

          {/* Authenticated dashboard routes */}
          <Route 
            path="/app/dashboard" 
            element={
              authed ? (
                <Dashboard />
              ) : (
                <Navigate to="/login" replace state={{ from: location }} />
              )
            }
          >
            <Route index element={<POS />} />
            <Route path="pos" element={<POS />} />
            <Route path="thermal-settings" element={<ThermalPrinterSettings />} />

            {/* Future components */}
            {/* <Route path="orders" element={<Orders />} /> */}
            {/* <Route path="orders/success" element={<OrderSuccess />} /> */}
            {/* <Route path="products" element={<Products />} /> */}
            {/* <Route path="settings" element={<Settings />} /> */}

            {/* fallback for any unmatched nested path */}
            <Route path="*" element={<POS />} />
          </Route>

          {/* Top-level redirects for common paths */}
          <Route 
            path="/thermal-settings" 
            element={<Navigate to="/app/dashboard/thermal-settings" replace />} 
          />

          {/* Catch-all fallback */}
          <Route 
            path="*" 
            element={
              <Navigate 
                to={authed ? "/app/dashboard/pos" : "/login"} 
                replace 
              />
            } 
          />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

// App entry point — HashRouter wraps the inner routes so routing works under file://
function App() {
  const user = useSelector(selectUser);
  const authed = isAuthorized(user);

  return (
    <HashRouter>
      <InnerRoutes authed={authed} />
    </HashRouter>
  );
}

export default App;
