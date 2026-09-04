'use client';

import { Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconAction } from '@/components/ui/icon-action';
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
import { displayDate } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useMe } from '@/features/auth/use-me';
import { useAdmins, type AdminAccount } from '@/features/admin/admins/api';
import { AdminFormDialog } from '@/features/admin/admins/admin-form-dialog';
import { AdminDeleteDialog } from '@/features/admin/admins/admin-delete-dialog';

export default function AdminAdminsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState<AdminAccount | null>(null);

  const { data, isPending } = useAdmins(page, q);
  // Which row is me. The API refuses a self-action regardless; this only keeps
  // the console from offering a button that cannot work.
  const { data: me } = useMe();
  const isSelf = (admin: AdminAccount) => admin.id === me?.user.id;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(admin: AdminAccount) {
    setEditing(admin);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admins</h1>
          <p className="text-sm text-muted-foreground">
            Everyone who can run the platform. Every admin can manage every other one.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New admin
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by email"
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
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">
                    {admin.email}
                    {isSelf(admin) && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={admin.isActive ? 'success' : 'destructive'}>
                      {admin.isActive ? 'Active' : 'Suspended'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {displayDate(admin.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {/* Editing your own row is allowed — that is where you
                          read your status. The status control inside is what
                          gets disabled, not the way in. */}
                      <IconAction label="Edit" icon={Pencil} onClick={() => openEdit(admin)} />
                      <IconAction
                        label={
                          isSelf(admin)
                            ? 'You cannot delete your own admin account'
                            : 'Delete'
                        }
                        icon={Trash2}
                        tone="destructive"
                        disabled={isSelf(admin)}
                        onClick={() => setDeleting(admin)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination meta={data.meta} onPageChange={setPage} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <ShieldCheck className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{q ? 'No admins match your search' : 'No admins yet'}</p>
            <p className="text-sm text-muted-foreground">
              {q ? 'Try a different email.' : 'Add someone who should be able to run the platform.'}
            </p>
          </div>
          {!q && (
            <Button onClick={openCreate}>
              <Plus /> New admin
            </Button>
          )}
        </div>
      )}

      <AdminFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        admin={editing}
        isSelf={editing ? editing.id === me?.user.id : false}
      />
      <AdminDeleteDialog admin={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  );
}
