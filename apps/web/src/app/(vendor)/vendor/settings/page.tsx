'use client';

import { useTranslations } from 'next-intl';
import { ChangePasswordCard } from '@/components/change-password-card';

/**
 * A vendor had no page of their own at all, so the change-password endpoint —
 * which serves every role — was unreachable for them. Their business name and
 * logo stay admin-managed; this is only what is theirs to change.
 */
export default function VendorSettingsPage() {
  const t = useTranslations('vendor.settings');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <ChangePasswordCard />
    </div>
  );
}
