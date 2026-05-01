// src/App.js
import React, { useState, useEffect, Suspense, lazy, startTransition } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'react-toastify';
import { selectUser } from './redux/slices/userSlice';

// Lazy pages
const Dashboard = lazy(() => import('./app/dashboard/index'));
const POS = lazy(() => import('./app/dashboard/POS'));
const Orders = lazy(() => import('./app/dashboard/orderManagement'));
const Reports = lazy(() => import('./app/dashboard/orders.jsx'));
const LoginPage = lazy(() => import('./app/login'));
const StockManagement = lazy(() => import('./app/dashboard/stockManagement'));
const ThermalPrinterSettings = lazy(() => import('./app/thermalPrinter/index.jsx'));
const Staff = lazy(() => import('./app/dashboard/staff.jsx'));
const Settings = lazy(() => import('./app/dashboard/settings.jsx'));

// Electron detection
const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

/* =========================
   Error Boundary Fallback
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

    const onUpdateAvailable = (_, info) => {
      setUpdateAvailable(true);
      setUpdateStatus(`Update ${info.version} available`);
      setShowUpdatePanel(true);
    };

    const onDownloadProgress = (_, p) => {
      setDownloadProgress(Math.round(p.percent || 0));
    };

    const onUpdateDownloaded = () => {
      setUpdateStatus('Update ready to install');
      setDownloadProgress(100);
    };

    const onUpdateError = (_, e) => {
      toast.error(e?.message || 'Update failed');
    };

    ipcRenderer.on('update-available', onUpdateAvailable);
    ipcRenderer.on('download-progress', onDownloadProgress);
    ipcRenderer.on('update-downloaded', onUpdateDownloaded);
    ipcRenderer.on('update-error', onUpdateError);

    return () => {
      try {
        ipcRenderer.removeListener('update-available', onUpdateAvailable);
        ipcRenderer.removeListener('download-progress', onDownloadProgress);
        ipcRenderer.removeListener('update-downloaded', onUpdateDownloaded);
        ipcRenderer.removeListener('update-error', onUpdateError);
      } catch (err) {
        // best-effort cleanup
      }
    };
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
   Auth Helper
========================= */
function isAuthorized(user) {
  return user && String(user.role || '').toLowerCase() !== 'customer';
}

/* =========================
   Redirect helper that uses startTransition
   (prevents synchronous navigation causing Suspense to replace UI)
========================= */
function RedirectWithTransition({ to, replace = true, when = true, state = undefined }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!when) return;
    // mark navigation as a transition so suspending lazy routes don't block UI input
    startTransition(() => {
      navigate(to, { replace, state });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, to, replace]);
  return null;
}

/* =========================
   Inner Routes (wrapped in Suspense)
========================= */
function InnerRoutes({ authed }) {
  const location = useLocation();

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AutoUpdateStatus />

      <Suspense
        fallback={
          <div className="min-vh-100 d-flex align-items-center justify-content-center">
            <div className="spinner-border" role="status" aria-hidden="true" />
            <span className="visually-hidden">Loading...</span>
          </div>
        }
      >
        <Routes>
          {/* Root index: redirect via startTransition to avoid synchronous suspension */}
          <Route
            index
            element={<RedirectWithTransition to={authed ? '/app/dashboard/pos' : '/login'} replace />}
          />

          {/* Login */}
          <Route
            path="/login"
            element={authed ? <RedirectWithTransition to="/app/dashboard/pos" replace /> : <LoginPage />}
          />

          {/* Dashboard area */}
          <Route
            path="/app/dashboard/*"
            element={
              authed ? (
                <Dashboard />
              ) : (
                // redirect to login using transition; pass original location for post-login return
                <RedirectWithTransition to="/login" replace state={{ from: location }} />
              )
            }
          >
            <Route index element={<POS />} />
            <Route path="pos" element={<POS />} />
            <Route path="orders" element={<Orders />} />
            <Route path="reports" element={<Reports />} />
            <Route path="stockManagement" element={<StockManagement />} />
            <Route path="staff" element={<Staff />} />
            <Route path="settings" element={<Settings />} />
            <Route path="thermal-settings" element={<ThermalPrinterSettings />} />
            <Route path="*" element={<RedirectWithTransition to="pos" replace />} />
          </Route>

          {/* Fallback: any other path */}
          <Route
            path="*"
            element={<RedirectWithTransition to={authed ? '/app/dashboard/pos' : '/login'} replace />}
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

/* =========================
   App Entry (use startTransition for auth state changes)
========================= */
export default function App() {
  const user = useSelector(selectUser);

  // maintain a local derived 'authed' flag and update it inside startTransition
  const [authedState, setAuthedState] = useState(() => isAuthorized(user));

  useEffect(() => {
    // mark this update as non-urgent so any lazy route reads don't block UI input
    startTransition(() => {
      setAuthedState(isAuthorized(user));
    });
  }, [user]);

  return (
    <HashRouter>
      <InnerRoutes authed={authedState} />
    </HashRouter>
  );
}
