import type { CreateMenuItem } from '@/components/document-detail';

/**
 * «Печать ▾» menyusini BIR XIL tartibda yig'adi (2026-08-01, egasining talabi:
 * «hamma chop etish qismlari bir xil bo'lishi kerak, eng muhimlari yuqorida»).
 *
 * Audit shuni ko'rsatdi: har sahifa menyuni o'zicha qurardi —
 *   invoices-out : [akkaunt] · standard · spiska · creceipt · set · configure
 *   supplies     : [akkaunt] · standard · set · configure
 *   demands      : blank · spiska · creceipt            (set/configure YO'Q)
 *   customer-orders / enters / payments-in : umuman menyu yo'q, 2 bandli zaxira
 *   losses / moves / inventories / … : chop menyusi umuman yo'q
 *
 * Kanonik tartib — muhimlik kamayishi bo'yicha:
 *   1. akkauntning O'Z shakllari  — foydalanuvchi o'zi yaratgan, eng muhimi
 *   2. hujjatning ASOSIY blankasi — «Расходная/Приходная накладная», «Счёт»…
 *   3. hujjatga xos qo'shimchalar — «Yig'ish varag'i», «Tovar cheki»
 *   4. «Комплект…»                — bir nechta shaklni bitta PDFga
 *   5. «Настроить…»               — shablonlar sozlamasi
 *
 * Qaysi qo'shimcha qaysi bo'limga tegishli ekanini CHAQIRUVCHI hal qiladi:
 * chek faqat sotuv tomonida ma'noli (xaridorga beriladi), yig'ish varag'i esa
 * omborga chiqadigan hujjatlarda. Buni yordamchi taxmin qilmaydi.
 */
export interface PrintMenuInput {
  /** Akkauntning o'z shablonlari — `{id, name}` ro'yxati. */
  accountForms?: { id: string; name: string }[] | null;
  /** Shablonni chop etish (bulk-print templateId bilan). */
  onAccountForm?: (templateId: string) => void;
  /** Hujjatning asosiy blankasi. */
  standard?: { label: string; onSelect: () => void } | null;
  /**
   * Hujjatga xos qo'shimcha shakllar — berilgan TARTIBDA chiqadi.
   * `id` menyu test-id'siga kiradi, shuning uchun barqaror bo'lsin.
   */
  extras?: { id: string; label: string; onSelect: () => void; disabled?: boolean }[];
  /** «Комплект…» — berilmasa band chiqmaydi. */
  set?: { label: string; onSelect: () => void } | null;
  /** «Настроить…» — berilmasa band chiqmaydi. */
  configure?: { label: string; onSelect: () => void } | null;
}

export function buildPrintMenu(input: PrintMenuInput): CreateMenuItem[] {
  const items: CreateMenuItem[] = [];

  for (const f of input.accountForms ?? []) {
    items.push({
      id: `form-${f.id}`,
      label: f.name,
      onSelect: () => input.onAccountForm?.(f.id),
    });
  }

  if (input.standard) {
    items.push({ id: 'standard', label: input.standard.label, onSelect: input.standard.onSelect });
  }

  for (const e of input.extras ?? []) {
    items.push({ id: e.id, label: e.label, onSelect: e.onSelect, disabled: e.disabled });
  }

  if (input.set) {
    items.push({ id: 'set', label: input.set.label, onSelect: input.set.onSelect });
  }
  if (input.configure) {
    items.push({
      id: 'configure',
      label: input.configure.label,
      onSelect: input.configure.onSelect,
    });
  }

  return items;
}
