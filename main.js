// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Try to load electron-pos-printer
let PosPrinter = null;
try {
  const electronPosPrinter = require('electron-pos-printer');
  PosPrinter = electronPosPrinter.PosPrinter;
  log.info('electron-pos-printer loaded successfully');
} catch (err) {
  log.warn('electron-pos-printer not available:', err && err.message ? err.message : err);
}

const APP_ID = 'com.arpella.pos';
if (process.platform === 'win32') {
  try { app.setAppUserModelId(APP_ID); } catch (e) { console.warn('setAppUserModelId failed', e); }
}

const electron = require('electron');
const windowApi = electron.BrowserWindow;

let mainWindow = null;
let updateDownloaded = false;
let thermalHandlerInstance = null;
let ThermalHandlerClass = null;
try {
  ThermalHandlerClass = require(path.join(__dirname, 'main-thermal-handler'));
} catch (err) {
  // optional, fine if not present
  log.info('No custom thermal handler provided:', err && err.message ? err.message : '');
}

// Cache for logo base64
let _logoCache = { dataUri: null, mtimeMs: 0, path: null };

// Printer cache / simple TTL (avoid frequent expensive calls)
let _printerCache = { data: null, ts: 0, ttl: 5000, inFlight: null };

// Utility: safe string from whatever error/object
function safeString(x, fallback = '') {
  if (!x) return fallback;
  if (typeof x === 'string') return x;
  if (x instanceof Error) return x.message || String(x);
  try { return JSON.stringify(x); } catch { return String(x); }
}

// Normalize handler return shape
function ok(data = null, message = '') { return { success: true, message: message || '', data }; }
function fail(message = '', data = null) { return { success: false, message: safeString(message), data }; }

// ----------------- Logo loader (async, mtime-aware) -----------------
async function resolveLogoPathCandidates() {
  const candidates = [
    path.join(__dirname, 'assets', 'receipt-logo.png'),
    path.join(__dirname, 'src', 'assets', 'receipt-logo.png'),
    path.join(__dirname, 'public', 'assets', 'receipt-logo.png'),
    path.join(__dirname, 'build', 'assets', 'receipt-logo.png'),
  ];
  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar', 'assets', 'receipt-logo.png'),
      path.join(process.resourcesPath, 'assets', 'receipt-logo.png'),
      path.join(process.resourcesPath, 'build', 'assets', 'receipt-logo.png')
    );
  }
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (e) { /* continue */ }
  }
  return null;
}

async function getLogoBase64Async() {
  try {
    const logoPath = await resolveLogoPathCandidates();
    if (!logoPath) {
      _logoCache = { dataUri: null, mtimeMs: 0, path: null };
      return null;
    }

    const stats = await fs.promises.stat(logoPath).catch(() => null);
    const mtimeMs = stats ? stats.mtimeMs : 0;
    if (_logoCache.dataUri && _logoCache.path === logoPath && _logoCache.mtimeMs === mtimeMs) {
      return _logoCache.dataUri;
    }

    const imageBuffer = await fs.promises.readFile(logoPath);
    const mimeType = logoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    _logoCache = { dataUri, mtimeMs, path: logoPath };
    log.info('Logo loaded and cached:', logoPath);
    return dataUri;
  } catch (err) {
    log.warn('getLogoBase64Async failed:', err && err.message ? err.message : err);
    _logoCache = { dataUri: null, mtimeMs: 0, path: null };
    return null;
  }
}

