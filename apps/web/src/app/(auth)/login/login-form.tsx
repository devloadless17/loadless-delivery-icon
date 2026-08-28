'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES, loginSchema, type LoginInput } from '@loadless/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { login, ROLE_HOME } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Incorrect phone number or password.',
  [ERROR_CODES.ACCOUNT_LOCKED]: 'Too many failed attempts. Wait a minute, then try again.',
  [ERROR_CODES.ACCOUNT_DEACTIVATED]: 'This account is deactivated. Contact your administrator.',
  [ERROR_CODES.RATE_LIMITED]: 'Too many attempts. Wait a minute, then try again.',
};

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' } as unknown as LoginInput,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { user } = await login(values.identifier, values.password);
      router.replace(ROLE_HOME[user.role]);
      router.refresh();
    } catch (err) {
      setServerError(
        err instanceof ApiError
          ? (ERROR_MESSAGES[err.code] ?? 'Sign-in failed. Try again.')
          : 'Network problem. Check your connection and try again.',
      );
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or phone number</Label>
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="you@business.com — drivers use 03 123 456"
              aria-invalid={!!errors.identifier}
              {...form.register('identifier')}
            />
            {errors.identifier && (
              <p className="text-sm text-destructive" role="alert">
                {errors.identifier.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {serverError}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
