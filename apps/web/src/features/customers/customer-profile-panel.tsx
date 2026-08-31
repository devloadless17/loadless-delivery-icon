'use client';

import { PackagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { displayPhone, displayRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { draftFromOrder, stashOrderDraft, type OrderDraft } from '@/features/orders/order-draft';
import { AddressManager } from './addresses/address-manager';
import { IdentityHeader } from './profile/identity-header';
import { LastOrderLine } from './profile/last-order-line';
import { RecentOrders } from './profile/recent-orders';
import { StatStrip } from './profile/stat-strip';
import type { CustomerAddress, CustomerOrder, CustomerProfile } from './api';

type Tab = 'addresses' | 'orders';

export interface CustomerProfilePanelProps {
  profile: CustomerProfile;
  variant?: 'full' | 'compact';
  /** 'navigate' pushes to the order form; 'callback' fills the form in place. */
  orderActions?: 'navigate' | 'callback' | 'none';
  onUseDraft?: (draft: OrderDraft) => void;
  className?: string;
}

/**
 * Everything the vendor needs to speak confidently while the customer is on the
 * line: who they are, where they usually want it, what they last ordered — and
 * the ability to fix any of it without leaving the screen.
 */
export function CustomerProfilePanel({
  profile,
  variant = 'full',
  orderActions = 'navigate',
  onUseDraft,
  className,
}: CustomerProfilePanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('addresses');
  const [editingName, setEditingName] = useState(false);

  const lastOrder = profile.recentOrders[0];
  // PLATFORM scope means admin: they may correct any address, whoever added it.
  const isPlatform = profile.stats.scope === 'PLATFORM';
  const usualAddressText = profile.stats.topAddress?.addressText ?? null;

  function applyDraft(draft: OrderDraft) {
    if (orderActions === 'callback' && onUseDraft) {
      onUseDraft(draft);
      return;
    }
    stashOrderDraft(draft);
    router.push(
      `/vendor/orders/new?repeat=1&phone=${encodeURIComponent(profile.normalizedPhone)}`,
    );
  }

  const repeat = (order: CustomerOrder, customer: CustomerProfile) =>
    applyDraft(draftFromOrder(order, customer));

  const startFromAddress = (address: CustomerAddress) =>
    applyDraft({
      customerPhone: profile.normalizedPhone,
      addressText: address.addressText ?? '',
      mapsUrl: address.mapsUrl,
    });

  if (variant === 'compact') {
    return (
      <div className={cn('space-y-3', className)}>
        <IdentityHeader
          customer={profile}
          dense
          editing={editingName}
          onEditingChange={setEditingName}
        />
        <p className="text-xs text-muted-foreground">
          {profile.stats.ordersInScope > 0
            ? `${profile.stats.ordersInScope} ${
                profile.stats.ordersInScope === 1 ? 'order' : 'orders'
              } with you${
                profile.stats.lastOrderAt ? ` · last ${displayRelative(profile.stats.lastOrderAt)}` : ''
              }`
            : profile.stats.totalOrdersPlatform > 0
              ? `First order with you — ${profile.stats.totalOrdersPlatform} on the platform`
              : 'First order on the platform'}
        </p>
        {lastOrder && (
          <LastOrderLine
            order={lastOrder}
            customer={profile}
            dense
            onRepeat={repeat}
            repeatLabel="Use last order"
          />
        )}
      </div>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="space-y-3 border-b bg-primary/[0.04] px-5 pb-4 pt-5">
        <IdentityHeader
          customer={profile}
          editing={editingName}
          onEditingChange={setEditingName}
          actionSlot={
            orderActions !== 'none' ? (
              <Button
                size="sm"
                onClick={() =>
                  router.push(
                    `/vendor/orders/new?phone=${encodeURIComponent(profile.normalizedPhone)}`,
                  )
                }
              >
                <PackagePlus /> New order
              </Button>
            ) : undefined
          }
        />
        {lastOrder && <LastOrderLine order={lastOrder} customer={profile} onRepeat={repeat} />}
      </div>

      <StatStrip stats={profile.stats} />

      <div className="space-y-4 p-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'addresses', label: 'Addresses', count: profile.addresses.length },
            { value: 'orders', label: 'Orders', count: profile.stats.ordersInScope },
          ]}
        />
        {tab === 'addresses' ? (
          <AddressManager
            customerId={profile.id}
            addresses={profile.addresses}
            usualAddressText={usualAddressText}
            canManageAll={isPlatform}
            {...(orderActions !== 'none' ? { onStartOrder: startFromAddress } : {})}
          />
        ) : (
          <RecentOrders customer={profile} onRepeat={repeat} />
        )}
        <p className="text-xs text-muted-foreground">
          {displayPhone(profile.normalizedPhone)} is shared across the platform. You can edit what
          you added; everything else stays as its owner set it.
        </p>
      </div>
    </Card>
  );
}
