'use client';

import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { fileUrl } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FilePurpose = 'VENDOR_LOGO' | 'DRIVER_FACE' | 'DRIVER_BIKE';

/**
 * Uploads on selection and hands back the storage key; the parent form saves
 * the key with the rest of its fields.
 */
export function ImageUpload({
  purpose,
  value,
  onChange,
  label,
  className,
}: {
  purpose: FilePurpose;
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  label: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { key } = await api.postForm<{ key: string }>(
        `/files/upload?purpose=${purpose}`,
        body,
      );
      onChange(key);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative">
            <img
              src={fileUrl(value)}
              alt={label}
              className="size-16 rounded-md border object-cover"
            />
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onChange(null)}
              className="absolute -right-2 -top-2 cursor-pointer rounded-full border bg-card p-0.5 text-muted-foreground shadow-sm hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <ImagePlus className="size-5" aria-hidden />
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {value ? 'Replace' : 'Upload'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}

