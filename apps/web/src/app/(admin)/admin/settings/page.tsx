'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatBps } from '@loadless/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings, useUpdateSettings } from '@/features/admin/settings/api';
import { ChangePasswordCard } from '@/components/change-password-card';

export default function AdminSettingsPage() {
  const { data, isPending } = useSettings();
  const updateSettings = useUpdateSettings();
  const [percent, setPercent] = useState('');

  useEffect(() => {
    if (data) setPercent(String(data.defaultCommissionBps / 100));
  }, [data]);

  async function save() {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error('Enter a percentage between 0 and 100.');
      return;
    }
    try {
      const saved = await updateSettings.mutateAsync({ defaultCommissionBps: Math.round(pct * 100) });
      toast.success(`Platform commission is now ${formatBps(saved.defaultCommissionBps)}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save settings.');
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform settings</h1>
        <p className="text-sm text-muted-foreground">Rules that apply across the whole platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Default commission</CardTitle>
          <CardDescription>
            The platform&apos;s share of each delivery charge. Drivers with a personal override are
            not affected. Orders already accepted keep the split they were accepted with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <form
              method="post"
              className="flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="commission">Commission (%)</Label>
                <Input
                  id="commission"
                  inputMode="decimal"
                  className="data-mono"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </div>
              <Button type="submit" loading={updateSettings.isPending}>
                Save
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
