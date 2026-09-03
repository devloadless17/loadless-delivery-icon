'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/use-me';
import { cn } from '@/lib/utils';
import { useSetDuty } from './api';

/** The duty switch — always one tap away, orange when live. */
export function DutyToggle() {
  const t = useTranslations('driver.duty');
  const { data, isPending } = useMe();
  const setDuty = useSetDuty();
  const dutyStatus = data?.user.driver?.dutyStatus;

  if (isPending || !dutyStatus) return <Skeleton className="h-6 w-24" />;
  const onDuty = dutyStatus === 'ON_DUTY';

  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <span
        className={cn(
          'text-sm font-semibold transition-colors duration-150',
          onDuty ? 'text-accent' : 'text-muted-foreground',
        )}
      >
        {onDuty ? t('on') : t('off')}
      </span>
      <Switch
        live
        checked={onDuty}
        aria-label={onDuty ? t('goOff') : t('goOn')}
        onCheckedChange={(checked) =>
          setDuty
            .mutateAsync(checked ? 'ON_DUTY' : 'OFF_DUTY')
            .then(() => toast.success(checked ? t('nowOn') : t('nowOff')))
            .catch(() => toast.error(t('failed')))
        }
      />
    </label>
  );
}
