// main.js (improved printing diagnostics & fallbacks)
// Key behaviors preserved; added robust error normalization, payload logging,
// image-to-temp-file fallback, no-image retry, and thermalHandler fallback.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Auto-updater
const { autoUpdater } = require('electron-updater');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Try to load electron-pos-printer
let PosPrinter = null;
try {
  const electronPosPrinter = require('electron-pos-printer');
  PosPrinter = electronPosPrinter.PosPrinter;
  log.info('electron-pos-printer loaded successfully');
} catch (error) {
  log.error('Failed to load electron-pos-printer:', error);
}

const APP_ID = 'com.arpella.pos';
if (process.platform === 'win32') {
  try { app.setAppUserModelId(APP_ID); } catch (e) { console.warn('setAppUserModelId failed', e); }
}

let mainWindow;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let ThermalHandlerClass = null;
let thermalHandlerInstance = null;
try {
  ThermalHandlerClass = require(path.join(__dirname, 'main-thermal-handler'));
} catch (err) {
  log.warn('Thermal handler module not found or failed to load. Using electron-pos-printer instead.', err);
}

// child_process helpers
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// CONFIG & CACHES
const PRINTER_CACHE_TTL = 5000;
const POWER_SHELL_TIMEOUT = 4000;
const POWER_SHELL_MAX_BUFFER = 10 * 1024 * 1024;

let printerCache = { data: null, ts: 0, inFlight: null };
let logoCache = { base64: null, path: null, mtimeMs: 0 };

