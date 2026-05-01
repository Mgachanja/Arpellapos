import React, { useState } from 'react';
import { 
  Box, Typography, Button, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, Chip, 
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, 
  DialogActions, TextField, MenuItem 
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useGetStaffsQuery } from '../../services/rtkApi';
import { useSelector } from 'react-redux';
import { selectUser } from '../../redux/slices/userSlice';

const ROLES = ['Admin', 'Order_Manager', 'Accountant', 'Delivery Guy'];

export default function Staff() {
  const { data: staffList, isLoading, isError } = useGetStaffsQuery();
  const currentUser = useSelector(selectUser);
  const currentUserRole = currentUser?.roles?.[0] || currentUser?.role || 'Customer';
  
  const isAdmin = currentUserRole === 'Admin';

  const [openModal, setOpenModal] = useState(false);
  const [formData, setFormData] = useState({ id: null, firstName: '', lastName: '', username: '', role: 'Delivery Guy', phoneNumber: '' });
  const [isEdit, setIsEdit] = useState(false);

  const handleOpen = (staff = null) => {
    if (staff) {
      setIsEdit(true);
      setFormData({
        id: staff.id || staff._id,
        firstName: staff.firstName || '',
        lastName: staff.lastName || '',
        username: staff.username || '',
        role: staff.role || staff.roles?.[0] || 'Delivery Guy',
        phoneNumber: staff.phoneNumber || ''
      });
    } else {
      setIsEdit(false);
      setFormData({ id: null, firstName: '', lastName: '', username: '', role: 'Delivery Guy', phoneNumber: '' });
    }
    setOpenModal(true);
  };

  const handleClose = () => {
    setOpenModal(false);
  };

  const handleSave = () => {
    // Mock save functionality as the mutation endpoint is not explicitly provided in rtkApi
    console.log("Saving staff data:", formData);
    handleClose();
  };

  const handleDelete = (id) => {
    // Mock delete
    console.log("Deleting staff:", id);
  };

  const staffs = Array.isArray(staffList) ? staffList : (staffList?.data || []);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="800">
          Staff Management
        </Typography>
        {isAdmin && (
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={() => handleOpen()}
            sx={{ bgcolor: '#ff5733', '&:hover': { bgcolor: '#e04a29' } }}
          >
            Add Staff
          </Button>
        )}
      </Box>

      {isLoading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : isError ? (
        <Alert severity="error">Failed to load staff list.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <Table>
            <TableHead sx={{ bgcolor: '#f8f9fa' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Username / Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                {isAdmin && <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {staffs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 4 : 3} align="center">No staff found.</TableCell>
                </TableRow>
              ) : (
                staffs.map((staff) => (
                  <TableRow key={staff.id || staff._id || staff.username} hover>
                    <TableCell>
                      {`${staff.firstName || ''} ${staff.lastName || ''}`.trim() || '-'}
                    </TableCell>
                    <TableCell>{staff.username || staff.phoneNumber || '-'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={staff.role || staff.roles?.[0] || 'Unknown'} 
                        size="small"
                        color={
                          (staff.role || staff.roles?.[0]) === 'Admin' ? 'error' :
                          (staff.role || staff.roles?.[0]) === 'Order_Manager' ? 'primary' :
                          (staff.role || staff.roles?.[0]) === 'Accountant' ? 'success' : 'default'
                        }
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <Button size="small" startIcon={<EditIcon />} onClick={() => handleOpen(staff)}>Edit</Button>
                        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => handleDelete(staff.id || staff._id)}>Delete</Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Staff Modal */}
      <Dialog open={openModal} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{isEdit ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="First Name"
              fullWidth
              size="small"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
            <TextField
              label="Last Name"
              fullWidth
              size="small"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
            <TextField
              label="Username"
              fullWidth
              size="small"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
            <TextField
              label="Phone Number"
              fullWidth
              size="small"
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            />
            <TextField
              select
              label="Role"
              fullWidth
              size="small"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#ff5733', '&:hover': { bgcolor: '#e04a29' } }}>
            {isEdit ? 'Save Changes' : 'Create Staff'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
