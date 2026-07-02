"""
Modal / dialog audit. Lists every modal-style component in the app and
flags ones that bypass the design-system primitives (Drawer, ConfirmDialog,
useConfirm, Tooltip).

Categories we check:
- `<Dialog.Root>` direct usage — should be wrapped with Drawer or
  similar primitive instead.
- `<Drawer>` usage — confirms moysklad-side parity for slide-in panels.
- `useConfirm` adoption — replaces native window.confirm() prompts.
- Custom modal implementations (z-fixed inset-0 patterns).
"""

from __future__ import annotations

import glob
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def audit() -> None:
    counts: dict[str, list[tuple[str, int]]] = defaultdict(list)

    for path in glob.glob("apps/web/src/**/*.tsx", recursive=True):
        if "node_modules" in path or ".next" in path:
            continue
        if path.endswith(".test.tsx"):
            continue
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        # Direct Radix Dialog usage (escapes Drawer primitive)
        for m in re.finditer(r"<Dialog\.Root\b", content):
            line = content[: m.start()].count("\n") + 1
            counts["dialog_root"].append((path, line))
        # Drawer primitive usage (good)
        for m in re.finditer(r"<Drawer\b", content):
            line = content[: m.start()].count("\n") + 1
            counts["drawer_primitive"].append((path, line))
        # useConfirm (good)
        for m in re.finditer(r"\buseConfirm\(\)", content):
            line = content[: m.start()].count("\n") + 1
            counts["use_confirm"].append((path, line))
        # Native window.confirm (bad)
        for m in re.finditer(r"\bwindow\.confirm\b|^\s*confirm\(", content, re.MULTILINE):
            line = content[: m.start()].count("\n") + 1
            counts["window_confirm"].append((path, line))
        # Custom fixed-inset modal patterns (likely should use Drawer)
        for m in re.finditer(
            r'className="[^"]*fixed[^"]*inset-0[^"]*z-\d+', content
        ):
            line = content[: m.start()].count("\n") + 1
            counts["custom_modal"].append((path, line))
        # FilterDrawer (good — moysklad parity pattern)
        for m in re.finditer(r"<FilterDrawer\b", content):
            line = content[: m.start()].count("\n") + 1
            counts["filter_drawer"].append((path, line))
        # CatalogPicker (good — moysklad picker pattern)
        for m in re.finditer(r"<CatalogPicker\b", content):
            line = content[: m.start()].count("\n") + 1
            counts["catalog_picker"].append((path, line))
        # SendEmailDialog
        for m in re.finditer(r"<SendEmailDialog\b", content):
            line = content[: m.start()].count("\n") + 1
            counts["send_email"].append((path, line))
        # WebhookDialog
        for m in re.finditer(r"<WebhookDialog\b", content):
            line = content[: m.start()].count("\n") + 1
            counts["webhook_dialog"].append((path, line))

    print("# Modal / dialog audit\n")
    print(f"- <Drawer> primitive uses:        {len(counts['drawer_primitive'])}")
    print(f"- <FilterDrawer> uses:            {len(counts['filter_drawer'])}")
    print(f"- <CatalogPicker> uses:           {len(counts['catalog_picker'])}")
    print(f"- useConfirm() usage:             {len(counts['use_confirm'])}")
    print(f"- Direct <Dialog.Root> (BYPASS):  {len(counts['dialog_root'])}")
    print(f"- Custom fixed-inset modals:      {len(counts['custom_modal'])}")
    print(f"- window.confirm (BYPASS):        {len(counts['window_confirm'])}")
    print(f"- SendEmailDialog uses:           {len(counts['send_email'])}")
    print(f"- WebhookDialog uses:             {len(counts['webhook_dialog'])}")

    if counts["dialog_root"]:
        print("\n## Direct <Dialog.Root> uses (consider wrapping in Drawer):")
        for p, l in counts["dialog_root"]:
            print(f"  {p}:{l}")
    if counts["window_confirm"]:
        print("\n## window.confirm (replace with useConfirm):")
        for p, l in counts["window_confirm"]:
            print(f"  {p}:{l}")
    if counts["custom_modal"]:
        print("\n## Custom fixed-inset modals (audit for Drawer wrap):")
        for p, l in counts["custom_modal"]:
            print(f"  {p}:{l}")


if __name__ == "__main__":
    audit()
