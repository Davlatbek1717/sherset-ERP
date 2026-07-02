"""Find tFields() keys used in code but missing from messages JSON."""
import json
import os
import re

ROOT = 'D:/projects/moysklad/apps/web/src'
MESSAGES = os.path.join(ROOT, 'messages')


def load_msgs(locale: str) -> dict:
    with open(os.path.join(MESSAGES, f'{locale}.json'), encoding='utf-8') as f:
        return json.load(f)


def collect_used_keys(translator: str) -> set[str]:
    pattern = re.compile(rf"{translator}\(['\"]([a-z_][a-z_0-9]*)['\"]\)")
    used = set()
    for root, _, files in os.walk(os.path.join(ROOT, 'app')):
        for f in files:
            if not f.endswith(('.tsx', '.ts')):
                continue
            with open(os.path.join(root, f), encoding='utf-8', errors='ignore') as fp:
                for line in fp:
                    for m in pattern.finditer(line):
                        used.add(m.group(1))
    return used


uz = load_msgs('uz')
ru = load_msgs('ru')


def report(translator: str, namespace: str):
    used = collect_used_keys(translator)
    uz_keys = set(uz.get(namespace, {}).keys())
    ru_keys = set(ru.get(namespace, {}).keys())
    missing_uz = sorted(used - uz_keys)
    missing_ru = sorted(used - ru_keys)
    print(f'\n--- {translator} (namespace: {namespace}) ---')
    print(f'Used in code: {len(used)}, uz: {len(uz_keys)}, ru: {len(ru_keys)}')
    if missing_uz:
        print(f'MISSING in uz.json: {missing_uz}')
    if missing_ru:
        print(f'MISSING in ru.json: {missing_ru}')
    if not missing_uz and not missing_ru:
        print('  [OK] All used keys translated.')


report('tFields', 'fields')
report('tCommon', 'common')
report('tBulk', 'bulk_actions')
report('tFilters', 'filters')
