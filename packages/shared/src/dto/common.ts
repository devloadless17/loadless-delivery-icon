import { z } from 'zod';
import { normalizeLebanesePhone } from '../phone';

/** Any accepted Lebanese input format -> normalized E.164 string. */
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .transform((value, ctx) => {
    const normalized = normalizeLebanesePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Lebanese phone number' });
      return z.NEVER;
    }
    return normalized;
  });

export const cuidSchema = z.string().min(20).max(32);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'))
  .refine((v) => v.length <= 190, 'Email is too long');

/**
 * Login identifier: drivers use their phone number, admins and vendors use
 * their email. Anything containing "@" is treated as an email; otherwise it
 * must normalize as a Lebanese phone number.
 */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email or phone number')
  .transform((value, ctx) => {
    if (value.includes('@')) {
      const parsed = emailSchema.safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' });
        return z.NEVER;
      }
      return parsed.data;
    }
    const normalized = normalizeLebanesePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email or Lebanese phone number' });
      return z.NEVER;
    }
    return normalized;
  });

/** Offset pagination for small admin tables. */
export const offsetPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type OffsetPagination = z.infer<typeof offsetPaginationSchema>;

/** Cursor pagination for churning lists (orders, feeds). Cursor = last item id. */
export const cursorPaginationSchema = z.object({
  cursor: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, {
    message: 'from must be before to',
    path: ['from'],
  });
export type DateRange = z.infer<typeof dateRangeSchema>;

export const reasonSchema = z.string().trim().min(3, 'Reason is required').max(500);
