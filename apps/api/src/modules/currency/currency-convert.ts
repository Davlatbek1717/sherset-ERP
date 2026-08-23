/**
 * Valyuta o'girish — endi `@moysklad/money` da turadi.
 *
 * Formula (aniq BigInt arifmetikasi, «кратность» + teskari kurs, oxirida
 * BITTA yaxlitlash) 2026-08-23 da paketga ko'chirildi: tovar narxi valyutada
 * saqlanishi mumkin va uni WEB tomoni ham bazaga o'giradi, ya'ni ikkala tomon
 * bitta manbadan o'qishi shart — aks holda hisobot bilan ekran bir-biriga mos
 * kelmay qoladi. Bu fayl mavjud chaqiruvchilar uchun (enter, supply, report,
 * money-map) yo'lni saqlab qolgan re-export.
 */
export {
  convertMinor,
  divRoundHalfAway,
  toBaseMinor,
  type CurrencyRate,
} from '@moysklad/money';