// Auto-updater helpers
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  log.info('Setting up auto-updater...');

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendUpdateEvent('update-checking');
    sendUpdateMessage('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    sendUpdateEvent('update-available', info);
    sendUpdateMessage(`Update available: v${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    sendUpdateEvent('update-not-available', info);
    sendUpdateMessage('No updates available');
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    sendUpdateEvent('update-error', { message: err.message, stack: err.stack });
    sendUpdateMessage(`Update error: ${err.message}`);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(log_message);
    sendUpdateEvent('update-download-progress', progressObj);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    sendUpdateEvent('update-downloaded', info);
    sendUpdateMessage(`Update v${info.version} downloaded - ready to install`);
  });

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('Initial update check failed:', err);
  });
}
function sendUpdateEvent(eventName, data = null) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(eventName, data);
}
function sendUpdateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', message);
}

// File helpers
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

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'receipt-logo.png'),
    path.join(__dirname, 'src', 'assets', 'receipt-logo.png'),
    path.join(__dirname, 'public', 'assets', 'receipt-logo.png'),
    path.join(__dirname, 'build', 'assets', 'receipt-logo.png'),
  ];

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar', 'assets', 'receipt-logo.png'),
      path.join(process.resourcesPath, 'app.asar', 'src', 'assets', 'receipt-logo.png'),
      path.join(process.resourcesPath, 'app.asar', 'build', 'assets', 'receipt-logo.png'),
      path.join(process.resourcesPath, 'assets', 'receipt-logo.png'),
      path.join(process.resourcesPath, 'build', 'assets', 'receipt-logo.png')
    );
  }

  for (const logoPath of candidates) {
    try {
      if (fs.existsSync(logoPath)) {
        log.info('Found receipt logo at:', logoPath);
        return logoPath;
      }
    } catch (error) { /* continue */ }
  }

  log.warn('Receipt logo not found in any expected locations');
  return null;
}

async function getLogoBase64() {
  try {
    const logoPath = resolveLogoPath();
    if (!logoPath) {
      logoCache = { base64: null, path: null, mtimeMs: 0 };
      return null;
    }

    const stats = await fs.promises.stat(logoPath).catch(() => null);
    const mtimeMs = stats ? stats.mtimeMs : 0;

    if (logoCache.base64 && logoCache.path === logoPath && logoCache.mtimeMs === mtimeMs) {
      return logoCache.base64;
    }

    const imageBuffer = await fs.promises.readFile(logoPath);
    const mimeType = logoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    logoCache = { base64: dataUri, path: logoPath, mtimeMs };
    log.info('Logo converted to base64 (async), sizeBytes:', imageBuffer.length, 'path:', logoPath);
    return dataUri;
  } catch (error) {
    log.error('Failed to load logo for receipt (async):', error);
    logoCache = { base64: null, path: null, mtimeMs: 0 };
    return null;
  }
}

// Printer detection (cached)
async function getAllAvailablePrinters() {
  try {
    const now = Date.now();
    if (printerCache.data && (now - printerCache.ts) < PRINTER_CACHE_TTL) return printerCache.data;

    if (printerCache.inFlight) {
      try { return await printerCache.inFlight; } catch (err) { printerCache.inFlight = null; }
    }

    printerCache.inFlight = (async () => {
      let printWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (!printWindow) {
        log.warn('No active window available for printer detection');
        printerCache.data = [];
        printerCache.ts = Date.now();
        printerCache.inFlight = null;
        return [];
      }

      let electronPrinters = [];
      try { electronPrinters = await printWindow.webContents.getPrintersAsync(); } catch (err) {
        log.warn('webContents.getPrintersAsync failed:', err && err.message ? err.message : err);
        electronPrinters = [];
      }

      log.info('Electron detected printers:', (electronPrinters || []).map(p => ({ name: p.name, status: p.status })));
      let allPrinters = [...(electronPrinters || [])];

      if (process.platform === 'win32' && (!electronPrinters || electronPrinters.length === 0)) {
        try {
          const psCmd = 'powershell "Get-Printer | Select-Object Name, PrinterStatus, Type | ConvertTo-Json"';
          const opts = { timeout: POWER_SHELL_TIMEOUT, maxBuffer: POWER_SHELL_MAX_BUFFER };
          const { stdout } = await execAsync(psCmd, opts);
          let windowsPrinters = [];
          try {
            const parsed = JSON.parse(stdout);
            windowsPrinters = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
          } catch (parseErr) {
            log.warn('Failed to parse PowerShell printers JSON:', parseErr && parseErr.message ? parseErr.message : parseErr);
            windowsPrinters = [];
          }

          if (Array.isArray(windowsPrinters) && windowsPrinters.length > 0) {
            windowsPrinters.forEach(winPrinter => {
              const name = winPrinter.Name || winPrinter.name;
              if (!allPrinters.find(p => p.name === name)) {
                allPrinters.push({
                  name,
                  displayName: name,
                  status: (winPrinter.PrinterStatus === 'Normal' || winPrinter.PrinterStatus === 3) ? 'idle' : 'unknown',
                  isDefault: false,
                  options: {}
                });
              }
            });
          }
          log.info('Windows PowerShell detected additional printers:', windowsPrinters?.length || 0);
        } catch (winError) {
          log.warn('Windows printer detection failed or timed out:', winError && winError.message ? winError.message : winError);
        }
      }

      printerCache.data = allPrinters;
      printerCache.ts = Date.now();
      printerCache.inFlight = null;
      return allPrinters;
    })();

    return await printerCache.inFlight;
  } catch (error) {
    log.error('Failed to get printers (cached):', error);
    printerCache.data = [];
    printerCache.ts = Date.now();
    printerCache.inFlight = null;
    return [];
  }
}

// Utility: consistent error -> string
function errToString(error, maxLen = 1000) {
  try {
    if (!error && error !== 0) return 'Unknown error';
    if (typeof error === 'string') return error.length > maxLen ? error.slice(0, maxLen) + '…' : error;
    if (error instanceof Error) {
      const m = error.message || String(error);
      return m.length > maxLen ? m.slice(0, maxLen) + '…' : m;
    }
    if (typeof error === 'object') {
      if (error.message && typeof error.message === 'string') return error.message;
      if (error.error && typeof error.error === 'string') return error.error;
      try {
        const s = JSON.stringify(error);
        return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
      } catch (e) {
        return String(error);
      }
    }
    return String(error);
  } catch (e) {
    return 'Unknown error';
  }
}

// Create window & startup
function findIndexHtmlCandidates() {
  const candidates = [
    path.join(__dirname, 'build', 'index.html'),
    path.join(__dirname, 'index.html'),
  ];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'build', 'index.html'));
    candidates.push(path.join(process.resourcesPath, 'app.asar', 'index.html'));
    candidates.push(path.join(process.resourcesPath, 'build', 'index.html'));
    candidates.push(path.join(process.resourcesPath, 'index.html'));
  }

  const existing = candidates.filter(c => {
    try { return c && fs.existsSync(c); } catch (e) { return false; }
  });

  log.info('Index.html candidate list:', candidates);
  log.info('Existing index.html files found:', existing);
  return existing;
}

function createMainWindow() {
  const iconPath = resolveIconPath();
  log.info('Resolved icon path:', iconPath, 'packaged:', app.isPackaged);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    title: app.name || 'Arpella POS',
    icon: iconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:4000';
    log.info('Dev mode: loading URL', devUrl);
    mainWindow.loadURL(devUrl).catch(err => {
      log.error('Failed to load dev URL', devUrl, err);
      mainWindow.loadURL('data:text/html,' + encodeURIComponent(`<h1>Dev server failed to load</h1><pre>${String(err)}</pre>`));
    });
  } else {
    const found = findIndexHtmlCandidates();
    if (found.length > 0) {
      const indexFile = found[0];
      log.info('Loading index from:', indexFile);
      mainWindow.loadFile(indexFile).catch(err => {
        log.error('loadFile failed for', indexFile, err);
        mainWindow.loadURL('data:text/html,' + encodeURIComponent(`<h1>Failed to load app</h1><pre>${String(err)}</pre>`));
      });
    } else {
      const diagnosticHtml = `
        <h1>No index.html found</h1>
        <p>Your packaged application did not contain build/index.html in any expected location.</p>
        <pre>${JSON.stringify({ __dirname, resourcesPath: process.resourcesPath }, null, 2)}</pre>
      `;
      mainWindow.loadURL('data:text/html,' + encodeURIComponent(diagnosticHtml));
      log.error('No index.html found. See packaged files and electron-builder config.');
    }
  }

  if (process.env.ELECTRON_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    log.info('ELECTRON_DEBUG detected — DevTools opened');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    if (!isDev) {
      log.info('Initializing auto-updater in 3 seconds...');
      setTimeout(() => { setupAutoUpdater(); }, 3000);
    } else {
      log.info('Development mode - skipping auto-updater');
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// IPC: printers
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await getAllAvailablePrinters();
    log.info('Total printers found:', printers.length);
    return printers;
  } catch (error) {
    log.error('Failed to get printers:', error);
    return [];
  }
});

// Utility to write a base64 dataUri to a temp file (returns temp path)
async function writeDataUriToTempFile(dataUri) {
  try {
    if (!dataUri || !dataUri.startsWith('data:')) return null;
    const matches = dataUri.match(/^data:(image\/[a-zA-Z0-9+.]+);base64,(.*)$/);
    if (!matches) return null;
    const mime = matches[1];
    const b64 = matches[2];
    const ext = mime.includes('png') ? '.png' : mime.includes('jpeg') ? '.jpg' : '.img';
    const tempName = `arpella_logo_${Date.now()}${Math.floor(Math.random()*1000)}${ext}`;
    const tmpPath = path.join(app.getPath('temp') || os.tmpdir(), tempName);
    await fs.promises.writeFile(tmpPath, Buffer.from(b64, 'base64'));
    return tmpPath;
  } catch (err) {
    log.warn('Failed to write dataUri to temp file:', err);
    return null;
  }
}

// Test print handler (improved)
ipcMain.handle('test-thermal-printer', async (event, printerName) => {
  if (!PosPrinter && !thermalHandlerInstance) {
    const msg = 'Thermal printing support not available';
    log.error(msg);
    return { success: false, message: msg };
  }

  const options = {
    preview: false,
    silent: true,
    margin: '10 10 10 10',
    timeOutPerLine: 400,
    pageSize: '80mm',
    copies: 1
  };
  if (printerName) options.printerName = printerName;

  try {
    const printData = [];
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      printData.push({
        type: 'image',
        url: logoBase64,
        position: 'center',
        width: '120px',
        height: '60px',
        style: { marginBottom: '10px' }
      });
    }

    printData.push(
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' } },
      { type: 'text', value: 'PRINTER TEST', style: { fontWeight: 'bold', textAlign: 'center', fontSize: '18px', marginBottom: '5px' } },
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '10px' } },
      { type: 'text', value: 'This is a test receipt to verify', style: { textAlign: 'center', fontSize: '14px', marginBottom: '3px' } },
      { type: 'text', value: 'printer alignment and formatting.', style: { textAlign: 'center', fontSize: '14px', marginBottom: '10px' } },
      { type: 'text', value: `Test Time: ${new Date().toLocaleString('en-KE')}`, style: { textAlign: 'center', fontSize: '11px', marginBottom: '10px' } },
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '20px' } }
    );

    log.info('Attempting test print. printer:', printerName || 'default', 'printData-items:', printData.length);

    if (PosPrinter) {
      try {
        await PosPrinter.print(printData, options);
        log.info('Test print completed successfully for printer:', printerName || 'default');
        return { success: true, message: 'Test print successful' };
      } catch (posErr) {
        log.error('PosPrinter test print failed:', errToString(posErr), posErr);
        // try image-path fallback or no-image fallback below
      }
    }

    // Fallback: try thermalHandlerInstance
    if (thermalHandlerInstance && typeof thermalHandlerInstance.testPrint === 'function') {
      try {
        const result = await thermalHandlerInstance.testPrint(printerName, printData, options);
        log.info('Thermal handler testPrint success:', result);
        return { success: true, message: 'Test print successful (thermal handler)' };
      } catch (handlerErr) {
        log.error('Thermal handler testPrint failed:', errToString(handlerErr), handlerErr);
        return { success: false, message: `Test print failed: ${errToString(handlerErr)}` };
      }
    }

    // As a last attempt, try no-image print (if image existed)
    const printDataNoImage = printData.filter(p => p.type !== 'image');
    if (printDataNoImage.length < printData.length && PosPrinter) {
      try {
        log.info('Retrying test print without images...');
        await PosPrinter.print(printDataNoImage, options);
        log.info('Test print succeeded (no-image fallback)');
        return { success: true, message: 'Test print successful (no-image fallback)' };
      } catch (noImgErr) {
        log.error('No-image fallback failed:', errToString(noImgErr), noImgErr);
      }
    }

    return { success: false, message: 'Test print failed: all backends failed' };
  } catch (error) {
    log.error('test-thermal-printer handler exception:', error);
    return { success: false, message: `Test print failed: ${errToString(error)}` };
  }
});

// Print receipt handler (improved)
ipcMain.handle('print-receipt', async (event, orderData = {}, printerName, storeSettings = {}) => {
  if (!PosPrinter && !thermalHandlerInstance) {
    const msg = 'Thermal printing support not available';
    log.error(msg);
    return { success: false, message: msg };
  }

  try {
    const {
      cart = [],
      cartTotal = 0,
      paymentType = '',
      paymentData = {},
      user = {},
      orderNumber = '',
      customerPhone = '',
    } = orderData;

    const cashAmount = Number(paymentData.cashAmount || 0);
    const formatCurrency = (amt) => `Ksh ${Number(amt || 0).toLocaleString('en-KE')}`;

    const options = {
      preview: false,
      silent: true,
      margin: '15 15 15 15',
      timeOutPerLine: 500,
      pageSize: '80mm',
      copies: 1
    };
    if (printerName) options.printerName = printerName;

    let printData = [];
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      printData.push({
        type: 'image',
        url: logoBase64,
        position: 'center',
        width: '150px',
        height: '75px',
        style: { marginBottom: '8px' }
      });
    }

    printData.push(
      { type: 'text', value: storeSettings.storeName || 'ARPELLA STORE', style: { textAlign: 'center', fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' } },
      { type: 'text', value: storeSettings.storeAddress || 'Ngong, Matasia', style: { textAlign: 'center', fontSize: '14px', marginBottom: '3px' } },
      { type: 'text', value: `TELEPHONE NO: ${storeSettings.storePhone || '+254 7xx xxx xxx'}`, style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' } },
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '8px' } },
      { type: 'text', value: 'SALES RECEIPT', style: { textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' } },
      { type: 'text', value: `Order #: ${orderNumber}`, style: { fontSize: '12px', marginBottom: '3px' } },
      { type: 'text', value: `Date: ${new Date().toLocaleString('en-KE')}`, style: { fontSize: '12px', marginBottom: '3px' } },
      { type: 'text', value: `Served by: ${user.fullName || user.username || 'Staff'}`, style: { fontSize: '12px', marginBottom: customerPhone ? '3px' : '8px' } }
    );

    if (customerPhone) {
      printData.push({ type: 'text', value: `Customer: ${customerPhone}`, style: { fontSize: '12px', marginBottom: '8px' } });
    }

    printData.push({ type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '8px' } });

    // Normalize items
    for (const rawItem of cart) {
      const name = rawItem.productName || rawItem.name || rawItem.title || 'Unknown Item';
      const qty = Number(rawItem.quantity || rawItem.qty || 0);
      const sellingPrice = Number(rawItem.sellingPrice ?? rawItem.price ?? rawItem.salePrice ?? rawItem.unitPrice ?? 0);
      const itemTotal = qty * sellingPrice;

      printData.push(
        { type: 'text', value: name, style: { fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' } },
        { type: 'text', value: `  ${qty} x ${formatCurrency(sellingPrice)} = ${formatCurrency(itemTotal)}`, style: { fontSize: '12px', marginBottom: '5px' } }
      );
    }

    printData.push(
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' } },
      { type: 'text', value: `TOTAL: ${formatCurrency(cartTotal)}`, style: { fontWeight: 'bold', fontSize: '16px', textAlign: 'right', marginBottom: '5px' } }
    );

    if (paymentType === 'cash') {
      printData.push(
        { type: 'text', value: `Cash: ${formatCurrency(cashAmount)}`, style: { fontSize: '13px', textAlign: 'right', marginBottom: '3px' } },
        { type: 'text', value: `Change: ${formatCurrency(Math.max(0, cashAmount - cartTotal))}`, style: { fontSize: '13px', textAlign: 'right', marginBottom: '8px' } }
      );
    } else if (paymentType === 'mpesa') {
      printData.push({ type: 'text', value: 'Payment: M-PESA', style: { fontSize: '13px', textAlign: 'right', marginBottom: '8px' } });
    }

    printData.push(
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '8px' } },
      { type: 'text', value: storeSettings.receiptFooter || 'Thank you for your business! Please come again', style: { textAlign: 'center', fontSize: '13px', marginBottom: '3px' } },
      { type: 'text', value: 'Powered by Arpella POS', style: { textAlign: 'center', fontSize: '10px', marginBottom: '20px' } }
    );

    log.info('print-receipt: printing to', printerName || 'default', 'items:', cart.length, 'printData length:', printData.length);

    // Try PosPrinter
    if (PosPrinter) {
      try {
        await PosPrinter.print(printData, options);
        log.info('Receipt printed successfully to:', printerName || 'default printer');
        return { success: true, message: 'Receipt printed successfully' };
      } catch (posErr) {
        log.error('PosPrinter.print failed:', errToString(posErr), posErr);

        // If image exists, try image->temp file fallback
        const imageEntry = printData.find(p => p.type === 'image');
        if (imageEntry && typeof imageEntry.url === 'string' && imageEntry.url.startsWith('data:')) {
          let tmpPath = null;
          try {
            // extract base64 and write to temp file
            const matches = imageEntry.url.match(/^data:(image\/[a-zA-Z0-9+.]+);base64,(.*)$/);
            if (matches) {
              const b64 = matches[2];
              const mime = matches[1];
              const ext = mime.includes('png') ? '.png' : mime.includes('jpeg') ? '.jpg' : '.img';
              const tempName = `arpella_logo_${Date.now()}_${Math.floor(Math.random()*10000)}${ext}`;
              tmpPath = path.join(app.getPath('temp') || require('os').tmpdir(), tempName);
              await fs.promises.writeFile(tmpPath, Buffer.from(b64, 'base64'));
              // replace url
              const printDataWithPath = printData.map(p => p.type === 'image' ? ({ ...p, url: tmpPath }) : p);
              try {
                log.info('Retrying print with logo as temp file path:', tmpPath);
                await PosPrinter.print(printDataWithPath, options);
                log.info('Receipt printed successfully (image temp-file fallback)');
                // clean up temp file
                try { await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
                return { success: true, message: 'Receipt printed (image file fallback)' };
              } catch (retryErr) {
                log.error('Retry with temp-file image failed:', errToString(retryErr), retryErr);
                try { await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
              }
            }
          } catch (imgErr) {
            log.warn('Image temp-file fallback failed to write/process:', errToString(imgErr), imgErr);
            try { if (tmpPath) await fs.promises.unlink(tmpPath); } catch (e) { /* ignore */ }
          }
        }

        // Try no-image fallback
        const printDataNoImage = printData.filter(p => p.type !== 'image');
        if (printDataNoImage.length < printData.length) {
          try {
            log.info('Retrying print without images as fallback...');
            await PosPrinter.print(printDataNoImage, options);
            log.info('Receipt printed successfully (no-image fallback)');
            return { success: true, message: 'Receipt printed (no-image fallback)' };
          } catch (noImgErr) {
            log.error('No-image fallback failed:', errToString(noImgErr), noImgErr);
          }
        }
      }
    }

    // fallback to thermalHandlerInstance if provided
    if (thermalHandlerInstance && typeof thermalHandlerInstance.print === 'function') {
      try {
        const result = await thermalHandlerInstance.print({ orderData, printData, options, printerName });
        log.info('Thermal handler printed successfully:', result);
        return { success: true, message: 'Receipt printed successfully (thermal handler)' };
      } catch (handlerErr) {
        log.error('Thermal handler print failed:', errToString(handlerErr), handlerErr);
        return { success: false, message: `Print failed: ${errToString(handlerErr)}` };
      }
    }

    const msg = 'Print failed: all print backends failed';
    log.error(msg);
    return { success: false, message: msg };
  } catch (error) {
    log.error('Print receipt failed (exception):', error);
    return { success: false, message: `Print failed: ${errToString(error)}` };
  }
});

