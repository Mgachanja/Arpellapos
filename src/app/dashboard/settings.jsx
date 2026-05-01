import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Typography,
  CircularProgress,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  Card,
  CardContent,
  Grid,
  Paper,
  InputAdornment,
  IconButton,
  Tooltip
} from '@mui/material';
import { 
  AccessTime, 
  LocalShipping, 
  Settings as SettingsIcon, 
  Save as SaveIcon,
  AddCircleOutline,
  Edit as EditIcon
} from '@mui/icons-material';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { baseUrl } from '../constants'; // Note: adjusted path to constants
import { useSelector } from 'react-redux';
import { selectUser } from '../../redux/slices/userSlice';

const Settings = () => {
  const user = useSelector(selectUser);
  const token = user?.token || user?.user?.token || (Array.isArray(user?.user) && user?.user[0]?.token);

  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('18:00');
  const [deliveryFee, setDeliveryFee] = useState('0');

  const [settingsMap, setSettingsMap] = useState({});
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingOpening, setLoadingOpening] = useState(false);
  const [loadingClosing, setLoadingClosing] = useState(false);
  const [loadingDelivery, setLoadingDelivery] = useState(false);

  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchAllSettings();
  }, []);

  const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchAllSettings = async () => {
    setLoadingInit(true);
    try {
      const res = await fetch(`${baseUrl}/settings`, { 
        method: 'GET', 
        headers: getHeaders()
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to fetch settings: ${res.status} ${txt}`);
      }
      const data = await res.json();
      const map = {};
      if (Array.isArray(data)) {
        for (const s of data) {
          if (s?.settingName) map[s.settingName] = s;
        }
      }
      setSettingsMap(map);
      if (map['Delivery Fee']) setDeliveryFee(String(map['Delivery Fee'].settingValue ?? '0'));
      if (map['Opening Time']) setOpeningTime(String(map['Opening Time'].settingValue ?? openingTime));
      if (map['Closing Time']) setClosingTime(String(map['Closing Time'].settingValue ?? closingTime));
    } catch (err) {
      console.error(err);
      toast.error('Unable to load settings. Check network or server.');
    } finally {
      setLoadingInit(false);
    }
  };

  const validateDeliveryFee = () => {
    if (deliveryFee === '') {
      toast.error('Please enter a delivery fee.');
      return false;
    }
    const num = Number(deliveryFee);
    if (Number.isNaN(num) || num < 0) {
      toast.error('Please enter a valid non-negative delivery fee.');
      return false;
    }
    return true;
  };

  const createSetting = async (name, value) => {
    const body = { settingName: String(name), settingValue: String(value) };
    return fetch(`${baseUrl}/setting`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
  };

  const updateSetting = async (id, name, value) => {
    const body = { settingName: String(name), settingValue: String(value) };
    return fetch(`${baseUrl}/setting/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
  };

  const handleSaveOpening = async () => {
    if (!openingTime) {
      toast.error('Opening time is required.');
      return;
    }
    if (closingTime && openingTime >= closingTime) {
      toast.error('Opening time must be earlier than closing time.');
      return;
    }
    setLoadingOpening(true);
    try {
      const key = 'Opening Time';
      const existing = settingsMap[key];
      const res = existing ? await updateSetting(existing.id, key, openingTime) : await createSetting(key, openingTime);
      if (!res.ok) {
        let msg = `Status ${res.status}`;
        try {
          const j = await res.json();
          if (j?.message) msg = j.message;
        } catch (_) {}
        toast.error(`Failed to save opening time: ${msg}`);
      } else {
        toast.success('Opening time saved.');
        await fetchAllSettings();
      }
    } catch (err) {
      console.error('Save opening error', err);
      toast.error('Network error while saving opening time.');
    } finally {
      setLoadingOpening(false);
    }
  };

  const handleSaveClosing = async () => {
    if (!closingTime) {
      toast.error('Closing time is required.');
      return;
    }
    if (openingTime && openingTime >= closingTime) {
      toast.error('Closing time must be later than opening time.');
      return;
    }
    setLoadingClosing(true);
    try {
      const key = 'Closing Time';
      const existing = settingsMap[key];
      const res = existing ? await updateSetting(existing.id, key, closingTime) : await createSetting(key, closingTime);
      if (!res.ok) {
        let msg = `Status ${res.status}`;
        try {
          const j = await res.json();
          if (j?.message) msg = j.message;
        } catch (_) {}
        toast.error(`Failed to save closing time: ${msg}`);
      } else {
        toast.success('Closing time saved.');
        await fetchAllSettings();
      }
    } catch (err) {
      console.error('Save closing error', err);
      toast.error('Network error while saving closing time.');
    } finally {
      setLoadingClosing(false);
    }
  };

  const handleSaveDelivery = async () => {
    if (!validateDeliveryFee()) return;
    setLoadingDelivery(true);
    try {
      const key = 'Delivery Fee';
      const existing = settingsMap[key];
      const value = String(Number(deliveryFee));
      const res = existing ? await updateSetting(existing.id, key, value) : await createSetting(key, value);
      if (!res.ok) {
        let msg = `Status ${res.status}`;
        try {
          const j = await res.json();
          if (j?.message) msg = j.message;
        } catch (_) {}
        toast.error(`Failed to save delivery fee: ${msg}`);
      } else {
        toast.success('Delivery fee saved.');
        await fetchAllSettings();
      }
    } catch (err) {
      console.error('Save delivery error', err);
      toast.error('Network error while saving delivery fee.');
    } finally {
      setLoadingDelivery(false);
    }
  };

  const validateNew = () => {
    if (!newName || !newName.trim()) {
      toast.error('Setting name is required.');
      return false;
    }
    if (newValue === '' || newValue === null) {
      toast.error('Setting value is required.');
      return false;
    }
    return true;
  };

  const handleCreateOrUpdateNew = async () => {
    if (!validateNew()) return;
    setSavingNew(true);
    try {
      if (editingId) {
        const res = await updateSetting(editingId, newName.trim(), String(newValue));
        if (!res.ok) {
          let msg = `Status ${res.status}`;
          try {
            const j = await res.json();
            if (j?.message) msg = j.message;
          } catch (_) {}
          toast.error(`Failed to update setting: ${msg}`);
        } else {
          toast.success('Setting updated.');
          setNewName('');
          setNewValue('');
          setEditingId(null);
          await fetchAllSettings();
        }
      } else {
        const res = await createSetting(newName.trim(), String(newValue));
        if (!res.ok) {
          let msg = `Status ${res.status}`;
          try {
            const j = await res.json();
            if (j?.message) msg = j.message;
          } catch (_) {}
          toast.error(`Failed to create setting: ${msg}`);
        } else {
          toast.success('Setting created.');
          setNewName('');
          setNewValue('');
          await fetchAllSettings();
        }
      }
    } catch (err) {
      console.error('Save new setting error', err);
      toast.error('Network error while saving setting.');
    } finally {
      setSavingNew(false);
    }
  };

  const handleLoadSetting = (s) => {
    if (!s) return;
    const { settingName, settingValue, id } = s;
    if (settingName === 'Delivery Fee') setDeliveryFee(String(settingValue ?? '0'));
    if (settingName === 'Opening Time') setOpeningTime(String(settingValue ?? openingTime));
    if (settingName === 'Closing Time') setClosingTime(String(settingValue ?? closingTime));
    setNewName(settingName);
    setNewValue(String(settingValue ?? ''));
    setEditingId(id ?? null);
  };

  const handleCancelEdit = () => {
    setNewName('');
    setNewValue('');
    setEditingId(null);
  };

  if (loadingInit) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <CircularProgress size={48} sx={{ mb: 2 }} color="primary" />
        <Typography variant="h6" color="text.secondary">Loading Settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, margin: '0 auto' }}>
      <ToastContainer position="top-right" autoClose={3000} />
      
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <SettingsIcon sx={{ fontSize: 40, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="800" color="text.primary">
            Store Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your operational hours, delivery fees, and custom system variables.
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={4}>
        {/* Core Settings */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', height: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTime color="primary" /> Operational Hours
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <TextField
                    label="Opening Time"
                    type="time"
                    fullWidth
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    variant="outlined"
                  />
                  <Button
                    variant="contained"
                    onClick={handleSaveOpening}
                    disabled={loadingOpening}
                    sx={{ height: 56, minWidth: 120, borderRadius: 2 }}
                    startIcon={loadingOpening ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  >
                    Save
                  </Button>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <TextField
                    label="Closing Time"
                    type="time"
                    fullWidth
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    variant="outlined"
                  />
                  <Button
                    variant="contained"
                    onClick={handleSaveClosing}
                    disabled={loadingClosing}
                    sx={{ height: 56, minWidth: 120, borderRadius: 2 }}
                    startIcon={loadingClosing ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  >
                    Save
                  </Button>
                </Box>
              </Box>

              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 5 }}>
                <LocalShipping color="primary" /> Delivery Operations
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <TextField
                  label="Delivery Fee"
                  type="number"
                  fullWidth
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  InputProps={{ 
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    inputProps: { min: 0, step: 0.01 } 
                  }}
                  variant="outlined"
                />
                <Button
                  variant="contained"
                  onClick={handleSaveDelivery}
                  disabled={loadingDelivery}
                  sx={{ height: 56, minWidth: 120, borderRadius: 2 }}
                  startIcon={loadingDelivery ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                >
                  Save
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Custom Settings & Variables */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CardContent sx={{ p: 4, flex: 1 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AddCircleOutline color="primary" /> {editingId ? 'Edit Setting' : 'Custom Variables'}
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4, bgcolor: '#f8f9fa', p: 3, borderRadius: 2 }}>
                <TextField
                  label="Variable Name"
                  fullWidth
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  variant="outlined"
                  size="small"
                />
                <TextField
                  label="Variable Value"
                  fullWidth
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  variant="outlined"
                  size="small"
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleCreateOrUpdateNew}
                    disabled={savingNew}
                    startIcon={savingNew ? <CircularProgress size={18} color="inherit" /> : (editingId ? <SaveIcon /> : <AddCircleOutline />)}
                    sx={{ borderRadius: 2 }}
                  >
                    {editingId ? (savingNew ? 'Updating...' : 'Update') : (savingNew ? 'Saving...' : 'Create')}
                  </Button>
                  {editingId && (
                    <Button variant="outlined" onClick={handleCancelEdit} sx={{ borderRadius: 2 }}>
                      Cancel
                    </Button>
                  )}
                </Box>
              </Box>

              <Typography variant="subtitle1" fontWeight="bold" mb={2}>
                Registered Variables
              </Typography>
              <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto', borderRadius: 2 }}>
                <List dense disablePadding>
                  {Object.values(settingsMap).length === 0 ? (
                    <ListItem>
                      <ListItemText primary="No custom variables found." sx={{ color: 'text.secondary', fontStyle: 'italic', p: 2 }} />
                    </ListItem>
                  ) : (
                    Object.values(settingsMap).map((s, index) => (
                      <React.Fragment key={s.id}>
                        <ListItem
                          secondaryAction={
                            <Tooltip title="Edit Variable">
                              <IconButton edge="end" onClick={() => handleLoadSetting(s)} size="small" color="primary">
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          }
                          sx={{ '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}
                        >
                          <ListItemText
                            primary={<Typography variant="body2" fontWeight="bold">{s.settingName}</Typography>}
                            secondary={
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                Value: {s.settingValue}
                              </Typography>
                            }
                          />
                        </ListItem>
                        {index < Object.values(settingsMap).length - 1 && <Divider component="li" />}
                      </React.Fragment>
                    ))
                  )}
                </List>
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Settings;
