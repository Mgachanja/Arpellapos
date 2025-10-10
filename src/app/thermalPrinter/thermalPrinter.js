// src/app/thermalPrinter/thermalPrinter.js
import { toast } from 'react-toastify';

const { ipcRenderer } = (typeof window !== 'undefined' && window.require) ? window.require('electron') : { ipcRenderer: null };

const isElectron = () => {
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer' && ipcRenderer;
};

// Small renderer-side cache to avoid hammering IPC frequently
const PRINTER_TTL_MS = 3000;
let _printerCache = { data: null, ts: 0, inFlight: null };

function formatError(err, maxLength = 400) {
  if (!err && err !== 0) return 'Unknown error';
  // If it's a string already, return trimmed
  if (typeof err === 'string') return err.length > maxLength ? err.slice(0, maxLength) + '…' : err;
  // If it's an Error instance
  if (err instanceof Error) {
    const msg = err.message || String(err);
    return msg.length > maxLength ? msg.slice(0, maxLength) + '…' : msg;
  }
  // If it's an object, try common fields
  try {
    if (typeof err === 'object') {
      if (err.message && typeof err.message === 'string') {
        return err.message.length > maxLength ? err.message.slice(0, maxLength) + '…' : err.message;
      }
      if (err.error && typeof err.error === 'string') {
        return err.error.length > maxLength ? err.error.slice(0, maxLength) + '…' : err.error;
      }
      if (err.data && typeof err.data === 'string') {
        return err.data.length > maxLength ? err.data.slice(0, maxLength) + '…' : err.data;
      }
      // Fall back to JSON.stringify but limit depth/size
      const json = JSON.stringify(err, replacerForStringify, 2);
      return json.length > maxLength ? json.slice(0, maxLength) + '…' : json;
    }
  } catch (e) {
    // fallback
  }
  // Fallback generic conversion
  try {
    const s = String(err);
    return s.length > maxLength ? s.slice(0, maxLength) + '…' : s;
  } catch (e) {
    return 'Unknown error';
  }
}

function replacerForStringify(key, value) {
  // avoid circular structures or huge nested objects: replace functions and DOM nodes
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Element) return `[Element ${value.tagName}]`;
  return value;
}

export const getThermalPrinters = async () => {
  if (!isElectron()) {
    console.warn('Not in Electron environment');
    return [];
  }

  const now = Date.now();
  if (_printerCache.data && (now - _printerCache.ts) < PRINTER_TTL_MS) {
    return _printerCache.data;
  }

  if (_printerCache.inFlight) {
    try {
      return await _printerCache.inFlight;
    } catch (err) {
      _printerCache.inFlight = null;
    }
  }

  _printerCache.inFlight = (async () => {
    try {
      const printers = await ipcRenderer.invoke('get-printers');
      _printerCache.data = printers || [];
      _printerCache.ts = Date.now();
      _printerCache.inFlight = null;
      return _printerCache.data;
    } catch (error) {
      console.error('Failed to get printers (renderer):', error);
      const msg = formatError(error, 200);
      toast.error(`Failed to get available printers: ${msg}`);
      _printerCache.data = [];
      _printerCache.ts = Date.now();
      _printerCache.inFlight = null;
      return [];
    }
  })();

  return await _printerCache.inFlight;
};

export const connectThermalPrinter = async (printerName = '') => {
  if (!isElectron()) {
    toast.error('Thermal printing only available in desktop app');
    return false;
  }

  try {
    const status = await ipcRenderer.invoke('check-printer-status', printerName);
    if (status && status.available) {
      return true;
    } else {
      const reason = status && (status.message || status.error) ? formatError(status, 200) : 'Printer not available';
      toast.error(`Printer not available: ${reason}`);
      return false;
    }
  } catch (error) {
    console.error('Failed to connect to printer (renderer):', error);
    toast.error(`Connection failed: ${formatError(error, 200)}`);
    return false;
  }
};

export const disconnectThermalPrinter = async () => {
  toast.info('Printer disconnected');
  return true;
};

export const isThermalPrinterConnected = async (printerName = '') => {
  if (!isElectron()) return false;
  try {
    const status = await ipcRenderer.invoke('check-printer-status', printerName);
    return Boolean(status && status.available);
  } catch (error) {
    console.error('Failed to check printer status (renderer):', error);
    return false;
  }
};

export const testThermalPrinter = async (printerName = '') => {
  if (!isElectron()) {
    toast.error('Thermal printing only available in desktop app');
    return false;
  }

  try {
    const result = await ipcRenderer.invoke('test-thermal-printer', printerName);
    // normalize response shapes: support { success: true } or { ok: true } etc.
    if (result && (result.success === true || result.ok === true)) {
      toast.success('Test print sent');
      return true;
    } else {
      const messageCandidate = (result && (result.message || result.error || result.msg)) || 'Test print failed';
      const msg = formatError(messageCandidate, 300);
      toast.error(`Test print failed: ${msg}`);
      return false;
    }
  } catch (error) {
    console.error('Test print failed (renderer):', error);
    toast.error(`Test print failed: ${formatError(error, 300)}`);
    return false;
  }
};

export const printOrderReceipt = async (orderData, printerName = '', storeSettings = {}) => {
  if (!isElectron()) {
    toast.error('Thermal printing only available in desktop app');
    throw new Error('Thermal printing not available');
  }

  try {
    let settings = storeSettings;
    if (!settings || Object.keys(settings).length === 0) {
      try {
        const saved = localStorage.getItem('thermalPrinterStoreSettings');
        if (saved) settings = JSON.parse(saved);
      } catch (error) {
        console.warn('Failed to load store settings (renderer) for print:', error);
      }
    }

    const result = await ipcRenderer.invoke('print-receipt', orderData, printerName, settings);
    if (result && (result.success === true || result.ok === true)) {
      toast.success('Receipt printed successfully');
      return true;
    } else {
      const message = (result && (result.message || result.error || result.msg)) ? formatError(result.message || result.error || result.msg, 400) : 'Unknown print error';
      toast.error(`Print failed: ${message}`);
      throw new Error(message);
    }
  } catch (error) {
    console.error('Print receipt failed (renderer):', error);
    const msg = formatError(error, 400);
    toast.error(`Print failed: ${msg}`);
    throw new Error(msg);
  }
};

export const getSavedPrinter = () => {
  try {
    return localStorage.getItem('selectedThermalPrinter') || '';
  } catch (error) {
    console.error('Failed to get saved printer:', error);
    return '';
  }
};

export const savePrinterPreference = (printerName) => {
  try {
    localStorage.setItem('selectedThermalPrinter', printerName);
  } catch (error) {
    console.error('Failed to save printer preference:', error);
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
