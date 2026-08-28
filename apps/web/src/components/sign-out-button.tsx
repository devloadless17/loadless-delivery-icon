'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { logout } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SignOutButton({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'default'}
      className={cn('text-muted-foreground', className)}
      onClick={handleSignOut}
      loading={busy}
      aria-label="Sign out"
    >
      {!busy && <LogOut />}
      {!iconOnly && 'Sign out'}
    </Button>
  );
}
