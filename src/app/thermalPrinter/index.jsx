// src/app/thermalPrinter/index.jsx - Updated settings component
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  getThermalPrinters,
  connectThermalPrinter,
  disconnectThermalPrinter,
  testThermalPrinter,
  isThermalPrinterConnected,
  getSavedPrinter,
  savePrinterPreference
} from './thermalPrinter';

export default function ThermalPrinterSettings({ show, onHide }) {
  const isModal = typeof show !== 'undefined';
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [storeSettings, setStoreSettings] = useState({
    storeName: 'YOUR STORE NAME',
    storeAddress: 'Store Address Line 1\nStore Address Line 2',
    storePhone: '+254 XXX XXX XXX',
    receiptFooter: 'Thank you for your business!\nPlease come again'
  });

  // Load printers and settings on component mount
  useEffect(() => {
    const loadData = async () => {
      // Load printers
      try {
        const printerList = await getThermalPrinters();
        setPrinters(printerList);
        
        // Load saved printer preference
        const savedPrinter = getSavedPrinter();
        if (savedPrinter && printerList.find(p => p.name === savedPrinter)) {
          setSelectedPrinter(savedPrinter);
        } else if (printerList.length > 0) {
          setSelectedPrinter(printerList[0].name);
        }
      } catch (error) {
        console.error('Failed to load printers:', error);
      }

      // Load store settings
      try {
        const saved = localStorage.getItem('thermalPrinterStoreSettings');
        if (saved) {
          setStoreSettings(JSON.parse(saved));
        }
      } catch (error) {
        console.error('Failed to load store settings:', error);
      }

      // Check connection status
      try {
        const connected = await isThermalPrinterConnected(selectedPrinter);
        setIsConnected(connected);
      } catch (error) {
        console.error('Failed to check connection status:', error);
        setIsConnected(false);
      }
    };

    loadData();
  }, []);

  const handleConnect = async () => {
    if (!selectedPrinter) {
      toast.error('Please select a printer first');
      return;
    }

    setIsConnecting(true);
    try {
      const connected = await connectThermalPrinter(selectedPrinter);
      setIsConnected(connected);
      if (connected) {
        savePrinterPreference(selectedPrinter);
        toast.success(`Connected to ${selectedPrinter}`);
      }
    } catch (error) {
      console.error('Connection failed:', error);
      toast.error('Failed to connect to printer');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectThermalPrinter();
      setIsConnected(false);
      toast.success('Printer disconnected');
    } catch (error) {
      console.error('Disconnect failed:', error);
      toast.error('Failed to disconnect printer');
    }
  };

  const handleTestPrint = async () => {
    if (!selectedPrinter) {
      toast.error('Please select a printer first');
      return;
    }

    setIsTesting(true);
    try {
      await testThermalPrinter(selectedPrinter);
    } catch (error) {
      console.error('Test print failed:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const handlePrinterChange = (newPrinter) => {
    setSelectedPrinter(newPrinter);
    setIsConnected(false); // Reset connection status when changing printers
    savePrinterPreference(newPrinter);
  };

  const handleStoreSettingsChange = (field, value) => {
    setStoreSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveStoreSettings = () => {
    try {
      localStorage.setItem('thermalPrinterStoreSettings', JSON.stringify(storeSettings));
      toast.success('Store settings saved');
    } catch (err) {
      console.error('saveStoreSettings failed', err);
      toast.error('Failed to save settings');
    }
  };

  const refreshPrinters = async () => {
    try {
      const printerList = await getThermalPrinters();
      setPrinters(printerList);
      toast.success('Printer list refreshed');
    } catch (error) {
      toast.error('Failed to refresh printer list');
    }
  };

  const Header = ({ title, onClose }) => (
    <div className="d-flex align-items-center justify-content-between mb-4">
      <h2 className="h4 mb-0 d-flex align-items-center">
        <i className="fas fa-print me-2" />
        {title}
      </h2>
      {onClose && (
        <button onClick={onClose} className="btn btn-sm btn-outline-secondary" aria-label="Close">
          Close
        </button>
      )}
    </div>
  );

  const ConnectionPanel = () => (
    <div className={`p-3 rounded-3 ${isConnected ? 'border-success bg-light' : 'border-secondary bg-white'}`} style={{ borderWidth: 2 }}>
      <div className="d-flex align-items-center mb-3">
        <span 
          className="me-3 d-inline-block rounded-circle" 
          style={{ 
            width: 12, 
            height: 12, 
            backgroundColor: isConnected ? '#28a745' : '#dc3545' 
          }} 
        />
        <strong className="me-2">Status:</strong>
        <span className={isConnected ? 'text-success' : 'text-danger'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <label className="form-label mb-0">Select Printer</label>
          <button 
            className="btn btn-sm btn-outline-secondary" 
            onClick={refreshPrinters}
            title="Refresh printer list"
          >
            <i className="fas fa-sync-alt" />
          </button>
        </div>
        <select 
          className="form-select" 
          value={selectedPrinter} 
          onChange={e => handlePrinterChange(e.target.value)}
          disabled={isConnecting || isTesting}
        >
          <option value="">Select a printer...</option>
          {printers.map(p => (
            <option key={p.name} value={p.name}>
              {p.name} {p.isDefault ? '(Default)' : ''}
            </option>
          ))}
        </select>
      </div>
      
      <div className="d-flex gap-2 flex-wrap">
        {!isConnected ? (
          <button 
            onClick={handleConnect} 
            disabled={isConnecting || !selectedPrinter} 
            className="btn btn-success btn-sm"
          >
            {isConnecting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        ) : (
          <>
            <button 
              onClick={handleTestPrint} 
              disabled={isTesting || !selectedPrinter} 
              className="btn btn-warning btn-sm"
            >
              {isTesting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Testing...
                </>
              ) : (
                'Test Print'
              )}
            </button>
            <button 
              onClick={handleDisconnect} 
              className="btn btn-outline-danger btn-sm"
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      
      {printers.length === 0 && (
        <div className="alert alert-warning mt-3 mb-0">
          <i className="fas fa-exclamation-triangle me-2" />
          No printers detected. Make sure your thermal printer is connected and installed.
        </div>
      )}
    </div>
  );

  const StoreSettingsPanel = () => (
    <div className="border rounded-3 p-3">
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label small fw-bold">Store Name</label>
          <input 
            type="text" 
            className="form-control" 
            value={storeSettings.storeName} 
            onChange={e => handleStoreSettingsChange('storeName', e.target.value)}
            placeholder="Enter your store name"
          />
        </div>
        <div className="col-12">
          <label className="form-label small fw-bold">Store Address</label>
          <textarea 
            className="form-control" 
            rows="3" 
            value={storeSettings.storeAddress} 
            onChange={e => handleStoreSettingsChange('storeAddress', e.target.value)}
            placeholder="Enter your store address"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Store Phone</label>
          <input 
            type="text" 
            className="form-control" 
            value={storeSettings.storePhone} 
            onChange={e => handleStoreSettingsChange('storePhone', e.target.value)}
            placeholder="+254 XXX XXX XXX"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Receipt Footer</label>
          <textarea 
            className="form-control" 
            rows="2" 
            value={storeSettings.receiptFooter} 
            onChange={e => handleStoreSettingsChange('receiptFooter', e.target.value)}
            placeholder="Thank you message"
          />
        </div>
        <div className="col-12">
          <button 
            className="btn btn-primary" 
            onClick={saveStoreSettings}
          >
            <i className="fas fa-save me-2" />
            Save Store Settings
          </button>
        </div>
      </div>
    </div>
  );

  // Render mode: modal or page
  if (isModal) {
    return (
      <div 
        className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" 
        style={{ zIndex: 1050, background: 'rgba(0,0,0,0.5)' }}
      >
        <div 
          className="bg-white rounded shadow-lg" 
          style={{ width: 'min(800px, 95%)', maxHeight: '90vh', overflowY: 'auto' }}
        >
          <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
            <h3 className="mb-0 d-flex align-items-center">
              <i className="fas fa-print me-2" /> 
              Thermal Printer Settings
            </h3>
            <button className="btn btn-light btn-sm" onClick={onHide}>
              <i className="fas fa-times" />
            </button>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <Header title="Printer Connection" />
              <ConnectionPanel />
            </div>
            <div className="mb-4">
              <Header title="Store Information" />
              <StoreSettingsPanel />
            </div>
            <div className="d-flex justify-content-end">
              <button className="btn btn-secondary" onClick={onHide}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3">
      <div className="card shadow-sm">
        <div className="card-body">
          <Header title="Thermal Printer Settings" />
          
          <div className="mb-4">
            <h5 className="mb-3">Printer Connection</h5>
            <ConnectionPanel />
          </div>
          
          <div className="mb-4">
            <h5 className="mb-3">Store Information</h5>
            <StoreSettingsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}