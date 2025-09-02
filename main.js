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

// Enhanced printer detection function
async function getAllAvailablePrinters() {
  try {
    let printWindow = window.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!printWindow) {
      log.warn('No active window available for printer detection');
      return [];
    }

    // Get printers from Electron
    const electronPrinters = await printWindow.webContents.getPrintersAsync();
    log.info('Electron detected printers:', electronPrinters.map(p => ({ name: p.name, status: p.status })));

    // Additional printer detection for thermal printers
    let allPrinters = [...electronPrinters];

    // On Windows, try to get additional printers using system commands
    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Use PowerShell to get more detailed printer info
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

// ---- ✅ ENHANCED IPC HANDLER: Get list of printers with better detection
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

// ---- ✅ FIXED IPC HANDLERS: Thermal Printer with proper styling
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
      timeOutPerLine: 400,
      pageSize: 'A4', // Changed from '80mm' for better compatibility
      copies: 1
    };

    if (printerName && printerName !== '') {
      options.printerName = printerName;
      log.info('Testing printer:', printerName);
    } else {
      log.info('Testing default printer');
    }

    // Fixed: Use object-based styling instead of CSS strings
    const printData = [
      {
        type: 'text',
        value: 'PRINTER TEST',
        style: {
          fontWeight: 'bold',
          textAlign: 'center',
          fontSize: '20px'
        }
      },
      {
        type: 'text',
        value: 'This is a test receipt.',
        style: {
          textAlign: 'center',
          fontSize: '14px'
        }
      },
      {
        type: 'text',
        value: `Test time: ${new Date().toLocaleString()}`,
        style: {
          textAlign: 'center',
          fontSize: '12px'
        }
      },
      {
        type: 'text',
        value: '==============================',
        style: {
          textAlign: 'center'
        }
      },
      {
        type: 'text',
        value: 'Test completed successfully!',
        style: {
          textAlign: 'center',
          fontWeight: 'bold'
        }
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

    // Fixed: Use object-based styling for all elements
    const printData = [
      {
        type: 'text',
        value: storeSettings.storeName || 'Arpella Store',
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '18px'
        }
      },
      {
        type: 'text',
        value: `${storeSettings.storeAddress || 'Ngong, Mtasia'}`,
        style: {
          textAlign: 'center',
          fontSize: '12px'
        }
      },
      {
        type: 'text',
        value: `Tel: ${storeSettings.storePhone || '+254 7xx xxx xxx'}`,
        style: {
          textAlign: 'center',
          fontSize: '12px'
        }
      },
      {
        type: 'text',
        value: '==============================',
        style: { textAlign: 'center' }
      },
      {
        type: 'text',
        value: 'SALES RECEIPT',
        style: {
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '16px'
        }
      },
      {
        type: 'text',
        value: '==============================',
        style: { textAlign: 'center' }
      },
      {
        type: 'text',
        value: `Date: ${new Date().toLocaleString('en-KE')}`,
        style: { fontSize: '12px' }
      },
      {
        type: 'text',
        value: `Order #: ${orderNumber}`,
        style: { fontSize: '12px' }
      },
      {
        type: 'text',
        value: `Customer: ${customerPhone || 'N/A'}`,
        style: { fontSize: '12px' }
      },
      {
        type: 'text',
        value: `Served by: ${user?.userName || user?.name || 'Staff'}`,
        style: { fontSize: '12px' }
      },
      {
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center' }
      },
      {
        type: 'text',
        value: 'ITEM                 QTY   TOTAL',
        style: {
          fontWeight: 'bold',
          fontSize: '12px',
          fontFamily: 'monospace'
        }
      },
      {
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center' }
      }
    ];

    // Add cart items
    for (const item of cart) {
      const name = item.name || item.productName || 'Item';
      const qty = item.quantity || item.qty || 1;
      const price = item.salePrice || item.price || 0;
      const total = qty * price;
      
      // Format for receipt printing with fixed width
      const truncatedName = name.length > 20 ? name.slice(0, 17) + '...' : name;
      const paddedName = truncatedName.padEnd(20);
      const qtyStr = qty.toString().padStart(3);
      const totalStr = formatCurrency(total);
      
      printData.push({
        type: 'text',
        value: `${paddedName} ${qtyStr} ${totalStr}`,
        style: {
          fontSize: '11px',
          fontFamily: 'monospace'
        }
      });
    }

    // Add totals and payment info
    printData.push(
      {
        type: 'text',
        value: '--------------------------------',
        style: { textAlign: 'center' }
      },
      {
        type: 'text',
        value: `TOTAL: ${formatCurrency(cartTotal)}`,
        style: {
          fontWeight: 'bold',
          fontSize: '14px'
        }
      }
    );

    if (paymentType.toLowerCase() === 'cash') {
      printData.push({
        type: 'text',
        value: `Cash Given: ${formatCurrency(cashAmount)}`,
        style: { fontSize: '12px' }
      });
      
      if (change > 0) {
        printData.push({
          type: 'text',
          value: `CHANGE: ${formatCurrency(change)}`,
          style: {
            fontWeight: 'bold',
            fontSize: '14px'
          }
        });
      }
    }

    printData.push(
      {
        type: 'text',
        value: `Payment: ${paymentType.toUpperCase()}`,
        style: { fontSize: '12px' }
      },
      {
        type: 'text',
        value: '==============================',
        style: { textAlign: 'center' }
      },
      {
        type: 'text',
        value: storeSettings.receiptFooter || 'Thank you for your business!',
        style: {
          textAlign: 'center',
          fontSize: '12px'
        }
      },
      {
        type: 'text',
        value: `Printed: ${new Date().toLocaleString('en-KE')}`,
        style: {
          textAlign: 'center',
          fontSize: '10px'
        }
      }
    );

    const options = {
      preview: false,
      silent: true,
      margin: '0 0 0 0',
      timeOutPerLine: 400,
      pageSize: 'A4', // Better compatibility than '80mm'
      copies: 1
    };

    if (printerName && printerName !== '') {
      options.printerName = printerName;
      log.info('Printing receipt to specific printer:', printerName);
    } else {
      log.info('Printing receipt to default printer');
    }

    await PosPrinter.print(printData, options);
    log.info('Receipt printed successfully to:', printerName || 'default printer');
    return { success: true, message: 'Receipt printed successfully' };
  } catch (error) {
    log.error('Print receipt failed:', error);
    return { success: false, message: `Print failed: ${error.message}` };
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

    // Basic capability info
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