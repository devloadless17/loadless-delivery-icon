'use client';

import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickerOption {
  id: string;
  label: string;
  /** Secondary line — a phone number, a duty state. Never the only thing that identifies a row. */
  hint?: string;
}

interface EntityPickerProps {
  /** Selected id, or '' for none. */
  value: string;
  /**
   * Label for the current selection. The picker cannot look this up itself: the
   * selected row is frequently NOT in the current search results (you searched
   * "sami", picked him, then cleared the box), and rendering a bare id there
   * would be worse than useless.
   */
  selectedLabel?: string;
  onSelect: (option: PickerOption | null) => void;
  /** Search text — owned by the caller, who also owns the query it drives. */
  query: string;
  onQueryChange: (q: string) => void;
  options: PickerOption[];
  isPending?: boolean;
  /** True when the server has more matches than it returned. */
  hasMore?: boolean;
  placeholder: string;
  /** Label for the "no filter" choice. Omit entirely to make a selection mandatory. */
  clearLabel?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * A picker that SEARCHES rather than listing.
 *
 * The dropdowns this replaces fetched page 1 at limit 20 of a list the server
 * orders newest-first, which meant the 21st-oldest driver could not be assigned
 * an order at all — not a truncated list, a dead end, and one that gets worse
 * every time the client hires someone. Searching server-side has no such
 * ceiling, and it is how anyone looks for a name they already know.
 *
 * Built on the plain primitives rather than a combobox dependency: this has to
 * work inside a Dialog, where a portalled popover fights the dialog's own focus
 * trap.
 */
export function EntityPicker({
  value,
  selectedLabel,
  onSelect,
  query,
  onQueryChange,
  options,
  isPending = false,
  hasMore = false,
  placeholder,
  clearLabel,
  id,
  disabled = false,
}: EntityPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  // Clicking anywhere else closes the list. Pointerdown, not click, so the list
  // is gone before a click on whatever is underneath resolves.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  React.useEffect(() => setActive(0), [query, open]);

  const rows: PickerOption[] = React.useMemo(
    () => (clearLabel ? [{ id: '', label: clearLabel }, ...options] : options),
    [clearLabel, options],
  );

  function choose(option: PickerOption) {
    onSelect(option.id ? option : null);
    onQueryChange('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const row = rows[active];
      if (row) {
        e.preventDefault();
        choose(row);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Closed, this reads as the chosen value; open, it is a search box. One
          control either way, so there is no hunting for where to type. */}
      {open ? (
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          autoFocus
          value={query}
          disabled={disabled}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Search ${placeholder.toLowerCase()}…`}
          className={cn(
            'flex h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-base',
            'focus-visible:border-primary-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-strong/15',
          )}
        />
      ) : (
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={false}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-card px-3.5 py-2 text-left text-sm',
            'hover:border-input focus-visible:border-primary-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-strong/15',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground/80')}>
            {value ? (selectedLabel ?? placeholder) : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value && clearLabel && (
              // A filter you cannot clear is a trap.
              <X
                role="button"
                aria-label="Clear selection"
                className="size-4 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                }}
              />
            )}
            <ChevronDown className="size-4 opacity-50" />
          </span>
        </button>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-input bg-card p-1 shadow-lg"
        >
          {isPending && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
          )}
          {!isPending && rows.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
          )}
          {rows.map((option, i) => (
            <li key={option.id || '__clear'}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                  i === active && 'bg-muted',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </span>
                {option.id === value && <Check className="size-4 shrink-0 opacity-60" />}
              </button>
            </li>
          ))}
          {hasMore && (
            // Saying so beats silently hiding the person they are looking for —
            // the exact failure the capped dropdowns had.
            <li className="border-t px-3 py-2 text-xs text-muted-foreground">
              More matches exist — keep typing to narrow.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
