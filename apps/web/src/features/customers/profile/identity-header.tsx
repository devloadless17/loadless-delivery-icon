'use client';

import { useTranslations } from 'next-intl';
import { Check, Copy, Pencil, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayPhone, initialsOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useClearDisplayName,
  useSetDisplayName,
  useUpdateCustomerName,
  type CustomerProfile,
} from '../api';

/** Name, phone and the one-tap actions — the first thing the vendor's eye hits. */
export function IdentityHeader({
  customer,
  dense,
  editing,
  onEditingChange,
  actionSlot,
}: {
  customer: CustomerProfile;
  dense?: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  actionSlot?: ReactNode;
}) {
  const t = useTranslations('customer');
  const [name, setName] = useState(customer.name);
  const [copied, setCopied] = useState(false);
  const updateName = useUpdateCustomerName();
  const setDisplayName = useSetDisplayName();
  const clearDisplayName = useClearDisplayName();

  // GLOBAL only for ADMIN: the shared record is the platform's to keep
  // correct. A vendor's pen reaches their own private label and nothing else.
  const isGlobal = customer.nameScope === 'GLOBAL';
  const saving = updateName.isPending || setDisplayName.isPending;

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error(t('errName'));
      return;
    }
    if (trimmed === customer.name) {
      onEditingChange(false);
      return;
    }
    try {
      if (isGlobal) {
        await updateName.mutateAsync({ id: customer.id, name: trimmed });
        toast.success(t('nameUpdated'));
      } else {
        await setDisplayName.mutateAsync({ id: customer.id, displayName: trimmed });
        toast.success(t('aliasSaved'));
      }
      onEditingChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('nameFailed'));
    }
  }

  async function usePlatformName() {
    try {
      await clearDisplayName.mutateAsync({ id: customer.id });
      toast.success(t('nowShowing', { name: customer.baseName }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('resetFailed'));
    }
  }

  function copyPhone() {
    void navigator.clipboard?.writeText(customer.normalizedPhone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display font-semibold text-primary-strong',
            dense ? 'size-9 text-sm' : 'size-11 text-base',
          )}
        >
          {initialsOf(customer.name)}
        </span>
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-1">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setName(customer.name);
                  onEditingChange(false);
                }
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 max-w-56"
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="submit" size="sm" loading={saving}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(customer.name);
                  onEditingChange(false);
                }}
              >
                Cancel
              </Button>
            </form>
            {/* The consequence, stated BEFORE the keystroke. This one sentence
                is the whole answer to "another vendor renamed my customer and
                I got confused". */}
            <p className="text-xs text-muted-foreground">
              {isGlobal
                ? t('everyoneSees')
                : `Only you will see this name — the platform record keeps “${customer.baseName}”.`}
            </p>
            </div>
          ) : (
            <h2
              className={cn(
                'flex items-center gap-2 font-display font-semibold tracking-tight',
                dense ? 'text-base' : 'text-xl',
              )}
            >
              {customer.name}
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('editName')}
                className="size-8 text-muted-foreground"
                onClick={() => {
                  setName(customer.name);
                  onEditingChange(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </h2>
          )}
          {customer.displayName && (
            <p className="text-xs text-muted-foreground">
              Your name for them · platform shows{' '}
              <span className="font-medium">{customer.baseName}</span>
              <button
                type="button"
                onClick={() => void usePlatformName()}
                className="ml-1.5 inline-flex cursor-pointer items-center gap-1 font-medium text-primary-strong hover:underline"
              >
                <RotateCcw className="size-3" aria-hidden /> Use platform name
              </button>
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <a
              href={`tel:${customer.normalizedPhone}`}
              className="data-mono text-sm text-muted-foreground hover:text-primary-strong hover:underline"
            >
              {displayPhone(customer.normalizedPhone)}
            </a>
            <button
              type="button"
              aria-label={t('copyPhone')}
              onClick={copyPhone}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!dense &&
          (customer.addedByYou ? (
            <Badge variant="muted">{t('addedByYou')}</Badge>
          ) : (
            <Badge variant="muted">{t('sharedCustomer')}</Badge>
          ))}
        {actionSlot}
      </div>
    </div>
  );
}
