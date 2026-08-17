import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /**
   * Adornment o'rami (`<div class="relative">`) uchun qo'shimcha classlar.
   * Kenglik/flex classlarini INPUTGA emas, shu yerga bering — aks holda
   * o'ram (flex-item) kontent bo'yicha qisqarib qoladi.
   */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const { className, invalid, leading, trailing, disabled, wrapperClassName, ...rest } = props;

  const input = (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-[var(--ms-control-h)] w-full px-2 text-[13px]',
        'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]',
        'border',
        'placeholder:text-[var(--ms-text-placeholder)]',
        'transition-colors duration-[var(--ms-duration-fast)]',
        'focus-visible:outline-none focus-visible:border-[var(--ms-border-focus)]',
        'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
        invalid
          ? 'border-[color:var(--ms-action-destructive)]'
          : // moysklad parity: controls use the #bfbfbf (border-strong) resting
            // border, not the lighter #e6e6e6 divider tone. The "color:" arbitrary
            // tag lets tailwind-merge recognise it as a border-COLOR (a bare
            // arbitrary border value is width/color-ambiguous), so a caller's
            // `border-transparent` (borderless grid cells) actually overrides it.
            'border-[color:var(--ms-border-input)]',
        leading && 'pl-9',
        trailing && 'pr-9',
        className,
      )}
      {...rest}
    />
  );

  // 🔴 DARAXT SHAKLI BARQAROR BO'LISHI SHART (2026-08-17, egasi: «barcha qidiruv
  // inputlarida bitta belgi yozgach fokus chiqib ketadi»).
  //
  // Ilgari shart QIYMAT bo'yicha edi: `if (!leading && !trailing) return input;`
  // ⇒ adornment YO'Q holatda yalang'och <input>, adornment PAYDO bo'lganda esa
  // <div class="relative"><input/>…</div>. ListView qidiruvi adornment'ni
  // inputning O'Z qiymatiga bog'lagan (`trailing = search ? <✕> : undefined`),
  // shuning uchun BIRINCHI belgidayoq o'sha pozitsiyadagi element turi
  // input→div ga o'zgarardi: React eski DOM tugunini ajratib yangisini yaratadi
  // ⇒ fokus, kursor va IME holati yo'qoladi, keyingi belgilar esa yo'qoladi.
  //
  // Endi shart QIYMAT emas, PROP MAVJUDLIGI bo'yicha: chaqiruvchi `leading`/
  // `trailing` ni umuman uzatmasa (ilovadagi form maydonlarining aksariyati) —
  // o'ram YO'Q, layout ilgarigidek. Uzatgan bo'lsa — qiymati hozir bo'sh bo'lsa
  // ham o'ram DOIM chiqadi, ya'ni shakl o'zgarmaydi va fokus saqlanadi.
  //
  // ⚠️ Shu sababli adornment prop'ini SHARTLI ravishda tarqatmang
  // (`{...(cond && { trailing: x })}`) — bu prop kalitini paydo qilib-yo'qotadi
  // va xatoni qaytaradi. Qiymatni shartli bering, kalitni doim.
  const hasAdornmentSlot = 'leading' in props || 'trailing' in props;
  if (!hasAdornmentSlot) return input;

  return (
    <div className={cn('relative', wrapperClassName)}>
      {leading && (
        <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-[var(--ms-text-muted)]">
          {leading}
        </div>
      )}
      {input}
      {trailing && (
        <div className="-translate-y-1/2 absolute top-1/2 right-3 text-[var(--ms-text-muted)]">
          {trailing}
        </div>
      )}
    </div>
  );
});
Input.displayName = 'Input';
