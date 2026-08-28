'use client';

import { normalizeLebanesePhone } from '@loadless/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/**
 * Phone-first lookup input. Emits the normalized phone once the typed value
 * becomes a valid Lebanese number; null while incomplete/invalid.
 */
export function usePhoneSearch() {
  const [raw, setRaw] = useState('');
  const debounced = useDebouncedValue(raw, 300);
  const normalized = useMemo(() => normalizeLebanesePhone(debounced), [debounced]);
  return { raw, setRaw, normalized, isTyping: raw !== debounced };
}

export function PhoneSearchInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="tel"
        inputMode="tel"
        autoFocus={autoFocus}
        placeholder="Customer phone — 03 123 456"
        className="data-mono h-12 pl-9 text-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
