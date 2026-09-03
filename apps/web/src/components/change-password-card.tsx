'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api-client';

/**
 * Change your own password. Available to every role, and the reason it exists
 * is the admin: the first account is created by the deploy from a secret, so
 * without this the platform runs forever on a bootstrap password that lives in
 * CI.
 *
 * Confirming the new password is a client-side courtesy only — the API asks for
 * the CURRENT password, which is the check that matters. On success every other
 * session is revoked and this device is handed fresh cookies, so the person
 * changing it stays signed in here and is signed out everywhere else.
 */
export function ChangePasswordCard() {
  const t = useTranslations('password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error(t('tooShort'));
      return;
    }
    if (next !== confirm) {
      toast.error(t('mismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(t('changed'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid max-w-sm gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="current-password">{t('current')}</Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">{t('new')}</Label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('hint')}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-password">{t('confirm')}</Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busy} className="justify-self-start">
            {t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
