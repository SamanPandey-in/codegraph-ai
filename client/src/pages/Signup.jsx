import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Signup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'USER',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');


    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const result = await signup({
        fullName: formData.fullName,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });

      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error || 'Signup failed. Please try again.');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const roleOptions = [
    { value: 'USER', label: 'User' },
    { value: 'TECHNICIAN', label: 'Technician' },
    { value: 'MANAGER', label: 'Manager' },
  ];


  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <h2 className="text-3xl font-display font-bold" style={{ color: 'var(--text)' }}>
              Create account
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <span className="font-medium" style={{ color: 'var(--primary-500)' }}>
                  Sign in
                </span>
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <form onSubmit={handleSubmit}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {error && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {error}
                  </Alert>
                )}

                <TextField
                  fullWidth
                  label="Full Name"
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="John Doe"
                  variant="outlined"
                  required
                  slotProps={{
                    input: {
                      startAdornment: <User size={20} style={{ marginRight: 8 }} />,
                    },
                  }}
                />

                <TextField
                  fullWidth
                  label="Username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="johndoe"
                  variant="outlined"
                  required
                  slotProps={{
                    input: {
                      startAdornment: <User size={20} style={{ marginRight: 8 }} />,
                    },
                  }}
                />

                <TextField
                  fullWidth
                  label="Email address"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@company.com"
                  variant="outlined"
                  required
                  slotProps={{
                    input: {
                      startAdornment: <Mail size={20} style={{ marginRight: 8 }} />,
                    },
                  }}
                />

                <FormControl fullWidth variant="outlined">
                  <InputLabel>Role</InputLabel>
                  <Select
                    label="Role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                  >
                    {roleOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  variant="outlined"
                  required
                  slotProps={{
                    input: {
                      startAdornment: <Lock size={20} style={{ marginRight: 8 }} />,
                    },
                  }}
                />

                <TextField
                  fullWidth
                  label="Confirm Password"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  variant="outlined"
                  required
                  slotProps={{
                    input: {
                      startAdornment: <Lock size={20} style={{ marginRight: 8 }} />,
                    },
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  disabled={loading}
                  sx={{ py: 1.5, mt: 2 }}
                >
                  {loading ? 'Creating account...' : 'Create account'}
                </Button>
              </Box>
            </form>
          </div>
        </div>
      </div>


      {/* Right side - Image/Brand */}
      <div className="hidden lg:block relative w-0 flex-1">
        <div className="absolute inset-0 bg-linear-to-br from-primary-600 to-primary-800">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div style={{ textAlign: 'center', color: 'white' }}>
              <Link to="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                {/* <Logo /> */}
              </Link>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>
                Join AppName
              </h2>
              <p style={{ fontSize: '1.25rem', color: 'var(--primary-100)', maxWidth: '28rem' }}>
                Lorem ipsum dolor sit amet consectetur adipisicing elit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;