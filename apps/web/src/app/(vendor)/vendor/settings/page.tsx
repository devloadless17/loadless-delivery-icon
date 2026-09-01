'use client';

import { ChangePasswordCard } from '@/components/change-password-card';

/**
 * A vendor had no page of their own at all, so the change-password endpoint —
 * which serves every role — was unreachable for them. Their business name and
 * logo stay admin-managed; this is only what is theirs to change.
 */
export default function VendorSettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your business name and logo are managed by the platform.
        </p>
      </div>
      <ChangePasswordCard />
    </div>
  );
}
