import { z } from 'zod';
import { phoneSchema } from './common';

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
