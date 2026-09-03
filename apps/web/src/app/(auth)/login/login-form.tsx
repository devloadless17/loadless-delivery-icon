'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES, loginSchema, type LoginInput } from '@loadless/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { login, ROLE_HOME } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** API error code -> message key under `auth.errors`. */
const ERROR_KEYS: Record<string, string> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: 'invalidCredentials',
  [ERROR_CODES.ACCOUNT_LOCKED]: 'accountLocked',
  [ERROR_CODES.ACCOUNT_DEACTIVATED]: 'accountDeactivated',
  [ERROR_CODES.RATE_LIMITED]: 'rateLimited',
};

export function LoginForm() {
  const t = useTranslations('auth');
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
      const key = err instanceof ApiError ? ERROR_KEYS[err.code] : undefined;
      setServerError(
        key
          ? t(`errors.${key}` as 'errors.invalidCredentials')
          : err instanceof ApiError
            ? t('errors.signInFailed')
            : t('errors.network'),
      );
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Card className="shadow-float">
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="identifier">{t('identifier')}</Label>
            <Input
              id="identifier"
              type="text"
              dir="ltr"
              autoComplete="username"
              placeholder={t('identifierPlaceholder')}
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
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
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
            {t('signIn')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
