"""Audit Russian translation completeness vs Uzbek (source of truth)."""
import json
import sys
from pathlib import Path

# Force UTF-8 stdout (Windows console default cp1252 chokes on Cyrillic).
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

uz = json.loads(Path('D:/projects/moysklad/apps/web/src/messages/uz.json').read_text(encoding='utf-8'))
ru = json.loads(Path('D:/projects/moysklad/apps/web/src/messages/ru.json').read_text(encoding='utf-8'))


def flatten(d, prefix=''):
    out = {}
    for k, v in d.items():
        key = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


uz_flat = flatten(uz)
ru_flat = flatten(ru)

missing_in_ru = sorted(set(uz_flat.keys()) - set(ru_flat.keys()))
extra_in_ru = sorted(set(ru_flat.keys()) - set(uz_flat.keys()))

# Same value in both (untranslated, copy-paste)
same_value = []
for k in set(uz_flat.keys()) & set(ru_flat.keys()):
    if uz_flat[k] == ru_flat[k] and len(uz_flat[k]) > 3 and not uz_flat[k].isdigit():
        # Likely same numbers, brand names, codes — skip those
        if not any(x in uz_flat[k].lower() for x in ['mxik', 'inn', 'utf', 'sap', 'pdf', 'csv', 'xls', 'xml', 'stir', 'okoned', 'mfo']):
            same_value.append((k, uz_flat[k]))

print(f'=== TRANSLATION COVERAGE (uz={len(uz_flat)}, ru={len(ru_flat)}) ===')
print(f'\nMissing in ru.json: {len(missing_in_ru)}')
for k in missing_in_ru[:30]:
    print(f'  {k} = "{uz_flat[k][:50]}"')
if len(missing_in_ru) > 30:
    print(f'  ... and {len(missing_in_ru) - 30} more')

print(f'\nExtra in ru.json (orphans): {len(extra_in_ru)}')
for k in extra_in_ru[:10]:
    print(f'  {k}')

print(f'\nSame value (likely untranslated): {len(same_value)}')
for k, v in same_value[:30]:
    print(f'  {k} = "{v[:60]}"')
if len(same_value) > 30:
    print(f'  ... and {len(same_value) - 30} more')

print(f'\n=== SUMMARY ===')
total = len(uz_flat)
translated = total - len(missing_in_ru) - len(same_value)
print(f'Total uz keys: {total}')
print(f'Translated to ru: {translated} ({100 * translated / total:.1f}%)')
print(f'Missing: {len(missing_in_ru)}')
print(f'Untranslated (same value): {len(same_value)}')
