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

// Check if running in Electron
const isElectron = window.require && window.require('electron');
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

// Auto Update Status Component
function AutoUpdateStatus() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState('');
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) return;

    // Get current version
    const getCurrentVersion = async () => {
      try {
        const version = await ipcRenderer.invoke('get-app-version');
        setCurrentVersion(version);
      } catch (error) {
        console.error('Failed to get app version:', error);
      }
    };

    getCurrentVersion();

    // Listen for update messages
    const handleUpdateMessage = (event, text) => {
      console.log('Update message:', text);
      setUpdateStatus(text);
      
      if (text.includes('Update available')) {
        setUpdateAvailable(true);
        setShowUpdatePanel(true);
        toast.info('New update available! Downloading in background...', {
          position: "top-right",
          autoClose: 5000,
        });
      } else if (text.includes('Update not available')) {
        setUpdateAvailable(false);
        if (isChecking) {
          toast.info('You are running the latest version.', {
            position: "top-right",
            autoClose: 3000,
          });
        }
      } else if (text.includes('downloaded')) {
        toast.success('Update downloaded! Click to install and restart.', {
          position: "top-right",
          autoClose: false,
          onClick: () => installUpdate()
        });
      }
    };

    const handleDownloadProgress = (event, progress) => {
      console.log('Download progress:', progress);
      setDownloadProgress(progress.percent);
    };

    // Register listeners
    ipcRenderer.on('update-message', handleUpdateMessage);
    ipcRenderer.on('download-progress', handleDownloadProgress);

    // Cleanup listeners
    return () => {
      ipcRenderer.removeListener('update-message', handleUpdateMessage);
      ipcRenderer.removeListener('download-progress', handleDownloadProgress);
    };
  }, [isChecking]);

  const checkForUpdates = async () => {
    if (!ipcRenderer) return;
    
    setIsChecking(true);
    setUpdateStatus('Checking for updates...');
    
    try {
      const result = await ipcRenderer.invoke('check-for-updates');
      if (result.success) {
        console.log('Update check result:', result);
      } else {
        setUpdateStatus('Failed to check for updates: ' + result.error);
        toast.error('Failed to check for updates: ' + result.error);
      }
    } catch (error) {
      console.error('Update check failed:', error);
      setUpdateStatus('Update check failed');
      toast.error('Update check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    if (!ipcRenderer) return;
    
    try {
      await ipcRenderer.invoke('quit-and-install');
    } catch (error) {
      console.error('Failed to install update:', error);
      toast.error('Failed to install update');
    }
  };

  const getStatusColor = () => {
    if (updateStatus.includes('Error') || updateStatus.includes('failed')) {
      return 'text-danger';
    } else if (updateStatus.includes('available')) {
      return 'text-success';
    } else if (updateStatus.includes('Downloading')) {
      return 'text-primary';
    } else if (updateStatus.includes('downloaded')) {
      return 'text-info';
    }
    return 'text-muted';
  };

  if (!isElectron) return null;

  return (
    <>
      {/* Update Notification Badge */}
      <div className="position-fixed" style={{ top: '10px', right: '10px', zIndex: 1050 }}>
        <button
          className={`btn btn-sm ${updateAvailable ? 'btn-warning' : 'btn-outline-secondary'} position-relative`}
          onClick={() => setShowUpdatePanel(!showUpdatePanel)}
          title="App Updates"
        >
          <i className="bi bi-arrow-clockwise"></i>
          {updateAvailable && (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
              !
            </span>
          )}
        </button>
      </div>

      {/* Update Panel */}
      {showUpdatePanel && (
        <div 
          className="position-fixed bg-white border shadow-lg rounded p-3"
          style={{ 
            top: '50px', 
            right: '10px', 
            width: '320px', 
            zIndex: 1040,
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="mb-0">
              <i className="bi bi-arrow-clockwise me-2"></i>
              App Updates
            </h6>
            <button
              className="btn-close"
              onClick={() => setShowUpdatePanel(false)}
              aria-label="Close"
            ></button>
          </div>

          <div className="mb-2">
            <small className="text-muted">Current Version: v{currentVersion}</small>
          </div>

          {/* Status Display */}
          <div className="alert alert-light border p-2 mb-3">
            <div className="small fw-medium text-dark mb-1">Status:</div>
            <div className={`small ${getStatusColor()}`}>
              {updateStatus || 'Ready to check for updates'}
            </div>
          </div>

          {/* Download Progress */}
          {downloadProgress > 0 && downloadProgress < 100 && (
            <div className="mb-3">
              <div className="small fw-medium text-dark mb-1">
                Downloading: {downloadProgress}%
              </div>
              <div className="progress" style={{ height: '6px' }}>
                <div
                  className="progress-bar bg-primary"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="d-grid gap-2">
            <button
              onClick={checkForUpdates}
              disabled={isChecking}
              className={`btn btn-sm ${isChecking ? 'btn-secondary' : 'btn-primary'}`}
            >
              {isChecking ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                  Checking...
                </>
              ) : (
                <>
                  <i className="bi bi-search me-1"></i>
                  Check for Updates
                </>
              )}
            </button>

            {updateAvailable && updateStatus.includes('downloaded') && (
              <button
                onClick={installUpdate}
                className="btn btn-sm btn-success"
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                Install & Restart
              </button>
            )}
          </div>

          {/* Update Available Notice */}
          {updateAvailable && !updateStatus.includes('downloaded') && (
            <div className="alert alert-success border-success p-2 mt-2 mb-2">
              <div className="small">
                <strong>Update Available!</strong><br />
                Downloading in background...
              </div>
            </div>
          )}

          {/* Info */}
          <div className="border-top pt-2 mt-2">
            <div className="small text-muted">
              <div>• Updates checked automatically at startup</div>
              <div>• Downloads happen in background</div>
              <div>• You'll be notified when ready</div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showUpdatePanel && (
        <div
          className="position-fixed w-100 h-100"
          style={{ top: 0, left: 0, zIndex: 1030 }}
          onClick={() => setShowUpdatePanel(false)}
        ></div>
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