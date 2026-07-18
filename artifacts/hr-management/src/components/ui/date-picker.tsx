'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const ISO_FORMAT = 'yyyy-MM-dd';

function parseIso(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

export interface DatePickerProps extends React.AriaAttributes {
  /** ISO yyyy-MM-dd, matching the value format of a native <input type="date"> */
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  /** ISO yyyy-MM-dd */
  min?: string;
  /** ISO yyyy-MM-dd */
  max?: string;
  className?: string;
}

/**
 * Popover date picker built on the app's own Calendar component, used in
 * place of a native <input type="date"> — browsers' built-in date pickers
 * (particularly Chromium's) can misfire a selection when only navigating
 * months, closing the picker on a day the user never actually clicked.
 */
export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  function DatePicker(
    { value, onChange, onBlur, id, name, placeholder = 'Pick a date', disabled, min, max, className, ...aria },
    ref,
  ) {
    const [open, setOpen] = React.useState(false);
    const selected = parseIso(value);
    const minDate = parseIso(min);
    const maxDate = parseIso(max);

    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur?.();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            id={id}
            name={name}
            type="button"
            variant="outline"
            disabled={disabled}
            {...aria}
            className={cn(
              'w-full justify-start text-left font-normal',
              !selected && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {selected ? format(selected, 'dd/MM/yyyy') : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={(date) =>
              (minDate ? date < minDate : false) || (maxDate ? date > maxDate : false)
            }
            onSelect={(date) => {
              onChange?.(date ? format(date, ISO_FORMAT) : '');
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
