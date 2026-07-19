import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface MultiSelectOption {
  id: number;
  name: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: number[];
  onChange: (value: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((o) => value.includes(o.id));

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function remove(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(value.filter((v) => v !== id));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-9 w-full justify-between font-normal',
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((o) => (
                <Badge
                  key={o.id}
                  variant="secondary"
                  className="gap-1 pr-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {o.name}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${o.name}`}
                    className="rounded-full hover-elevate"
                    onClick={(e) => remove(o.id, e)}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value.includes(option.id);
                return (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => toggle(option.id)}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {option.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
