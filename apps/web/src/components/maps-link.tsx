'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const LINK_OK = /^https?:\/\/\S+$/;

/**
 * Locations travel as Google Maps links here: the customer shares one on
 * WhatsApp, the vendor pastes it, the driver taps it and navigates.
 */
export function MapsLinkField({
  value,
  onChange,
  id = 'maps-link',
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
}) {
  const t = useTranslations('address');
  const valid = LINK_OK.test(value.trim());
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <MapPin className="size-3.5 text-muted-foreground" aria-hidden /> {label ?? t('mapsLinkFromCustomer')}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="url"
          inputMode="url"
          placeholder={t('mapsPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className={cn('data-mono text-sm', value && !valid && 'border-warning')}
        />
        {valid && (
          <a href={value.trim()} target="_blank" rel="noopener noreferrer" aria-label={t('previewLink')}>
            <Button type="button" variant="outline" size="icon">
              <ExternalLink />
            </Button>
          </a>
        )}
      </div>
      {value && !valid && (
        <p className="text-xs text-warning">{t('notALink')}</p>
      )}
    </div>
  );
}

export function MapsLinkButton({
  url,
  size = 'default',
  className,
  label = 'Open location',
}: {
  url: string | null;
  size?: 'default' | 'sm' | 'touch';
  className?: string;
  label?: string;
}) {
  if (!url) {
    return (
      <Button variant="outline" size={size} disabled className={className}>
        <Navigation /> No location link
      </Button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      <Button variant="outline" size={size} className="w-full">
        <Navigation /> {label}
      </Button>
    </a>
  );
}
