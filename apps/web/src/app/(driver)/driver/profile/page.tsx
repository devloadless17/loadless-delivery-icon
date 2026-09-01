'use client';

import { Bike, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SignOutButton } from '@/components/sign-out-button';
import { ChangePasswordCard } from '@/components/change-password-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { displayPhone, fileUrl } from '@/lib/format';
import { useMe } from '@/features/auth/use-me';

export default function DriverProfilePage() {
  const { data, isPending } = useMe();
  const driver = data?.user.driver;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {isPending || !driver ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-4">
              {/* Their own face. The platform holds the photo and the driver
                  never uploads it, which is exactly why showing it back
                  matters — otherwise the person whose picture it is is the
                  only one in the system who cannot see it. */}
              {driver.facePhotoKey ? (
                <img
                  src={fileUrl(driver.facePhotoKey)}
                  alt={driver.fullName}
                  className="size-16 shrink-0 rounded-full border object-cover"
                />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                  <UserRound className="size-7 text-muted-foreground" aria-hidden />
                </div>
              )}
              <div>
                <p className="text-lg font-semibold">{driver.fullName}</p>
                <p className="data-mono text-sm text-muted-foreground">
                  {displayPhone(driver.contactPhone)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <span className="text-sm">Theme</span>
              <ThemeToggle />
            </div>
            <SignOutButton className="w-full justify-center border" />
          </CardContent>
        </Card>
      )}
      <ChangePasswordCard />
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Bike className="size-3.5" aria-hidden /> Photos and details are managed by the platform.
      </p>
    </div>
  );
}
