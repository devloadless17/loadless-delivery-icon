'use client';

import { PackagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { displayPhone, displayRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AddressManager } from './addresses/address-manager';
import { IdentityHeader } from './profile/identity-header';
import { RecentOrders } from './profile/recent-orders';
import { StatStrip } from './profile/stat-strip';
import type { CustomerAddress, CustomerProfile } from './api';

type Tab = 'addresses' | 'orders';

export interface CustomerProfilePanelProps {
  profile: CustomerProfile;
  variant?: 'full' | 'compact';
  /**
   * Whether this panel offers to start an order. There is deliberately no
   * "repeat the last one": every order begins from a blank form, so nothing
   * from a previous delivery can ride along unnoticed into a new one.
   */
  orderActions?: 'navigate' | 'none';
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
  className,
}: CustomerProfilePanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('addresses');
  const [editingName, setEditingName] = useState(false);

  // PLATFORM scope means admin: they may correct any address, whoever added it.
  const isPlatform = profile.stats.scope === 'PLATFORM';
  const usualAddressText = profile.stats.topAddress?.addressText ?? null;

  /**
   * Open a blank order form on this customer, with one saved address already
   * chosen. Carried in the URL rather than stashed state: an address id is
   * short, survives a refresh, and is the ONLY thing that travels — no charge,
   * no notes, nothing from any previous order.
   */
  const startFromAddress = (address: CustomerAddress) =>
    router.push(
      `/vendor/orders/new?phone=${encodeURIComponent(profile.normalizedPhone)}` +
        `&addressId=${encodeURIComponent(address.id)}`,
    );

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
            : 'First order with you'}
        </p>
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
          <RecentOrders customer={profile} />
        )}
        <p className="text-xs text-muted-foreground">
          {displayPhone(profile.normalizedPhone)} is shared across the platform. You can edit what
          you added; everything else stays as its owner set it.
        </p>
      </div>
    </Card>
  );
}
