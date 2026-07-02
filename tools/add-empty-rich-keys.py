"""
Insert pages.<name>.empty_rich_heading + empty_rich_helper keys into
uz.json and ru.json for every Round 1 page that gets the new
ListView.richEmpty pattern. Idempotent — skips entries that already
have these keys.

Translations are sourced from a hand-curated map (per moysklad's own
empty-state copy where I've seen the exact wording, otherwise
"Создавайте … X" / "<Bizning> X yarating" style). Anything we don't
have a real moysklad string for goes through with a sensible
placeholder; the per-page parity work refines them later.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

REPO = Path("D:/projects/moysklad")
UZ_PATH = REPO / "apps" / "web" / "src" / "messages" / "uz.json"
RU_PATH = REPO / "apps" / "web" / "src" / "messages" / "ru.json"

# (page_namespace, ru_heading, ru_helper, uz_heading, uz_helper)
ENTRIES: list[tuple[str, str, str, str, str]] = [
    (
        "customer_orders",
        "Создавайте и принимайте заказы покупателей",
        "После подтверждения заказа создайте отгрузку и счёт",
        "Mijoz buyurtmalarini yarating va qabul qiling",
        "Buyurtmani tasdiqlagandan so'ng otgruzka va schyot yarating",
    ),
    (
        "demands",
        "Создавайте отгрузки покупателям",
        "Отгрузка списывает товар со склада и формирует выручку",
        "Mijozlarga otgruzkalar yarating",
        "Otgruzka tovarni ombordan chiqaradi va savdoni yozadi",
    ),
    (
        "invoices_out",
        "Выставляйте счета покупателям",
        "После оплаты счёта создайте отгрузку",
        "Mijozlarga schyotlar bering",
        "Schyot to'langandan so'ng otgruzka yarating",
    ),
    (
        "sales_returns",
        "Регистрируйте возвраты покупателей",
        "Возврат вернёт товар на склад и сторнирует выручку",
        "Mijoz qaytarishlarini yozib oling",
        "Qaytarish tovarni omborga qaytaradi va savdoni bekor qiladi",
    ),
    (
        "supplies",
        "Создавайте приёмки от поставщиков",
        "Приёмка приходует товар на склад и фиксирует кредиторскую",
        "Ta'minlovchilardan qabullar yarating",
        "Qabul tovarni omborga qo'shadi va kreditor qarzni yozadi",
    ),
    (
        "invoices_in",
        "Принимайте счета от поставщиков",
        "После оплаты счёта поставщика создайте приёмку",
        "Ta'minlovchi schyotlarini qabul qiling",
        "Schyot to'langandan so'ng qabul yarating",
    ),
    (
        "purchase_returns",
        "Регистрируйте возвраты поставщикам",
        "Возврат списывает товар со склада и сторнирует кредиторскую",
        "Ta'minlovchiga qaytarishlarni yozib oling",
        "Qaytarish tovarni ombordan chiqaradi va kreditor qarzni bekor qiladi",
    ),
    (
        "cash_in",
        "Регистрируйте поступления в кассу",
        "ПКО фиксирует приход наличных и закрывает счёт покупателя",
        "Kassaga kirim orderlarini yozib oling",
        "ПКО naqd kirimni qayd etadi va xaridor schyotini yopadi",
    ),
    (
        "cash_out",
        "Регистрируйте выдачи из кассы",
        "РКО фиксирует расход наличных",
        "Kassadan chiqim orderlarini yozib oling",
        "РКО naqd chiqimni qayd etadi",
    ),
    (
        "payments_in",
        "Принимайте платежи на расчётный счёт",
        "Входящие платежи закрывают счета покупателей",
        "Hisob raqamiga kelgan to'lovlar",
        "Kirgan to'lov xaridor schyotini yopadi",
    ),
    (
        "payments_out",
        "Делайте платежи поставщикам",
        "Исходящие платежи закрывают счета поставщиков",
        "Ta'minlovchilarga to'lovlar",
        "Chiqqan to'lov ta'minlovchi schyotini yopadi",
    ),
    (
        "counterparties",
        "Заводите контрагентов — покупателей и поставщиков",
        "Из карточки контрагента можно создать счёт, отгрузку или приёмку",
        "Kontragentlarni qo'shing — xaridorlar va ta'minlovchilar",
        "Kontragent kartasidan schyot, otgruzka yoki qabul yaratishingiz mumkin",
    ),
    (
        "products",
        "Заводите товары и услуги, которыми торгуете",
        "Каждый товар может быть с модификациями, ценами и остатками",
        "Sotadigan tovarlar va xizmatlarni qo'shing",
        "Har tovar modifikatsiyalar, narxlar va qoldiqlar bilan bo'lishi mumkin",
    ),
    (
        "contact_persons",
        "Добавляйте контактных лиц контрагентов",
        "Сюда попадают директор, бухгалтер, менеджеры — те, кому пишете",
        "Kontragent aloqa shaxslari",
        "Direktor, hisobchi, menejerlar — siz aloqada bo'ladigan kishilar",
    ),
    (
        "moves",
        "Перемещайте товары между складами",
        "Перемещение списывает с одного склада и приходует на другой",
        "Tovarlarni omborlar o'rtasida ko'chiring",
        "Ko'chirish bir ombordan chiqaradi va boshqasiga qo'shadi",
    ),
    (
        "losses",
        "Регистрируйте списания и потери",
        "Списание уменьшает остаток на складе",
        "Yo'qotishlar va hisobdan chiqarishlarni qayd eting",
        "Hisobdan chiqarish ombor qoldig'ini kamaytiradi",
    ),
    (
        "enters",
        "Оприходуйте товар на склад",
        "Оприходование увеличивает остаток без поставщика",
        "Tovarni omborga oprixod qiling",
        "Oprixod ta'minlovchisiz qoldiqni oshiradi",
    ),
    (
        "inventories",
        "Проводите инвентаризации",
        "Инвентаризация выравнивает фактический остаток с учётным",
        "Inventarizatsiyalar o'tkazing",
        "Inventarizatsiya haqiqiy qoldiqni hisob bilan tenglashtiradi",
    ),
    (
        "tasks",
        "Создавайте задачи и поручения сотрудникам",
        "У задачи есть исполнитель, срок, приоритет и связь с документом",
        "Vazifalar va topshiriqlar yarating",
        "Vazifaning bajaruvchisi, muddati, ustuvorligi va hujjatga aloqasi bor",
    ),
    (
        "opportunities",
        "Управляйте сделками в воронке продаж",
        "Из сделки создаётся заказ, счёт или отгрузка",
        "Bitimlarni voronkada boshqaring",
        "Bitimdan buyurtma, schyot yoki otgruzka yaratiladi",
    ),
    (
        "services",
        "Заводите услуги, которые оказываете",
        "Услуга добавляется в документы как позиция без остатка",
        "Ko'rsatadigan xizmatlar",
        "Xizmat qoldiqsiz pozitsiya sifatida hujjatga qo'shiladi",
    ),
    (
        "bundles",
        "Создавайте комплекты — наборы товаров",
        "Комплект собирается из отдельных товаров и продаётся как один",
        "Komplektlar yarating — tovar to'plamlari",
        "Komplekt alohida tovarlardan yig'iladi va birga sotiladi",
    ),
    (
        "variants",
        "Создавайте модификации товара",
        "Модификации различаются цветом, размером или другим свойством",
        "Tovar modifikatsiyalarini yarating",
        "Modifikatsiyalar rang, o'lcham yoki boshqa xususiyat bilan farqlanadi",
    ),
    (
        "product_folders",
        "Группируйте товары по папкам",
        "Папки помогают навигации в большом каталоге",
        "Tovarlarni papkalarga guruhlang",
        "Papkalar katta katalogda navigatsiyani osonlashtiradi",
    ),
    (
        "calls",
        "Регистрируйте звонки от клиентов",
        "У звонка есть направление, статус и привязка к контрагенту",
        "Mijoz qo'ng'iroqlarini qayd eting",
        "Qo'ng'iroqning yo'nalishi, holati va kontragent bilan aloqasi bor",
    ),
]


def insert_keys(data: dict, ns: str, heading: str, helper: str) -> int:
    """Insert empty_rich_heading + empty_rich_helper into pages.<ns>.
    Returns 1 if added, 0 if already present, -1 if pages.<ns> missing."""
    pages = data.get("pages", {})
    if ns not in pages:
        return -1
    bucket = pages[ns]
    changed = 0
    if "empty_rich_heading" not in bucket:
        bucket["empty_rich_heading"] = heading
        changed = 1
    if "empty_rich_helper" not in bucket:
        bucket["empty_rich_helper"] = helper
        changed = 1
    return changed


def main() -> int:
    uz = json.loads(UZ_PATH.read_text(encoding="utf-8"))
    ru = json.loads(RU_PATH.read_text(encoding="utf-8"))

    added_uz = 0
    added_ru = 0
    missing_ns: list[str] = []

    for ns, ru_h, ru_help, uz_h, uz_help in ENTRIES:
        u = insert_keys(uz, ns, uz_h, uz_help)
        r = insert_keys(ru, ns, ru_h, ru_help)
        if u == -1 or r == -1:
            missing_ns.append(ns)
            continue
        added_uz += max(u, 0)
        added_ru += max(r, 0)

    UZ_PATH.write_text(
        json.dumps(uz, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    RU_PATH.write_text(
        json.dumps(ru, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(f"Added uz keys: {added_uz}")
    print(f"Added ru keys: {added_ru}")
    if missing_ns:
        print(f"Missing pages.<ns>: {missing_ns}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
