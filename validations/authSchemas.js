// validations/userSchemas.js
const { z } = require('zod');


const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string({ required_error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

module.exports = {
  loginSchema,
  refreshSchema,
  logoutSchema,
};
