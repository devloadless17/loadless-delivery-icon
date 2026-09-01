'use client';

import { Bike, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { formatBps } from '@loadless/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/pagination';
import { displayDate, displayPhone, fileUrl } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useDrivers, type AdminDriver } from '@/features/admin/drivers/api';
import { DriverFormDialog } from '@/features/admin/drivers/driver-form-dialog';
import { useSettings } from '@/features/admin/settings/api';

export default function AdminDriversPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminDriver | null>(null);

  const { data, isPending } = useDrivers(page, q);
  const { data: settings } = useSettings();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(driver: AdminDriver) {
    setEditing(driver);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            Riders who deliver orders. Platform commission default:{' '}
            <span className="data-mono">{settings ? formatBps(settings.defaultCommissionBps) : '…'}</span>
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New driver
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone"
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : data && data.data.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Duty</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bike</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {driver.facePhotoKey ? (
                        <img
                          src={fileUrl(driver.facePhotoKey)}
                          alt=""
                          className="size-9 rounded-full border object-cover"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Bike className="size-4" />
                        </div>
                      )}
                      <span className="font-medium">{driver.fullName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="data-mono">{displayPhone(driver.contactPhone)}</TableCell>
                  <TableCell>
                    {driver.dutyStatus === 'ON_DUTY' ? (
                      <Badge variant="accent">
                        <span className="size-1.5 rounded-full bg-accent" aria-hidden /> On duty
                      </Badge>
                    ) : (
                      <Badge variant="muted">Off duty</Badge>
                    )}
                  </TableCell>
                  <TableCell className="data-mono">
                    {driver.commissionOverrideBps === null ? (
                      <span className="text-muted-foreground">default</span>
                    ) : (
                      formatBps(driver.commissionOverrideBps)
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={driver.status === 'ACTIVE' ? 'success' : 'destructive'}>
                      {driver.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                    </Badge>
                  </TableCell>
                  {/* Admin-only: the bike photo is collected for the platform's own
                      checks and is deliberately not shown to vendors. Rendering it here
                      is what stops it being stored and never looked at. */}
                  <TableCell>
                    {driver.bikePhotoKey ? (
                      <img
                        src={fileUrl(driver.bikePhotoKey)}
                        alt={`${driver.fullName}'s bike`}
                        className="h-9 w-14 rounded-md border object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{displayDate(driver.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(driver)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination meta={data.meta} onPageChange={setPage} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Bike className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{q ? 'No drivers match your search' : 'No drivers yet'}</p>
            <p className="text-sm text-muted-foreground">
              {q ? 'Try a different name or phone number.' : 'Create the first driver to get started.'}
            </p>
          </div>
          {!q && (
            <Button onClick={openCreate}>
              <Plus /> New driver
            </Button>
          )}
        </div>
      )}

      <DriverFormDialog open={dialogOpen} onOpenChange={setDialogOpen} driver={editing} />
    </div>
  );
}
