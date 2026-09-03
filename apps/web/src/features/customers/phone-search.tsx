'use client';

import { useTranslations } from 'next-intl';
import { normalizePhone } from '@loadless/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/**
 * Phone-first lookup input. Emits the normalized phone once the typed value
 * becomes a valid number — Lebanese by default, any country with a leading
 * + or 00. Null while incomplete or invalid.
 */
export function usePhoneSearch() {
  const [raw, setRaw] = useState('');
  const debounced = useDebouncedValue(raw, 300);
  const normalized = useMemo(() => normalizePhone(debounced), [debounced]);
  return { raw, setRaw, debounced, normalized, isTyping: raw !== debounced };
}

export function PhoneSearchInput({
  value,
  onChange,
  autoFocus,
  mode = 'phone',
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  /**
   * 'phone' — creating an order, where a number is the only valid answer, so
   * the numeric keypad opens straight away.
   * 'any'   — looking someone up, where a name is just as good a way in. A tel
   *   input would give a phone user a keypad they cannot type "Ahmad" on.
   */
  mode?: 'phone' | 'any';
}) {
  const t = useTranslations('vendor.customers');
  const isPhone = mode === 'phone';
  return (
    <div className="relative">
      <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type={isPhone ? 'tel' : 'text'}
        inputMode={isPhone ? 'tel' : 'text'}
        autoFocus={autoFocus}
        dir={isPhone ? 'ltr' : 'auto'}
        placeholder={isPhone ? t('searchPhone') : t('searchAny')}
        className={cn('h-12 ps-9 text-base', isPhone && 'data-mono')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
