"""
Export 2,678 counterparties from the legacy Python+SQLite Moysklad
clone (D:/projects-desktop/projects/moysklad/backend/app.db) to a
JSON file that the TypeScript importer can ingest.

Output shape per row:
{
  "name": "...",
  "phone": "+998..." | null,
  "email": "..." | null,
  "externalCode": "<moysklad_id>",  // legacy moysklad UUID, kept for re-sync
  "tags": [...],
  "telegram": {                      // moved into Counterparty.attributes.telegram
    "username": "...",
    "phone": "...",
    "chatId": "...",
    "linked": true|false,
    "notificationsEnabled": true,
    "ustaPhone": "..."               // secondary contact in legacy schema
  },
  "balanceFloat": 0.0,                // legacy, not directly mapped (we use ledger)
  "createdAt": "ISO"
}

The phone field is run through a UZ E.164 normaliser if it doesn't
already look right. Empty strings → null.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

LEGACY_DB = Path("D:/projects-desktop/projects/moysklad/backend/app.db")
OUTPUT = Path("D:/projects/moysklad/tools/old-counterparties.json")


def normalise_phone(raw: str | None) -> str | None:
    """Best-effort UZ E.164 normaliser. Mirrors apps/api/src/modules/shared/phone.ts."""
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    # already +998…
    if raw.startswith("+998") and len(digits) == 12:
        return f"+{digits}"
    # 998… (no +)
    if digits.startswith("998") and len(digits) == 12:
        return f"+{digits}"
    # 9-digit local
    if len(digits) == 9:
        return f"+998{digits}"
    # 12 digits but doesn't start with 998 → return as-is (caller flags later)
    if len(digits) == 12:
        return f"+{digits}"
    # last-resort: keep what we have
    return raw if raw.startswith("+") else f"+{digits}" if digits else None


def main() -> int:
    if not LEGACY_DB.exists():
        print(f"!! {LEGACY_DB} not found", file=sys.stderr)
        return 1

    db = sqlite3.connect(str(LEGACY_DB))
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    cur.execute(
        "SELECT * FROM counterparties WHERE moysklad_id IS NOT NULL ORDER BY id"
    )
    rows = cur.fetchall()
    db.close()

    out = []
    bad_phone = 0
    for r in rows:
        raw_phone = r["phone"]
        phone = normalise_phone(raw_phone)
        if raw_phone and not phone:
            bad_phone += 1

        # Tags column carries a JSON list; tolerate both list and CSV
        tags: list[str] = []
        if r["tags"]:
            try:
                parsed = json.loads(r["tags"])
                if isinstance(parsed, list):
                    tags = [str(t) for t in parsed if t]
            except (json.JSONDecodeError, TypeError):
                tags = [t.strip() for t in str(r["tags"]).split(",") if t.strip()]

        # Collapse the four telegram_* columns into a single nested object so
        # the new schema can store it under Counterparty.attributes.telegram.
        telegram = {
            k: v
            for k, v in {
                "username": r["telegram_username"],
                "phone": normalise_phone(r["telegram_phone"]),
                "chatId": r["telegram_chat_id"],
                "ustaPhone": normalise_phone(r["usta_telegram_phone"]),
                "linked": bool(r["telegram_linked"]),
                "notificationsEnabled": bool(r["notifications_enabled"]),
            }.items()
            if v not in (None, "", False) or k in ("linked", "notificationsEnabled")
        }

        out.append(
            {
                "name": (r["name"] or "").strip(),
                "phone": phone,
                "email": (r["email"] or "").strip() or None,
                "externalCode": r["moysklad_id"],
                "tags": tags,
                "telegram": telegram,
                "balanceFloat": float(r["balance"] or 0),
                "createdAt": r["created_at"],
            }
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(out):,} counterparties → {OUTPUT}")
    print(f"  Phones normalised: {sum(1 for r in out if r['phone']):,}")
    print(f"  Phones unknown format: {bad_phone}")
    print(f"  With email: {sum(1 for r in out if r['email']):,}")
    print(
        f"  With telegram link: {sum(1 for r in out if r['telegram'].get('linked')):,}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
