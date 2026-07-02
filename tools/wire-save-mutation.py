"""
Replace the first `useMutation({` declaration named `saveMut`/`updateMut`
with `useSaveMutation` in selected detail pages, and add the import.

Idempotent: skips files where useSaveMutation is already in use. Touches
only the named files so we don't accidentally migrate every mutation in
the codebase.
"""

from __future__ import annotations

import re
import sys

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

TARGETS = [
    # First batch (commit 8d??): main money/sales/purchase pipeline.
    "apps/web/src/app/(app)/cash-out/[id]/page.tsx",
    "apps/web/src/app/(app)/payments-in/[id]/page.tsx",
    "apps/web/src/app/(app)/payments-out/[id]/page.tsx",
    "apps/web/src/app/(app)/demands/[id]/page.tsx",
    "apps/web/src/app/(app)/customer-orders/[id]/page.tsx",
    "apps/web/src/app/(app)/supplies/[id]/page.tsx",
    "apps/web/src/app/(app)/invoices-out/[id]/page.tsx",
    "apps/web/src/app/(app)/invoices-in/[id]/page.tsx",
    "apps/web/src/app/(app)/purchase-orders/[id]/page.tsx",
    "apps/web/src/app/(app)/sales-returns/[id]/page.tsx",
    "apps/web/src/app/(app)/purchase-returns/[id]/page.tsx",
    # Read-only / separate-edit detail pages — Save handler is a no-op,
    # leave the raw useMutation alone (this script's filter handles it).
    "apps/web/src/app/(app)/products/[id]/page.tsx",
    "apps/web/src/app/(app)/counterparties/[id]/page.tsx",
    # Second batch (uniformity audit): warehouse module pages whose
    # Save handler still raw-useMutations and emits no toast.
    "apps/web/src/app/(app)/enters/[id]/page.tsx",
    "apps/web/src/app/(app)/inventories/[id]/page.tsx",
    "apps/web/src/app/(app)/losses/[id]/page.tsx",
    "apps/web/src/app/(app)/moves/[id]/page.tsx",
]


def patch(path: str) -> bool:
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        print(f"  ! {path} (not found)")
        return False
    if "useSaveMutation" in content:
        print(f"  - {path} (already migrated)")
        return False

    # Replace `const saveMut = useMutation({` with the save-mutation hook.
    new_content, n_save = re.subn(
        r"\bconst\s+saveMut\s*=\s*useMutation\(",
        "const saveMut = useSaveMutation(",
        content,
        count=1,
    )
    new_content, n_update = re.subn(
        r"\bconst\s+updateMut\s*=\s*useMutation\(",
        "const updateMut = useSaveMutation(",
        new_content,
        count=1,
    )
    n = n_save + n_update
    if n == 0:
        print(f"  - {path} (no saveMut/updateMut found)")
        return False

    # Add the import next to the existing `@/hooks/use-destructive-mutation`
    # line if present, or right after the `@tanstack/react-query` import.
    if "@/hooks/use-save-mutation" not in new_content:
        if "from '@/hooks/use-destructive-mutation';" in new_content:
            new_content = new_content.replace(
                "from '@/hooks/use-destructive-mutation';",
                "from '@/hooks/use-destructive-mutation';\n"
                "import { useSaveMutation } from '@/hooks/use-save-mutation';",
                1,
            )
        else:
            # Fallback: insert near the api-client import.
            new_content = re.sub(
                r"(import\s+\{[^}]*\}\s+from\s+'@tanstack/react-query';\n)",
                r"\1import { useSaveMutation } from '@/hooks/use-save-mutation';\n",
                new_content,
                count=1,
            )

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)
    print(f"  + {path} ({n} mutation patched)")
    return True


def main() -> int:
    print("Wiring useSaveMutation into detail pages:\n")
    patched = 0
    for p in TARGETS:
        if patch(p):
            patched += 1
    print(f"\n{patched} / {len(TARGETS)} files patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
