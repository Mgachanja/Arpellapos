// main-electron-printing-enhanced.js
// Enhanced Electron main process with modern, professional thermal receipt printing
// Uses @plick/electron-pos-printer when available (recommended)

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let PosPrinter = null;
let usingPlick = false;
try {
  // prefer @plick/electron-pos-printer per the provided doc
  const plick = require('@plick/electron-pos-printer');
  PosPrinter = plick.PosPrinter || plick;
  usingPlick = true;
  log.info('@plick/electron-pos-printer loaded successfully');
} catch (err) {
  try {
    // fallback to previous library name if present in the codebase
    const electronPosPrinter = require('electron-pos-printer');
    PosPrinter = electronPosPrinter.PosPrinter || electronPosPrinter;
    log.info('electron-pos-printer loaded as fallback');
  } catch (error) {
    PosPrinter = null;
    log.error('No POS printer library available:', error);
  }
}

const APP_ID = 'com.arpella.pos';
if (process.platform === 'win32') {
  try { app.setAppUserModelId(APP_ID); } catch (e) { log.warn('setAppUserModelId failed', e); }
}

const electron = require('electron');
const window = electron.BrowserWindow;

let mainWindow;
let updateDownloaded = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

function sendUpdateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', message);
  log.info('Update message:', message);
}

// --- Keep auto updater handlers (omitted in this file for brevity) ---
function setupAutoUpdater() {
  log.info('Setting up auto-updater...');

  // Configure logging
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';

  // Enable auto-downloading
  autoUpdater.autoDownload = true;

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendUpdateMessage({ type: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    // sendUpdateMessage({ type: 'not-available', message: 'No update available.', info });
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = 'Download speed: ' + progressObj.bytesPerSecond;
    logMessage = logMessage + ' - Downloaded ' + progressObj.percent + '%';
    logMessage = logMessage + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
    log.info(logMessage);

    // Send detailed progress object to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  // Handle quit and install IPC from renderer
  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
  });

  // Check immediately
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('Failed initial check:', err);
  });

  // Check every hour (3600000 ms)
  setInterval(() => {
    log.info('Performing hourly update check...');
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      log.error('Failed hourly check:', err);
    });
  }, 3600000);
}

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
    path.join(__dirname, 'index.html')
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
      log.info('Initializing auto-updater...');
      setTimeout(() => { setupAutoUpdater(); }, 3000);
    } else {
      log.info('Development mode - skipping auto-updater');
      // Uncomment to test in dev (requires valid dev-app-update.yml)
      // setTimeout(() => { setupAutoUpdater(); }, 3000);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

async function getAllAvailablePrinters() {
  try {
    let printWindow = window.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!printWindow) {
      log.warn('No active window available for printer detection');
      return [];
    }

    const electronPrinters = await printWindow.webContents.getPrintersAsync();
    log.info('Electron detected printers:', electronPrinters.map(p => ({ name: p.name, status: p.status })));

    let allPrinters = [...electronPrinters];

    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync('powershell "Get-Printer | Select-Object Name, PrinterStatus, Type | ConvertTo-Json"');
        const windowsPrinters = JSON.parse(stdout);
        if (Array.isArray(windowsPrinters)) {
          windowsPrinters.forEach(winPrinter => {
            if (!allPrinters.find(p => p.name === winPrinter.Name)) {
              allPrinters.push({
                name: winPrinter.Name,
                displayName: winPrinter.Name,
                status: winPrinter.PrinterStatus === 'Normal' ? 'idle' : 'unknown',
                isDefault: false,
                options: {}
              });
            }
          });
        }
        log.info('Windows PowerShell detected additional printers:', windowsPrinters?.length || 0);
      } catch (winError) {
        log.warn('Windows printer detection failed:', winError.message);
      }
    }

    return allPrinters;
  } catch (error) {
    log.error('Failed to get printers:', error);
    return [];
  }
}

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
    log.error('POS printer library not available');
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
    if (printerName && printerName !== '') options.printerName = printerName;

    const printData = [
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' } },
      { type: 'text', value: 'PRINTER TEST', style: { fontWeight: '700', textAlign: 'center', fontSize: '18px', marginBottom: '5px' } },
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '10px' } }
    ];

    await PosPrinter.print(printData, options);
    log.info('Test print completed successfully for printer:', printerName || 'default');
    return { success: true, message: 'Test print successful' };
  } catch (error) {
    log.error('Test print failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
  }
});

