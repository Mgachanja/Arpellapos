const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Auto-updater import
const { autoUpdater } = require('electron-updater');

// Configure auto-updater logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

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
let updateDownloaded = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let ThermalHandlerClass = null;
let thermalHandlerInstance = null;
try {
  ThermalHandlerClass = require(path.join(__dirname, 'main-thermal-handler'));
} catch (err) {
  log.warn('Thermal handler module not found or failed to load. Using electron-pos-printer instead.', err);
}

// =====================================================
// AUTO-UPDATER CONFIGURATION
// =====================================================

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
      mainWindow.webContents.send('download-progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
        transferredMB: Math.round(progressObj.transferred / 1024 / 1024),
        totalMB: Math.round(progressObj.total / 1024 / 1024)
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
        log.info('User chose to install update immediately');
        try {
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.close();
            }
          });
          
          setImmediate(() => {
            autoUpdater.quitAndInstall(false, true);
          });
        } catch (error) {
          log.error('Failed to quit and install:', error);
        }
      } else {
        log.info('User chose to install update later');
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

// Enhanced IPC handlers for auto-updater
ipcMain.handle('check-for-updates', async () => {
  try {
    log.info('Manual update check initiated');
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
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
    
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 1000);
    
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

// =====================================================
// FILE PATH RESOLVERS
// =====================================================

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
    } catch (error) {
      // Continue searching
    }
  }

  log.warn('Receipt logo not found in any of the expected locations:', candidates);
  return null;
}

function getLogoBase64() {
  try {
    const logoPath = resolveLogoPath();
    if (!logoPath) {
      log.warn('No logo found for receipt printing');
      return null;
    }

    const imageBuffer = fs.readFileSync(logoPath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = logoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    
    log.info('Logo converted to base64, size:', imageBuffer.length, 'bytes');
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    log.error('Failed to load logo for receipt:', error);
    return null;
  }
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

// =====================================================
// MAIN WINDOW CREATION
// =====================================================

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
      setTimeout(() => {
        setupAutoUpdater();
      }, 3000);
    } else {
      log.info('Development mode - skipping auto-updater');
    }
  });

  mainWindow.on('closed', () => { 
    mainWindow = null; 
  });

  mainWindow.on('close', (event) => {
    if (updateDownloaded) {
      log.info('App closing with update available, will install on quit');
    }
  });
}

// =====================================================
// PRINTER DETECTION & MANAGEMENT
// =====================================================

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

