'use client';

import * as DM from '@radix-ui/react-dropdown-menu';
import type * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button, type ButtonProps } from './Button.tsx';

/**
 * Dropdown menu — moysklad-style toolbar dropdowns
 * (Изменить / Создать документ / Печать / Отправить).
 *
 * Compose:
 *   <DropdownMenu trigger={<Button>Печать</Button>}>
 *     <DropdownMenu.Item onSelect={...} icon={<Icons.print />}>Шаблон 1</DropdownMenu.Item>
 *     <DropdownMenu.Separator />
 *     <DropdownMenu.Item destructive onSelect={...}>Удалить</DropdownMenu.Item>
 *   </DropdownMenu>
 */

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  className?: string;
}

function DropdownMenuRoot({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  open,
  onOpenChange,
  testId,
  className,
}: DropdownMenuProps) {
  return (
    <DM.Root open={open} onOpenChange={onOpenChange}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          side={side}
          sideOffset={4}
          className={cn(
            'z-50 min-w-[180px]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface,white)] shadow-[var(--ms-shadow-elevated)]',
            'p-1 text-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95',
            className,
          )}
          data-test-id={testId}
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export interface DropdownMenuItemProps {
  children: React.ReactNode;
  onSelect?: () => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
}

function DropdownMenuItem({
  children,
  onSelect,
  icon,
  destructive,
  disabled,
  testId,
}: DropdownMenuItemProps) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={() => onSelect?.()}
      className={cn(
        'flex items-center gap-2 rounded-[var(--ms-radius-sm)] px-2 py-1.5',
        'cursor-pointer outline-none',
        'data-[highlighted]:bg-[var(--ms-bg-muted)]',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        destructive && 'text-[var(--ms-text-destructive)]',
      )}
      data-test-id={testId}
    >
      {icon && <span className="text-[var(--ms-text-muted)]">{icon}</span>}
      <span className="flex-1">{children}</span>
    </DM.Item>
  );
}

function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-[var(--ms-border-default)]" />;
}

function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DM.Label className="px-2 py-1 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
      {children}
    </DM.Label>
  );
}

/**
 * Convenience trigger: a Button with a chevron-down icon that opens the menu.
 * Use like: <DropdownButton variant="secondary">Печать</DropdownButton>
 */
function DropdownButton({
  children,
  ...rest
}: ButtonProps & { children: React.ReactNode }) {
  return (
    <Button {...rest}>
      {children}
      <Icons.down className="h-4 w-4" />
    </Button>
  );
}

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
  Button: DropdownButton,
});
