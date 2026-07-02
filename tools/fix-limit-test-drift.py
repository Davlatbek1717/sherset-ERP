"""Fix the 14 limit-related test files that drifted out of sync with
their schemas.

What happened:
  - Schemas were raised from `max(100)` to `max(500)` to allow
    larger page sizes (UX/perf tuning).
  - The tests still asserted that `limit: 200` should fail, but 200 <
    500 so the schema correctly accepts 200 — test fails.

Fix: rewrite the assertion to use a value just over the new max
(600) and rename the test to "rejects limit above max".

Idempotent: checks the current state and skips already-fixed files.
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('D:/projects/moysklad/apps/api/src/modules')

TARGETS = [
    'attachment', 'call', 'cash-in', 'cashier-session', 'contact-person',
    'email', 'mxik', 'notification', 'online-order', 'opportunity',
    'retail-sale', 'store', 'task', 'variant',
]


def patch(test_path: Path) -> tuple[bool, str]:
    src = test_path.read_text(encoding='utf-8')

    # Idempotent skip if already at max (501) and renamed.
    if 'rejects limit above max (500)' in src and re.search(
        r'\blimit:\s*[\'"]?501[\'"]?', src,
    ):
        return True, 'already fixed'

    new = src
    # Rename test in either historical phrasing.
    new = new.replace("'rejects limit > 100'", "'rejects limit above max (500)'")
    new = new.replace("'rejects > 100 limit'", "'rejects limit above max (500)'")
    new = new.replace("'rejects > 100 limit'", "'rejects limit above max (500)'")

    # Find the test block and replace the numeric literal in the
    # `limit: NNN` assertion with 501 (one past the new max).
    pat = re.compile(
        r"(it\(\s*'rejects limit above max \(500\)'[^)]*\)\s*=>\s*\{.*?)"
        r"(\blimit:\s*['\"]?)\d+(['\"]?)",
        re.S,
    )
    new = pat.sub(r'\g<1>\g<2>501\g<3>', new)

    if new == src:
        return False, 'no replacements made'

    test_path.write_text(new, encoding='utf-8')
    return True, 'fixed'


def main():
    rc = 0
    for mod in TARGETS:
        test = ROOT / mod / f'{mod}.schema.test.ts'
        if not test.exists():
            print(f'SKIP {mod:<22} no schema.test.ts')
            continue
        ok, msg = patch(test)
        flag = 'OK ' if ok else 'ERR'
        print(f'{flag} {mod:<22} {msg}')
        if not ok:
            rc = 1
    return rc


if __name__ == '__main__':
    sys.exit(main())
