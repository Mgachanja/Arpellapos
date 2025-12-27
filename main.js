const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

const { autoUpdater } = require('electron-updater');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

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
  try { app.setAppUserModelId(APP_ID); } catch (e) { log.warn('setAppUserModelId failed', e); }
}

const electron = require('electron');
const window = electron.BrowserWindow;

let mainWindow;
let updateDownloaded = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let ThermalHandlerClass = null;
let thermalHandlerInstance = null;
try {
  ThermalHandlerClass = require(path.join(__dirname, 'main-thermal-handler'));
} catch (err) {
  log.warn('Thermal handler module not found, using electron-pos-printer instead.', err);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendUpdateMessage('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    sendUpdateMessage(`Update available: v${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
        releaseDate: info.releaseDate
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    sendUpdateMessage('You are running the latest version');
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    sendUpdateMessage(`Update error: ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: err.message,
        stack: err.stack
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = `Download speed: ${Math.round(progressObj.bytesPerSecond / 1024)}KB/s`;
    log_message += ` - Downloaded ${Math.round(progressObj.percent)}%`;
    log_message += ` (${Math.round(progressObj.transferred / 1024 / 1024)}MB/${Math.round(progressObj.total / 1024 / 1024)}MB)`;
    log.info(log_message);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info('Update downloaded:', info);
    updateDownloaded = true;
    sendUpdateMessage(`Update v${info.version} downloaded - ready to install`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
        releaseDate: info.releaseDate
      });

      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Install Now', 'Install Later'],
        title: 'Update Downloaded',
        message: `Update v${info.version} has been downloaded.`,
        detail: 'The update will be installed when the application is restarted. Would you like to restart now?',
        defaultId: 0,
        cancelId: 1
      });

      if (choice.response === 0) {
        try {
          BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.close(); });
          setImmediate(() => { autoUpdater.quitAndInstall(false, true); });
        } catch (error) {
          log.error('Failed to quit and install:', error);
        }
      }
    }
  });
}

function sendUpdateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-message', message);
  }
  log.info('Update message:', message);
}

ipcMain.handle('check-for-updates', async () => {
  try {
    log.info('Manual update check initiated');
    autoUpdater.checkForUpdates();
    return { success: true, message: 'Update check initiated' };
  } catch (error) {
    log.error('Manual update check failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('quit-and-install', async () => {
  try {
    if (!updateDownloaded) {
      log.warn('No update downloaded, cannot install');
      return { success: false, error: 'No update available to install' };
    }
    log.info('Initiating quit and install');
    setTimeout(() => { autoUpdater.quitAndInstall(false, true); }, 1000);
    return { success: true };
  } catch (error) {
    log.error('Quit and install failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    updateDownloaded
  };
});

ipcMain.handle('download-update', async () => {
  try {
    log.info('Manual update download initiated');
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    log.error('Manual update download failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-update-info', () => {
  return {
    updateDownloaded,
    autoDownload: autoUpdater.autoDownload,
    autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
    channel: autoUpdater.channel,
    currentVersion: app.getVersion()
  };
});

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
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('close', (event) => {
    if (updateDownloaded) {
      log.info('App closing with update available, will install on quit');
    }
  });
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

    if (printerName && printerName !== '') options.printerName = printerName;

    const printData = [
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' } },
      { type: 'text', value: 'PRINTER TEST', style: { fontWeight: 'bold', textAlign: 'center', fontSize: '18px', marginBottom: '5px' } },
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '10px' } },
      { type: 'text', value: 'This is a test receipt to verify', style: { textAlign: 'center', fontSize: '14px', marginBottom: '3px' } },
      { type: 'text', value: 'printer alignment and formatting.', style: { textAlign: 'center', fontSize: '14px', marginBottom: '10px' } },
      { type: 'text', value: `Test Time: ${new Date().toLocaleString('en-KE')}`, style: { textAlign: 'center', fontSize: '11px', marginBottom: '10px' } },
      { type: 'text', value: '================================', style: { textAlign: 'center', fontSize: '12px', marginBottom: '20px' } }
    ];

    await PosPrinter.print(printData, options);
    log.info('Test print completed successfully for printer:', printerName || 'default');
    return { success: true, message: 'Test print successful' };
  } catch (error) {
    log.error('Test print failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
  }
});

ipcMain.handle('print-receipt', async (event, orderData = {}, printerName, storeSettingsArg) => {
  log.info('PRINT RECEIPT called');

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
      orderNumber = '',
      customerPhone = '',
      user: orderUser = {},
      cashier: orderCashier = {}
    } = orderData || {};

    const userObj = orderUser && Object.keys(orderUser).length > 0 ? orderUser : orderCashier;

    // Enhanced store settings extraction with proper fallback
    const ss = (typeof storeSettingsArg === 'object' && storeSettingsArg !== null)
      ? storeSettingsArg
      : (orderData && orderData.storeSettings && typeof orderData.storeSettings === 'object')
        ? orderData.storeSettings
        : {};

    log.info('Store settings received:', JSON.stringify(ss, null, 2));

    const storeSettingsObj = {
      storeName: String(ss.storeName || ss.store_name || 'ARPELLA STORE LIMITED').trim(),
      storeAddress: String(ss.storeAddress || ss.store_address || 'Ngong, Matasia').trim(),
      storePhone: String(ss.storePhone || ss.store_phone || '+254 704288802').trim(),
      pin: String(ss.pin || ss.taxPin || ss.tax_pin || 'P052336649L').trim(),
      receiptFooter: String(ss.receiptFooter || ss.receipt_footer || 'Thank you for your business!').trim()
    };

    log.info('Formatted store settings:', JSON.stringify(storeSettingsObj, null, 2));

    const formatCurrency = (amount) => `Ksh ${Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

    const printData = [];

    // Professional Header Section
    printData.push(
      { type: 'text', value: '========================================', style: { textAlign: 'center', fontSize: '11px', marginBottom: '8px' } },
      { type: 'text', value: storeSettingsObj.storeName.toUpperCase(), style: { textAlign: 'center', fontWeight: 'bold', fontSize: '18px', marginBottom: '6px' } },
      { type: 'text', value: storeSettingsObj.storeAddress, style: { textAlign: 'center', fontSize: '13px', marginBottom: '4px' } },
      { type: 'text', value: `Tel: ${storeSettingsObj.storePhone}`, style: { textAlign: 'center', fontSize: '13px', marginBottom: '4px' } },
      { type: 'text', value: `PIN: ${storeSettingsObj.pin}`, style: { textAlign: 'center', fontSize: '12px', marginBottom: '8px' } },
      { type: 'text', value: '========================================', style: { textAlign: 'center', fontSize: '11px', marginBottom: '8px' } }
    );

    const timestamp = new Date();
    const orderIdFinal = orderNumber || `ORD-${String(Date.now()).slice(-8)}`;

    const maskPhoneForReceipt = (rawPhone) => {
      if (!rawPhone) return 'Walk-in Customer';
      const s = String(rawPhone).trim();
      if (s.length < 6) return s;
      const idx = s.length - 6;
      return s.substring(0, idx) + '***' + s.substring(s.length - 3);
    };

    const maskedCustomerPhone = maskPhoneForReceipt((paymentType === 'mpesa' || paymentType === 'both') ? (paymentData.mpesaPhone || '').trim() || '' : customerPhone || '');

    // Transaction Information Section
    printData.push(
      { type: 'text', value: `Date: ${timestamp.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}`, style: { fontSize: '12px', marginBottom: '3px', textAlign: 'center' } },
      { type: 'text', value: `Receipt #: ${orderIdFinal}`, style: { fontSize: '12px', marginBottom: '3px', textAlign: 'center', fontWeight: 'bold' } },
      { type: 'text', value: `Served by: ${cashierName}`, style: { fontSize: '12px', marginBottom: '3px', textAlign: 'center' } },
      { type: 'text', value: `Customer: ${maskedCustomerPhone}`, style: { fontSize: '12px', marginBottom: '8px', textAlign: 'center' } },
      { type: 'text', value: '========================================', style: { textAlign: 'center', fontSize: '11px', marginBottom: '8px' } }
    );

    // Items Header - Fixed Width Columns for 10cm paper
    const itemCol = 22;
    const qtyCol = 4;
    const unitCol = 8;
    const lineCol = 8;

    const headerLine = `${'ITEM'.padEnd(itemCol)}${'QTY'.padStart(qtyCol)} ${'UNIT'.padStart(unitCol)} ${'TOTAL'.padStart(lineCol)}`;
    
    printData.push(
      { type: 'text', value: headerLine, style: { fontWeight: 'bold', fontSize: '11px', fontFamily: 'monospace', marginBottom: '4px', textAlign: 'left' } },
      { type: 'text', value: '------------------------------------------------', style: { textAlign: 'center', fontSize: '11px', marginBottom: '6px' } }
    );

    let subtotalCalc = 0;
    
    // Items Section - Fixed Alignment
    for (const item of cart) {
      const nameRaw = String(item.name || item.productName || 'Item');
      const qty = Number(item.quantity || item.qty || 1);
      const unit = Number(item.salePrice || item.price || 0);
      const lineTotal = qty * unit;
      subtotalCalc += lineTotal;
      
      const truncatedName = nameRaw.length > itemCol ? (nameRaw.slice(0, itemCol - 2) + '..') : nameRaw;
      const qtyStr = String(qty);
      const unitStr = unit.toFixed(2);
      const lineStr = lineTotal.toFixed(2);
      
      const line = `${truncatedName.padEnd(itemCol)}${qtyStr.padStart(qtyCol)} ${unitStr.padStart(unitCol)} ${lineStr.padStart(lineCol)}`;
      printData.push({ 
        type: 'text', 
        value: line, 
        style: { fontSize: '11px', fontFamily: 'monospace', marginBottom: '2px', textAlign: 'left' } 
      });
    }

    printData.push({ 
      type: 'text', 
      value: '========================================', 
      style: { textAlign: 'center', fontSize: '11px', marginTop: '8px', marginBottom: '8px' } 
    });

    // Calculations
    const TAX_RATE = typeof ss.taxRate === 'number' ? ss.taxRate : (typeof ss.tax_rate === 'number' ? ss.tax_rate : 0);
    const taxAmount = +(subtotalCalc * (TAX_RATE || 0));
    const totalAfterTax = subtotalCalc + taxAmount;
    const discountAmount = typeof ss.discountAmount === 'number' ? ss.discountAmount : (typeof ss.discount_amount === 'number' ? ss.discount_amount : 0);
    const grandTotal = Math.max(0, totalAfterTax - (discountAmount || 0));

    // Totals Section - Clean Format
    const pushTotalRow = (label, value, bold = false) => {
      const formattedValue = formatCurrency(value);
      const spacing = '                    '; // 20 spaces for alignment
      printData.push({ 
        type: 'text', 
        value: `${label}${spacing.slice(label.length)}${formattedValue}`, 
        style: { 
          fontSize: bold ? '13px' : '12px', 
          fontWeight: bold ? 'bold' : 'normal', 
          fontFamily: 'monospace', 
          marginBottom: '3px',
          textAlign: 'center'
        } 
      });
    };

    pushTotalRow('Subtotal:', subtotalCalc);
    if (TAX_RATE && taxAmount > 0) {
      pushTotalRow(`VAT (${(TAX_RATE * 100).toFixed(0)}%):`, taxAmount);
    }
    if (discountAmount && discountAmount > 0) {
      pushTotalRow('Discount:', -Math.abs(discountAmount));
    }
    
    printData.push({ 
      type: 'text', 
      value: '----------------------------------------', 
      style: { textAlign: 'center', fontSize: '11px', marginTop: '4px', marginBottom: '4px' } 
    });
    
    pushTotalRow('TOTAL:', grandTotal, true);

    printData.push({ 
      type: 'text', 
      value: '========================================', 
      style: { textAlign: 'center', fontSize: '11px', marginTop: '8px', marginBottom: '8px' } 
    });

    // Payment Section
    if (String(paymentType).toLowerCase() === 'cash') {
      const cash = Number(paymentData.cashAmount || 0);
      const change = Math.max(0, cash - grandTotal);
      pushTotalRow('Paid (Cash):', cash);
      if (change > 0) pushTotalRow('Change:', change, true);
    } else if (String(paymentType).toLowerCase() === 'mpesa') {
      const mpesa = Number(paymentData.mpesaAmount || grandTotal);
      pushTotalRow('Paid (M-Pesa):', mpesa);
    } else if (String(paymentType).toLowerCase() === 'both' || String(paymentType).toLowerCase() === 'hybrid') {
      const cash = Number(paymentData.cashAmount || 0);
      const mpesa = Number(paymentData.mpesaAmount || 0);
      const change = Math.max(0, (cash + mpesa) - grandTotal);
      pushTotalRow('Paid (Cash):', cash);
      pushTotalRow('Paid (M-Pesa):', mpesa);
      if (change > 0) pushTotalRow('Change:', change, true);
    } else {
      pushTotalRow('Paid:', grandTotal);
    }

    // Footer Section
    printData.push(
      { type: 'text', value: '========================================', style: { textAlign: 'center', fontSize: '11px', marginTop: '8px', marginBottom: '8px' } },
      { type: 'text', value: storeSettingsObj.receiptFooter, style: { textAlign: 'center', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' } },
      { type: 'text', value: 'Thank you for your purchase!', style: { textAlign: 'center', fontSize: '12px', marginBottom: '10px' } },
      { type: 'text', value: '----------------------------------------', style: { textAlign: 'center', fontSize: '11px', marginBottom: '8px' } },
      { type: 'text', value: 'For easier management on the go,', style: { textAlign: 'center', fontSize: '11px', marginBottom: '3px' } },
      { type: 'text', value: 'download our mobile app:', style: { textAlign: 'center', fontSize: '11px', marginBottom: '5px' } },
      { type: 'text', value: 'www.arpellastore.com/download', style: { textAlign: 'center', fontSize: '12px', fontWeight: 'bold', marginBottom: '10px' } },
      { type: 'text', value: '----------------------------------------', style: { textAlign: 'center', fontSize: '11px', marginBottom: '6px' } },
      { type: 'text', value: `Printed: ${timestamp.toLocaleString('en-KE')}`, style: { textAlign: 'center', fontSize: '10px', marginBottom: '3px' } },
      { type: 'text', value: 'Powered by Arpella POS', style: { textAlign: 'center', fontSize: '10px', marginBottom: '3px' } },
      { type: 'text', value: '\n\n\n', style: { marginBottom: '10px' } }
    );

    const options = {
      preview: false,
      silent: true,
      margin: '5 10 5 10',
      timeOutPerLine: 500,
      pageSize: '80mm',
      copies: 1
    };

    if (printerName && printerName.trim()) options.printerName = printerName.trim();

    await PosPrinter.print(printData, options);

    log.info('Receipt printed successfully to:', printerName || 'default printer');
    return { success: true, message: 'Receipt printed successfully' };

  } catch (error) {
    log.error('Print receipt failed - Full error:', error);
    return {
      success: false,
      message: `Print failed: ${error?.message || error?.toString() || 'Unknown error'}`
    };
  }
});

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