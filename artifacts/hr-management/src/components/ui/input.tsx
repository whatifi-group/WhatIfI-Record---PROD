import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onChange, ...props }, ref) => {
    const isDate = type === 'date';

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
        // Auto-close the native date picker once a value is chosen
        if (isDate && e.target.value) {
          e.target.blur();
        }
      },
      [onChange, isDate],
    );

    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          isDate && !props.value && 'date-empty',
          className,
        )}
        ref={ref}
        onChange={isDate ? handleChange : onChange}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