// Helper utilities used by print-receipt
const formatCurrency = (amount) => `Ksh ${Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const maskPhoneForReceipt = (rawPhone) => {
  if (!rawPhone) return 'Walk-in Customer';
  const s = String(rawPhone).trim();
  if (s.length < 6) return s;
  const idx = s.length - 6;
  return s.substring(0, idx) + '***' + s.substring(s.length - 3);
};

ipcMain.handle('print-receipt', async (event, orderData = {}, printerName, storeSettingsArg) => {
  log.info('PRINT RECEIPT called');

  if (!PosPrinter) {
    log.error('POS printer library not available');
    return { success: false, message: 'Thermal printer library not available' };
  }

  try {
    const {
      cart = [],
      cartTotal = 0,
      paymentType = '',
      paymentData = {},
      orderNumber = '',
      customerPhone = '',
      user: orderUser = {},
      cashier: orderCashier = {}
    } = orderData || {};

    const userObj = orderUser && Object.keys(orderUser).length > 0 ? orderUser : orderCashier;

    const ss = (typeof storeSettingsArg === 'object' && storeSettingsArg !== null)
      ? storeSettingsArg
      : (orderData && orderData.storeSettings && typeof orderData.storeSettings === 'object')
        ? orderData.storeSettings
        : {};

    const storeSettingsObj = {
      storeName: String(ss.storeName || ss.store_name || 'ARPELLA STORE LIMITED').trim(),
      storeAddress: String(ss.storeAddress || ss.store_address || 'Ngong, Matasia').trim(),
      storePhone: String(ss.storePhone || ss.store_phone || '+254 704288802').trim(),
      pin: String(ss.pin || ss.taxPin || ss.tax_pin || 'P052336649L').trim(),
      receiptFooter: String(ss.receiptFooter || ss.receipt_footer || 'Thank you for your business!').trim()
    };

    const getCashierName = () => {
      if (!userObj || Object.keys(userObj).length === 0) return 'Staff';
      const candidates = [
        userObj.fullName,
        userObj.full_name,
        userObj.name,
        ((userObj.firstName || userObj.first_name) ? `${userObj.firstName || userObj.first_name} ${userObj.lastName || userObj.last_name || ''}` : null),
        userObj.userName,
        userObj.username,
        userObj.email
      ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);
      const chosen = candidates.length > 0 ? candidates[0] : 'Staff';
      return (chosen.split(/\s+/)[0] || chosen).trim();
    };

    const cashierName = getCashierName();

    if (!Array.isArray(cart) || cart.length === 0) {
      log.error('Invalid or empty cart');
      return { success: false, message: 'Cart is empty or invalid' };
    }

    // Build modern, professional receipt using table features supported by @plick/electron-pos-printer
    const timestamp = new Date();
    const orderIdFinal = orderNumber || `ORD-${String(Date.now()).slice(-8)}`;

    // Determine pageSize (allow object or string)
    let pageSize = ss.pageSize || ss.page_size || '80mm';
    if (typeof pageSize === 'object' && pageSize.width && pageSize.height) {
      // leave as object
    } else if (typeof pageSize === 'string') {
      // keep string like '80mm'
    } else {
      pageSize = '80mm';
    }

    // Header + logo
    const logoPathCandidates = [
      path.join(__dirname, 'src', 'assets', 'logo.png'),
      path.join(__dirname, 'src', 'assets', 'logo.jpeg'),
      path.join(__dirname, 'public', 'logo.png')
    ];
    let logoPath = null;
    for (const p of logoPathCandidates) if (fs.existsSync(p)) { logoPath = p; break; }

    const data = [];
    if (logoPath) {
      data.push({ type: 'image', path: logoPath, position: 'center', width: '160px', height: '60px' });
    }

    data.push({ type: 'text', value: storeSettingsObj.storeName.toUpperCase(), style: { fontWeight: '700', textAlign: 'center', fontSize: '18px' } });
    data.push({ type: 'text', value: storeSettingsObj.storeAddress, style: { fontSize: '11px', textAlign: 'center', marginBottom: '4px' } });
    data.push({ type: 'text', value: `Tel: ${storeSettingsObj.storePhone}   PIN: ${storeSettingsObj.pin}`, style: { fontSize: '11px', textAlign: 'center', marginBottom: '4px' } });
    data.push({ type: 'divider' });

    data.push({ type: 'text', value: `Date: ${timestamp.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}`, style: { fontSize: 10, textAlign: 'left' } });
    data.push({ type: 'text', value: `Receipt #: ${orderIdFinal}`, style: { fontSize: 11, textAlign: 'left', fontWeight: '700' } });
    data.push({ type: 'text', value: `Served by: ${cashierName}`, style: { fontSize: 11, textAlign: 'left' } });
    data.push({ type: 'text', value: `Customer: ${maskPhoneForReceipt((paymentType === 'mpesa' || paymentType === 'both') ? (paymentData.mpesaPhone || '').trim() || '' : customerPhone || '')}`, style: { fontSize: 11, textAlign: 'left', marginBottom: '6px' } });

    // Items table header and body
    const tableHeader = [
      { type: 'text', value: 'Item' },
      { type: 'text', value: 'Qty' },
      { type: 'text', value: 'Unit' },
      { type: 'text', value: 'Total' }
    ];

    const tableBody = [];
    let subtotalCalc = 0;

    for (const item of cart) {
      const nameRaw = String(item.name || item.productName || 'Item');
      const qty = Number(item.quantity || item.qty || 1);
      const unit = Number(item.salePrice || item.price || 0);
      const lineTotal = +(qty * unit);
      subtotalCalc += lineTotal;

      tableBody.push([
        { type: 'text', value: (nameRaw.length > 28 ? nameRaw.slice(0, 25) + '...' : nameRaw), style: { fontSize: 10 } },
        { type: 'text', value: String(qty), style: { fontSize: 10 } },
        { type: 'text', value: formatCurrency(unit), style: { fontSize: 10 } },
        { type: 'text', value: formatCurrency(lineTotal), style: { fontSize: 10, textAlign: 'right' } }
      ]);
    }

    // Totals
    const TAX_RATE = typeof ss.taxRate === 'number' ? ss.taxRate : (typeof ss.tax_rate === 'number' ? ss.tax_rate : 0);
    const taxAmount = +(subtotalCalc * (TAX_RATE || 0));
    const totalAfterTax = subtotalCalc + taxAmount;
    const discountAmount = typeof ss.discountAmount === 'number' ? ss.discountAmount : (typeof ss.discount_amount === 'number' ? ss.discount_amount : 0);
    const grandTotal = Math.max(0, totalAfterTax - (discountAmount || 0));

    const tableFooter = [
      [{ type: 'text', value: 'Subtotal' }, { type: 'text', value: formatCurrency(subtotalCalc) }],
    ];
    if (TAX_RATE && taxAmount > 0) tableFooter.push([{ type: 'text', value: `VAT (${(TAX_RATE * 100).toFixed(0)}%)` }, { type: 'text', value: formatCurrency(taxAmount) }]);
    if (discountAmount && discountAmount > 0) tableFooter.push([{ type: 'text', value: 'Discount' }, { type: 'text', value: `- ${formatCurrency(Math.abs(discountAmount))}` }]);
    tableFooter.push([{ type: 'text', value: 'TOTAL' }, { type: 'text', value: formatCurrency(grandTotal) }]);

    data.push({ type: 'table', tableHeader, tableBody, tableFooter, tableHeaderStyle: { backgroundColor: '#000', color: '#fff' }, tableBodyStyle: { border: '0.5px solid #ddd' }, tableFooterStyle: { fontWeight: '700' } });

    data.push({ type: 'divider' });

    // Payment lines
    const paymentLower = String(paymentType || '').toLowerCase();
    if (paymentLower === 'cash') {
      const cash = Number(paymentData.cashAmount || 0);
      const change = Math.max(0, cash - grandTotal);
      data.push({ type: 'text', value: `Paid (Cash): ${formatCurrency(cash)}`, style: { fontSize: 11 } });
      if (change > 0) data.push({ type: 'text', value: `Change: ${formatCurrency(change)}`, style: { fontSize: 11, fontWeight: '700' } });
    } else if (paymentLower === 'mpesa') {
      const mpesa = Number(paymentData.mpesaAmount || grandTotal);
      data.push({ type: 'text', value: `Paid (M-Pesa): ${formatCurrency(mpesa)}`, style: { fontSize: 11 } });
    } else if (paymentLower === 'both' || paymentLower === 'hybrid') {
      const cash = Number(paymentData.cashAmount || 0);
      const mpesa = Number(paymentData.mpesaAmount || 0);
      const change = Math.max(0, (cash + mpesa) - grandTotal);
      data.push({ type: 'text', value: `Paid (Cash): ${formatCurrency(cash)}`, style: { fontSize: 11 } });
      data.push({ type: 'text', value: `Paid (M-Pesa): ${formatCurrency(mpesa)}`, style: { fontSize: 11 } });
      if (change > 0) data.push({ type: 'text', value: `Change: ${formatCurrency(change)}`, style: { fontSize: 11, fontWeight: '700' } });
    } else {
      data.push({ type: 'text', value: `Paid: ${formatCurrency(grandTotal)}`, style: { fontSize: 11 } });
    }

    // Footer, QR code with receipt reference
   const playStoreUrl = storeSettingsObj.playStoreUrl ||
  'https://play.google.com/store/apps/details?id=com.mgachanja.Arpella';

