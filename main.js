// main-electron-printing-enhanced.js
// Modern thermal receipt printing for 80mm POS printers
// Uses @plick/electron-pos-printer ^1.3.0 — table + divider types throughout

'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const log  = require('electron-log');
const { autoUpdater } = require('electron-updater');

// ─── POS Printer loader ──────────────────────────────────────────────────────
let PosPrinter = null;
let usingPlick  = false;

try {
  const plick = require('@plick/electron-pos-printer');
  PosPrinter  = plick.PosPrinter || plick;
  usingPlick  = true;
  log.info('@plick/electron-pos-printer loaded successfully');
} catch {
  try {
    const fallback = require('electron-pos-printer');
    PosPrinter     = fallback.PosPrinter || fallback;
    log.info('electron-pos-printer loaded as fallback');
  } catch (err) {
    PosPrinter = null;
    log.error('No POS printer library available:', err);
  }
}

// ─── App setup ───────────────────────────────────────────────────────────────
const APP_ID = 'com.arpella.pos';
if (process.platform === 'win32') {
  try { app.setAppUserModelId(APP_ID); } catch (e) { log.warn('setAppUserModelId failed', e); }
}

let mainWindow      = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ─── Auto-updater ────────────────────────────────────────────────────────────
function sendUpdateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('update-message', message);
  log.info('Update message:', message);
}

