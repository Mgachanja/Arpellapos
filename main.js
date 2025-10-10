// main.js (optimized - preserves functionality)
// Key improvements:
// - async logo base64 with mtime-aware cache
// - printer list caching + in-flight coalescing
// - conditional PowerShell fallback only when electron printers are empty
// - exec timeout and maxBuffer for PowerShell calls
// - minimal surface changes; functionality preserved

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Auto-updater import
const { autoUpdater } = require('electron-updater');

// Configure auto-updater logging
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

const electron = require('electron');
const window = electron.BrowserWindow;

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

// Setup helper dependencies for exec
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// -----------------------------
// CACHES / CONFIG
// -----------------------------
const PRINTER_CACHE_TTL = 5000; // milliseconds: cache printer list for 5s
const POWER_SHELL_TIMEOUT = 4000; // ms: timeout for PowerShell exec
const POWER_SHELL_MAX_BUFFER = 10 * 1024 * 1024; // 10MB

let printerCache = {
  data: null,
  ts: 0,
  inFlight: null // promise
};

// Logo cache: keeps base64 and last mtime to avoid re-reading/converting if unchanged
let logoCache = {
  base64: null,
  path: null,
  mtimeMs: 0
};

// -----------------------------
// Auto-updater setup (unchanged behavior)
// -----------------------------
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false; // manual control

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

  // initial check; catch errors so it doesn't crash
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('Initial update check failed:', err);
  });
}

function sendUpdateEvent(eventName, data = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(eventName, data);
  }
}
function sendUpdateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', message);
  }
}

// -----------------------------
// File & resource helpers
// -----------------------------
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
  // synchronous resolution is OK — it's cheap and only called occasionally
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
    } catch (error) {
      // continue searching
    }
  }

  log.warn('Receipt logo not found in any of the expected locations:', candidates);
  return null;
}

// Async, cached base64 loader. Uses mtime check to refresh if file changed.
async function getLogoBase64() {
  try {
    const logoPath = resolveLogoPath();
    if (!logoPath) {
      log.warn('No logo found for receipt printing');
      // clear cache if any
      logoCache = { base64: null, path: null, mtimeMs: 0 };
      return null;
    }

    // Use promises API for non-blocking I/O
    const stats = await fs.promises.stat(logoPath).catch(() => null);
    const mtimeMs = stats ? stats.mtimeMs : 0;

    // If cached and unchanged, return cached base64
    if (logoCache.base64 && logoCache.path === logoPath && logoCache.mtimeMs === mtimeMs) {
      return logoCache.base64;
    }

    // Read file asynchronously
    const imageBuffer = await fs.promises.readFile(logoPath);
    const mimeType = logoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    // Update cache
    logoCache = {
      base64: dataUri,
      path: logoPath,
      mtimeMs
    };

    log.info('Logo converted to base64 (async), sizeBytes:', imageBuffer.length, 'path:', logoPath);
    return dataUri;
  } catch (error) {
    log.error('Failed to load logo for receipt (async):', error);
    // Clear cache on error to force reattempt next time
    logoCache = { base64: null, path: null, mtimeMs: 0 };
    return null;
  }
}