data.push({ type: 'divider' });

// optional store footer (keeps existing value if present)
if (storeSettingsObj.receiptFooter) {
  data.push({
    type: 'text',
    value: storeSettingsObj.receiptFooter,
    style: { fontSize: 10, textAlign: 'center' }
  });
}

// Call to action — short, bold, clear
data.push({
  type: 'text',
  value: 'Join our Beta Testers — Shop from home, get goods delivered to your door',
  style: { fontSize: 11, textAlign: 'center', fontWeight: '700' }
});
data.push({
  type: 'text',
  value: 'Scan the code or search "Arpella" on Google Play',
  style: { fontSize: 9, textAlign: 'center' }
});

// Play Store QR (smaller than the receipt QR)
data.push({
  type: 'qrCode',
  value: playStoreUrl,
  height: 60,
  width: 60,
  position: 'center'
});

data.push({
  type: 'text',
  value: 'Thank you for your purchase!',
  style: { fontSize: 10, textAlign: 'center' }
});

// Receipt QR (keeps original receipt link)
data.push({
  type: 'qrCode',
  value: receiptUrl,
  height: 70,
  width: 70,
  position: 'center'
});

data.push({
  type: 'text',
  value: `Printed: ${timestamp.toLocaleString('en-KE')}`,
  style: { fontSize: 9, textAlign: 'center' }
});
data.push({
  type: 'text',
  value: 'Powered by Arpella POS',
  style: { fontSize: 9, textAlign: 'center' }
});
    const options = {
      preview: false,
      silent: true,
      margin: '0 5 0 5',
      timeOutPerLine: ss.timeOutPerLine || 400,
      pageSize: pageSize,
      copies: ss.copies || 1
    };
    if (printerName && String(printerName).trim()) options.printerName = String(printerName).trim();

    await PosPrinter.print(data, options);

    log.info('Receipt printed successfully to:', printerName || 'default printer');
    return { success: true, message: 'Receipt printed successfully' };

  } catch (error) {
    log.error('Print receipt failed - Full error:', error);
    return { success: false, message: `Print failed: ${error?.message || error?.toString() || 'Unknown error'}` };
  }
});

ipcMain.handle('check-printer-status', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    if (!printerName) return { available: printers.length > 0, printers, count: printers.length };
    const found = printers.find(p => p.name === printerName);
    return { available: !!found, printers, printer: found, status: found ? found.status : 'not_found' };
  } catch (error) {
    log.error('Failed to check printer status:', error);
    return { available: false, printers: [], error: error.message };
  }
});

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
      supportsThermal: printer.name.toLowerCase().includes('thermal') || printer.name.toLowerCase().includes('pos') || printer.name.toLowerCase().includes('epson') || printer.name.toLowerCase().includes('star'),
      ...printer.options
    };
    log.info('Printer capabilities for', printerName, ':', capabilities);
    return { success: true, capabilities };
  } catch (error) {
    log.error('Failed to get printer capabilities:', error);
    return { success: false, message: error.message };
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.commandLine.appendSwitch('disable-http2');

app.whenReady().then(() => {
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
