# /<slug> parity spec

**Manba**: `docs/moysklad-reference/visual-captures/<NN>-module/<module>/`
**Tahriri**: <YYYY-MM-DD>
**Holat**: ⏸ Draft / 🚧 In progress / ✅ Done

---

> Bu hujjat har string'ning manbasi bilan to'ldirilishi kerak.
> Hech qanday taxmin yo'q. Capture'da topilmagan narsa "❓ TODO:
> capture'da yo'q, foydalanuvchidan so'rash kerak" deb belgilanadi.

---

## 1. List view (`dom/01-default.html`)

### Title row
- **H1 matni**: `<exact ru>` _(source: dom/01-default.html L<XXX>)_
- Refresh icon: ✅/❌
- Help icon (?): ✅/❌

### Sub-tabs (RU only, exact tartib)
| # | Matn | Href | Source |
|---|---|---|---|
| 1 | … | … | dom/01-default.html L… |

### Toolbar (chap-o'ng)
| # | Element | Matn | Type | Source |
|---|---|---|---|---|
| 1 | Primary CTA | … | button | … |
| 2 | Filter button | "Фильтр" | button | … |
| 3 | Selection counter | "0" | text | … |
| 4 | Bulk dropdown | "Изменить ▾" | dropdown | … |
| 5 | Status dropdown | "Статус ▾" | dropdown | … |
| 6 | Create dropdown | "Создать ▾" | dropdown | … |
| 7 | Print dropdown | "Печать ▾" | dropdown | … |
| 8 | Solutions | "Решения ▾" | dropdown | … |
| 9 | Columns | settings icon | button | … |

### Search
- **Placeholder**: `<exact ru>` _(source: …)_
- Position: inline-toolbar / above-table

### Columns (default visible)
| Order | Key | Header | Type | Align | Source |
|---|---|---|---|---|---|
| 1 | name | "№" | string | left | dom/01-default.html L… |
| … | | | | | |

### Empty state
- **Heading**: `<exact ru>` _(source: dom/01-default.html L<XXX>)_
- **Helper link**: `<exact ru>` → `<href>` _(source: …)_
- **Resource cards**: 0/3
  | Matn | Href | Icon |
  |---|---|---|
  | … | … | … |
- **Illustration present**: ✅/❌

### Pagination format
- **Format**: `1-1 из 0` / `1-25 из 1234` _(source: …)_
- Footer sum row: ✅/❌
  - Columns with sum: …

---

## 2. Toolbar dropdowns

### "Изменить ▾" (`dom/02-dropdown-izmenit.html`)
| # | Item matn | Action |
|---|---|---|
| 1 | Удалить | …  |
| 2 | … | … |

### "Создать ▾" (`dom/03-dropdown-sozdat-dokument.html`)
| # | Item matn | Yangi doc tipi | Pre-fill |
|---|---|---|---|
| 1 | … | … | … |

### "Печать ▾" (`dom/04-dropdown-pechat.html`)
| # | Template matn | Format |
|---|---|---|
| 1 | … | PDF |

### "Отправить ▾" (`dom/05-dropdown-otpravit.html`)
| # | Item matn | Channel |
|---|---|---|
| 1 | … | email/sms |

---

## 3. Edit form (`dom/08-edit-default.html`)

### Tabs
| # | Matn | Source |
|---|---|---|
| 1 | Главная | … |
| 2 | Связанные документы | … |
| 3 | Файлы | … |
| 4 | Задачи | … |
| 5 | События | … |

### Form header
- Save button matn: `<exact ru>` _(source: …)_
- Save and close: …
- Cancel: …
- Delete: …

### Tab "Главная" fields
| Order | Label (ru) | Required | Type | Validation | Source |
|---|---|---|---|---|---|
| 1 | Дата | yes | datetime | not future | dom/08-… L… |
| … | | | | | |

### Tab "Позиции" (`dom/13-edit-tab-positions.html`)
- Catalog picker trigger: …
- Per-row fields: Tovar / Qty / Price / Discount / VAT
- Bulk add: "Добавить из справочника" → dom/18-catalog-picker.html
- Import: "Импорт"
- "Проверить комплектацию"

---

## 4. Detail page (`dom/0X-detail-default.html`)

### Tabs
| # | Matn | Source |
|---|---|---|
| 1 | Главная | … |
| 2 | Связанные документы | … |
| 3 | Файлы | … |
| 4 | Задачи | … |
| 5 | События | … |

### "Главная" sections
- Header: …
- Body sections: …
- Linked documents panel: …

---

## 5. Field modallar

### Catalog picker (`dom/18-catalog-picker.html`)
- Title: …
- Search: …
- List columns: …
- "Выбрать" / "Отмена" buttons: …

### Agent picker (`dom/0X-field-modal-agent-picker.html`)
- …

### Date picker (`dom/0X-field-modal-date-picker.html`)
- …

---

## 6. Row context menu (`dom/0X-row-context-menu.html`)
- Items: …

---

## 7. Bulk action modallar

### Delete confirm (`dom/0X-action-modal-udalit.html`)
- Title: …
- Body: …
- Buttons: …

### Status changer (`dom/0X-action-modal-izmenit-status.html`)
- …

---

## 8. i18n string'lar (capture'dan extracted)

| Key | RU | UZ | Source |
|---|---|---|---|
| `pages.<ns>.title` | … | … | dom/01-default.html L… |
| `pages.<ns>.search_placeholder` | … | … | … |
| `pages.<ns>.empty_heading` | … | … | … |
| `pages.<ns>.empty_helper` | … | … | … |

> UZ tarjimasi: agar moysklad'da uz toggle bo'lmasa, men avtomat
> tarjima qilaman, lekin RU avval capture'dan kelishi shart.

---

## 9. Open questions / TODO

- ❓ **<savol>**: capture'da topilmadi, foydalanuvchi'dan so'rash
  kerak.
- ❓ ...

---

## 10. Definition of Done

- [ ] List view 9 element capture bilan side-by-side mos
- [ ] 4 ta toolbar dropdown ochilib to'g'ri item ko'rsatadi
- [ ] Edit form 30+ field capture bilan mos
- [ ] Detail page 5 tab capture bilan mos
- [ ] Field modallar (agent/date/catalog) capture bilan mos
- [ ] Row context menu capture bilan mos
- [ ] Har string capture'dan kelgan
- [ ] Typecheck + biome clean
- [ ] Manual smoke (lokal'da har element click qilib tekshirilgan)
- [ ] Adversarial QA pass
- [ ] PARITY-STATUS.md DONE belgisi
