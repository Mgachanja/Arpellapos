// src/utils/thermalPrinter.js
import { toast } from 'react-toastify';

let ipcRenderer = null;
try {
  ipcRenderer = (typeof window !== 'undefined' && window.require)
    ? window.require('electron').ipcRenderer
    : null;
} catch (err) {
  ipcRenderer = null;
}

// Helper: determine if running inside Electron renderer
const isElectron = () => {
  return !!(ipcRenderer && typeof window !== 'undefined' && window.process && window.process.type === 'renderer');
};

// Helper: convert various error/result shapes to a safe string for toast
function safeMessage(input, fallback = 'An unexpected error occurred') {
  if (!input) return fallback;
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message || String(input);
  if (typeof input === 'object') {
    if (input.message) return String(input.message);
    if (input.error) return String(input.error);
    try {
      return JSON.stringify(input);
    } catch (err) {
      return String(input);
    }
  }
  try {
    return String(input);
  } catch (err) {
    return fallback;
  }
}

// Helper: normalize result from ipcRenderer.invoke to { success, message, data }
function normalizeIpcResult(res) {
  if (res == null) return { success: true, message: '', data: null };
  if (typeof res === 'object') {
    const success = ('success' in res) ? Boolean(res.success) : true;
    const message = res.message || res.error || '';
    const data = res.data !== undefined ? res.data : res;
    return { success, message: safeMessage(message, ''), data };
  }
  // primitive truthy/falsey
  return { success: Boolean(res), message: '', data: res };
}

export const getThermalPrinters = async () => {
  if (!isElectron()) {
    console.warn('Not in Electron environment (getThermalPrinters)');
    return [];
  }

  try {
    const res = await ipcRenderer.invoke('get-printers');
    const { success, data } = normalizeIpcResult(res);
    // data expected to be array; if not, fallback to empty array
    return Array.isArray(data) ? data : (Array.isArray(res) ? res : []);
  } catch (error) {
    console.error('getThermalPrinters error:', error);
    toast.error(safeMessage(error, 'Failed to get available printers'));
    return [];
  }
};

export const connectThermalPrinter = async (printerName = '') => {
  if (!isElectron()) {
    toast.error('Thermal printing only available in desktop app');
    return false;
  }

  try {
    const res = await ipcRenderer.invoke('check-printer-status', printerName);
    const { success, data, message } = normalizeIpcResult(res);
    // check-printer-status returns object with available boolean or success flag
    const available = (data && data.available) || (res && res.available) || (!!success && !!(data && (data.count || data.printers)));
    if (available) {
      toast.success('Printer is ready');
      return true;
    } else {
      const userMsg = message || (data && data.message) || 'No thermal printer found';
      toast.error(safeMessage(userMsg, 'No thermal printer found'));
      return false;
    }
  } catch (error) {
    console.error('connectThermalPrinter error:', error);
    toast.error(safeMessage(error, 'Connection failed'));
    return false;
  }
};

export const disconnectThermalPrinter = async () => {
  // electron-pos-printer doesn't require explicit disconnect; keep API for parity
  toast.info('Printer disconnected');
  return true;
};

export const isThermalPrinterConnected = async (printerName = '') => {
  if (!isElectron()) return false;

  try {
    const res = await ipcRenderer.invoke('check-printer-status', printerName);
    const { data, message } = normalizeIpcResult(res);
    return !!(data && data.available) || !!(res && res.available);
  } catch (error) {
    console.error('isThermalPrinterConnected error:', error);
    return false;
  }
};

export const testThermalPrinter = async (printerName = '') => {
  if (!isElectron()) {
    toast.error('Thermal printing only available in desktop app');
    return false;
  }

  try {
    const res = await ipcRenderer.invoke('test-thermal-printer', printerName);
    const { success, message } = normalizeIpcResult(res);
    if (success) {
      toast.success('Test print sent successfully');
      return true;
    } else {
      toast.error(safeMessage(message, 'Test print failed'));
      return false;
    }
  } catch (error) {
    console.error('testThermalPrinter error:', error);
    toast.error(safeMessage(error, 'Test print failed'));
    return false;
  }
};

export const printOrderReceipt = async (orderData, printerName = '', storeSettings = {}) => {
  if (!isElectron()) {
    toast.error('Thermal printing only available in desktop app');
    throw new Error('Thermal printing not available');
  }

  try {
    // fallback: try to load saved store settings when none passed
    let settings = storeSettings;
    if (!settings || Object.keys(settings).length === 0) {
      try {
        const saved = localStorage.getItem('thermalPrinterStoreSettings');
        if (saved) settings = JSON.parse(saved);
      } catch (err) {
        // ignore parse errors; settings will be {}
        console.warn('Failed to parse saved store settings for print:', err);
      }
    }

    const res = await ipcRenderer.invoke('print-receipt', orderData, printerName, settings);
    const { success, message } = normalizeIpcResult(res);

    if (success) {
      toast.success('Receipt printed successfully');
      return true;
    } else {
      const msg = message || 'Print failed';
      toast.error(safeMessage(msg));
      throw new Error(msg);
    }
  } catch (error) {
    console.error('printOrderReceipt error:', error);
    const m = safeMessage(error, 'Print failed');
    toast.error(m);
    throw new Error(m);
  }
};

export const getSavedPrinter = () => {
  try {
    return localStorage.getItem('selectedThermalPrinter') || '';
  } catch (error) {
    console.error('getSavedPrinter error:', error);
    return '';
  }
};

export const savePrinterPreference = (printerName) => {
  try {
    localStorage.setItem('selectedThermalPrinter', printerName);
  } catch (error) {
    console.error('savePrinterPreference error:', error);
  }
};

export default {
  getThermalPrinters,
  connectThermalPrinter,
  disconnectThermalPrinter,
  isThermalPrinterConnected,
  testThermalPrinter,
  printOrderReceipt,
  getSavedPrinter,
  savePrinterPreference,
};
