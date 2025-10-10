// src/utils/thermalPrinter.js - Updated renderer process code

import { toast } from 'react-toastify';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

// Check if we're in Electron environment
const isElectron = () => {
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
};

export const getThermalPrinters = async () => {
  if (!isElectron() || !ipcRenderer) {
    console.warn('Not in Electron environment');
    return [];
  }
  
  try {
    const printers = await ipcRenderer.invoke('get-printers');
    return printers || [];
  } catch (error) {
    console.error('Failed to get printers:', error);
    toast.error('Failed to get available printers');
    return [];
  }
};

export const connectThermalPrinter = async (printerName = '') => {
  if (!isElectron() || !ipcRenderer) {
    toast.error('Thermal printing only available in desktop app');
    return false;
  }

  try {
    const status = await ipcRenderer.invoke('check-printer-status', printerName);
    if (status.available) {
      toast.success('Printer is ready');
      return true;
    } else {
      toast.error('No thermal printer found');
      return false;
    }
  } catch (error) {
    console.error('Failed to connect to printer:', error);
    toast.error(`Connection failed: ${error.message}`);
    return false;
  }
};

export const disconnectThermalPrinter = async () => {
  // electron-pos-printer doesn't need explicit disconnect
  toast.info('Printer disconnected');
  return true;
};

export const isThermalPrinterConnected = async (printerName = '') => {
  if (!isElectron() || !ipcRenderer) {
    return false;
  }
  
  try {
    const status = await ipcRenderer.invoke('check-printer-status', printerName);
    return status.available;
  } catch (error) {
    console.error('Failed to check printer status:', error);
    return false;
  }
};

export const testThermalPrinter = async (printerName = '') => {
  if (!isElectron() || !ipcRenderer) {
    toast.error('Thermal printing only available in desktop app');
    return false;
  }

  try {
    const result = await ipcRenderer.invoke('test-thermal-printer', printerName);
    if (result.success) {
      toast.success('Test print sent successfully');
      return true;
    } else {
      toast.error(`Test print failed: ${result}`);
      return false;
    }
  } catch (error) {
    console.error('Test print failed:', error);
    toast.error(`Test print failed: ${error}`);
    return false;
  }
};

export const printOrderReceipt = async (orderData, printerName = '', storeSettings = {}) => {
  if (!isElectron() || !ipcRenderer) {
    toast.error('Thermal printing only available in desktop app');
    throw new Error('Thermal printing not available');
  }

  try {
    // Get store settings from localStorage if not provided
    let settings = storeSettings;
    if (Object.keys(settings).length === 0) {
      try {
        const saved = localStorage.getItem('thermalPrinterStoreSettings');
        if (saved) {
          settings = JSON.parse(saved);
        }
      } catch (error) {
        console.error('Failed to load store settings:', error);
      }
    }

    const result = await ipcRenderer.invoke('print-receipt', orderData, printerName, settings);
    
    if (result.success) {
      toast.success('Receipt printed successfully');
      return true;
    } else {
      toast.error(`Print failed: ${result}`);
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Print receipt failed:', error);
    toast.error(`Print failed: ${error}`);
    throw error;
  }
};

// Utility to get saved printer preference
export const getSavedPrinter = () => {
  try {
    return localStorage.getItem('selectedThermalPrinter') || '';
  } catch (error) {
    console.error('Failed to get saved printer:', error);
    return '';
  }
};

// Utility to save printer preference
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