// ----------------- Printers detection (cached) -----------------
async function getAllAvailablePrinters() {
  try {
    const now = Date.now();
    if (_printerCache.data && (now - _printerCache.ts) < _printerCache.ttl) return _printerCache.data;
    if (_printerCache.inFlight) return await _printerCache.inFlight;

    _printerCache.inFlight = (async () => {
      let printWindow = windowApi.getFocusedWindow() || windowApi.getAllWindows()[0];
      if (!printWindow) {
        _printerCache.data = [];
        _printerCache.ts = Date.now();
        _printerCache.inFlight = null;
        return [];
      }

      let electronPrinters = [];
      try {
        electronPrinters = await printWindow.webContents.getPrintersAsync();
      } catch (err) {
        log.warn('getPrintersAsync failed:', err && err.message ? err.message : err);
        electronPrinters = [];
      }

      const all = Array.isArray(electronPrinters) ? electronPrinters.slice() : [];
      // Windows fallback via PowerShell (best-effort, non-blocking)
      if (process.platform === 'win32' && (!electronPrinters || electronPrinters.length === 0)) {
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          const ps = 'powershell "Get-Printer | Select-Object Name, PrinterStatus, Type | ConvertTo-Json"';
          const { stdout } = await execAsync(ps, { timeout: 3000, maxBuffer: 10 * 1024 * 1024 });
          let parsed = [];
          try { parsed = JSON.parse(stdout); } catch (e) { parsed = []; }
          if (Array.isArray(parsed)) {
            parsed.forEach(p => {
              const name = p.Name || p.name;
              if (!all.find(x => x.name === name)) {
                all.push({ name, displayName: name, status: p.PrinterStatus || 'unknown', isDefault: false, options: {} });
              }
            });
          }
        } catch (err) {
          log.warn('PowerShell printers fallback failed (ignored):', err && err.message ? err.message : err);
        }
      }

      _printerCache.data = all;
      _printerCache.ts = Date.now();
      _printerCache.inFlight = null;
      return all;
    })();

    return await _printerCache.inFlight;
  } catch (err) {
    log.error('getAllAvailablePrinters failed:', err && err.message ? err.message : err);
    _printerCache.data = [];
    _printerCache.ts = Date.now();
    _printerCache.inFlight = null;
    return [];
  }
}

// ----------------- Auto updater wiring -----------------
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    log.info('autoUpdater: checking-for-update');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', 'Checking for updates...');
  });

  autoUpdater.on('update-available', info => {
    log.info('autoUpdater: update-available', info && info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
      mainWindow.webContents.send('update-message', `Update available: v${info.version}`);
    }
  });

  autoUpdater.on('update-not-available', info => {
    log.info('autoUpdater: update-not-available');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', 'No updates available');
  });

  autoUpdater.on('download-progress', progressObj => {
    log.info('autoUpdater: download-progress', progressObj && progressObj.percent);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', {
      percent: Math.round(progressObj.percent || 0),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  autoUpdater.on('update-downloaded', async info => {
    log.info('autoUpdater: update-downloaded', info && info.version);
    updateDownloaded = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
      mainWindow.webContents.send('update-message', `Update downloaded: v${info.version}`);
    }

    // Ask user if they want to install now (optional)
    try {
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Install & Restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Ready',
        message: `Update v${info.version} has been downloaded.`,
        detail: 'Install now and restart the app?'
      });
      if (choice.response === 0) {
        setTimeout(() => {
          try { autoUpdater.quitAndInstall(); } catch (err) { log.error('quitAndInstall failed:', err); }
        }, 500);
      }
    } catch (err) {
      log.warn('Auto-updater dialog failed (ignored):', err && err.message ? err.message : err);
    }
  });

  autoUpdater.on('error', err => {
    log.error('autoUpdater error:', err && err.message ? err.message : err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { message: safeString(err.message || err), stack: err.stack || '' });
      mainWindow.webContents.send('update-message', `Update error: ${safeString(err.message || err)}`);
    }
  });

  // Trigger a background check at setup time (non-blocking)
  (async () => {
    try { await autoUpdater.checkForUpdatesAndNotify(); } catch (err) { log.warn('autoUpdater initial check failed (ignored):', err && err.message ? err.message : err); }
  })();
}

// ----------------- IPC Handlers (registered immediately) -----------------

ipcMain.handle('get-app-version', async () => {
  try {
    return ok({ version: app.getVersion(), name: app.getName(), updateDownloaded });
  } catch (err) {
    return fail(safeString(err));
  }
});

