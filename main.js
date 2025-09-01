const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Add electron-pos-printer import
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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- ✅ EXISTING IPC HANDLER: Get list of printers
ipcMain.handle('get-printers', async () => {
  try {
    let printWindow = window.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!printWindow) throw new Error('No active window available');
    const list = await printWindow.webContents.getPrintersAsync();
    log.info('Printer list retrieved:', list);
    return list;
  } catch (error) {
    log.error('Failed to get printers:', error);
    return [];
  }
});

// ---- ✅ NEW IPC HANDLERS: Thermal Printer with electron-pos-printer
ipcMain.handle('test-thermal-printer', async (event, printerName) => {
  if (!PosPrinter) {
    log.error('electron-pos-printer not available');
    return { success: false, message: 'Thermal printer library not available' };
  }

  try {
    const options = {
      preview: false,
      silent: true,
      margin: '0 0 0 0',
      timeOutPerLine: 200,
      pageSize: '80mm'
    };

    if (printerName && printerName !== '') {
      options.printerName = printerName;
      log.info('Testing printer:', printerName);
    } else {
      log.info('Testing default printer');
    }

    await PosPrinter.print([
      {
        type: 'text',
        value: 'PRINTER TEST',
        style: 'text-align:center;font-weight:bold;font-size:20px;',
      },
      {
        type: 'text',
        value: 'This is a test receipt.',
        style: 'text-align:center;',
      },
      {
        type: 'text',
        value: `Test time: ${new Date().toLocaleString()}`,
        style: 'text-align:center;font-size:12px;',
      },
      {
        type: 'text',
        value: '==============================',
        style: 'text-align:center;',
      },
    ], options);

    log.info('Test print completed successfully');
    return { success: true, message: 'Test print successful' };
  } catch (error) {
    log.error('Test print failed:', error);
    return { success: false, message: error.message };
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

    const items = [
      {
        type: 'text',
        value: storeSettings.storeName || 'Arpella Store',
        style: 'text-align:center;font-weight:bold;font-size:20px;',
      },
      {
        type: 'text',
        value: `${storeSettings.storeAddress || 'Ngong, Mtasia'}`,
        style: 'text-align:center;font-size:12px;',
      },
      {
        type: 'text',
        value: `Tel: ${storeSettings.storePhone || '+254 7xx xxx xxx'}`,
        style: 'text-align:center;font-size:12px;',
      },
      { type: 'text', value: '==============================', style: 'text-align:center;' },
      { type: 'text', value: 'SALES RECEIPT', style: 'text-align:center;font-weight:bold;' },
      { type: 'text', value: '==============================', style: 'text-align:center;' },
      { type: 'text', value: `Date: ${new Date().toLocaleString('en-KE')}` },
      { type: 'text', value: `Order #: ${orderNumber}` },
      { type: 'text', value: `Customer: ${customerPhone || 'N/A'}` },
      { type: 'text', value: `Served by: ${user?.userName || user?.name || 'Staff'}` },
      { type: 'text', value: '--------------------------------', style: 'text-align:center;' },
      { type: 'text', value: 'ITEM                 QTY   TOTAL', style: 'font-weight:bold;' },
      { type: 'text', value: '--------------------------------', style: 'text-align:center;' },
    ];

    // Add cart items
    for (const item of cart) {
      const name = item.name || item.productName || 'Item';
      const qty = item.quantity || item.qty || 1;
      const price = item.salePrice || item.price || 0;
      const total = qty * price;
      const paddedName = name.length > 20 ? name.slice(0, 20) : name.padEnd(20);
      items.push({
        type: 'text',
        value: `${paddedName} ${qty.toString().padStart(3)} ${formatCurrency(total)}`,
      });
    }

    items.push({ type: 'text', value: '--------------------------------' });
    items.push({
      type: 'text',
      value: `TOTAL: ${formatCurrency(cartTotal)}`,
      style: 'font-weight:bold;',
    });

    if (paymentType.toLowerCase() === 'cash') {
      items.push({ type: 'text', value: `Cash Given: ${formatCurrency(cashAmount)}` });
      if (change > 0) {
        items.push({
          type: 'text',
          value: `CHANGE: ${formatCurrency(change)}`,
          style: 'font-weight:bold;',
        });
      }
    }

    items.push({ type: 'text', value: `Payment: ${paymentType.toUpperCase()}` });
    items.push({ type: 'text', value: '==============================', style: 'text-align:center;' });
    items.push({
      type: 'text',
      value: storeSettings.receiptFooter || 'Thank you for your business!',
      style: 'text-align:center;',
    });
    items.push({
      type: 'text',
      value: `Printed: ${new Date().toLocaleString('en-KE')}`,
      style: 'text-align:center;font-size:10px;',
    });

    const options = {
      preview: false,
      silent: true,
      margin: '0 0 0 0',
      timeOutPerLine: 200,
      pageSize: '80mm'
    };

    if (printerName && printerName !== '') {
      options.printerName = printerName;
      log.info('Printing to specific printer:', printerName);
    } else {
      log.info('Printing to default printer');
    }

    await PosPrinter.print(items, options);
    log.info('Receipt printed successfully');
    return { success: true, message: 'Receipt printed successfully' };
  } catch (error) {
    log.error('Print receipt failed:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('check-printer-status', async (event, printerName) => {
  try {
    let printWindow = window.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!printWindow) throw new Error('No active window available');
    
    const printers = await printWindow.webContents.getPrintersAsync();
    
    if (!printerName) {
      return { available: printers.length > 0, printers };
    }
    
    const found = printers.find(p => p.name === printerName);
    return { available: !!found, printers };
  } catch (error) {
    log.error('Failed to check printer status:', error);
    return { available: false, printers: [] };
  }
});

/* Single instance handling */
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

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