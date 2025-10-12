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

    // Get current version
    (async () => {
      try {
        const res = await ipcRenderer.invoke('get-app-version');
        if (!mounted) return;
        if (res?.version) setCurrentVersion(res.version);
      } catch (err) {
        console.error('Failed to get app version:', err);
      }
    })();

    const onChecking = () => {
      setUpdateStatus('Checking for updates...');
      setIsChecking(true);
    };

    const onAvailable = (event, info) => {
      setUpdateInfo(info || null);
      setUpdateStatus(`Downloading v${info?.version || ''} in background...`);
      setUpdateAvailable(true);
      setShowUpdatePanel(true);
      setIsChecking(false);
      setDownloadProgress(1); // Start showing progress
      toast.info('New update available — downloading in background.', { autoClose: 4000 });
    };

    const onNotAvailable = () => {
      setUpdateStatus('No updates available');
      setUpdateAvailable(false);
      setIsChecking(false);
      toast.info('You are running the latest version.', { autoClose: 2500 });
    };

    const onProgress = (event, progress) => {
      const pct = Math.round(progress?.percent || 0);
      setDownloadProgress(pct);
      setUpdateStatus(`Downloading: ${pct}%`);
    };

    const onDownloaded = (event, info) => {
      setUpdateInfo(info || null);
      setDownloadProgress(100);
      setUpdateStatus('Update ready to install');
      setUpdateAvailable(true);
      setShowUpdatePanel(true);
      toast.success('Update downloaded — click Install & Restart.', { autoClose: false });
    };

    const onError = (event, err) => {
      const msg = err?.message || err?.toString() || 'Update error';
      setUpdateStatus(`Error: ${msg}`);
      setIsChecking(false);
      
      if (msg.includes('404') || msg.includes('Not Found')) {
        toast.error('Update not available on server.', { autoClose: 5000 });
      } else if (msg.includes('ENOTFOUND') || msg.includes('network')) {
        toast.error('Network error. Check your connection.', { autoClose: 5000 });
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

    return () => {
      mounted = false;
      try {
        ipcRenderer.removeListener('update-checking', onChecking);
        ipcRenderer.removeListener('update-available', onAvailable);
        ipcRenderer.removeListener('update-not-available', onNotAvailable);
        ipcRenderer.removeListener('update-download-progress', onProgress);
        ipcRenderer.removeListener('update-downloaded', onDownloaded);
        ipcRenderer.removeListener('update-error', onError);
      } catch (e) {
        // ignore
      }
    };
  }, []);

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
      const res = await ipcRenderer.invoke('check-for-updates');
      setLastCheckTime(Date.now());
      
      if (!res?.success) {
        setIsChecking(false);
        const errorMsg = res?.error || res?.message || 'Update check failed';
        setUpdateStatus(`Error: ${errorMsg}`);
        toast.error(errorMsg, { autoClose: 5000 });
      }
      // Success - rely on main events to update UI
    } catch (err) {
      setIsChecking(false);
      const msg = err?.message || 'Update check failed';
      setUpdateStatus(`Error: ${msg}`);
      toast.error(msg, { autoClose: 5000 });
    }
  };

  const installUpdate = async () => {
    if (!ipcRenderer) {
      toast.error('Not running in Electron environment');
      return;
    }
    
    toast.info('Installing update and restarting...', { autoClose: 2000 });
    
    try {
      const res = await ipcRenderer.invoke('quit-and-install');
      
      if (!res?.success) {
        const msg = res?.error || res?.message || 'Install failed';
        toast.error(`Failed to install: ${msg}`, { autoClose: 5000 });
      }
    } catch (err) {
      const msg = err?.message || 'Install failed';
      toast.error(`Install error: ${msg}`, { autoClose: 5000 });
    }
  };

  const getStatusColor = () => {
    if (/error|failed/i.test(updateStatus)) return 'text-danger';
    if (/available/i.test(updateStatus)) return 'text-success';
    if (/downloading/i.test(updateStatus)) return 'text-primary';
    if (/ready/i.test(updateStatus)) return 'text-info';
    return 'text-muted';
  };

  const UpdateButton = () => (
    <button
      className={`btn btn-sm d-flex align-items-center ${updateAvailable ? 'btn-warning' : 'btn-outline-secondary'}`}
      onClick={() => {
        setShowUpdatePanel(true);
        if (!updateAvailable) setTimeout(() => checkForUpdates(), 150);
      }}
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
          style={{ top: 56, right: 12, width: 340, zIndex: 10000 }}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <strong>App Updates</strong>
              <div className="small text-muted">v{currentVersion}</div>
            </div>
            <button className="btn-close" onClick={() => setShowUpdatePanel(false)} />
          </div>

          <div className="mb-3">
            <div className={`${getStatusColor()} small fw-semibold`}>
              {updateStatus || 'Ready to check for updates'}
            </div>
          </div>

          {updateInfo && updateAvailable && (
            <div className="mb-3 p-2 bg-light rounded">
              <div className="fw-bold">New Version: v{updateInfo.version}</div>
              {updateInfo.releaseDate && (
                <div className="text-muted small">
                  {new Date(updateInfo.releaseDate).toLocaleDateString()}
                </div>
              )}
            </div>
          )}

          {downloadProgress > 0 && downloadProgress < 100 && (
            <div className="mb-3">
              <div className="small mb-1">Downloading: {downloadProgress}%</div>
              <div className="progress" style={{ height: 6 }}>
                <div 
                  className="progress-bar progress-bar-striped progress-bar-animated" 
                  style={{ width: `${downloadProgress}%` }} 
                />
              </div>
            </div>
          )}

          <div className="d-grid gap-2">
            <button 
              className="btn btn-primary" 
              onClick={checkForUpdates} 
              disabled={isChecking}
            >
              {isChecking ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Checking...
                </>
              ) : (
                <>
                  <i className="bi bi-arrow-clockwise me-2"></i>
                  Check for Updates
                </>
              )}
            </button>

            {updateAvailable && /ready/i.test(updateStatus) && (
              <button className="btn btn-success" onClick={installUpdate}>
                <i className="bi bi-download me-2"></i>
                Install & Restart
              </button>
            )}
          </div>
        </div>
      )}

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