// -----------------------------
// Printer detection (cached / throttled)
// -----------------------------
async function getAllAvailablePrinters() {
  try {
    // Return cached if TTL hasn't elapsed
    const now = Date.now();
    if (printerCache.data && (now - printerCache.ts) < PRINTER_CACHE_TTL) {
      return printerCache.data;
    }

    // If a fetch is already in progress, wait for it (coalesce)
    if (printerCache.inFlight) {
      try {
        return await printerCache.inFlight;
      } catch (err) {
        // Clear inFlight on error and continue to attempt fresh fetch
        printerCache.inFlight = null;
      }
    }

    // Create a single in-flight promise
    printerCache.inFlight = (async () => {
      let printWindow = window.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (!printWindow) {
        log.warn('No active window available for printer detection');
        printerCache.data = [];
        printerCache.ts = Date.now();
        printerCache.inFlight = null;
        return [];
      }

      // 1) Use Electron's built-in printers API (fast, native)
      let electronPrinters = [];
      try {
        electronPrinters = await printWindow.webContents.getPrintersAsync();
      } catch (err) {
        log.warn('webContents.getPrintersAsync failed:', err && err.message ? err.message : err);
        electronPrinters = [];
      }

      log.info('Electron detected printers:', (electronPrinters || []).map(p => ({ name: p.name, status: p.status })));

      let allPrinters = [...(electronPrinters || [])];

      // 2) Only attempt PowerShell fallback if electronPrinters list is empty (reduces expensive process spawn)
      if (process.platform === 'win32' && (!electronPrinters || electronPrinters.length === 0)) {
        try {
          const psCmd = 'powershell "Get-Printer | Select-Object Name, PrinterStatus, Type | ConvertTo-Json"';
          const opts = { timeout: POWER_SHELL_TIMEOUT, maxBuffer: POWER_SHELL_MAX_BUFFER };
          const { stdout } = await execAsync(psCmd, opts);
          // stdout can be 'null' or JSON; guard parse
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
      } // end PowerShell fallback

      // Update cache
      printerCache.data = allPrinters;
      printerCache.ts = Date.now();
      printerCache.inFlight = null;
      return allPrinters;
    })();

    // Wait for inFlight and return
    return await printerCache.inFlight;
  } catch (error) {
    log.error('Failed to get printers (cached):', error);
    // On error, clear cache entry and return empty list
    printerCache.data = [];
    printerCache.ts = Date.now();
    printerCache.inFlight = null;
    return [];
  }
}

// -----------------------------
// Create window & startup
// -----------------------------
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

    // Initialize auto-updater after window is ready (only in production)
    if (!isDev) {
      log.info('Initializing auto-updater in 3 seconds...');
      setTimeout(() => {
        setupAutoUpdater();
      }, 3000); // Wait 3 seconds after app is ready
    } else {
      log.info('Development mode - skipping auto-updater');
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// -----------------------------
// IPC HANDLERS (printing + printers)
// -----------------------------
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

ipcMain.handle('test-thermal-printer', async (event, printerName) => {
  if (!PosPrinter) {
    log.error('electron-pos-printer not available');
    return { success: false, message: 'Thermal printer library not available' };
  }

  try {
    const options = {
      preview: false,
      silent: true,
      margin: '10 10 10 10',
      timeOutPerLine: 400,
      pageSize: '80mm',
      copies: 1
    };

    if (printerName && printerName !== '') {
      options.printerName = printerName;
      log.info('Testing printer:', printerName);
    } else {
      log.info('Testing default printer');
    }

    const printData = [];

    // Add logo if available (async + cached)
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      printData.push({
        type: 'image',
        url: logoBase64,
        position: 'center',
        width: '120px',
        height: '60px',
        style: {
          marginBottom: '10px'
        }
      });
    }

    // Add test content
    printData.push(
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: 'PRINTER TEST',
        style: {
          fontWeight: 'bold',
          textAlign: 'center',
          fontSize: '18px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '10px'
        }
      },
      {
        type: 'text',
        value: 'This is a test receipt to verify',
        style: {
          textAlign: 'center',
          fontSize: '14px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: 'printer alignment and formatting.',
        style: {
          textAlign: 'center',
          fontSize: '14px',
          marginBottom: '10px'
        }
      },
      {
        type: 'text',
        value: '- Printer Status: ONLINE',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: '- Paper Width: 80mm',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: '- Character Set: UTF-8',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '10px'
        }
      },
      {
        type: 'text',
        value: `Test Time: ${new Date().toLocaleString('en-KE')}`,
        style: {
          textAlign: 'center',
          fontSize: '11px',
          marginBottom: '10px'
        }
      },
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: '✓ TEST COMPLETED SUCCESSFULLY!',
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '14px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '20px'
        }
      }
    );

    await PosPrinter.print(printData, options);
    log.info('Test print completed successfully for printer:', printerName || 'default');
    return { success: true, message: 'Test print successful' };
  } catch (error) {
    log.error('Test print failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
  }
});

