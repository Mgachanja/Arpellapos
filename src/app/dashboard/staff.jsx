import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { 
  useGetStaffsQuery, 
  useCreateStaffMutation, 
  useDeleteStaffMutation 
} from "../../services/rtkApi";
import { 
  TextField, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Typography, MenuItem, Select, 
  InputAdornment, IconButton, CircularProgress, Collapse, Backdrop,
  Box, Card, CardContent, Divider, Chip, Avatar
} from "@mui/material";
import { 
  Visibility, VisibilityOff, Delete, AddCircleOutline, 
  PeopleAlt, Close
} from "@mui/icons-material";
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import Swal from 'sweetalert2';

const Staff = () => {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const dispatch = useDispatch();

  // Get state using RTK Query
  const { data: staffData = [], isLoading } = useGetStaffsQuery();
  const [createStaffMutation] = useCreateStaffMutation();
  const [deleteStaffMutation] = useDeleteStaffMutation();

  const staffList = Array.isArray(staffData) ? staffData : (staffData?.data || []);

  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      // Map to correct API fields if needed, currently passing data exactly
      await createStaffMutation(data).unwrap();
      toast.success("Staff added successfully!");
      reset();
      setShowForm(false);
    } catch (err) {
      toast.error(err?.data?.message || err?.message || "Failed to add staff");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (phoneNumber) => {
    const result = await Swal.fire({
      title: 'Delete Staff Member?',
      text: 'This action cannot be undone. Are you absolutely sure?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#0056b3',
      confirmButtonText: 'Yes, remove them!',
      cancelButtonText: 'Cancel',
      borderRadius: '12px'
    });

    if (!result.isConfirmed) return;

    try {
      await deleteStaffMutation(phoneNumber).unwrap();
      toast.success('Staff deleted successfully!');
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Failed to delete staff member');
    }
  };

  const getRoleColor = (role) => {
    switch(role?.toLowerCase()) {
      case 'admin': return 'error';
      case 'order manager': return 'info';
      case 'accountant': return 'success';
      case 'delivery guy': return 'warning';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, margin: '0 auto' }}>
      <ToastContainer position="top-right" autoClose={3000} />
      
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PeopleAlt sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="800" color="text.primary">
              Staff Directory
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your employees, roles, and system access.
            </Typography>
          </Box>
        </Box>
        
        <Button 
          variant={showForm ? "outlined" : "contained"} 
          color={showForm ? "inherit" : "primary"}
          startIcon={showForm ? <Close /> : <AddCircleOutline />}
          onClick={() => {
            setShowForm(f => !f);
            if(showForm) reset();
          }} 
          sx={{ height: 48, borderRadius: 2, px: 3 }}
        >
          {showForm ? "Cancel Creation" : "Add New Staff"}
        </Button>
      </Box>

      <Collapse in={showForm} timeout="auto" unmountOnExit>
        <Card sx={{ mb: 4, borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom color="primary">
              Register New Employee
            </Typography>
            <Divider sx={{ mb: 4 }} />
            
            <form onSubmit={handleSubmit(onSubmit)}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <TextField
                  label="First Name"
                  variant="outlined"
                  fullWidth
                  {...register("FirstName", { required: "First name is required" })}
                  error={!!errors.FirstName}
                  helperText={errors.FirstName?.message}
                />
                
                <TextField
                  label="Last Name"
                  variant="outlined"
                  fullWidth
                  {...register("LastName", { required: "Last name is required" })}
                  error={!!errors.LastName}
                  helperText={errors.LastName?.message}
                />

                <Select
                  fullWidth
                  displayEmpty
                  {...register("role", { required: "Role is required" })}
                  error={!!errors.role}
                  defaultValue=""
                >
                  <MenuItem value="" disabled>Select System Role</MenuItem>
                  <MenuItem value="Order Manager">Order Manager</MenuItem>
                  <MenuItem value="Accountant">Accountant</MenuItem>
                  <MenuItem value="Customer">Customer</MenuItem>
                  <MenuItem value="Admin">Admin</MenuItem>
                  <MenuItem value="Delivery Guy">Delivery Guy</MenuItem>
                </Select>

                <TextField
                  label="Email Address"
                  variant="outlined"
                  fullWidth
                  {...register("email", { 
                    pattern: {
                      value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
                      message: "Invalid email format"
                    }
                  })}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />

                <TextField
                  label="Phone Number"
                  variant="outlined"
                  fullWidth
                  {...register("phoneNumber", { required: "Phone Number is required" })}
                  error={!!errors.phoneNumber}
                  helperText={errors.phoneNumber?.message}
                />
                
                <TextField
                  label="Secure Password"
                  type={showPassword ? "text" : "password"}
                  variant="outlined"
                  fullWidth
                  {...register("password", { required: "Password is required" })}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(p => !p)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </Box>
              
              {errors.role && (
                <Typography color="error" variant="caption" sx={{ display: 'block', mt: -1, mb: 2 }}>
                  {errors.role.message}
                </Typography>
              )}

              <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                <Button 
                  variant="outlined" 
                  color="inherit" 
                  onClick={() => { setShowForm(false); reset(); }}
                >
                  Discard
                </Button>
                <Button 
                  variant="contained" 
                  color="primary" 
                  type="submit" 
                  disabled={submitting}
                  sx={{ px: 4 }}
                >
                  Confirm & Save
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>
      </Collapse>

      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>System Role</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Email Address</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Phone Number</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {staffList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">No staff members found in the system.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  staffList.map((staff) => (
                    <TableRow key={staff.phoneNumber || staff.id || staff._id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.dark' }}>
                            {staff.firstName?.[0] || staff.username?.[0] || '?'}
                          </Avatar>
                          <Typography fontWeight="500">
                            {`${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.username || 'N/A'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={staff.role || staff.roles?.[0] || 'Unknown'} 
                          size="small"
                          color={getRoleColor(staff.role || staff.roles?.[0])}
                          variant="outlined"
                          sx={{ fontWeight: 'bold' }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{staff.email || '-'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{staff.phoneNumber || '-'}</TableCell>
                      <TableCell align="right">
                        <IconButton 
                          color="error" 
                          onClick={() => handleDelete(staff.phoneNumber || staff.id || staff._id)}
                          sx={{ bgcolor: 'error.lighter', '&:hover': { bgcolor: 'error.light', color: 'white' } }}
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Backdrop
        open={submitting}
        sx={{ zIndex: theme => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress color="inherit" />
          <Typography variant="h6">Registering Staff...</Typography>
        </Box>
      </Backdrop>
    </Box>
  );
};

export default Staff;
