import { z } from 'zod';
import { loginIdentifierSchema } from './common';

/**
 * One login form for everyone: drivers type their phone number, admins and
 * vendors type their email. The identifier is normalized client- AND
 * server-side by the same schema.
 */
export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
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