ipcMain.handle('print-receipt', async (event, orderData, printerName, storeSettings) => {
  if (!PosPrinter) {
    log.error('electron-pos-printer not available');
    return { success: false, message: 'Thermal printer library not available' };
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
    } = orderData || {};

    const cashAmount = Number(paymentData.cashAmount || 0);
    const change = Math.max(0, cashAmount - Number(cartTotal));

    const formatCurrency = (amount) => {
      return `Ksh ${Number(amount || 0).toLocaleString('en-KE')}`;
    };

    const options = {
      preview: false,
      silent: true,
      margin: '15 15 15 15',
      timeOutPerLine: 500,
      pageSize: '80mm',
      copies: 1
    };

    if (printerName && printerName !== '') {
      options.printerName = printerName;
      log.info('Printing receipt to specific printer:', printerName);
    } else {
      log.info('Printing receipt to default printer');
    }

    const printData = [];

    // Async + cached logo retrieval
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      printData.push({
        type: 'image',
        url: logoBase64,
        position: 'center',
        width: '150px',
        height: '75px',
        style: {
          marginBottom: '8px'
        }
      });
    }

    // Store information
    printData.push(
      {
        type: 'text',
        value: storeSettings.storeName || 'ARPELLA STORE',
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '16px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: storeSettings.storeAddress || 'Ngong, Matasia',
        style: {
          textAlign: 'center',
          fontSize: '14px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: `TELEPHONE NO: ${storeSettings.storePhone || '+254 7xx xxx xxx'}`,
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '8px'
        }
      },
      {
        type: 'text',
        value: 'SALES RECEIPT',
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '14px',
          marginBottom: '8px'
        }
      },
      {
        type: 'text',
        value: `Order #: ${orderNumber}`,
        style: {
          fontSize: '12px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: `Date: ${new Date().toLocaleString('en-KE')}`,
        style: {
          fontSize: '12px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: `Served by: ${user.fullName || user.username || 'Staff'}`,
        style: {
          fontSize: '12px',
          marginBottom: customerPhone ? '3px' : '8px'
        }
      }
    );

    if (customerPhone) {
      printData.push({
        type: 'text',
        value: `Customer: ${customerPhone}`,
        style: {
          fontSize: '12px',
          marginBottom: '8px'
        }
      });
    }

    printData.push({
      type: 'text',
      value: '================================',
      style: {
        textAlign: 'center',
        fontSize: '12px',
        marginBottom: '8px'
      }
    });

    // Cart items
    cart.forEach((item) => {
      const itemTotal = Number(item.quantity || 0) * Number(item.sellingPrice || 0);

      printData.push(
        {
          type: 'text',
          value: item.productName || 'Unknown Item',
          style: {
            fontWeight: 'bold',
            fontSize: '13px',
            marginBottom: '2px'
          }
        },
        {
          type: 'text',
          value: `  ${item.quantity} x ${formatCurrency(item.sellingPrice)} = ${formatCurrency(itemTotal)}`,
          style: {
            fontSize: '12px',
            marginBottom: '5px'
          }
        }
      );
    });

    printData.push(
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '5px'
        }
      },
      {
        type: 'text',
        value: `TOTAL: ${formatCurrency(cartTotal)}`,
        style: {
          fontWeight: 'bold',
          fontSize: '16px',
          textAlign: 'right',
          marginBottom: '5px'
        }
      }
    );

    // Payment details
    if (paymentType === 'cash') {
      printData.push(
        {
          type: 'text',
          value: `Cash: ${formatCurrency(cashAmount)}`,
          style: {
            fontSize: '13px',
            textAlign: 'right',
            marginBottom: '3px'
          }
        },
        {
          type: 'text',
          value: `Change: ${formatCurrency(change)}`,
          style: {
            fontSize: '13px',
            textAlign: 'right',
            marginBottom: '8px'
          }
        }
      );
    } else if (paymentType === 'mpesa') {
      printData.push({
        type: 'text',
        value: 'Payment: M-PESA',
        style: {
          fontSize: '13px',
          textAlign: 'right',
          marginBottom: '8px'
        }
      });
    }

    printData.push(
      {
        type: 'text',
        value: '================================',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '8px'
        }
      },
      {
        type: 'text',
        value: 'Thank you for your business!',
        style: {
          textAlign: 'center',
          fontSize: '13px',
          marginBottom: '3px'
        }
      },
      {
        type: 'text',
        value: 'Please come again',
        style: {
          textAlign: 'center',
          fontSize: '12px',
          marginBottom: '10px'
        }
      },
      {
        type: 'text',
        value: 'Powered by Arpella POS',
        style: {
          textAlign: 'center',
          fontSize: '10px',
          marginBottom: '20px'
        }
      }
    );

    await PosPrinter.print(printData, options);
    log.info('Receipt printed successfully to:', printerName || 'default printer');
    return { success: true, message: 'Receipt printed successfully' };
  } catch (error) {
    log.error('Print receipt failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
  }
});

// New IPC handler to check logo availability
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
    return {
      available: false,
      error: error.message
    };
  }
});

// Enhanced printer status check
ipcMain.handle('check-printer-status', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();

    if (!printerName) {
      return {
        available: printers.length > 0,
        printers,
        count: printers.length
      };
    }

    const found = printers.find(p => p.name === printerName);
    return {
      available: !!found,
      printers,
      printer: found,
      status: found ? found.status : 'not_found'
    };
  } catch (error) {
    log.error('Failed to check printer status:', error);
    return {
      available: false,
      printers: [],
      error: error.message
    };
  }
});

// Additional IPC handler for printer capabilities
ipcMain.handle('get-printer-capabilities', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    const printer = printers.find(p => p.name === printerName);

    if (!printer) {
      return { success: false, message: 'Printer not found' };
    }

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
    return { success: false, message: error.message };
  }
});

// -----------------------------
// Single instance handling
// -----------------------------
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

// Debugging helpers
ipcMain.on('log', (ev, msg) => log.info('Renderer log:', msg));
ipcMain.on('open-devtools', () => mainWindow && mainWindow.webContents.openDevTools());
ipcMain.on('close-devtools', () => mainWindow && mainWindow.webContents.closeDevTools());