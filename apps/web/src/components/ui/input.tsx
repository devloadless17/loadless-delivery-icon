import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-base shadow-none transition-all duration-150',
        'placeholder:text-muted-foreground/80',
        'hover:border-input focus-visible:outline-none focus-visible:border-primary-strong focus-visible:ring-[3px] focus-visible:ring-primary-strong/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
