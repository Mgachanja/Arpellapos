import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
  Grid,
  Chip,
  IconButton
} from '@mui/material';
import { Save as SaveIcon, Send as SendIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { MdSms } from 'react-icons/md';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import apiService from '../../services/api';
import Swal from 'sweetalert2';

const SmsTemplate = () => {
  const [tabIndex, setTabIndex] = useState(0);
  
  // Create state
  const [newTemplateType, setNewTemplateType] = useState('');
  const [newContent, setNewContent] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Send state
  const [templates, setTemplates] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  const fetchTemplates = async () => {
    setFetchLoading(true);
    try {
      const response = await apiService.getSmsTemplates();
      const data = response.data?.data || response.data || [];
      const templatesList = Array.isArray(data) ? data : [];
      
      const ignoredTemplates = [
        'CustomerOrderCreationMessage',
        'OrderManagerOrderCreationMessage',
        'OTP',
        'ChangeInOrderStatusMessage',
        'ForgotPasswordTemplate'
      ];
      
      const filteredTemplates = templatesList.filter(
        t => !ignoredTemplates.includes(t.templateType)
      );
      
      setTemplates(filteredTemplates);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      toast.error('Failed to load SMS templates.');
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    if (tabIndex === 0) {
      fetchTemplates();
    }
  }, [tabIndex]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newTemplateType.trim() || !newContent.trim()) {
      toast.error('Both Template Type and Content are required.');
      return;
    }

    setCreateLoading(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        templateType: newTemplateType.trim(),
        content: newContent,
        createdAt: now,
        updatedAt: now
      };

      await apiService.sendSmsTemplate(payload);
      toast.success('SMS template created successfully.');
      setNewTemplateType('');
      setNewContent('');
      // Switch to send tab after creating
      setTabIndex(0);
    } catch (error) {
      console.error('Failed to create SMS template:', error);
      toast.error(error?.response?.data?.message || 'Failed to create SMS template. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSendTemplate = async (template) => {
    if (!template || !template.templateType) return;
    
    setSendingId(template._id || template.templateType);
    try {
      await apiService.sendMessage(template.templateType);
      toast.success(`Message sent successfully using '${template.templateType}' template.`);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error(error?.response?.data?.message || 'Failed to send message. Please try again.');
    } finally {
      setSendingId(null);
    }
  };

  const handleSendEditedTemplate = async (template) => {
    if (!template || !template.templateType) return;
    
    setSendingId(template._id || template.templateType);
    try {
      const now = new Date().toISOString();
      // First put the template
      await apiService.updateSmsTemplate(template.templateType, { content: editingContent });

      // Then hit endpoint send
      await apiService.sendMessage(template.templateType);
      toast.success(`Template updated and message sent successfully using '${template.templateType}'.`);
      
      // Update local state to reflect new content
      setTemplates(templates.map(t => 
        (t._id || t.templateType) === (template._id || template.templateType) 
          ? { ...t, content: editingContent } 
          : t
      ));
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update and send message:', error);
      toast.error(error?.response?.data?.message || 'Failed to update/send message. Please try again.');
    } finally {
      setSendingId(null);
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!template || !template.templateType) return;
    
    const result = await Swal.fire({
      title: 'Delete Template?',
      text: `Are you sure you want to delete the '${template.templateType}' template?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        await apiService.deleteSmsTemplate(template.templateType);
        toast.success(`Template '${template.templateType}' deleted successfully.`);
        setTemplates(templates.filter(t => t.templateType !== template.templateType));
      } catch (error) {
        console.error('Failed to delete template:', error);
        toast.error(error?.response?.data?.message || 'Failed to delete template.');
      }
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabIndex(newValue);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1000, margin: '0 auto' }}>
      <ToastContainer position="top-right" autoClose={3000} />
      
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <MdSms size={40} color="#1976d2" />
        <Box>
          <Typography variant="h4" fontWeight="800" color="text.primary">
            SMS Center
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage templates and send messages to customers.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={handleTabChange} aria-label="sms tabs">
          <Tab label="Send Message" icon={<SendIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Create Template" icon={<AddIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Box>
          {fetchLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : templates.length === 0 ? (
            <Card sx={{ borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>
                No templates found.
              </Typography>
              <Button 
                variant="outlined" 
                startIcon={<AddIcon />} 
                onClick={() => setTabIndex(1)}
                sx={{ mt: 2 }}
              >
                Create your first template
              </Button>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {templates.map((template, idx) => {
                const id = template._id || template.templateType || idx;
                const isSending = sendingId === id;
                const isEditing = editingId === id;
                
                return (
                  <Grid item xs={12} md={isEditing ? 12 : 6} key={id} sx={{ transition: 'all 0.3s ease' }}>
                    <Card sx={{ 
                      borderRadius: 3, 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                      }
                    }}>
                      <CardContent sx={{ flexGrow: 1, p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6" fontWeight="bold">
                            {template.templateType}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label="Template" size="small" color="primary" variant="outlined" />
                            <IconButton
                              color="error"
                              size="small"
                              onClick={() => handleDeleteTemplate(template)}
                              disabled={isSending}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                        <Divider sx={{ mb: 2 }} />
                        
                        {isEditing ? (
                          <TextField
                            fullWidth
                            multiline
                            minRows={4}
                            variant="outlined"
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            sx={{ mt: 1, mb: 1 }}
                            placeholder="Edit SMS content here..."
                          />
                        ) : (
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ 
                              whiteSpace: 'pre-wrap',
                              minHeight: 80,
                              maxHeight: 150,
                              overflow: 'auto',
                              bgcolor: '#f8f9fa',
                              p: 2,
                              borderRadius: 1,
                              fontFamily: 'monospace'
                            }}
                          >
                            {template.content || ''}
                          </Typography>
                        )}
                      </CardContent>
                      <Box sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        {isEditing ? (
                          <>
                            <Button
                              variant="outlined"
                              onClick={() => setEditingId(null)}
                              disabled={isSending}
                              sx={{ borderRadius: 2 }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={() => handleSendEditedTemplate(template)}
                              disabled={isSending || !editingContent.trim()}
                              startIcon={isSending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                              sx={{ borderRadius: 2 }}
                            >
                              {isSending ? 'Sending...' : 'Save & Send'}
                            </Button>
                          </>
                        ) : (
                            <>
                              <Button
                                variant="outlined"
                                onClick={() => {
                                  setEditingId(id);
                                  setEditingContent(template.content || '');
                                }}
                                disabled={isSending}
                                sx={{ borderRadius: 2 }}
                              >
                                Edit
                              </Button>
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={() => handleSendTemplate(template)}
                              disabled={isSending}
                              startIcon={isSending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                              sx={{ borderRadius: 2 }}
                            >
                              {isSending ? 'Sending...' : 'Send'}
                            </Button>
                          </>
                        )}
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {tabIndex === 1 && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
          <CardContent sx={{ p: 4 }}>
            <form onSubmit={handleCreateSubmit}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                New Template
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Template Type"
                  variant="outlined"
                  fullWidth
                  value={newTemplateType}
                  onChange={(e) => setNewTemplateType(e.target.value)}
                  placeholder="e.g. Welcome Message, Order Update"
                  required
                />

                <TextField
                  label="SMS Content"
                  variant="outlined"
                  fullWidth
                  multiline
                  minRows={6}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Enter the SMS content here. Line breaks are supported."
                  required
                />

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={createLoading}
                    sx={{ height: 48, minWidth: 140, borderRadius: 2 }}
                    startIcon={createLoading ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  >
                    {createLoading ? 'Saving...' : 'Save Template'}
                  </Button>
                </Box>
              </Box>
            </form>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default SmsTemplate;
