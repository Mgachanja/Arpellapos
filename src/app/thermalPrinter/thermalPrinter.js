// src/utils/thermalPrinter.js
import { toast } from 'react-toastify';

const { ipcRenderer } = (typeof window !== 'undefined' && window.require) ? window.require('electron') : { ipcRenderer: null };

const isElectron = () => {
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer' && ipcRenderer;
};

// Small renderer-side cache to avoid hammering IPC frequently
const PRINTER_TTL_MS = 3000;
let _printerCache = { data: null, ts: 0, inFlight: null };

export const getThermalPrinters = async () => {
  if (!isElectron()) {
    console.warn('Not in Electron environment');
    return [];
  }

  // Use cache if fresh
  const now = Date.now();
  if (_printerCache.data && (now - _printerCache.ts) < PRINTER_TTL_MS) {
    return _printerCache.data;
  }

  // If in-flight, return the same promise
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
      // only surface a single toast to avoid toast spam
      toast.error('Failed to get available printers');
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
      return false;
    }
  } catch (error) {
    console.error('Failed to connect to printer (renderer):', error);
    toast.error('Connection failed');
    return false;
  }
};

export const disconnectThermalPrinter = async () => {
  // App-level disconnect isn't required for electron-pos-printer
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
    if (result && result.success) {
      return true;
    } else {
      // Provide the message as toast only once
      const msg = result && result.message ? result.message : 'Test print failed';
      toast.error(`Test print failed: ${msg}`);
      return false;
    }
  } catch (error) {
    console.error('Test print failed (renderer):', String(error));
    toast.error('Test print failed');
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
    if (result && result.success) {
      toast.success('Receipt printed successfully');
      return true;
    } else {
      const message = (result && result.message) ? result.message : 'Unknown print error';
      toast.error(`Print failed: ${String(message)}`);
      throw new Error(message);
    }
  } catch (error) {
    console.error('Print receipt failed (renderer):', String(error));
    toast.error(`Print failed: ${String(error.message || error)}`);
    throw error;
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
    // update renderer-side cache to avoid an immediate re-fetch
    if (_printerCache.data && !_printerCache.data.find(p => p.name === printerName)) {
      // don't modify the source-of-truth; just let next refresh pick it up
    }
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
