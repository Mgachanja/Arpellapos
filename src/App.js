// src/App.js
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'react-toastify';

// Pages & Layouts
import Dashboard from './app/dashboard/index';
import POS from './app/dashboard/POS';
import LoginPage from './app/login';
import ThermalPrinterSettings from './app/thermalPrinter/index.jsx';

// Selectors from Redux
import { selectUser } from './redux/slices/userSlice';

// Detect Electron and get ipcRenderer safely
const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

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

// === Auto Update Status Component (improved, matches main.js events) ===
function AutoUpdateStatus() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState('');
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) return;

    // Get current version from main
    (async () => {
      try {
        const version = await ipcRenderer.invoke('get-app-version');
        setCurrentVersion(version || '');
      } catch (err) {
        console.warn('get-app-version failed', err);
      }
    })();

    // Handlers
    const onChecking = () => {
      setUpdateStatus('Checking for updates...');
      setIsChecking(true);
    };

    const onAvailable = (event, info) => {
      setUpdateStatus(`Update available: v${info?.version || ''}`);
      setUpdateAvailable(true);
      setShowUpdatePanel(true);
      toast.info('New update available — downloading in background.', { position: 'top-right', autoClose: 4000 });
    };

    const onNotAvailable = () => {
      setUpdateStatus('No updates available');
      setUpdateAvailable(false);
      if (isChecking) {
        toast.info('You are running the latest version.', { position: 'top-right', autoClose: 3000 });
      }
    };

    const onProgress = (event, progress) => {
      const pct = Math.round(progress?.percent || 0);
      setDownloadProgress(pct);
      setUpdateStatus(`Downloading update: ${pct}%`);
    };

    const onDownloaded = (event, info) => {
      setDownloadProgress(100);
      setUpdateStatus('Update downloaded');
      setUpdateAvailable(true);
      toast.success('Update downloaded — click Install & Restart to apply.', { autoClose: false });
    };

    const onError = (event, err) => {
      const msg = err?.message || String(err);
      console.error('AutoUpdater error:', msg);
      setUpdateStatus(`Update error: ${msg}`);
      toast.error('Update error: ' + msg, { autoClose: 5000 });
    };

    // Register listeners (names must match main.js)
    ipcRenderer.on('update-checking', onChecking);
    ipcRenderer.on('update-available', onAvailable);
    ipcRenderer.on('update-not-available', onNotAvailable);
    ipcRenderer.on('update-download-progress', onProgress);
    ipcRenderer.on('update-downloaded', onDownloaded);
    ipcRenderer.on('update-error', onError);

    // Backwards compatibility: also subscribe to legacy channels if used
    ipcRenderer.on('update-message', (e, text) => {
      // keep textual messages in sync with granular state
      setUpdateStatus(text || '');
      if (typeof text === 'string' && text.toLowerCase().includes('update available')) {
        setUpdateAvailable(true);
      }
    });
    ipcRenderer.on('download-progress', (e, progress) => {
      const pct = Math.round(progress?.percent || 0);
      setDownloadProgress(pct);
    });

    return () => {
      ipcRenderer.removeListener('update-checking', onChecking);
      ipcRenderer.removeListener('update-available', onAvailable);
      ipcRenderer.removeListener('update-not-available', onNotAvailable);
      ipcRenderer.removeListener('update-download-progress', onProgress);
      ipcRenderer.removeListener('update-downloaded', onDownloaded);
      ipcRenderer.removeListener('update-error', onError);

      ipcRenderer.removeAllListeners('update-message');
      ipcRenderer.removeAllListeners('download-progress');
    };
  }, [isChecking]);

  // Manual check trigger
  const checkForUpdates = async () => {
    if (!ipcRenderer) return;
    try {
      setIsChecking(true);
      setUpdateStatus('Checking for updates...');
      const res = await ipcRenderer.invoke('check-for-updates');
      if (res && res.success === false) {
        const msg = res.error || res.message || 'Check failed';
        setUpdateStatus(msg);
        toast.error(msg);
      }
    } catch (err) {
      console.error('checkForUpdates failed', err);
      setUpdateStatus('Update check failed');
      toast.error('Update check failed');
    } finally {
      setIsChecking(false);
    }
  };

  // Install and restart
  const installUpdate = async () => {
    if (!ipcRenderer) return;
    try {
      await ipcRenderer.invoke('install-update'); // alias exposed in main.js
      // app will quit & install if no errors
    } catch (err) {
      console.error('installUpdate failed', err);
      toast.error('Failed to install update: ' + (err?.message || String(err)));
    }
  };

  const getStatusColor = () => {
    if (/error|failed/i.test(updateStatus)) return 'text-danger';
    if (/available/i.test(updateStatus)) return 'text-success';
    if (/downloading/i.test(updateStatus)) return 'text-primary';
    if (/downloaded/i.test(updateStatus)) return 'text-info';
    return 'text-muted';
  };

  // Improved Update Button
  const UpdateButton = () => (
    <button
      className={`btn btn-sm d-flex align-items-center ${updateAvailable ? 'btn-warning' : 'btn-outline-secondary'}`}
      onClick={() => {
        setShowUpdatePanel(true);
        // kick off a check when opening panel (small delay to let panel render)
        setTimeout(() => checkForUpdates(), 200);
      }}
      aria-label={updateAvailable ? 'Update available' : 'Check for updates'}
      title={updateAvailable ? 'Update available' : 'Check for updates'}
      style={{ gap: 8, padding: '6px 10px' }}
    >
      {updateAvailable ? (
        <>
          <i className="bi bi-arrow-down-circle-fill" style={{ fontSize: 14 }}></i>
          <span className="small fw-bold ms-1">Update</span>
          <span className="badge bg-danger ms-2">!</span>
        </>
      ) : (
        <>
          <i className="bi bi-arrow-clockwise" style={{ fontSize: 14 }}></i>
          <span className="small ms-1">Updates</span>
        </>
      )}
    </button>
  );

  if (!isElectron) return null;

  return (
    <>
      {/* Fixed-position badge/button */}
      <div className="position-fixed" style={{ top: 10, right: 12, zIndex: 9999 }}>
        <UpdateButton />
      </div>

      {/* Update Panel */}
      {showUpdatePanel && (
        <div
          className="position-fixed bg-white border shadow-lg rounded p-3"
          style={{ top: 56, right: 12, width: 360, zIndex: 10000, maxHeight: '75vh', overflowY: 'auto' }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
              <strong>App Updates</strong>
              <div className="small text-muted">v{currentVersion}</div>
            </div>
            <div>
              <button className="btn btn-sm btn-outline-secondary me-2" onClick={checkForUpdates} disabled={isChecking} title="Check now">
                {isChecking ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-search" />}
              </button>
              <button className="btn-close" onClick={() => setShowUpdatePanel(false)} />
            </div>
          </div>

          <div className="mb-2 small">
            <div className={getStatusColor()}>{updateStatus || 'Ready to check for updates'}</div>
          </div>

          {downloadProgress > 0 && (
            <div className="mb-3">
              <div className="small mb-1">Downloading: {downloadProgress}%</div>
              <div className="progress" style={{ height: 8 }}>
                <div className="progress-bar" role="progressbar" style={{ width: `${downloadProgress}%` }} aria-valuenow={downloadProgress} aria-valuemin="0" aria-valuemax="100" />
              </div>
            </div>
          )}

          <div className="d-grid gap-2">
            <button className="btn btn-sm btn-primary" onClick={checkForUpdates} disabled={isChecking}>
              {isChecking ? 'Checking...' : 'Check for updates'}
            </button>

            {updateAvailable && /downloaded/i.test(updateStatus) && (
              <button className="btn btn-sm btn-success" onClick={installUpdate}>
                Install & Restart
              </button>
            )}
          </div>

          <div className="mt-3 small text-muted border-top pt-2">
            • App checks for updates automatically on startup (packaged builds).<br/>
            • Downloads happen in background. Install when ready.
          </div>
        </div>
      )}

      {/* overlay to close panel when clicking outside */}
      {showUpdatePanel && (
        <div className="position-fixed w-100 h-100" style={{ top: 0, left: 0, zIndex: 9998 }} onClick={() => setShowUpdatePanel(false)} />
      )}
    </>
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
      <div className="App position-relative">
        {/* Auto Update Status Component */}
        <AutoUpdateStatus />

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