// Manual check for updates - returns immediately with check result or error
ipcMain.handle('check-for-updates', async () => {
  try {
    log.info('IPC: check-for-updates called');
    // Ensure auto-updater listeners are set up
    setupAutoUpdater();
    // Asking autoUpdater to check for updates (it will emit events)
    const result = await autoUpdater.checkForUpdates();
    return ok(null, 'Update check initiated');
  } catch (err) {
    log.error('IPC check-for-updates error:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

// Download update on demand
ipcMain.handle('download-update', async () => {
  try {
    log.info('IPC: download-update called');
    await autoUpdater.downloadUpdate();
    return ok(null, 'Download started');
  } catch (err) {
    log.error('IPC download-update failed:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

// Quit and install (only works if update downloaded)
ipcMain.handle('quit-and-install', async () => {
  try {
    if (!updateDownloaded) return fail('No update downloaded yet');
    log.info('IPC: quit-and-install called');
    // autoUpdater.quitAndInstall will quit and install; return success true preemptively
    setImmediate(() => {
      try { autoUpdater.quitAndInstall(); } catch (err) { log.error('quitAndInstall call failed:', err && err.message ? err.message : err); }
    });
    return ok(null, 'Installing update');
  } catch (err) {
    log.error('IPC quit-and-install error:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

// Provide update info
ipcMain.handle('get-update-info', async () => {
  try {
    return ok({ updateDownloaded, autoDownload: autoUpdater.autoDownload, currentVersion: app.getVersion() });
  } catch (err) {
    return fail(safeString(err));
  }
});

// Printers list
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await getAllAvailablePrinters();
    return ok(printers);
  } catch (err) {
    log.error('IPC get-printers error:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

ipcMain.handle('check-printer-status', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    if (!printerName) return ok({ available: (printers && printers.length > 0), count: printers.length, printers });
    const found = printers.find(p => p.name === printerName || p.displayName === printerName);
    return ok({ available: !!found, printer: found, printers });
  } catch (err) {
    log.error('IPC check-printer-status error:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

ipcMain.handle('get-printer-capabilities', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    const p = printers.find(x => x.name === printerName || x.displayName === printerName);
    if (!p) return fail('Printer not found');
    const caps = { name: p.name, status: p.status, isDefault: p.isDefault || false, options: p.options || {} };
    return ok(caps);
  } catch (err) {
    log.error('IPC get-printer-capabilities error:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

// Test thermal printer (best-effort)
ipcMain.handle('test-thermal-printer', async (event, printerName) => {
  if (!PosPrinter && !ThermalHandlerClass && !thermalHandlerInstance) {
    log.error('No PosPrinter and no custom thermal handler available');
    return fail('Thermal printing not available on this build');
  }
  try {
    const options = { preview: false, silent: true, margin: '10 10 10 10', timeOutPerLine: 400, pageSize: '80mm', copies: 1 };
    if (printerName) options.printerName = printerName;

    const printData = [
      { type: 'text', value: '====== PRINTER TEST ======', style: { textAlign: 'center', fontSize: 14 } },
      { type: 'text', value: `Test Time: ${new Date().toLocaleString()}`, style: { textAlign: 'center', fontSize: 11 } },
      { type: 'text', value: '------ END ------', style: { textAlign: 'center', fontSize: 11 } }
    ];

    if (thermalHandlerInstance && typeof thermalHandlerInstance.print === 'function') {
      await thermalHandlerInstance.print(printData, options);
    } else if (PosPrinter) {
      await PosPrinter.print(printData, options);
    } else {
      throw new Error('No print implementation available');
    }

    return ok(null, 'Test print successful');
  } catch (err) {
    log.error('IPC test-thermal-printer failed:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

// Helper to format currency
function formatCurrency(amount) { return `Ksh ${Number(amount || 0).toLocaleString('en-KE')}`; }

// print-receipt: accepts flexible cart items and storeSettings
ipcMain.handle('print-receipt', async (event, orderData = {}, printerName = '', storeSettings = {}) => {
  if (!PosPrinter && !ThermalHandlerClass && !thermalHandlerInstance) {
    log.error('print-receipt: no printing implementation available');
    return fail('Thermal printing not available');
  }

  try {
    const {
      cart = [],
      cartTotal = 0,
      paymentType = '',
      paymentData = {},
      user = {},
      orderNumber = '',
      customerPhone = ''
    } = orderData || {};

    // Try to get storeSettings from localStorage file if empty (best-effort)
    if (!storeSettings || Object.keys(storeSettings).length === 0) {
      try {
        const settingsPath = path.join(app.getPath('userData') || __dirname, 'thermalPrinterStoreSettings.json');
        if (fs.existsSync(settingsPath)) {
          const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          storeSettings = s || storeSettings;
        } else {
          // fallback to app-local storage or environment — ignore if missing
        }
      } catch (err) {
        log.warn('Failed to load store settings file (ignored):', err && err.message ? err.message : err);
      }
    }

    // Build print data
    const printData = [];

    const logo = await getLogoBase64Async();
    if (logo) {
      printData.push({ type: 'image', url: logo, position: 'center', width: '140px', height: '70px', style: { marginBottom: '6px' } });
    }

    printData.push(
      { type: 'text', value: storeSettings.storeName || 'ARPELLA STORE', style: { textAlign: 'center', fontSize: 16, fontWeight: 'bold' } },
      { type: 'text', value: storeSettings.storeAddress || 'Address', style: { textAlign: 'center', fontSize: 12 } },
      { type: 'text', value: `Tel: ${storeSettings.storePhone || '+254 7xx xxx xxx'}`, style: { textAlign: 'center', fontSize: 12 } },
      { type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: 12 } },
      { type: 'text', value: `Order #: ${orderNumber || 'N/A'}`, style: { fontSize: 12 } },
      { type: 'text', value: `Date: ${new Date().toLocaleString()}`, style: { fontSize: 12 } }
    );

    if (customerPhone) {
      printData.push({ type: 'text', value: `Customer: ${customerPhone}`, style: { fontSize: 12 } });
    }

    printData.push({ type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: 12 } });

    // Normalize each cart item - support both old/new shapes
    for (const rawItem of cart) {
      const item = rawItem || {};
      const name = item.productName || item.name || item.product || 'Item';
      const qty = Number(item.quantity || item.qty || 1);
      const price = Number(item.sellingPrice || item.salePrice || item.price || 0);
      const total = qty * price;
      // Truncate/pad name for alignment
      const truncated = (name.length > 18) ? name.slice(0, 15) + '...' : name;
      const padded = truncated.padEnd(18, ' ');
      const qtyStr = String(qty).padStart(3, ' ');
      const totalStr = formatCurrency(total).padStart(10, ' ');
      printData.push({ type: 'text', value: `${padded} ${qtyStr} ${totalStr}`, style: { fontSize: 12, fontFamily: 'monospace' } });
    }

    printData.push({ type: 'text', value: '--------------------------------', style: { textAlign: 'center', fontSize: 12 } });
    printData.push({ type: 'text', value: `TOTAL: ${formatCurrency(cartTotal)}`, style: { textAlign: 'right', fontSize: 14, fontWeight: 'bold' } });

    // Payment info
    const cashAmt = Number(paymentData.cashAmount || 0);
    if (String(paymentType || '').toLowerCase() === 'cash') {
      printData.push({ type: 'text', value: `Cash: ${formatCurrency(cashAmt)}`, style: { textAlign: 'right', fontSize: 12 } });
      const change = Math.max(0, cashAmt - Number(cartTotal || 0));
      if (change > 0) printData.push({ type: 'text', value: `Change: ${formatCurrency(change)}`, style: { textAlign: 'right', fontSize: 12 } });
    } else {
      printData.push({ type: 'text', value: `Payment: ${String(paymentType || '').toUpperCase()}`, style: { textAlign: 'right', fontSize: 12 } });
    }

    printData.push({ type: 'text', value: storeSettings.receiptFooter || 'Thank you for your business!', style: { textAlign: 'center', fontSize: 13 } });
    printData.push({ type: 'text', value: `Print Time: ${new Date().toLocaleString()}`, style: { textAlign: 'center', fontSize: 10, marginBottom: '15px' } });

    const options = { preview: false, silent: true, margin: '12 12 12 12', timeOutPerLine: 500, pageSize: '80mm', copies: 1 };
    if (printerName) options.printerName = printerName;

    if (thermalHandlerInstance && typeof thermalHandlerInstance.print === 'function') {
      await thermalHandlerInstance.print(printData, options);
    } else if (PosPrinter) {
      await PosPrinter.print(printData, options);
    } else {
      throw new Error('No print implementation available');
    }

    log.info('print-receipt: printed successfully');
    return ok(null, 'Receipt printed successfully');
  } catch (err) {
    log.error('print-receipt failed:', err && err.message ? err.message : err);
    return fail(safeString(err));
  }
});

// Small helper: log messages from renderer
ipcMain.on('log', (ev, msg) => log.info('Renderer log:', msg));
ipcMain.on('open-devtools', () => mainWindow && mainWindow.webContents.openDevTools());
ipcMain.on('close-devtools', () => mainWindow && mainWindow.webContents.closeDevTools());

// ----------------- Create main window -----------------
function resolveIconPath() {
  if (!app.isPackaged) {
    const devIcons = [
      path.join(__dirname, 'public', 'favicon.ico'),
      path.join(__dirname, 'buildResources', 'icons', 'win', 'icon.ico'),
      path.join(__dirname, 'src', 'assets', 'logo.png'),
      path.join(__dirname, 'src', 'assets', 'logo.jpeg')
    ];
    for (const p of devIcons) if (fs.existsSync(p)) return p;
    return path.join(__dirname, 'public', 'favicon.ico');
  }
  if (process.platform === 'darwin') return path.join(process.resourcesPath, 'icon.icns');
  return path.join(process.resourcesPath, 'icon.ico');
}

function findIndexHtmlCandidates() {
  const candidates = [
    path.join(__dirname, 'build', 'index.html'),
    path.join(__dirname, 'index.html'),
  ];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'build', 'index.html'));
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'index.html'));
  }
  const existing = candidates.filter(c => { try { return c && fs.existsSync(c); } catch (e) { return false; } });
  return existing;
}

function createMainWindow() {
  const iconPath = resolveIconPath();
  mainWindow = new BrowserWindow({
    width: 1200, height: 820, minWidth: 1024, minHeight: 720,
    title: app.name || 'Arpella POS', icon: iconPath, show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: false, nodeIntegration: true }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:4000';
    mainWindow.loadURL(devUrl).catch(err => {
      mainWindow.loadURL('data:text/html,' + encodeURIComponent(`<h1>Dev server failed</h1><pre>${String(err)}</pre>`));
    });
  } else {
    const found = findIndexHtmlCandidates();
    if (found.length > 0) mainWindow.loadFile(found[0]).catch(err => { mainWindow.loadURL('data:text/html,' + encodeURIComponent(`<h1>Load failed</h1><pre>${String(err)}</pre>`)); });
    else mainWindow.loadURL('data:text/html,' + encodeURIComponent('<h1>No index.html found</h1>'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Setup auto-updater once window is ready (so events can be sent)
    setupAutoUpdater();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.whenReady().then(async () => {
  // instantiate optional thermal handler if provided
  if (ThermalHandlerClass) {
    try {
      thermalHandlerInstance = new ThermalHandlerClass();
      log.info('Custom thermal handler instantiated');
    } catch (err) {
      log.warn('Failed to instantiate thermal handler (ignored):', err && err.message ? err.message : err);
      thermalHandlerInstance = null;
    }
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
