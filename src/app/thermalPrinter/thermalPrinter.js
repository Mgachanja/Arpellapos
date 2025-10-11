// src/screens/thermalPrinter/thermalPrinter.js

const isElectron = !!(typeof window !== 'undefined' && window.require && window.require('electron'));
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

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
    // Ensure all required fields exist
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
 * Test print to verify thermal printer is working
 * @param {string} printerName - Name of printer to test
 * @returns {Promise<Object>} Result object with success status
 */
export const testThermalPrinter = async (printerName = null) => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return { success: false, message: 'Not in Electron environment' };
  }

  try {
    console.log('Testing printer:', printerName || 'default');
    
    const result = await ipcRenderer.invoke('test-thermal-printer', printerName);
    
    if (result?.success) {
      console.log('Printer test successful');
      return { success: true, message: 'Printer test successful' };
    } else {
      console.error('Printer test failed:', result?.message);
      return { success: false, message: result?.message || 'Printer test failed' };
    }
  } catch (error) {
    console.error('Error in testThermalPrinter:', error);
    return {
      success: false,
      message: error?.message || 'Failed to test printer'
    };
  }
};

/**
 * Get list of available printers
 * @returns {Promise<Array>} List of available printers
 */
export const getAvailablePrinters = async () => {
  if (!isElectron || !ipcRenderer) {
    console.warn('Not running in Electron environment');
    return [];
  }

  try {
    const printers = await ipcRenderer.invoke('get-printers');
    console.log('Available printers:', printers);
    return Array.isArray(printers) ? printers : [];
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
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