// =====================================================
// TEST THERMAL PRINTER
// =====================================================

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

    const printData = [
      {
        type: 'text',
        value: '================================',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' }
      },
      {
        type: 'text',
        value: 'PRINTER TEST',
        style: { fontWeight: 'bold', textAlign: 'center', fontSize: '18px', marginBottom: '5px' }
      },
      {
        type: 'text',
        value: '================================',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '10px' }
      },
      {
        type: 'text',
        value: 'This is a test receipt to verify',
        style: { textAlign: 'center', fontSize: '14px', marginBottom: '3px' }
      },
      {
        type: 'text',
        value: 'printer alignment and formatting.',
        style: { textAlign: 'center', fontSize: '14px', marginBottom: '10px' }
      },
      {
        type: 'text',
        value: '- Printer Status: ONLINE',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '3px' }
      },
      {
        type: 'text',
        value: '- Paper Width: 80mm',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '3px' }
      },
      {
        type: 'text',
        value: '- Character Set: UTF-8',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '10px' }
      },
      {
        type: 'text',
        value: `Test Time: ${new Date().toLocaleString('en-KE')}`,
        style: { textAlign: 'center', fontSize: '11px', marginBottom: '10px' }
      },
      {
        type: 'text',
        value: '================================',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '5px' }
      },
      {
        type: 'text',
        value: '✓ TEST COMPLETED SUCCESSFULLY!',
        style: { textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '5px' }
      },
      {
        type: 'text',
        value: '================================',
        style: { textAlign: 'center', fontSize: '12px', marginBottom: '20px' }
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

// =====================================================
// RECEIPT PRINTING - SIMPLIFIED
// =====================================================

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
      orderNumber = '',
      customerPhone = '',
      user = {}
    } = orderData || {};

    const cashAmount = Number(paymentData.cashAmount || 0);
    const change = Math.max(0, cashAmount - Number(cartTotal));

    const formatCurrency = (amount) => {
      return `Ksh ${Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Get cashier name
    const cashierName = user?.fullName || 
                       `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 
                       user?.userName || 
                       user?.username || 
                       'Staff';

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
      log.info('Printing receipt to specific printer:', printerName);
    }

    const printData = [];

    // Logo (if available)
    const logoBase64 = getLogoBase64();
    if (logoBase64) {
      try {
        printData.push({
          type: 'image',
          url: logoBase64,
          position: 'center',
          width: '150px',
          height: '75px',
          style: { marginBottom: '8px' }
        });
      } catch (logoErr) {
        log.warn('Failed to add logo to receipt:', logoErr.message);
      }
    }

    // Helper function to add text
    const addText = (value, isBold = false, isCenter = false) => {
      printData.push({
        type: 'text',
        value: String(value),
        style: {
          textAlign: isCenter ? 'center' : 'left',
          fontWeight: isBold ? 'bold' : 'normal',
          fontSize: '12px',
          marginBottom: '2px'
        }
      });
    };

    // Header
    addText(storeSettings?.storeName || 'ARPELLA STORE LIMITED', true, true);
    addText(storeSettings?.storeAddress || 'Ngong, Matasia', false, true);
    addText(`Tel: ${storeSettings?.storePhone || '+254 7xx xxx xxx'}`, false, true);
    addText(`PIN: ${storeSettings?.pin || 'P052336649L'}`, false, true);
    addText('================================', false, true);
    addText('SALES RECEIPT', true, true);
    addText('================================', false, true);

    // Order Info
    addText(`Date: ${new Date().toLocaleString('en-KE')}`, false);
    addText(`Order #: ${orderNumber}`, true);
    addText(`Customer: ${customerPhone || 'Walk-in'}`, false);
    addText(`Cashier: ${cashierName}`, false);
    addText('--------------------------------', false, true);

    // Items header
    addText('ITEM          QTY      TOTAL', true);
    addText('--------------------------------', false, true);

    // Cart items - simplified formatting
    for (const item of cart) {
      const name = (item.name || item.productName || 'Item').substring(0, 15);
      const qty = item.quantity || item.qty || 1;
      const price = item.salePrice || item.price || 0;
      const total = (qty * price).toFixed(2);
      
      // Simple fixed-width formatting
      const line = `${name.padEnd(15)} ${String(qty).padStart(3)} ${String(total).padStart(8)}`;
      addText(line, false);
    }

    // Totals
    addText('================================', false, true);
    addText(`Subtotal: ${formatCurrency(cartTotal)}`, false);
    addText(`TOTAL: ${formatCurrency(cartTotal)}`, true);

    // Payment info
    if (paymentType.toLowerCase() === 'cash') {
      addText('--------------------------------', false, true);
      addText(`Cash Received: ${formatCurrency(cashAmount)}`, false);
      if (change > 0) {
        addText(`Change: ${formatCurrency(change)}`, true);
      }
    }

    addText(`Payment: ${paymentType.toUpperCase()}`, false, true);

    // Footer
    addText('================================', false, true);
    addText(storeSettings?.receiptFooter || 'Thank you for your business!', true, true);
    addText('Visit us again soon!', false, true);
    addText('================================', false, true);
    addText('Powered by Arpella', false, true);
    addText(`Printed: ${new Date().toLocaleString('en-KE')}`, false, true);

    await PosPrinter.print(printData, options);
    log.info('Receipt printed successfully to:', printerName || 'default printer');
    return { success: true, message: 'Receipt printed successfully' };
  } catch (error) {
    log.error('Print receipt failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
  }
});

// =====================================================
// PRINTER STATUS & CAPABILITIES
// =====================================================

ipcMain.handle('check-receipt-logo', async () => {
  try {
    const logoPath = resolveLogoPath();
    const logoBase64 = getLogoBase64();
    
    return {
      available: !!logoBase64,
      path: logoPath,
      size: logoBase64 ? logoBase64.length : 0
    };
  } catch (error) {
    log.error('Failed to check receipt logo:', error);
    return {
      available: false,
      error: error.message
    };
  }
});

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

// =====================================================
// APP LIFECYCLE
// =====================================================

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

app.on('before-quit', () => {
  if (thermalHandlerInstance) thermalHandlerInstance.close();
});