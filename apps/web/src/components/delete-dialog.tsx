'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ErrorCode } from '@loadless/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-client';

/**
 * Confirms an irreversible delete, and turns the one refusal the API is
 * expected to give into the operation the admin actually wanted.
 *
 * Vendors, drivers and customers all refuse deletion once they appear on an
 * order, because those orders carry the money — the commission charged and the
 * earnings owed. For vendors and drivers there IS a right answer (suspend), so
 * `fallback` lets the dialog offer it in place of a dead end: the admin gets
 * the outcome without needing to know which of the two operations the system
 * would accept. Customers have no account to suspend, so they pass no fallback
 * and the refusal simply stands with its explanation.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  blockedTitle,
  blockedCode,
  fallback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown>;
  /** Heading shown once the API refuses with `blockedCode`. */
  blockedTitle?: string;
  /** The refusal this dialog knows how to recover from. */
  blockedCode?: ErrorCode;
  /** The operation offered instead. Omit when there is no second option. */
  fallback?: { label: string; run: () => Promise<unknown>; successMessage: string };
}) {
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setBlockedReason(null);
    setBusy(false);
    onOpenChange(false);
  }

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      close();
    } catch (err) {
      if (blockedCode && err instanceof ApiError && err.code === blockedCode) {
        // Not a dead end — keep the dialog open and explain, offering the
        // fallback when there is one.
        setBlockedReason(err.message);
        setBusy(false);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
      setBusy(false);
    }
  }

  async function runFallback() {
    if (!fallback) return;
    setBusy(true);
    try {
      await fallback.run();
      toast.success(fallback.successMessage);
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work.');
      setBusy(false);
    }
  }

  const blocked = blockedReason !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{blocked ? (blockedTitle ?? 'Not possible') : title}</DialogTitle>
          <DialogDescription>{blockedReason ?? description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {blocked && !fallback ? 'Close' : 'Cancel'}
          </Button>
          {blocked ? (
            fallback ? (
              <Button variant="destructive" loading={busy} onClick={() => void runFallback()}>
                {fallback.label}
              </Button>
            ) : null
          ) : (
            <Button variant="destructive" loading={busy} onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
