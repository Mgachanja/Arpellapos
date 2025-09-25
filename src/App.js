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

// === FIXED Auto Update Status Component ===
function AutoUpdateStatus() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [appInfo, setAppInfo] = useState({ version: '', name: '', updateDownloaded: false });
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    if (!ipcRenderer) return;

    // Load initial app info
    loadAppInfo();

    // Set up event listeners with CORRECT event names from main.js
    const onUpdateMessage = (event, message) => {
      setUpdateStatus(message || '');
      console.log('Update message:', message);
    };

    const onUpdateAvailable = (event, info) => {
      console.log('Update available:', info);
      setUpdateInfo(info);
      setUpdateAvailable(true);
      setIsChecking(false);
      setUpdateStatus(`Update v${info?.version} available`);
      setShowUpdatePanel(true);
      toast.info(`Update v${info?.version} is available and downloading...`, { 
        position: 'top-right', 
        autoClose: 4000 
      });
    };

    const onUpdateDownloaded = (event, info) => {
      console.log('Update downloaded:', info);
      setUpdateInfo(info);
      setDownloadProgress(100);
      setUpdateStatus('Update downloaded - ready to install');
      setUpdateAvailable(true);
      // Reload app info to get updated status
      loadAppInfo();
      toast.success('Update downloaded! Click "Install & Restart" to apply.', { 
        autoClose: false,
        closeOnClick: false
      });
    };

    const onDownloadProgress = (event, progress) => {
      console.log('Download progress:', progress);
      const pct = Math.round(progress?.percent || 0);
      setDownloadProgress(pct);
      setUpdateStatus(`Downloading update: ${pct}% (${progress?.transferredMB}MB / ${progress?.totalMB}MB)`);
    };

    const onUpdateError = (event, error) => {
      console.error('Update error:', error);
      setIsChecking(false);
      setUpdateStatus(`Update error: ${error?.message || 'Unknown error'}`);
      toast.error(`Update error: ${error?.message || 'Unknown error'}`, { autoClose: 5000 });
    };

    // Register listeners with EXACT event names from main.js
    ipcRenderer.on('update-message', onUpdateMessage);
    ipcRenderer.on('update-available', onUpdateAvailable);
    ipcRenderer.on('update-downloaded', onUpdateDownloaded);
    ipcRenderer.on('download-progress', onDownloadProgress);
    ipcRenderer.on('update-error', onUpdateError);

    return () => {
      // Clean up listeners
      ipcRenderer.removeListener('update-message', onUpdateMessage);
      ipcRenderer.removeListener('update-available', onUpdateAvailable);
      ipcRenderer.removeListener('update-downloaded', onUpdateDownloaded);
      ipcRenderer.removeListener('download-progress', onDownloadProgress);
      ipcRenderer.removeListener('update-error', onUpdateError);
    };
  }, []);

  // Load app information
  const loadAppInfo = async () => {
    if (!ipcRenderer) return;
    
    try {
      const info = await ipcRenderer.invoke('get-app-version');
      console.log('App info loaded:', info);
      
      // Handle the object properly - don't render it directly
      if (info && typeof info === 'object') {
        setAppInfo({
          version: info.version || 'Unknown',
          name: info.name || 'App',
          updateDownloaded: info.updateDownloaded || false
        });
        
        // If update is already downloaded, show it
        if (info.updateDownloaded) {
          setUpdateAvailable(true);
          setUpdateStatus('Update ready to install');
          setDownloadProgress(100);
        }
      }
    } catch (err) {
      console.warn('Failed to load app info:', err);
      setUpdateStatus('Failed to load app information');
    }
  };

  // Manual check for updates
  const checkForUpdates = async () => {
    if (!ipcRenderer || isChecking) return;
    
    try {
      setIsChecking(true);
      setUpdateStatus('Checking for updates...');
      
      const result = await ipcRenderer.invoke('check-for-updates');
      console.log('Update check result:', result);
      
      if (result && !result.success) {
        const errorMsg = result.error || 'Update check failed';
        setUpdateStatus(errorMsg);
        toast.error(errorMsg, { autoClose: 5000 });
        setIsChecking(false);
      }
      // Don't set isChecking to false here if successful - let the event handlers do it
    } catch (err) {
      console.error('Update check failed:', err);
      setIsChecking(false);
      setUpdateStatus('Update check failed');
      toast.error('Update check failed: ' + (err?.message || String(err)));
    }
  };

  // Install and restart
  const installUpdate = async () => {
    if (!ipcRenderer) return;
    
    try {
      const result = await ipcRenderer.invoke('quit-and-install');
      console.log('Install result:', result);
      
      if (result && !result.success) {
        const errorMsg = result.error || 'Failed to install update';
        toast.error(errorMsg);
        setUpdateStatus(errorMsg);
      }
      // If successful, app will quit and restart automatically
    } catch (err) {
      console.error('Install failed:', err);
      toast.error('Failed to install update: ' + (err?.message || String(err)));
    }
  };

  const getStatusColor = () => {
    if (/error|failed/i.test(updateStatus)) return 'text-danger';
    if (/available/i.test(updateStatus)) return 'text-success';
    if (/downloading/i.test(updateStatus)) return 'text-primary';
    if (/downloaded|ready/i.test(updateStatus)) return 'text-info';
    return 'text-muted';
  };

  // Update Button Component
  const UpdateButton = () => {
    const hasUpdate = updateAvailable || appInfo.updateDownloaded;
    
    return (
      <button
        className={`btn btn-sm d-flex align-items-center ${hasUpdate ? 'btn-warning' : 'btn-outline-secondary'}`}
        onClick={() => {
          setShowUpdatePanel(true);
          // Trigger a check when opening panel
          if (!hasUpdate) {
            setTimeout(() => checkForUpdates(), 200);
          }
        }}
        aria-label={hasUpdate ? 'Update available' : 'Check for updates'}
        title={hasUpdate ? 'Update available' : 'Check for updates'}
        style={{ gap: 8, padding: '6px 10px' }}
      >
        {hasUpdate ? (
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
  };

  if (!isElectron) return null;

  return (
    <>
      {/* Fixed-position update button */}
      <div className="position-fixed" style={{ top: 10, right: 12, zIndex: 9999 }}>
        <UpdateButton />
      </div>

      {/* Update Panel */}
      {showUpdatePanel && (
        <div
          className="position-fixed bg-white border shadow-lg rounded p-3"
          style={{ top: 56, right: 12, width: 380, zIndex: 10000, maxHeight: '75vh', overflowY: 'auto' }}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <strong>App Updates</strong>
              <div className="small text-muted">
                Current: v{appInfo.version}
                {appInfo.updateDownloaded && <span className="text-success ms-2">(Update Ready)</span>}
              </div>
            </div>
            <div>
              <button 
                className="btn btn-sm btn-outline-secondary me-2" 
                onClick={checkForUpdates} 
                disabled={isChecking}
                title="Check now"
              >
                {isChecking ? (
                  <span className="spinner-border spinner-border-sm" />
                ) : (
                  <i className="bi bi-search" />
                )}
              </button>
              <button className="btn-close" onClick={() => setShowUpdatePanel(false)} />
            </div>
          </div>

          {/* Status message */}
          <div className="mb-3">
            <div className={`small ${getStatusColor()}`}>
              {updateStatus || 'Ready to check for updates'}
            </div>
          </div>

          {/* Download progress */}
          {downloadProgress > 0 && downloadProgress < 100 && (
            <div className="mb-3">
              <div className="small mb-1">Downloading: {downloadProgress}%</div>
              <div className="progress" style={{ height: 8 }}>
                <div 
                  className="progress-bar progress-bar-striped progress-bar-animated" 
                  role="progressbar" 
                  style={{ width: `${downloadProgress}%` }} 
                  aria-valuenow={downloadProgress} 
                  aria-valuemin="0" 
                  aria-valuemax="100" 
                />
              </div>
            </div>
          )}

          {/* Update info */}
          {updateInfo && (
            <div className="mb-3 p-2 bg-light rounded small">
              <div><strong>Version:</strong> {updateInfo.version}</div>
              {updateInfo.releaseName && (
                <div><strong>Release:</strong> {updateInfo.releaseName}</div>
              )}
              {updateInfo.releaseDate && (
                <div><strong>Date:</strong> {new Date(updateInfo.releaseDate).toLocaleDateString()}</div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="d-grid gap-2">
            <button 
              className="btn btn-sm btn-primary" 
              onClick={checkForUpdates} 
              disabled={isChecking}
            >
              {isChecking ? 'Checking...' : 'Check for Updates'}
            </button>

            {(updateAvailable || appInfo.updateDownloaded) && downloadProgress === 100 && (
              <button className="btn btn-sm btn-success" onClick={installUpdate}>
                <i className="bi bi-arrow-clockwise me-1"></i>
                Install & Restart
              </button>
            )}
          </div>

          {/* Help text */}
          <div className="mt-3 small text-muted border-top pt-2">
            <i className="bi bi-info-circle me-1"></i>
            Updates are checked automatically on startup. Downloads happen in the background.
          </div>
        </div>
      )}

      {/* Overlay to close panel when clicking outside */}
      {showUpdatePanel && (
        <div 
          className="position-fixed w-100 h-100" 
          style={{ top: 0, left: 0, zIndex: 9998 }} 
          onClick={() => setShowUpdatePanel(false)} 
        />
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
          {/* Root redirect */}
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
            <Route path="*" element={<POS />} />
          </Route>

          {/* Top-level redirects */}
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

// App entry point
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