function setupAutoUpdater() {
  log.info('Setting up auto-updater...');
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateMessage({ type: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('update-error', { message: err.message });
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download: ${progress.percent.toFixed(1)}% (${progress.transferred}/${progress.total})`);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('download-progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('update-downloaded', info);
  });

  ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());

  autoUpdater.checkForUpdatesAndNotify().catch(err => log.error('Initial update check failed:', err));

  setInterval(() => {
    log.info('Hourly update check...');
    autoUpdater.checkForUpdatesAndNotify().catch(err => log.error('Hourly update check failed:', err));
  }, 3_600_000);
}

// ─── Window helpers ──────────────────────────────────────────────────────────
function resolveIconPath() {
  if (!app.isPackaged) {
    const candidates = [
      path.join(__dirname, 'public', 'favicon.ico'),
      path.join(__dirname, 'buildResources', 'icons', 'win', 'icon.ico'),
      path.join(__dirname, 'src', 'assets', 'logo.png'),
      path.join(__dirname, 'src', 'assets', 'logo.jpeg'),
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return path.join(__dirname, 'public', 'favicon.ico');
  }
  if (process.platform === 'darwin') return path.join(process.resourcesPath, 'icon.icns');
  return path.join(process.resourcesPath, 'icon.ico');
}

function findIndexHtml() {
  const candidates = [
    path.join(__dirname, 'build', 'index.html'),
    path.join(__dirname, 'index.html'),
    ...(process.resourcesPath ? [
      path.join(process.resourcesPath, 'app.asar', 'build', 'index.html'),
      path.join(process.resourcesPath, 'app.asar', 'index.html'),
      path.join(process.resourcesPath, 'build', 'index.html'),
      path.join(process.resourcesPath, 'index.html'),
    ] : []),
  ];
  const found = candidates.filter(c => { try { return fs.existsSync(c); } catch { return false; } });
  log.info('index.html candidates:', found);
  return found;
}

function createMainWindow() {
  const iconPath = resolveIconPath();
  log.info('Icon path:', iconPath, '| packaged:', app.isPackaged);

  mainWindow = new BrowserWindow({
    width:  1200,
    height: 820,
    minWidth:  1024,
    minHeight: 720,
    title: app.name || 'Arpella POS',
    icon:  iconPath,
    show:  false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration:  true,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:4000';
    log.info('Dev mode: loading', devUrl);
    mainWindow.loadURL(devUrl).catch(err => {
      log.error('Dev URL failed:', err);
      mainWindow.loadURL('data:text/html,' + encodeURIComponent(`<h1>Dev server failed</h1><pre>${err}</pre>`));
    });
  } else {
    const found = findIndexHtml();
    if (found.length > 0) {
      log.info('Loading:', found[0]);
      mainWindow.loadFile(found[0]).catch(err => {
        log.error('loadFile failed:', err);
        mainWindow.loadURL('data:text/html,' + encodeURIComponent(`<h1>Failed to load app</h1><pre>${err}</pre>`));
      });
    } else {
      const html = `<h1>No index.html found</h1><pre>${JSON.stringify({ __dirname, resourcesPath: process.resourcesPath }, null, 2)}</pre>`;
      mainWindow.loadURL('data:text/html,' + encodeURIComponent(html));
      log.error('No index.html found.');
    }
  }

  if (process.env.ELECTRON_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!isDev) setTimeout(setupAutoUpdater, 3000);
    else log.info('Dev mode — auto-updater skipped');
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Printer helpers ─────────────────────────────────────────────────────────
async function getAllAvailablePrinters() {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) { log.warn('No window for printer detection'); return []; }

    const electronPrinters = await win.webContents.getPrintersAsync();
    log.info('Electron printers:', electronPrinters.map(p => p.name));

    let all = [...electronPrinters];

    if (process.platform === 'win32') {
      try {
        const { exec }    = require('child_process');
        const { promisify } = require('util');
        const execAsync   = promisify(exec);
        const { stdout }  = await execAsync(
          'powershell "Get-Printer | Select-Object Name, PrinterStatus | ConvertTo-Json"'
        );
        const winPrinters = JSON.parse(stdout);
        if (Array.isArray(winPrinters)) {
          for (const wp of winPrinters) {
            if (!all.find(p => p.name === wp.Name)) {
              all.push({
                name:        wp.Name,
                displayName: wp.Name,
                status:      wp.PrinterStatus === 'Normal' ? 'idle' : 'unknown',
                isDefault:   false,
                options:     {},
              });
            }
          }
          log.info('PowerShell found', winPrinters.length, 'printers');
        }
      } catch (e) {
        log.warn('PowerShell printer detection failed:', e.message);
      }
    }

    return all;
  } catch (err) {
    log.error('getAllAvailablePrinters failed:', err);
    return [];
  }
}

// ─── IPC: printers ───────────────────────────────────────────────────────────
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await getAllAvailablePrinters();
    log.info('Total printers:', printers.length);
    return printers;
  } catch (err) {
    log.error('get-printers failed:', err);
    return [];
  }
});

ipcMain.handle('check-printer-status', async (_event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    if (!printerName) return { available: printers.length > 0, printers, count: printers.length };
    const found = printers.find(p => p.name === printerName);
    return {
      available: !!found,
      printers,
      printer: found,
      status:  found ? found.status : 'not_found',
    };
  } catch (err) {
    log.error('check-printer-status failed:', err);
    return { available: false, printers: [], error: err.message };
  }
});

ipcMain.handle('get-printer-capabilities', async (_event, printerName) => {
  try {
    const printers = await getAllAvailablePrinters();
    const printer  = printers.find(p => p.name === printerName);
    if (!printer) return { success: false, message: 'Printer not found' };
    const n = printer.name.toLowerCase();
    return {
      success: true,
      capabilities: {
        name:             printer.name,
        status:           printer.status,
        isDefault:        printer.isDefault || false,
        canPrint:         printer.status === 'idle',
        supportsThermal:  n.includes('thermal') || n.includes('pos') || n.includes('epson') || n.includes('star'),
        ...printer.options,
      },
    };
  } catch (err) {
    log.error('get-printer-capabilities failed:', err);
    return { success: false, message: err.message };
  }
});

// ─── IPC: test print ─────────────────────────────────────────────────────────
ipcMain.handle('test-thermal-printer', async (_event, printerName) => {
  if (!PosPrinter) return { success: false, message: 'Thermal printer library not available' };

  try {
    const options = buildPrintOptions(printerName, { pageSize: '80mm', copies: 1, timeout: 400 });

    const data = [
      { type: 'divider' },
      {
        type: 'text',
        value: 'PRINTER TEST',
        style: { fontWeight: '700', textAlign: 'center', fontSize: '16px', margin: '4px 0' },
      },
      {
        type: 'text',
        value: 'Arpella POS — OK',
        style: { textAlign: 'center', fontSize: '12px' },
      },
      { type: 'divider' },
    ];

    await PosPrinter.print(data, options);
    log.info('Test print OK for:', printerName || 'default');
    return { success: true, message: 'Test print successful' };
  } catch (err) {
    log.error('Test print failed:', err);
    return { success: false, message: `Print failed: ${err.message}` };
  }
});

// ─── Formatting helpers ──────────────────────────────────────────────────────
const fmt = (amount) =>
  Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const maskPhone = (raw) => {
  if (!raw) return 'Walk-in';
  const s = String(raw).trim();
  if (s.toLowerCase().startsWith('walk-in')) return 'Walk-in';
  if (s.length < 6) return s;
  return s.slice(0, s.length - 6) + '***' + s.slice(-3);
};

// Shared table cell styles
const CELL_L = { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' };
const CELL_R = { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' };
const HEADER_STYLE = { backgroundColor: '#ffffff', color: '#000000' };
const FOOTER_STYLE = { backgroundColor: '#ffffff', color: '#000000' };
const BODY_STYLE   = { border: 'none' };

/** Build a two-column table row */
const row = (left, right, bold = false) => [
  { type: 'text', value: String(left),  style: bold ? { ...CELL_L, fontWeight: '700' } : CELL_L },
  { type: 'text', value: String(right), style: bold ? { ...CELL_R, fontWeight: '700' } : CELL_R },
];

/** Build print options object */
function buildPrintOptions(printerName, store) {
  const opts = {
    preview:       false,
    silent:        true,
    margin:        '0 0 0 0',
    timeOutPerLine: store.timeout || 400,
    pageSize:      store.pageSize || '80mm',
    copies:        store.copies   || 1,
  };
  if (printerName && String(printerName).trim())
    opts.printerName = String(printerName).trim();
  return opts;
}

// ─── IPC: print receipt ───────────────────────────────────────────────────────
ipcMain.handle('print-receipt', async (_event, orderData = {}, printerName, storeSettingsArg) => {
  log.info('PRINT RECEIPT called');

  if (!PosPrinter)
    return { success: false, message: 'Thermal printer library not available' };

  try {
    const {
      cart          = [],
      paymentType   = '',
      paymentData   = {},
      orderNumber   = '',
      customerPhone = '',
      user:     orderUser    = {},
      cashier:  orderCashier = {},
      buyerPin  = '',
    } = orderData || {};

    const userObj = (orderUser && Object.keys(orderUser).length > 0) ? orderUser : orderCashier;

    // ── Resolve store settings ──────────────────────────────────────────────
    const ss =
      (typeof storeSettingsArg === 'object' && storeSettingsArg !== null)
        ? storeSettingsArg
        : (typeof orderData?.storeSettings === 'object' && orderData.storeSettings !== null)
        ? orderData.storeSettings
        : {};

    const store = {
      name:      String(ss.storeName    || ss.store_name    || 'ARPELLA STORE LIMITED').trim(),
      address:   String(ss.storeAddress || ss.store_address || 'Ngong, Matasia').trim(),
      phone:     String(ss.storePhone   || ss.store_phone   || '+254 704 288 802').trim(),
      pin:       String(ss.pin          || ss.taxPin        || ss.tax_pin || 'P052336649L').trim(),
      footer:    String(ss.receiptFooter || ss.receipt_footer || 'Thank you for shopping with us!').trim(),
      taxRate:   typeof ss.taxRate      === 'number' ? ss.taxRate      : (typeof ss.tax_rate      === 'number' ? ss.tax_rate      : 0),
      discount:  typeof ss.discountAmount === 'number' ? ss.discountAmount : (typeof ss.discount_amount === 'number' ? ss.discount_amount : 0),
      playStore: String(ss.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.mgachanja.Arpella').trim(),
      pageSize:  ss.pageSize || ss.page_size || '80mm',
      copies:    ss.copies   || 1,
      timeout:   ss.timeOutPerLine || 400,
    };

    // ── Cashier name ────────────────────────────────────────────────────────
    const getCashierName = () => {
      if (!userObj || !Object.keys(userObj).length) return 'Staff';
      const candidates = [
        userObj.fullName,
        userObj.full_name,
        userObj.name,
        userObj.firstName
          ? `${userObj.firstName || userObj.first_name || ''} ${userObj.lastName || userObj.last_name || ''}`.trim()
          : null,
        userObj.userName,
        userObj.username,
        userObj.email,
      ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);
      return candidates[0] || 'Staff';
    };
    const cashierName = getCashierName();

    if (!Array.isArray(cart) || cart.length === 0)
      return { success: false, message: 'Cart is empty or invalid' };

    // ── Timestamps & IDs ────────────────────────────────────────────────────
    const now     = new Date();
    const orderId = orderNumber || `ORD-${String(Date.now()).slice(-8)}`;
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const customerPhoneVal =
      (paymentType === 'mpesa' || paymentType === 'both')
        ? (paymentData?.mpesaPhone || '').trim() || customerPhone || ''
        : customerPhone || '';

    // ── Logo ────────────────────────────────────────────────────────────────
    const logoCandidates = [
      path.join(__dirname, 'src', 'assets', 'logo.png'),
      path.join(__dirname, 'src', 'assets', 'logo.jpeg'),
      path.join(__dirname, 'public', 'logo.png'),
    ];
    let logoPath = null;
    for (const p of logoCandidates) { if (fs.existsSync(p)) { logoPath = p; break; } }

    // ════════════════════════════════════════════════════════════════════════
    // Build receipt data
    // ════════════════════════════════════════════════════════════════════════
    const data = [];

    // ── Logo ─────────────────────────────────────────────────────────────
    if (logoPath) {
      data.push({
        type:     'image',
        path:     logoPath,
        position: 'center',
        width:    '140px',
        height:   '55px',
      });
    }

    // ── Store header ──────────────────────────────────────────────────────
    data.push({
      type:  'text',
      value: store.name.toUpperCase(),
      style: { fontWeight: '700', textAlign: 'center', fontSize: '15px', marginBottom: '2px' },
    });
    data.push({
      type:  'text',
      value: store.address,
      style: { textAlign: 'center', fontSize: '10px' },
    });
    data.push({
      type:  'text',
      value: `Tel: ${store.phone}`,
      style: { textAlign: 'center', fontSize: '10px' },
    });
    data.push({
      type:  'text',
      value: `PIN: ${store.pin}`,
      style: { textAlign: 'center', fontSize: '10px', marginBottom: '4px' },
    });

    data.push({ type: 'divider' });

    // ── Receipt title ─────────────────────────────────────────────────────
    data.push({
      type:  'text',
      value: 'SALES RECEIPT',
      style: { fontWeight: '700', textAlign: 'center', fontSize: '14px', margin: '3px 0' },
    });

    data.push({ type: 'divider' });

    // ── Order ID barcode ──────────────────────────────────────────────────
    data.push({
      type:         'barCode',
      value:        orderId,
      height:       36,
      width:        2,
      displayValue: true,
      position:     'center',
      fontSize:     9,
    });

    data.push({ type: 'divider' });

    // ── Order meta (table) ────────────────────────────────────────────────
    const metaRows = [
      row(`Date: ${dateStr}`, timeStr),
      row(`Receipt #`, orderId),
      row('Cashier', cashierName),
      row('Customer', maskPhone(customerPhoneVal)),
    ];
    if (buyerPin && buyerPin.trim() && buyerPin.trim() !== 'N/A') {
      metaRows.push(row('Cust. PIN', buyerPin.trim()));
    }

    data.push({
      type:             'table',
      style:            { border: 'none', width: '100%' },
      tableHeader:      [{ type: 'text', value: '' }, { type: 'text', value: '' }],
      tableBody:        metaRows,
      tableFooter:      [],
      tableHeaderStyle: HEADER_STYLE,
      tableBodyStyle:   BODY_STYLE,
      tableFooterStyle: FOOTER_STYLE,
      tableHeaderCellStyle: { padding: '0', display: 'none' },
      tableBodyCellStyle:   { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' },
      tableFooterCellStyle: { padding: '0' },
    });

    data.push({ type: 'divider' });

    // ── Items header ──────────────────────────────────────────────────────
    data.push({
      type:  'table',
      style: { border: 'none', width: '100%' },
      tableHeader: [
        { type: 'text', value: 'ITEM' },
        { type: 'text', value: 'AMOUNT' },
      ],
      tableBody:        [],
      tableFooter:      [],
      tableHeaderStyle: { backgroundColor: '#000', color: '#fff' },
      tableBodyStyle:   BODY_STYLE,
      tableFooterStyle: FOOTER_STYLE,
      tableHeaderCellStyle: { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' },
      tableBodyCellStyle:   { padding: '2px 4px', textAlign: 'center' },
      tableFooterCellStyle: { padding: '0' },
    });

    // ── Line items ────────────────────────────────────────────────────────
    let subtotal = 0;
    const itemRows = [];

    for (const item of cart) {
      const nameRaw = String(item.name || item.productName || 'Item');
      const qty     = Number(item.quantity || item.qty || 1);
      const unit    = Number(item.salePrice || item.unitPrice || item.price || 0);
      const line    = +(qty * unit).toFixed(2);
      subtotal     += line;

      const maxName    = 22;
      const displayName = nameRaw.length > maxName ? nameRaw.slice(0, maxName - 1) + '…' : nameRaw;

      // Name row
      itemRows.push([
        { type: 'text', value: displayName,               style: { ...CELL_L, fontWeight: '600' } },
        { type: 'text', value: `KES ${fmt(line)}`,        style: { ...CELL_R, fontWeight: '600' } },
      ]);

      // Qty × unit row
      itemRows.push([
        { type: 'text', value: `  ${qty} × ${fmt(unit)}`, style: { ...CELL_L, fontSize: '10px', color: '#555' } },
        { type: 'text', value: '',                         style: CELL_R },
      ]);
    }

    data.push({
      type:             'table',
      style:            { border: 'none', width: '100%' },
      tableHeader:      [{ type: 'text', value: '' }, { type: 'text', value: '' }],
      tableBody:        itemRows,
      tableFooter:      [],
      tableHeaderStyle: HEADER_STYLE,
      tableBodyStyle:   BODY_STYLE,
      tableFooterStyle: FOOTER_STYLE,
      tableHeaderCellStyle: { padding: '0', display: 'none' },
      tableBodyCellStyle:   { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' },
      tableFooterCellStyle: { padding: '0' },
    });

    // ── Totals ────────────────────────────────────────────────────────────
    data.push({ type: 'divider' });

    const taxAmount  = +(subtotal * (store.taxRate || 0)).toFixed(2);
    const afterTax   = subtotal + taxAmount;
    const grandTotal = +(Math.max(0, afterTax - (store.discount || 0))).toFixed(2);

    const totalRows = [
      row('Sub-total', `KES ${fmt(subtotal)}`),
    ];
    if (store.taxRate && taxAmount > 0) {
      totalRows.push(row(`Tax (${(store.taxRate * 100).toFixed(0)}%)`, `KES ${fmt(taxAmount)}`));
    }
    if (store.discount && store.discount > 0) {
      totalRows.push(row('Discount', `- KES ${fmt(store.discount)}`));
    }

    data.push({
      type:             'table',
      style:            { border: 'none', width: '100%' },
      tableHeader:      [{ type: 'text', value: '' }, { type: 'text', value: '' }],
      tableBody:        totalRows,
      tableFooter:      [row('TOTAL', `KES ${fmt(grandTotal)}`, true)],
      tableHeaderStyle: HEADER_STYLE,
      tableBodyStyle:   BODY_STYLE,
      tableFooterStyle: { backgroundColor: '#fff', color: '#000' },
      tableHeaderCellStyle: { padding: '0', display: 'none' },
      tableBodyCellStyle:   { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' },
      tableFooterCellStyle: { padding: '2px 4px', fontSize: '14px', fontFamily: 'monospace', fontWeight: '700', textAlign: 'center' },
    });

    // ── Payment details ───────────────────────────────────────────────────
    if (paymentType) {
      data.push({ type: 'divider' });

      const pmLabel =
        paymentType === 'mpesa' ? 'M-Pesa'
        : paymentType === 'cash' ? 'Cash'
        : paymentType === 'both' ? 'Cash + M-Pesa'
        : paymentType.charAt(0).toUpperCase() + paymentType.slice(1);

      const payRows = [row('Payment Method', pmLabel)];

      if ((paymentType === 'mpesa' || paymentType === 'both') && paymentData?.mpesaRef) {
        payRows.push(row('M-Pesa Ref', paymentData.mpesaRef));
      }

      if (paymentType === 'cash' && paymentData?.cashReceived) {
        const cashReceived = Number(paymentData.cashReceived || 0);
        const change       = Math.max(0, cashReceived - grandTotal);
        payRows.push(row('Cash Received', `KES ${fmt(cashReceived)}`));
        payRows.push(row('Change',        `KES ${fmt(change)}`));
      }

      data.push({
        type:             'table',
        style:            { border: 'none', width: '100%' },
        tableHeader:      [{ type: 'text', value: '' }, { type: 'text', value: '' }],
        tableBody:        payRows,
        tableFooter:      [],
        tableHeaderStyle: HEADER_STYLE,
        tableBodyStyle:   BODY_STYLE,
        tableFooterStyle: FOOTER_STYLE,
        tableHeaderCellStyle: { padding: '0', display: 'none' },
        tableBodyCellStyle:   { padding: '2px 4px', fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' },
        tableFooterCellStyle: { padding: '0' },
      });
    }

    // ── Footer message ────────────────────────────────────────────────────
    data.push({ type: 'divider' });

    if (store.footer) {
      data.push({
        type:  'text',
        value: store.footer,
        style: { fontSize: '11px', textAlign: 'center', fontWeight: '700', margin: '4px 0' },
      });
    }

    // ── App promo ─────────────────────────────────────────────────────────
    data.push({
      type:  'text',
      value: 'Download Arpella on Google Play',
      style: { fontSize: '10px', textAlign: 'center', fontWeight: '700', marginTop: '4px' },
    });
    data.push({
      type:  'text',
      value: 'Get discounts & order for delivery!',
      style: { fontSize: '10px', textAlign: 'center' },
    });

    data.push({
      type:     'qrCode',
      value:    store.playStore,
      height:   70,
      width:    70,
      position: 'center',
      style:    { margin: '4px auto' },
    });

    // ── Print timestamp ───────────────────────────────────────────────────
    data.push({
      type:  'text',
      value: `Printed: ${now.toLocaleString('en-KE')}`,
      style: { fontSize: '9px', textAlign: 'center', marginTop: '4px' },
    });
    data.push({
      type:  'text',
      value: 'Powered by Arpella POS',
      style: { fontSize: '9px', textAlign: 'center', marginBottom: '8px' },
    });

    // ── Fire the print job ────────────────────────────────────────────────
    const options = buildPrintOptions(printerName, store);
    log.info('Printing receipt →', options.printerName || 'default', '| items:', cart.length, '| total:', grandTotal);

    await PosPrinter.print(data, options);

    log.info('Receipt printed successfully');
    return { success: true, message: 'Receipt printed successfully' };

  } catch (err) {
    log.error('print-receipt failed:', err);
    return {
      success: false,
      message: `Print failed: ${err?.message || err?.toString() || 'Unknown error'}`,
    };
  }
});

// ─── App lifecycle ───────────────────────────────────────────────────────────
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

// ─── Misc IPC ─────────────────────────────────────────────────────────────────
ipcMain.on('log',          (_ev, msg) => log.info('Renderer:', msg));
ipcMain.on('open-devtools', ()        => mainWindow?.webContents.openDevTools());