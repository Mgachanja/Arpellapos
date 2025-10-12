// src/screens/thermalPrinter/thermalPrinter.js

const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

// Internal state for printer connection and preferences
let connectedPrinter = null;
let printerCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5000; // 5 seconds cache

/**
 * Get list of thermal printers - fetched from Electron main process
 * @returns {Promise<Array>} List of available thermal printers
 */
export const getThermalPrinters = async () => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return [];
  }

  try {
    // Use cache if still valid
    const now = Date.now();
    if (printerCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('Using cached printer list');
      return printerCache;
    }

    const printers = await ipcRenderer.invoke('get-printers');
    console.log('Available printers:', printers);
    
    // Update cache
    printerCache = Array.isArray(printers) ? printers : [];
    cacheTimestamp = now;
    
    return printerCache;
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
};

/**
 * Connect to a specific thermal printer
 * @param {string} printerName - Name of the printer to connect to
 * @returns {Promise<boolean>} True if connection successful
 */
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
    console.log('Connecting to printer:', printerName);
    
    // For now, we just validate the printer exists
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

/**
 * Disconnect from current thermal printer
 * @returns {Promise<boolean>} True if disconnected
 */
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

/**
 * Test print to verify thermal printer is working
 * @param {string} printerName - Name of printer to test
 * @returns {Promise<boolean>} True if test print successful
 */
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

/**
 * Check if thermal printer is connected
 * @param {string} printerName - Name of printer to check (optional)
 * @returns {Promise<boolean>} True if printer is connected
 */
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

/**
 * Get saved printer preference from localStorage
 * @returns {string|null} Saved printer name or null
 */
export const getSavedPrinter = () => {
  try {
    const saved = localStorage.getItem('thermalPrinterPreference');
    return saved || null;
  } catch (err) {
    console.warn('Failed to get saved printer preference:', err);
    return null;
  }
};

/**
 * Save printer preference to localStorage
 * @param {string} printerName - Printer name to save
 * @returns {boolean} True if saved successfully
 */
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
 * @param {Object} receiptData - Receipt data with order details
 * @returns {Promise<Object>} Result object with success status
 */
export const printOrderReceipt = async (receiptData) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment - skipping thermal print');
    return { success: false, message: 'Not in Electron environment' };
  }

  if (!receiptData) {
    console.error('No receipt data provided');
    return { success: false, message: 'No receipt data provided' };
  }

  try {
    const {
      cart = [],
      cartTotal = 0,
      paymentType = 'cash',
      paymentData = {},
      user = {},
      orderNumber = '',
      customerPhone = '',
      storeSettings = {}
    } = receiptData;

    // Validate cart
    if (!Array.isArray(cart) || cart.length === 0) {
      console.error('Invalid or empty cart in receipt data');
      return { success: false, message: 'Invalid cart data' };
    }

    // Prepare the data for the main process
    const printData = {
      cart: cart.map(item => ({
        name: item.name || item.productName || 'Item',
        productName: item.name || item.productName || 'Item',
        quantity: item.quantity || item.qty || 1,
        qty: item.quantity || item.qty || 1,
        salePrice: item.salePrice || item.price || 0,
        price: item.salePrice || item.price || 0,
        priceType: item.priceType || 'Retail',
        barcode: item.barcode || '',
        lineTotal: item.lineTotal || item.total || (item.price * item.quantity) || 0
      })),
      cartTotal: Number(cartTotal) || 0,
      paymentType: String(paymentType).toLowerCase(),
      paymentData: {
        cashAmount: Number(paymentData.cashAmount) || 0,
        mpesaAmount: Number(paymentData.mpesaAmount) || 0,
        change: Number(paymentData.change) || 0
      },
      user: {
        firstName: user.firstName || user.first_name || 'Staff',
        lastName: user.lastName || user.last_name || '',
        fullName: user.fullName || user.full_name || `${user.firstName || 'Staff'} ${user.lastName || ''}`.trim(),
        phone: user.phone || user.phoneNumber || '',
        userName: user.userName || user.username || ''
      },
      orderNumber: String(orderNumber || ''),
      customerPhone: String(customerPhone || '').trim()
    };

    // Prepare store settings with defaults
    const defaultStoreSettings = {
      storeName: 'ARPELLA STORE LIMITED',
      storeAddress: 'Ngong, Matasia',
      storePhone: '+254 7xx xxx xxx',
      pin: 'P052336649L',
      receiptFooter: 'Thank you for your business!'
    };

    const finalStoreSettings = {
      ...defaultStoreSettings,
      ...storeSettings
    };

    console.log('Sending receipt to thermal printer:', {
      cartItems: printData.cart.length,
      cartTotal: printData.cartTotal,
      paymentType: printData.paymentType,
      storeSettings: finalStoreSettings
    });

    // Call the main process to print
    const result = await ipcRenderer.invoke('print-receipt', printData, null, finalStoreSettings);

    if (result?.success) {
      console.log('Receipt printed successfully');
      return { success: true, message: 'Receipt printed successfully' };
    } else {
      console.error('Main process returned error:', result?.message);
      return { success: false, message: result?.message || 'Print failed' };
    }
  } catch (error) {
    console.error('Error in printOrderReceipt:', error);
    return {
      success: false,
      message: error?.message || 'Failed to print receipt'
    };
  }
};

/**
 * Get list of available printers
 * @returns {Promise<Array>} List of available printers
 */
export const getAvailablePrinters = async () => {
  return await getThermalPrinters();
};

/**
 * Check printer status
 * @param {string} printerName - Name of printer to check
 * @returns {Promise<Object>} Printer status object
 */
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

/**
 * Get printer capabilities
 * @param {string} printerName - Name of printer
 * @returns {Promise<Object>} Printer capabilities
 */
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

/**
 * Check receipt logo availability
 * @returns {Promise<Object>} Logo availability object
 */
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