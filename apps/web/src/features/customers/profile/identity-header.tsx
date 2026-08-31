'use client';

import { Check, Copy, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayPhone, initialsOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateCustomerName, type CustomerProfile } from '../api';

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
  const [name, setName] = useState(customer.name);
  const [copied, setCopied] = useState(false);
  const updateName = useUpdateCustomerName();

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Enter the customer’s name.');
      return;
    }
    if (trimmed === customer.name) {
      onEditingChange(false);
      return;
    }
    try {
      await updateName.mutateAsync({ id: customer.id, name: trimmed });
      onEditingChange(false);
      toast.success('Name updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the name.');
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
            'flex shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display font-semibold text-primary',
            dense ? 'size-9 text-sm' : 'size-11 text-base',
          )}
        >
          {initialsOf(customer.name)}
        </span>
        <div className="min-w-0">
          {editing ? (
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
              <Button type="submit" size="sm" loading={updateName.isPending}>
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
                aria-label="Edit name"
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
          <div className="flex items-center gap-1.5">
            <a
              href={`tel:${customer.normalizedPhone}`}
              className="data-mono text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              {displayPhone(customer.normalizedPhone)}
            </a>
            <button
              type="button"
              aria-label="Copy phone number"
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
        {!dense && <Badge variant="muted">Shared customer</Badge>}
        {actionSlot}
      </div>
    </div>
  );
}
