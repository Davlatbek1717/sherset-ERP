/**
 * GroupTree pure helpers — testable, React-free. Builds a hierarchical tree
 * from the flat `{groupId, groupName, groupPath, itemCount}[]` returned by
 * `/analitika/items/groups`. Ported 1:1 from the Alibobo reference
 * (`group-tree-utils.ts`) — only the `groupId` type changed (UUID `string`
 * instead of numeric `number`).
 */

export interface ItemGroupNode {
  groupId: string;
  groupName: string;
  groupPath: string | null;
  itemCount: number;
}

export interface TreeNode {
  key: string;
  label: string;
  itemCount: number;
  groupId: string | null;
  children: TreeNode[];
}

/** Split a Path/Like\String into trimmed non-empty segments. */
export function splitPath(path: string | null): string[] {
  if (!path) return [];
  return path
    .split(/[/\\]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildTree(groups: ItemGroupNode[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const g of groups) {
    const segments = splitPath(g.groupPath);

    // No path — flat root node.
    if (segments.length === 0) {
      root.push({
        key: `flat-${g.groupId}`,
        label: g.groupName,
        itemCount: g.itemCount,
        groupId: g.groupId,
        children: [],
      });
      continue;
    }

    // Descend by segment.
    let currentLevel: TreeNode[] = root;
    let cumulativeKey = '';
    segments.forEach((seg, idx) => {
      cumulativeKey = cumulativeKey ? `${cumulativeKey}/${seg}` : seg;
      let node = currentLevel.find((n) => n.key === cumulativeKey);
      if (!node) {
        node = {
          key: cumulativeKey,
          label: seg,
          itemCount: 0,
          groupId: null,
          children: [],
        };
        currentLevel.push(node);
      }
      if (idx === segments.length - 1) {
        node.groupId = g.groupId;
        node.itemCount = g.itemCount;
        if (g.groupName) node.label = g.groupName;
      }
      currentLevel = node.children;
    });
  }

  // Alphabetical per level.
  function sortRec(nodes: TreeNode[]): void {
    nodes.sort((a, b) => a.label.localeCompare(b.label, 'uz'));
    for (const n of nodes) sortRec(n.children);
  }
  sortRec(root);

  // Aggregate counts up — parent gets own count (if also a leaf) + sum of children.
  function aggregateCounts(node: TreeNode): number {
    if (node.children.length === 0) return node.itemCount;
    const childSum = node.children.reduce((acc, c) => acc + aggregateCounts(c), 0);
    node.itemCount = childSum + (node.groupId !== null ? node.itemCount : 0);
    return node.itemCount;
  }
  for (const n of root) aggregateCounts(n);

  return root;
}

/**
 * Flatten the tree for render given an "expanded" key set. Each output entry
 * carries its depth so the UI can indent. Collapsed parents emit themselves
 * but skip their children.
 */
export interface FlatNode {
  node: TreeNode;
  depth: number;
}

export function flattenForRender(roots: TreeNode[], expanded: ReadonlySet<string>): FlatNode[] {
  const out: FlatNode[] = [];
  function walk(nodes: TreeNode[], depth: number): void {
    for (const n of nodes) {
      out.push({ node: n, depth });
      if (n.children.length > 0 && expanded.has(n.key)) {
        walk(n.children, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return out;
}
