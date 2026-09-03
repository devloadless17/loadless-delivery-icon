'use client';

import { CalendarDays, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A date input that looks like the rest of the app.
 *
 * Still a native `<input type="date">` underneath — that keeps the OS picker,
 * the keyboard segment stepping and the mobile date wheel, none of which a
 * hand-rolled calendar gets right for free. What it fixes is everything the
 * browser does that the app should own:
 *
 *   - the default calendar glyph, replaced by the app's own icon;
 *   - the empty "dd/mm/yyyy" hint, which Chrome paints in full-strength text
 *     so an empty filter reads as if it holds a value;
 *   - a width that crushed the segments into "dd----yyyy";
 *   - no way to clear a date once set.
 */
export interface DateFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Announced on the clear button, e.g. "from date". */
  clearLabel?: string;
}

export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  ({ className, value, onValueChange, clearLabel = 'date', disabled, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement | null>(null);
    const setRefs = (node: HTMLInputElement | null) => {
      inner.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    function openPicker() {
      const el = inner.current;
      if (!el || disabled) return;
      // showPicker throws if the browser declines (or does not implement it);
      // focusing still lets the field be typed into, so never let it bubble.
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    }

    return (
      <div className="relative">
        <CalendarDays
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          {...props}
          ref={setRefs}
          type="date"
          disabled={disabled}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn(
            'flex h-10 w-full rounded-lg border border-input bg-card py-2 ps-9 pe-9 text-sm shadow-none transition-all duration-150',
            'hover:border-input focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15',
            'disabled:cursor-not-allowed disabled:opacity-50',
            // The browser's own picker button is replaced by the icon above;
            // it stays in the layout as a full-field click target so tapping
            // anywhere opens the picker.
            '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0',
            '[&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full',
            '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
            // An empty date must read as a hint, not as data.
            value ? 'text-foreground' : 'text-muted-foreground/70',
            className,
          )}
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label={`Clear ${clearLabel}`}
            onClick={() => {
              onValueChange('');
              inner.current?.focus();
            }}
            className="absolute end-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={openPicker}
            className="absolute end-2 top-1/2 -translate-y-1/2 cursor-pointer p-1 opacity-0"
          />
        )}
      </div>
    );
  },
);
DateField.displayName = 'DateField';
