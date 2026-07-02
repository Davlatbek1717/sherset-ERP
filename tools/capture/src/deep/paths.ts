import path from 'node:path';
import { OUTPUT } from '../config.ts';
import { ensureDir } from '../utils/paths.ts';
import type { RouteOutputPaths } from './types.ts';

/**
 * Output layout per route:
 *
 *   docs/moysklad-reference/visual-captures/<module>-module/<route>/
 *     ├── manifest.json
 *     ├── screenshots/
 *     │   ├── 01-default.png
 *     │   ├── 02-filter-panel.png
 *     │   ├── 03-dropdown-status.png
 *     │   └── ...
 *     ├── dom/
 *     │   ├── 01-default.html
 *     │   └── ...
 *     └── meta/
 *         ├── 01-default.json
 *         └── ...
 */

export async function resolveRoutePaths(
  moduleNum: number,
  routeId: string,
): Promise<RouteOutputPaths> {
  const root = path.join(
    OUTPUT.visualCaptures,
    `${String(moduleNum).padStart(2, '0')}-module`,
    routeId,
  );
  const screenshots = path.join(root, 'screenshots');
  const doms = path.join(root, 'dom');
  const metas = path.join(root, 'meta');
  const manifest = path.join(root, 'manifest.json');

  await ensureDir(root);
  await ensureDir(screenshots);
  await ensureDir(doms);
  await ensureDir(metas);

  return { root, screenshots, doms, metas, manifest };
}
