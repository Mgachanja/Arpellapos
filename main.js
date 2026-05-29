// main-electron-printing-enhanced.js
// Fixed + Professional thermal receipt printing for 80mm POS printers

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let PosPrinter = null;
let usingPlick = false;
try {
  const plick = require('@plick/electron-pos-printer');
  PosPrinter = plick.PosPrinter || plick;
  usingPlick = true;
  log.info('@plick/electron-pos-printer loaded successfully');
} catch (err) {
  try {
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

function setupAutoUpdater() {
  log.info('Setting up auto-updater...');
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = true;

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
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
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

  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('Failed initial check:', err);
  });

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
  log.info('Index.html candidates found:', existing);
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
      margin: '0 5 0 5',
      timeOutPerLine: 400,
      pageSize: '80mm',
      copies: 1
    };
    if (printerName && printerName !== '') options.printerName = printerName;

    const printData = [
      {
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center', fontSize: '11px' }
      },
      {
        type: 'text',
        value: 'PRINTER TEST',
        style: { fontWeight: '700', textAlign: 'center', fontSize: '16px', margin: '4px 0' }
      },
      {
        type: 'text',
        value: 'Arpella POS - OK',
        style: { textAlign: 'center', fontSize: '12px' }
      },
      {
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center', fontSize: '11px' }
      }
    ];

    await PosPrinter.print(printData, options);
    log.info('Test print completed successfully for printer:', printerName || 'default');
    return { success: true, message: 'Test print successful' };
  } catch (error) {
    log.error('Test print failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatCurrency = (amount) =>
  Number(amount || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const maskPhone = (rawPhone) => {
  if (!rawPhone) return 'Walk-in';
  const s = String(rawPhone).trim();
  if (s.toLowerCase().startsWith('walk-in')) return 'Walk-in';
  if (s.length < 6) return s;
  return s.substring(0, s.length - 6) + '***' + s.substring(s.length - 3);
};

// Build a two-column text line padded to fill ~32 chars (80mm ~32 chars at 12px)
const twoCol = (left, right, width = 32) => {
  const leftStr = String(left);
  const rightStr = String(right);
  const spaces = Math.max(1, width - leftStr.length - rightStr.length);
  return leftStr + ' '.repeat(spaces) + rightStr;
};

// Divider line
const DIVIDER = '--------------------------------';

// ─── Main print-receipt handler ─────────────────────────────────────────────

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
      cashier: orderCashier = {},
      buyerPin = ''
    } = orderData || {};

    const userObj =
      orderUser && Object.keys(orderUser).length > 0 ? orderUser : orderCashier;

    // Resolve store settings
    const ss =
      typeof storeSettingsArg === 'object' && storeSettingsArg !== null
        ? storeSettingsArg
        : orderData?.storeSettings && typeof orderData.storeSettings === 'object'
        ? orderData.storeSettings
        : {};

    const store = {
      name:    String(ss.storeName    || ss.store_name    || 'ARPELLA STORE LIMITED').trim(),
      address: String(ss.storeAddress || ss.store_address || 'Ngong, Matasia').trim(),
      phone:   String(ss.storePhone   || ss.store_phone   || '+254 704 288 802').trim(),
      pin:     String(ss.pin          || ss.taxPin        || ss.tax_pin || 'P052336649L').trim(),
      footer:  String(ss.receiptFooter || ss.receipt_footer || 'Thank you for shopping with us!').trim(),
      taxRate: typeof ss.taxRate === 'number' ? ss.taxRate : (typeof ss.tax_rate === 'number' ? ss.tax_rate : 0),
      discount: typeof ss.discountAmount === 'number' ? ss.discountAmount : (typeof ss.discount_amount === 'number' ? ss.discount_amount : 0),
      playStore: String(ss.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.mgachanja.Arpella').trim(),
      pageSize: ss.pageSize || ss.page_size || '80mm',
      copies:  ss.copies || 1,
      timeout: ss.timeOutPerLine || 400
    };

    // Resolve cashier name
    const getCashierName = () => {
      if (!userObj || Object.keys(userObj).length === 0) return 'Staff';
      const candidates = [
        userObj.fullName,
        userObj.full_name,
        userObj.name,
        userObj.firstName
          ? `${userObj.firstName || userObj.first_name} ${userObj.lastName || userObj.last_name || ''}`.trim()
          : null,
        userObj.userName,
        userObj.username,
        userObj.email
      ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);
      return candidates[0] || 'Staff';
    };
    const cashierName = getCashierName();

    if (!Array.isArray(cart) || cart.length === 0) {
      log.error('Invalid or empty cart');
      return { success: false, message: 'Cart is empty or invalid' };
    }

    const now = new Date();
    const orderId = orderNumber || `ORD-${String(Date.now()).slice(-8)}`;
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const customerPhoneVal =
      paymentType === 'mpesa' || paymentType === 'both'
        ? (paymentData?.mpesaPhone || '').trim() || customerPhone || ''
        : customerPhone || '';

    // ── Logo ──────────────────────────────────────────────────────────────
    const logoCandidates = [
      path.join(__dirname, 'src', 'assets', 'logo.png'),
      path.join(__dirname, 'src', 'assets', 'logo.jpeg'),
      path.join(__dirname, 'public', 'logo.png')
    ];
    let logoPath = null;
    for (const p of logoCandidates) if (fs.existsSync(p)) { logoPath = p; break; }

    // ── Build receipt data ────────────────────────────────────────────────
    // Strategy: use plain `text` elements for ALL content.
    // Tables in some library versions silently drop rows — avoid them.
    // Two-column rows are built as monospace-padded strings.

    const data = [];

    // Logo
    if (logoPath) {
      data.push({
        type: 'image',
        path: logoPath,
        position: 'center',
        width: '140px',
        height: '55px'
      });
    }

    // Store name (big)
    data.push({
      type: 'text',
      value: store.name.toUpperCase(),
      style: { fontWeight: '700', textAlign: 'center', fontSize: '15px', marginBottom: '2px' }
    });

    data.push({
      type: 'text',
      value: store.address,
      style: { textAlign: 'center', fontSize: '10px' }
    });
    data.push({
      type: 'text',
      value: `Tel: ${store.phone}`,
      style: { textAlign: 'center', fontSize: '10px' }
    });
    data.push({
      type: 'text',
      value: `PIN: ${store.pin}`,
      style: { textAlign: 'center', fontSize: '10px', marginBottom: '4px' }
    });

    // Divider
    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    // Receipt header label
    data.push({
      type: 'text',
      value: 'SALES RECEIPT',
      style: { fontWeight: '700', textAlign: 'center', fontSize: '14px', margin: '3px 0' }
    });

    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    // Order meta
    data.push({
      type: 'text',
      value: twoCol(`Date: ${dateStr}`, timeStr),
      style: { fontSize: '11px', fontFamily: 'monospace' }
    });
    data.push({
      type: 'text',
      value: `Receipt #: ${orderId}`,
      style: { fontSize: '11px', fontFamily: 'monospace' }
    });
    data.push({
      type: 'text',
      value: `Cashier:   ${cashierName}`,
      style: { fontSize: '11px', fontFamily: 'monospace' }
    });
    data.push({
      type: 'text',
      value: `Customer:  ${maskPhone(customerPhoneVal)}`,
      style: { fontSize: '11px', fontFamily: 'monospace' }
    });

    if (buyerPin && buyerPin.trim() && buyerPin.trim() !== 'N/A') {
      data.push({
        type: 'text',
        value: `Cust. PIN: ${buyerPin.trim()}`,
        style: { fontSize: '11px', fontFamily: 'monospace' }
      });
    }

    // Items header
    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });
    data.push({
      type: 'text',
      value: twoCol('ITEM', 'AMOUNT'),
      style: { fontWeight: '700', fontSize: '11px', fontFamily: 'monospace' }
    });
    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    // ── Line items ─────────────────────────────────────────────────────────
    let subtotal = 0;

    for (const item of cart) {
      const nameRaw = String(item.name || item.productName || 'Item');
      const qty     = Number(item.quantity || item.qty || 1);
      const unit    = Number(item.salePrice || item.unitPrice || item.price || 0);
      const line    = +(qty * unit);
      subtotal      += line;

      // Name truncated to fit; qty shown on same line if space allows
      const maxName = 20;
      let displayName = nameRaw.length > maxName ? nameRaw.slice(0, maxName - 1) + '…' : nameRaw;
      const amountStr = `KES ${formatCurrency(line)}`;

      // First row: item name + total amount
      data.push({
        type: 'text',
        value: twoCol(displayName, amountStr),
        style: { fontSize: '11px', fontFamily: 'monospace' }
      });

      // Second row: qty x unit price (indent)
      if (qty > 1 || unit > 0) {
        const qtyLine = `  ${qty} x ${formatCurrency(unit)}`;
        data.push({
          type: 'text',
          value: qtyLine,
          style: { fontSize: '10px', fontFamily: 'monospace', color: '#444' }
        });
      }
    }

    // ── Totals ─────────────────────────────────────────────────────────────
    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    const taxAmount    = +(subtotal * (store.taxRate || 0));
    const afterTax     = subtotal + taxAmount;
    const grandTotal   = Math.max(0, afterTax - (store.discount || 0));

    data.push({
      type: 'text',
      value: twoCol('Sub-total', `KES ${formatCurrency(subtotal)}`),
      style: { fontSize: '11px', fontFamily: 'monospace' }
    });

    if (store.taxRate && taxAmount > 0) {
      const taxLabel = `Tax (${(store.taxRate * 100).toFixed(0)}%)`;
      data.push({
        type: 'text',
        value: twoCol(taxLabel, `KES ${formatCurrency(taxAmount)}`),
        style: { fontSize: '11px', fontFamily: 'monospace' }
      });
    }

    if (store.discount && store.discount > 0) {
      data.push({
        type: 'text',
        value: twoCol('Discount', `- KES ${formatCurrency(store.discount)}`),
        style: { fontSize: '11px', fontFamily: 'monospace' }
      });
    }

    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    // Grand total — large and bold
    data.push({
      type: 'text',
      value: twoCol('TOTAL', `KES ${formatCurrency(grandTotal)}`),
      style: { fontWeight: '700', fontSize: '14px', fontFamily: 'monospace' }
    });

    // Payment method
    if (paymentType) {
      const pmLabel = paymentType === 'mpesa'
        ? 'M-Pesa'
        : paymentType === 'cash'
        ? 'Cash'
        : paymentType === 'both'
        ? 'Cash + M-Pesa'
        : paymentType.charAt(0).toUpperCase() + paymentType.slice(1);

      data.push({
        type: 'text',
        value: twoCol('Payment', pmLabel),
        style: { fontSize: '11px', fontFamily: 'monospace', marginTop: '2px' }
      });

      // Show M-Pesa ref if available
      if ((paymentType === 'mpesa' || paymentType === 'both') && paymentData?.mpesaRef) {
        data.push({
          type: 'text',
          value: `Ref: ${paymentData.mpesaRef}`,
          style: { fontSize: '10px', fontFamily: 'monospace' }
        });
      }

      // Show change if cash
      if (paymentType === 'cash' && paymentData?.cashReceived) {
        const cashReceived = Number(paymentData.cashReceived || 0);
        const change       = Math.max(0, cashReceived - grandTotal);
        data.push({
          type: 'text',
          value: twoCol('Cash', `KES ${formatCurrency(cashReceived)}`),
          style: { fontSize: '11px', fontFamily: 'monospace' }
        });
        data.push({
          type: 'text',
          value: twoCol('Change', `KES ${formatCurrency(change)}`),
          style: { fontSize: '11px', fontFamily: 'monospace' }
        });
      }
    }

    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    // Barcode for order ID
    data.push({
      type: 'barCode',
      value: orderId,
      height: 36,
      width: 2,
      displayValue: true,
      position: 'center',
      fontSize: 9
    });

    // Footer message
    data.push({
      type: 'text',
      value: DIVIDER,
      style: { textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }
    });

    if (store.footer) {
      data.push({
        type: 'text',
        value: store.footer,
        style: { fontSize: '11px', textAlign: 'center', fontWeight: '700', margin: '4px 0' }
      });
    }

    // App promo
    data.push({
      type: 'text',
      value: 'Download Arpella on Google Play',
      style: { fontSize: '10px', textAlign: 'center', fontWeight: '700', marginTop: '4px' }
    });
    data.push({
      type: 'text',
      value: 'Get discounts & order for delivery!',
      style: { fontSize: '10px', textAlign: 'center' }
    });

    // Play Store QR
    data.push({
      type: 'qrCode',
      value: store.playStore,
      height: 70,
      width: 70,
      position: 'center'
    });

    data.push({
      type: 'text',
      value: `Printed: ${now.toLocaleString('en-KE')}`,
      style: { fontSize: '9px', textAlign: 'center', marginTop: '4px' }
    });
    data.push({
      type: 'text',
      value: 'Powered by Arpella POS',
      style: { fontSize: '9px', textAlign: 'center', marginBottom: '8px' }
    });

    // ── Print options ──────────────────────────────────────────────────────
    const options = {
      preview: false,
      silent: true,
      margin: '0 5 0 5',
      timeOutPerLine: store.timeout,
      pageSize: store.pageSize,
      copies: store.copies
    };
    if (printerName && String(printerName).trim()) {
      options.printerName = String(printerName).trim();
    }

    log.info('Sending receipt to printer:', options.printerName || 'default', '| items:', cart.length, '| total:', grandTotal);
    await PosPrinter.print(data, options);

    log.info('Receipt printed successfully');
    return { success: true, message: 'Receipt printed successfully' };

  } catch (error) {
    log.error('Print receipt failed:', error);
    return {
      success: false,
      message: `Print failed: ${error?.message || error?.toString() || 'Unknown error'}`
    };
  }
});

ipcMain.handle('check-printer-status', async (event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    if (!printerName) return { available: printers.length > 0, printers, count: printers.length };
    const found = printers.find(p => p.name === printerName);
    return {
      available: !!found,
      printers,
      printer: found,
      status: found ? found.status : 'not_found'
    };
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
      supportsThermal:
        printer.name.toLowerCase().includes('thermal') ||
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