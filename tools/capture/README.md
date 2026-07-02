# @moysklad/capture

Playwright-based discovery tooling — **moysklad clone uchun professional ma'lumot yig'uvchi**.

## Nima qiladi

Uchta alohida narsa:

### 1. API docs scraper (`scrape-api`)
- Manbai: `dev.moysklad.ru/doc/api/remap/1.2/`
- Anonim (hech qanday auth kerak emas)
- 53 entity + 36 document schema
- Har biri: field name, type, filter operators, description, flags (required / readOnly / UZ-specific / ...)
- Natija: `docs/moysklad-reference/data-model/entities/*.json` (53 fayl) + `documents/*.json` (36 fayl)

### 2. App UI scraper (`scrape-app`)
- Manbai: `online.moysklad.ru/app/`
- **Auth kerak** — birinchi marta interaktiv login (`pnpm ... auth`)
- 80+ marshrut: har modul (12 ta), har submenu, admin
- Har sahifa uchun: full-page screenshot (retina 2x) + DOM HTML + strukturalangan JSON (toolbar, filters, columns, empty state)
- Natija: `docs/moysklad-reference/visual-captures/<module>/<page>/`

### 3. Design tokens extractor (`scrape-tokens`)
- Auth kerak
- Real page'dan computed CSS
- Font, color, spacing, border-radius, button styles, CSS variables
- Natija: `docs/moysklad-reference/design-tokens-extracted.json`

## Boshlash

```bash
# 1. Browser'ni o'rnatish (birinchi marta)
pnpm --filter @moysklad/capture install:browser

# 2. Login (birinchi marta — brauzer ochiladi, siz qo'lda login qilasiz)
pnpm --filter @moysklad/capture auth

# 3. Hamma narsani scrape qilish (~2-4 soat)
pnpm --filter @moysklad/capture scrape-all

# YOKI alohida-alohida:
pnpm --filter @moysklad/capture scrape-api         # 10-20 daqiqa
pnpm --filter @moysklad/capture scrape-app         # 1-2 soat
pnpm --filter @moysklad/capture scrape-tokens      # 30 soniya

# Yoki ma'lum marshrutlargagina:
pnpm --filter @moysklad/capture scrape-app --routes=product,counterparty,purchaseorder
```

## Xavfsizlik

- **Login state `.credentials/moysklad-storage-state.json`da saqlanadi** — `.gitignore`da
- Parolingiz kodda yo'q — siz o'zingiz brauzerga kiritib, keyin yopasiz
- User-Agent haqiqiy Chrome'ga o'xshaydi
- Rate limit: sahifalar orasida 800ms pauza, bir vaqtda 1 ta sahifa (app), 3 ta (api docs)

## Chiqish strukturasi

```
docs/moysklad-reference/
├── data-model/
│   ├── entity-schemas/           # scrape-api output (53 fayl)
│   │   ├── counterparty.json
│   │   ├── product.json
│   │   └── ...
│   └── document-schemas/         # scrape-api output (36 fayl)
│       ├── purchaseorder.json
│       ├── demand.json
│       └── ...
├── visual-captures/               # scrape-app output
│   ├── 02-module/
│   │   └── purchaseorder/
│   │       ├── 01-default.png
│   │       ├── dom-default.html
│   │       └── capture.json
│   └── ...
└── design-tokens-extracted.json   # scrape-tokens output
```

Har JSON schema:

```jsonc
// entity-schemas/counterparty.json
{
  "slug": "counterparty",
  "title": "Контрагент",
  "section": "dictionaries",
  "url": "https://dev.moysklad.ru/doc/api/remap/1.2/#/dictionaries/counterparty",
  "capturedAt": "2026-04-17T...",
  "sections": [
    { "title": "Контрагент", "level": 2 },
    { "title": "Реквизиты", "level": 3 },
    ...
  ],
  "tables": [
    {
      "heading": "Атрибуты сущности",
      "fields": [
        {
          "name": "accountId",
          "type": "UUID",
          "filtering": "= !=",
          "description": "ID учетной записи",
          "flags": {
            "required": true,
            "readOnly": true,
            "requiredOnCreate": false,
            "expandable": false,
            "onDemand": false,
            "immutableAfterSet": false,
            "regionTag": null
          }
        },
        ...
      ]
    },
    ...
  ],
  "crossRefs": [ ... ],
  "rawTableCount": 42
}
```

## Keyingi qadamlar (capture tugagandan keyin)

1. **Codegen:** `pnpm codegen:prisma` — `entity-schemas/*.json` → `packages/db/prisma/schema.prisma`
2. **Codegen:** `pnpm codegen:zod` — Zod validation schemas
3. **Tokens:** `packages/ui/tokens.ts` — `design-tokens-extracted.json` asosida Tailwind config
4. **Pattern library:** `visual-captures/` dan 15 pattern'ni olish, har biriga reference komponenti

## Texnologik yo'riqlar

- **Playwright** — Chromium engine (native JS execution)
- **Headless** default (`auth` dan boshqa hammasi)
- Har sahifa uchun alohida `page.goto` — toza state
- `settle()` helper bilan async content yuklangunga qadar kutish

## Debug

```bash
# Verbose log
LOG_LEVEL=debug pnpm --filter @moysklad/capture scrape-api

# Ko'rinadigan brauzer (debug uchun)
# — manuially auth.ts da { headless: false } qiling
```

## Cheklovlar

- Rate limit oshib ketsa Moysklad'ning CDN 429 yoki block qilishi mumkin → pauzani oshiring (`config.ts` → `TIMING.betweenPages`)
- Login session expire bo'ladi (~24 soat) → `auth` qayta ishga tushuring
- Ba'zi sahifalar (POS, mobile-only view) full-page screenshot to'g'ri olmasligi mumkin → manual fallback
