// src/App.js
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'react-toastify';

import Dashboard from './app/dashboard/index';
import POS from './app/dashboard/POS';
import LoginPage from './app/login';
import ThermalPrinterSettings from './app/thermalPrinter/index.jsx';

import { selectUser } from './redux/slices/userSlice';

// Detect Electron and get ipcRenderer safely
const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="text-center">
        <h2 className="text-danger mb-3">Something went wrong</h2>
        <p className="text-muted mb-4">{error?.message || 'An unexpected error occurred'}</p>
        <div>
          <button className="btn btn-primary me-2" onClick={resetErrorBoundary}>
            Try again
          </button>
          <button className="btn btn-outline-secondary" onClick={() => window.location.reload()}>
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

function AutoUpdateStatus() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState('');
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [lastCheckTime, setLastCheckTime] = useState(null);

  useEffect(() => {
    if (!ipcRenderer) return;

    let mounted = true;

    (async () => {
      try {
        const res = await safeInvoke('get-app-version');
        if (!mounted) return;
        if (res && res.success && res.version) setCurrentVersion(res.version);
        else if (typeof res === 'string') setCurrentVersion(res);
      } catch (err) {
        // ignore - optional
      }
    })();

    const onChecking = () => {
      setUpdateStatus('Checking for updates...');
      setIsChecking(true);
    };

    const onAvailable = (event, info) => {
      setUpdateInfo(info || null);
      setUpdateStatus(`Update available: v${(info && info.version) || ''}`);
      setUpdateAvailable(true);
      setShowUpdatePanel(true);
      setIsChecking(false);
      toast.info('New update available — downloading in background.', { position: 'top-right', autoClose: 4000 });
    };

    const onNotAvailable = () => {
      setUpdateStatus('No updates available');
      setUpdateAvailable(false);
      setIsChecking(false);
      toast.info('You are running the latest version.', { position: 'top-right', autoClose: 2500 });
    };

    const onProgress = (event, progress) => {
      const pct = Math.round(progress?.percent || 0);
      setDownloadProgress(pct);
      setUpdateStatus(`Downloading update: ${pct}%`);
    };

    const onDownloaded = (event, info) => {
      setUpdateInfo(info || null);
      setDownloadProgress(100);
      setUpdateStatus('Update downloaded — ready to install');
      setUpdateAvailable(true);
      setShowUpdatePanel(true);
      toast.success('Update downloaded — click Install & Restart to apply.', { autoClose: false });
    };

    const onError = (event, err) => {
      const msg = (err && (err.message || err.toString())) || 'Update error';
      setUpdateStatus(`Update error: ${msg}`);
      setIsChecking(false);
      
      // Show more user-friendly error messages
      if (msg.includes('404') || msg.includes('Not Found')) {
        toast.error('Update not available on server. Please check back later.', { autoClose: 5000 });
      } else if (msg.includes('ENOTFOUND') || msg.includes('network')) {
        toast.error('Network error. Check your internet connection.', { autoClose: 5000 });
      } else {
        toast.error(`Update error: ${msg}`, { autoClose: 5000 });
      }
    };

    // Register listeners
    ipcRenderer.on('update-checking', onChecking);
    ipcRenderer.on('update-available', onAvailable);
    ipcRenderer.on('update-not-available', onNotAvailable);
    ipcRenderer.on('update-download-progress', onProgress);
    ipcRenderer.on('update-downloaded', onDownloaded);
    ipcRenderer.on('update-error', onError);

    // Backwards/extra channels
    const onUpdateMessage = (e, text) => {
      setUpdateStatus(text || '');
      if (typeof text === 'string' && text.toLowerCase().includes('update available')) setUpdateAvailable(true);
    };
    const onDownloadProgress = (e, progress) => {
      const pct = Math.round(progress?.percent || 0);
      setDownloadProgress(pct);
    };

    ipcRenderer.on('update-message', onUpdateMessage);
    ipcRenderer.on('download-progress', onDownloadProgress);

    return () => {
      mounted = false;
      try {
        ipcRenderer.removeListener('update-checking', onChecking);
        ipcRenderer.removeListener('update-available', onAvailable);
        ipcRenderer.removeListener('update-not-available', onNotAvailable);
        ipcRenderer.removeListener('update-download-progress', onProgress);
        ipcRenderer.removeListener('update-downloaded', onDownloaded);
        ipcRenderer.removeListener('update-error', onError);
        ipcRenderer.removeListener('update-message', onUpdateMessage);
        ipcRenderer.removeListener('download-progress', onDownloadProgress);
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, []);

  // Utility: safe ipc invoke wrapper that normalizes result to { success, ... }
  async function safeInvoke(channel, ...args) {
    if (!ipcRenderer) return { success: false, message: 'Not running in Electron' };
    try {
      const res = await ipcRenderer.invoke(channel, ...args);
      // Normalize many possible shapes:
      if (res == null) return { success: true, data: null };
      if (typeof res === 'object') {
        // if it already has success boolean, return as-is
        if ('success' in res) return res;
        // if it looks like version string or info, wrap it
        return { success: true, ...res };
      }
      // primitive
      return { success: true, data: res, version: String(res) };
    } catch (err) {
      const message = (err && (err.message || String(err))) || 'IPC invoke failed';
      return { success: false, message };
    }
  }

  const checkForUpdates = async () => {
    if (!ipcRenderer) {
      toast.error('Not running in Electron environment');
      return;
    }
    
    // Prevent rapid checking
    if (lastCheckTime && Date.now() - lastCheckTime < 5000) {
      toast.warn('Please wait before checking again', { autoClose: 2000 });
      return;
    }

    setIsChecking(true);
    setUpdateStatus('Checking for updates...');
    
    try {
      const res = await safeInvoke('check-for-updates');
      setLastCheckTime(Date.now());
      
      if (!res) {
        setIsChecking(false);
        setUpdateStatus('Update check failed - no response from main');
        toast.error('Update check failed');
        return;
      }
      
      if (!res.success) {
        setIsChecking(false);
        const errorMsg = res.message || res.error || 'Update check failed';
        setUpdateStatus(`Error: ${errorMsg}`);
        
        if (errorMsg.includes('404')) {
          toast.error('Update URL not found. Please verify your release is published on GitHub.', { autoClose: 5000 });
        } else if (errorMsg.includes('network') || errorMsg.includes('ENOTFOUND')) {
          toast.error('Network error. Check your internet connection.', { autoClose: 5000 });
        } else {
          toast.error(errorMsg, { autoClose: 5000 });
        }
        return;
      }
      
      // Success - rely on main events to update UI
    } catch (err) {
      setIsChecking(false);
      const msg = err?.message || 'Update check failed';
      setUpdateStatus(`Error: ${msg}`);
      toast.error(`Update check error: ${msg}`, { autoClose: 5000 });
    }
  };

  const installUpdate = async () => {
    if (!ipcRenderer) {
      toast.error('Not running in Electron environment');
      return;
    }
    
    toast.info('Installing update and restarting...', { autoClose: 2000 });
    
    try {
      const res = await safeInvoke('quit-and-install');
      
      if (!res || res.success === false) {
        const msg = (res && (res.message || res.error)) || 'Install failed';
        toast.error(`Failed to start install: ${msg}`, { autoClose: 5000 });
        return;
      }
      
      // App should restart automatically
      setTimeout(() => {
        toast.warn('Waiting for app to restart...', { autoClose: 3000 });
      }, 1500);
    } catch (err) {
      const msg = err?.message || 'Install failed';
      toast.error(`Install error: ${msg}`, { autoClose: 5000 });
    }
  };

  const getStatusColor = () => {
    if (/error|failed/i.test(updateStatus)) return 'text-danger';
    if (/available/i.test(updateStatus)) return 'text-success';
    if (/downloading/i.test(updateStatus)) return 'text-primary';
    if (/downloaded/i.test(updateStatus)) return 'text-info';
    return 'text-muted';
  };

  const UpdateButton = () => (
    <button
      className={`btn btn-sm d-flex align-items-center ${updateAvailable ? 'btn-warning' : 'btn-outline-secondary'}`}
      onClick={() => {
        setShowUpdatePanel(true);
        setTimeout(() => checkForUpdates(), 150);
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
      <div className="position-fixed" style={{ top: 10, right: 12, zIndex: 9999 }}>
        <UpdateButton />
      </div>

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

          {updateInfo && updateAvailable && (
            <div className="mb-2 p-2 bg-light rounded small">
              <strong>New Version:</strong> v{updateInfo.version}
              {updateInfo.releaseDate && <div className="text-muted">Released: {new Date(updateInfo.releaseDate).toLocaleDateString()}</div>}
              {updateInfo.releaseNotes && (
                <div className="mt-2">
                  <strong>Release Notes:</strong>
                  <p className="text-muted small mt-1" style={{ maxHeight: '100px', overflowY: 'auto' }}>
                    {updateInfo.releaseNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {downloadProgress > 0 && downloadProgress < 100 && (
            <div className="mb-3">
              <div className="small mb-1">Downloading: {downloadProgress}%</div>
              <div className="progress" style={{ height: 8 }}>
                <div className="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style={{ width: `${downloadProgress}%` }} aria-valuenow={downloadProgress} aria-valuemin="0" aria-valuemax="100" />
              </div>
            </div>
          )}

          <div className="d-grid gap-2">
            <button className="btn btn-sm btn-primary" onClick={checkForUpdates} disabled={isChecking}>
              {isChecking ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Checking...
                </>
              ) : (
                'Check for updates'
              )}
            </button>

            {updateAvailable && /downloaded/i.test(updateStatus) && (
              <button className="btn btn-sm btn-success" onClick={installUpdate}>
                <i className="bi bi-download me-2"></i>
                Install & Restart
              </button>
            )}
          </div>

          <div className="mt-3 small text-muted border-top pt-2">
            <strong>Setup Instructions:</strong>
            <ul className="mb-0 mt-2">
              <li>1. Ensure your GitHub release is published (not a draft)</li>
              <li>2. The release tag must match your app version (e.g., v0.1.47)</li>
              <li>3. Upload the .exe file to the GitHub release</li>
              <li>4. Verify the download URL exists and is accessible</li>
            </ul>
          </div>

          <div className="mt-3 small text-muted border-top pt-2">
            <strong>How it works:</strong>
            <ul className="mb-0 mt-2">
              <li>• App checks for updates automatically on startup (packaged builds)</li>
              <li>• Downloads happen in background</li>
              <li>• Click "Install & Restart" when ready</li>
              <li>• App restarts automatically during installation</li>
            </ul>
          </div>
        </div>
      )}

      {showUpdatePanel && <div className="position-fixed w-100 h-100" style={{ top: 0, left: 0, zIndex: 9998 }} onClick={() => setShowUpdatePanel(false)} />}
    </>
  );
}

function isAuthorized(user) {
  return user && String(user.role || '').toLowerCase() !== 'customer';
}

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
        <AutoUpdateStatus />

        <Routes>
          <Route
            index
            element={authed ? <Navigate to="/app/dashboard/pos" replace /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/"
            element={authed ? <Navigate to="/app/dashboard/pos" replace /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/login"
            element={authed ? <Navigate to="/app/dashboard/pos" replace /> : <LoginPage />}
          />
          <Route
            path="/app/dashboard"
            element={authed ? <Dashboard /> : <Navigate to="/login" replace state={{ from: location }} />}
          >
            <Route index element={<POS />} />
            <Route path="pos" element={<POS />} />
            <Route path="thermal-settings" element={<ThermalPrinterSettings />} />
            <Route path="*" element={<POS />} />
          </Route>

          <Route path="/thermal-settings" element={<Navigate to="/app/dashboard/thermal-settings" replace />} />

          <Route path="*" element={<Navigate to={authed ? "/app/dashboard/pos" : "/login"} replace />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

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