// logo check
ipcMain.handle('check-receipt-logo', async () => {
  try {
    const logoPath = resolveLogoPath();
    const logoBase64 = await getLogoBase64();
    return {
      available: !!logoBase64,
      path: logoPath,
      size: logoBase64 ? Buffer.byteLength(logoBase64, 'utf8') : 0
    };
  } catch (error) {
    log.error('Failed to check receipt logo:', error);
    return { available: false, error: errToString(error) };
  }
});

// printer status
ipcMain.handle('check-printer-status', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    if (!printerName) {
      return { available: printers.length > 0, printers, count: printers.length };
    }
    const found = printers.find(p => p.name === printerName);
    return { available: !!found, printers, printer: found, status: found ? found.status : 'not_found' };
  } catch (error) {
    log.error('Failed to check printer status:', error);
    return { available: false, printers: [], error: errToString(error) };
  }
});

// printer capabilities
ipcMain.handle('get-printer-capabilities', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    const printer = printers.find(p => p.name === printerName);
    if (!printer) return { success: false, message: 'Printer not found' };

    const capabilities = {
      name: printer.name,
      status: printer.status,
      isDefault: printer.isDefault || false,
      canPrint: printer.status === 'idle',
      supportsThermal: printer.name.toLowerCase().includes('thermal') ||
                       printer.name.toLowerCase().includes('pos') ||
                       printer.name.toLowerCase().includes('epson') ||
                       printer.name.toLowerCase().includes('star'),
      ...printer.options
    };

    log.info('Printer capabilities for', printerName, ':', capabilities);
    return { success: true, capabilities };
  } catch (error) {
    log.error('Failed to get printer capabilities:', error);
    return { success: false, message: errToString(error) };
  }
});

// single instance & lifecycle
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.commandLine.appendSwitch('disable-http2');

app.whenReady().then(() => {
  if (ThermalHandlerClass) {
    try {
      thermalHandlerInstance = new ThermalHandlerClass();
      log.info('Thermal handler instantiated');
    } catch (err) {
      log.error('Failed to instantiate thermal handler', err);
      thermalHandlerInstance = null;
    }
  } else {
    log.info('Using electron-pos-printer for thermal printing');
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('log', (ev, msg) => log.info('Renderer log:', msg));
ipcMain.on('open-devtools', () => mainWindow && mainWindow.webContents.openDevTools());
ipcMain.on('close-devtools', () => mainWindow && mainWindow.webContents.closeDevTools());
