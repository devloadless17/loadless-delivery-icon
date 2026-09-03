'use client';

import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapsLinkField } from '@/components/maps-link';
import { useCreateCustomer } from './api';

/** Shown when a valid phone has no match — creates the global customer inline. */
export function NewCustomerForm({ normalizedPhone }: { normalizedPhone: string }) {
  const t = useTranslations('customer');
  const [name, setName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const createCustomer = useCreateCustomer();

  async function submit() {
    if (name.trim().length < 2) {
      toast.error(t('errName'));
      return;
    }
    try {
      await createCustomer.mutateAsync({
        phone: normalizedPhone,
        name: name.trim(),
        ...(addressText.trim().length >= 3 || mapsUrl.trim()
          ? {
              address: {
                label: 'HOME' as const,
                ...(addressText.trim().length >= 3 ? { addressText: addressText.trim() } : {}),
                ...(mapsUrl.trim() ? { mapsUrl: mapsUrl.trim() } : {}),
              },
            }
          : {}),
      });
      toast.success(t('created'));
      setName('');
      setAddressText('');
      setMapsUrl('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('createFailed'));
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4 text-primary-strong" aria-hidden />
          {t('newCustomer')}
        </CardTitle>
        <CardDescription>
          <span dir="ltr" className="data-mono">
            {displayPhone(normalizedPhone)}
          </span>{' '}
          {t('notOnPlatform')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nc-name">{t('name')}</Label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nc-address">{t('addressOptional')}</Label>
            <Input
              id="nc-address"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder={t('addressPlaceholder')}
            />
          </div>
          <MapsLinkField id="nc-maps" value={mapsUrl} onChange={setMapsUrl} />
          <Button type="submit" loading={createCustomer.isPending}>
            {t('create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
