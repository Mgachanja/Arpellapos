// src/screens/thermalPrinter/thermalPrinter.js
const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

// Internal state for printer connection and preferences
let connectedPrinter = null;
let printerCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5000; // 5 seconds cache

export const getThermalPrinters = async () => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return [];
  }

  try {
    const now = Date.now();
    if (printerCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('Using cached printer list');
      return printerCache;
    }

    const printers = await ipcRenderer.invoke('get-printers');
    console.log('Available printers:', printers);
    printerCache = Array.isArray(printers) ? printers : [];
    cacheTimestamp = now;
    return printerCache;
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
};

export const connectThermalPrinter = async (printerName) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return false;
  }

  if (!printerName || typeof printerName !== 'string') {
    console.error('Invalid printer name');
    return false;
  }

  try {
    const printers = await getThermalPrinters();
    const printerExists = printers.some(p => p.name === printerName);
    if (printerExists) {
      connectedPrinter = printerName;
      console.log('Connected to printer:', printerName);
      return true;
    } else {
      console.error('Printer not found:', printerName);
      return false;
    }
  } catch (error) {
    console.error('Connection failed:', error);
    connectedPrinter = null;
    return false;
  }
};

export const disconnectThermalPrinter = async () => {
  try {
    console.log('Disconnecting from printer:', connectedPrinter);
    connectedPrinter = null;
    return true;
  } catch (error) {
    console.error('Disconnect failed:', error);
    return false;
  }
};

export const testThermalPrinter = async (printerName = null) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return false;
  }

  const nameToTest = printerName || connectedPrinter;

  try {
    console.log('Testing printer:', nameToTest || 'default');
    const result = await ipcRenderer.invoke('test-thermal-printer', nameToTest);
    if (result?.success) {
      console.log('Printer test successful');
      return true;
    } else {
      console.error('Printer test failed:', result?.message);
      return false;
    }
  } catch (error) {
    console.error('Error in testThermalPrinter:', error);
    return false;
  }
};

export const isThermalPrinterConnected = async (printerName = null) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return false;
  }

  const nameToCheck = printerName || connectedPrinter;

  try {
    if (!nameToCheck) {
      return false;
    }

    console.log('Checking connection status:', nameToCheck);
    const status = await ipcRenderer.invoke('check-printer-status', nameToCheck);
    const isConnected = status?.available === true;
    console.log('Printer connection status:', isConnected);
    return isConnected;
  } catch (error) {
    console.error('Error checking printer connection:', error);
    return false;
  }
};

export const getSavedPrinter = () => {
  try {
    const saved = localStorage.getItem('thermalPrinterPreference');
    return saved || null;
  } catch (err) {
    console.warn('Failed to get saved printer preference:', err);
    return null;
  }
};

export const savePrinterPreference = (printerName) => {
  try {
    if (printerName) {
      localStorage.setItem('thermalPrinterPreference', printerName);
      console.log('Saved printer preference:', printerName);
      return true;
    } else {
      localStorage.removeItem('thermalPrinterPreference');
      console.log('Cleared printer preference');
      return true;
    }
  } catch (err) {
    console.error('Failed to save printer preference:', err);
    return false;
  }
};

/**
 * Print order receipt to thermal printer
 * - Uses ipcRenderer.invoke('print-receipt', orderData, printerName, storeSettings)
 * - Returns the result object from main process, or a safe failure object
 */
export const printOrderReceipt = async (receiptData, printerName = null, storeSettings = {}) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment - skipping thermal print');
    return { success: false, message: 'Not in Electron environment' };
  }

  if (!receiptData) {
    console.error('No receipt data provided');
    return { success: false, message: 'No receipt data provided' };
  }

  try {
    // Normalize incoming data and ensure numbers exist
    const {
      cart = [],
      cartTotal = 0,
      paymentType = 'cash',
      paymentData = {},
      user = {},
      orderNumber = '',
      customerPhone = ''
    } = receiptData || {};

    // Sanitize items
    const normalizedCart = (Array.isArray(cart) ? cart : []).map(item => {
      const salePrice = Number(item.salePrice ?? item.price ?? 0) || 0;
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      return {
        name: item.name || item.productName || 'Item',
        productName: item.name || item.productName || 'Item',
        quantity: qty,
        qty,
        salePrice,
        price: salePrice,
        priceType: item.priceType || 'Retail',
        barcode: item.barcode || '',
        lineTotal: Number(item.lineTotal ?? item.total ?? (salePrice * qty)) || (salePrice * qty)
      };
    });

    const printPayload = {
      cart: normalizedCart,
      cartTotal: Number(cartTotal) || normalizedCart.reduce((s, it) => s + (it.lineTotal || 0), 0),
      paymentType: String(paymentType).toLowerCase(),
      paymentData: {
        cashAmount: Number(paymentData.cashAmount) || 0,
        mpesaAmount: Number(paymentData.mpesaAmount) || 0,
        change: Number(paymentData.change) || 0
      },
      user: {
        firstName: user.firstName || user.first_name || '',
        lastName: user.lastName || user.last_name || '',
        fullName: user.fullName || user.full_name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        phone: user.phone || user.phoneNumber || '',
        userName: user.userName || user.username || ''
      },
      orderNumber: String(orderNumber || ''),
      customerPhone: String(customerPhone || '').trim()
    };

    console.log('printOrderReceipt -> invoking print-receipt', {
      items: printPayload.cart.length,
      cartTotal: printPayload.cartTotal,
      orderNumber: printPayload.orderNumber,
      cashier: printPayload.user.fullName
    });

    // Invoke main process handler - pass store settings as third arg
    const result = await ipcRenderer.invoke('print-receipt', printPayload, printerName, storeSettings);

    if (result?.success) {
      console.log('printOrderReceipt: success', result);
      return { success: true, message: result?.message || 'Printed' };
    } else {
      console.error('printOrderReceipt: failure', result);
      return { success: false, message: result?.message || 'Print failed (no details)' };
    }
  } catch (error) {
    console.error('Error in printOrderReceipt:', error);
    return { success: false, message: error?.message || 'Failed to print receipt' };
  }
};

export const getAvailablePrinters = async () => {
  return await getThermalPrinters();
};

export const checkPrinterStatus = async (printerName = null) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return { available: false };
  }

  try {
    const status = await ipcRenderer.invoke('check-printer-status', printerName);
    return status || { available: false };
  } catch (error) {
    console.error('Error checking printer status:', error);
    return { available: false, error: error?.message };
  }
};

export const getPrinterCapabilities = async (printerName) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return { success: false };
  }

  try {
    const capabilities = await ipcRenderer.invoke('get-printer-capabilities', printerName);
    return capabilities || { success: false };
  } catch (error) {
    console.error('Error getting printer capabilities:', error);
    return { success: false, error: error?.message };
  }
};

export const checkReceiptLogo = async () => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return { available: false };
  }

  try {
    const logoInfo = await ipcRenderer.invoke('check-receipt-logo');
    return logoInfo || { available: false };
  } catch (error) {
    console.error('Error checking receipt logo:', error);
    return { available: false, error: error?.message };
  }
};
