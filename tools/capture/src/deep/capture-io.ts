import { readFileSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { CaptureArtifact, RouteOutputPaths } from './types.ts';

/**
 * Capture trio — screenshot + DOM + meta JSON — for a given interaction.
 * All files share a sequence number and id (e.g., `01-default.png` / `01-default.html` / `01-default.json`).
 */

export async function captureTrio(
  page: Page,
  paths: RouteOutputPaths,
  routeId: string,
  opts: {
    seq: number;
    id: string;
    label: string;
    meta: Record<string, unknown>;
    /** Full page screenshot (default: true) */
    fullPage?: boolean;
  },
): Promise<CaptureArtifact> {
  const { seq, id, label, meta, fullPage = true } = opts;
  const base = `${String(seq).padStart(2, '0')}-${id}`;

  const screenshotPath = path.join(paths.screenshots, `${base}.png`);
  const domPath = path.join(paths.doms, `${base}.html`);
  const metaPath = path.join(paths.metas, `${base}.json`);

  // 1. Screenshot
  await page.screenshot({ path: screenshotPath, fullPage });

  // 2. DOM HTML
  const html = await page.content();
  await writeFile(domPath, html, 'utf8');

  // 3. Meta JSON
  const artifact: CaptureArtifact = {
    seq,
    id,
    label,
    routeId,
    at: new Date().toISOString(),
    screenshotPath,
    domPath,
    metaPath,
    meta,
  };
  await writeFile(metaPath, JSON.stringify(artifact, null, 2), 'utf8');

  return artifact;
}

/**
 * Load + mutate + save a manifest.json that tracks all artifacts per route.
 * Useful to know what's already captured (idempotent re-runs).
 */

export interface RouteManifest {
  routeId: string;
  updatedAt: string;
  artifacts: CaptureArtifact[];
}

export function readManifest(paths: RouteOutputPaths, routeId: string): RouteManifest {
  try {
    const raw = readFileSync(paths.manifest, 'utf8');
    return JSON.parse(raw) as RouteManifest;
  } catch {
    return { routeId, updatedAt: new Date().toISOString(), artifacts: [] };
  }
}

export function writeManifest(paths: RouteOutputPaths, manifest: RouteManifest): void {
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2), 'utf8');
}

export function recordArtifact(manifest: RouteManifest, artifact: CaptureArtifact): void {
  // Replace existing entry with same id (idempotent)
  const existing = manifest.artifacts.findIndex((a) => a.id === artifact.id);
  if (existing >= 0) {
    manifest.artifacts[existing] = artifact;
  } else {
    manifest.artifacts.push(artifact);
  }
}

export function hasArtifact(manifest: RouteManifest, id: string): boolean {
  return manifest.artifacts.some((a) => a.id === id);
}

export async function readDomFile(file: string): Promise<string> {
  return readFile(file, 'utf8');
}
