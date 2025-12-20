// src/App.js
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'react-toastify';

// Pages & Layouts
import Dashboard from './app/dashboard/index';
import POS from './app/dashboard/POS';
import Orders from './app/dashboard/orderManagement';
import Reports from './app/dashboard/orders.jsx'
import LoginPage from './app/login';
import ThermalPrinterSettings from './app/thermalPrinter/index.jsx';

// Redux
import { selectUser } from './redux/slices/userSlice';

// Electron
const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

/* =========================
   Error Boundary
========================= */
function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="text-center">
        <h2 className="text-danger">Something went wrong</h2>
        <p className="text-muted">{error?.message}</p>
        <button className="btn btn-primary me-2" onClick={resetErrorBoundary}>
          Try again
        </button>
        <button className="btn btn-outline-secondary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <pre className="text-danger small mt-3">{error?.stack}</pre>
      </div>
    </div>
  );
}

/* =========================
   Auto Update UI
========================= */
function AutoUpdateStatus() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [appInfo, setAppInfo] = useState({ version: '', updateDownloaded: false });
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) return;

    ipcRenderer.on('update-available', (_, info) => {
      setUpdateAvailable(true);
      setUpdateStatus(`Update ${info.version} available`);
      setShowUpdatePanel(true);
    });

    ipcRenderer.on('download-progress', (_, p) => {
      setDownloadProgress(Math.round(p.percent || 0));
    });

    ipcRenderer.on('update-downloaded', () => {
      setUpdateStatus('Update ready to install');
      setDownloadProgress(100);
    });

    ipcRenderer.on('update-error', (_, e) => {
      toast.error(e?.message || 'Update failed');
    });

    return () => ipcRenderer.removeAllListeners();
  }, []);

  if (!isElectron) return null;

  return (
    <>
      <button
        className="btn btn-sm btn-warning position-fixed"
        style={{ top: 10, right: 10, zIndex: 9999 }}
        onClick={() => setShowUpdatePanel(true)}
      >
        Update
      </button>

      {showUpdatePanel && (
        <div
          className="position-fixed bg-white border p-3"
          style={{ top: 50, right: 10, width: 360, zIndex: 10000 }}
        >
          <strong>Updates</strong>
          <div className="small text-muted">{updateStatus}</div>

          {downloadProgress > 0 && (
            <div className="progress mt-2">
              <div className="progress-bar" style={{ width: `${downloadProgress}%` }} />
            </div>
          )}

          <button
            className="btn btn-sm btn-success mt-3 w-100"
            onClick={() => ipcRenderer.invoke('quit-and-install')}
            disabled={downloadProgress < 100}
          >
            Install & Restart
          </button>
        </div>
      )}
    </>
  );
}

/* =========================
   Auth Guard
========================= */
function isAuthorized(user) {
  return user && String(user.role || '').toLowerCase() !== 'customer';
}

/* =========================
   Routes
========================= */
function InnerRoutes({ authed }) {
  const location = useLocation();

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AutoUpdateStatus />

      <Routes>
        {/* Root */}
        <Route
          index
          element={<Navigate to={authed ? '/app/dashboard/pos' : '/login'} replace />}
        />

        {/* Login */}
        <Route
          path="/login"
          element={authed ? <Navigate to="/app/dashboard/pos" replace /> : <LoginPage />}
        />

        {/* Dashboard */}
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

          {/* FIXED */}
          <Route path="orders" element={<Orders />} />
          <Route path="reports" element={<Reports/>} />

          <Route path="thermal-settings" element={<ThermalPrinterSettings />} />
          <Route path="*" element={<Navigate to="pos" replace />} />
        </Route>

        {/* Fallback */}
        <Route
          path="*"
          element={<Navigate to={authed ? '/app/dashboard/pos' : '/login'} replace />}
        />
      </Routes>
    </ErrorBoundary>
  );
}

/* =========================
   App Entry
========================= */
export default function App() {
  const user = useSelector(selectUser);
  const authed = isAuthorized(user);

  return (
    <HashRouter>
      <InnerRoutes authed={authed} />
    </HashRouter>
  );
}
