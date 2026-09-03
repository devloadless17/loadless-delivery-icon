'use client';

import { useTranslations } from 'next-intl';
import { ADDRESS_LABELS, type AddressLabel } from '@loadless/shared';
import { MapsLinkField } from '@/components/maps-link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


export interface AddressDraft {
  label: AddressLabel;
  addressText: string;
  mapsUrl: string;
}

export const emptyAddressDraft: AddressDraft = { label: 'HOME', addressText: '', mapsUrl: '' };

/**
 * The address form body, shared by every place an address is written: the
 * profile's add/edit rows, the create-customer dialog, and order creation.
 * One definition means the maps-link field can never go missing from one of them.
 */
export function AddressFields({
  value,
  onChange,
  idPrefix,
  showLabel = true,
  autoFocus,
}: {
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
  idPrefix: string;
  showLabel?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations('address');
  const tl = useTranslations('address.label');
  const textId = idPrefix === 'new-address' ? 'new-address' : `${idPrefix}-address`;
  return (
    <div className="space-y-3">
      <div className={showLabel ? 'grid gap-3 sm:grid-cols-[8rem_1fr]' : ''}>
        {showLabel && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-label`}>{t('labelField')}</Label>
            <Select
              value={value.label}
              onValueChange={(label) => onChange({ ...value, label: label as AddressLabel })}
            >
              <SelectTrigger id={`${idPrefix}-label`} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDRESS_LABELS.map((label) => (
                  <SelectItem key={label} value={label}>
                    {tl(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={textId}>{t('addressField')}</Label>
          <Input
            id={textId}
            className="h-10"
            placeholder={t('addressPlaceholder')}
            value={value.addressText}
            onChange={(e) => onChange({ ...value, addressText: e.target.value })}
            autoFocus={autoFocus}
          />
        </div>
      </div>
      <MapsLinkField
        id={`${idPrefix}-maps`}
        value={value.mapsUrl}
        onChange={(mapsUrl) => onChange({ ...value, mapsUrl })}
      />
    </div>
  );
}
