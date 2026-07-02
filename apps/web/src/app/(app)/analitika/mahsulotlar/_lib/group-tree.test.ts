import { describe, expect, it } from 'vitest';
import { buildTree, flattenForRender, splitPath } from './group-tree';

const UUID = (n: number) => `${`${n}`.padStart(8, '0')}-0000-0000-0000-000000000000`;

describe('splitPath', () => {
  it('returns empty array for null', () => {
    expect(splitPath(null)).toEqual([]);
  });

  it('splits by forward slash', () => {
    expect(splitPath('a/b/c')).toEqual(['a', 'b', 'c']);
  });

  it('splits by backslash (Windows-style)', () => {
    expect(splitPath('a\\b\\c')).toEqual(['a', 'b', 'c']);
  });

  it('trims and drops empty segments', () => {
    expect(splitPath('  a / / b  ')).toEqual(['a', 'b']);
  });
});

describe('buildTree', () => {
  it('returns empty for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('places groups without a path as flat root nodes (alphabetical)', () => {
    const tree = buildTree([
      { groupId: UUID(1), groupName: 'Foods', groupPath: null, itemCount: 5 },
      { groupId: UUID(2), groupName: 'Drinks', groupPath: null, itemCount: 3 },
    ]);
    expect(tree.map((n) => n.label)).toEqual(['Drinks', 'Foods']);
  });

  it('builds a nested hierarchy from path and aggregates counts upward', () => {
    const tree = buildTree([
      { groupId: UUID(10), groupName: 'Yogurt', groupPath: 'Foods/Dairy/Yogurt', itemCount: 4 },
      { groupId: UUID(11), groupName: 'Milk', groupPath: 'Foods/Dairy/Milk', itemCount: 7 },
      { groupId: UUID(12), groupName: 'Bread', groupPath: 'Foods/Bakery', itemCount: 2 },
    ]);

    expect(tree).toHaveLength(1);
    const foods = tree[0]!;
    expect(foods.label).toBe('Foods');
    expect(foods.itemCount).toBe(13); // 4 + 7 + 2

    // Bakery sorts before Dairy.
    expect(foods.children.map((c) => c.label)).toEqual(['Bread', 'Dairy']);

    const dairy = foods.children[1]!;
    expect(dairy.groupId).toBeNull(); // intermediate node
    expect(dairy.itemCount).toBe(11); // 4 + 7
  });

  it('handles a parent that is also a leaf (group with own items)', () => {
    const tree = buildTree([
      { groupId: UUID(1), groupName: 'Foods', groupPath: 'Foods', itemCount: 10 },
      { groupId: UUID(2), groupName: 'Yogurt', groupPath: 'Foods/Yogurt', itemCount: 5 },
    ]);
    expect(tree).toHaveLength(1);
    const foods = tree[0]!;
    expect(foods.groupId).toBe(UUID(1));
    expect(foods.itemCount).toBe(15); // 10 own + 5 child
  });

  it('regression: multiple siblings under the same parent stay grouped', () => {
    const tree = buildTree([
      { groupId: UUID(1), groupName: 'A1', groupPath: 'A/A1', itemCount: 1 },
      { groupId: UUID(2), groupName: 'A2', groupPath: 'A/A2', itemCount: 2 },
      { groupId: UUID(3), groupName: 'B1', groupPath: 'B/B1', itemCount: 3 },
    ]);
    expect(tree).toHaveLength(2);
    const a = tree.find((n) => n.label === 'A');
    const b = tree.find((n) => n.label === 'B');
    if (!a || !b) throw new Error('roots missing');
    expect(a.children).toHaveLength(2);
    expect(b.children).toHaveLength(1);
  });
});

describe('flattenForRender', () => {
  it('emits collapsed parents and skips their children', () => {
    const tree = buildTree([
      { groupId: UUID(1), groupName: 'A1', groupPath: 'A/A1', itemCount: 1 },
      { groupId: UUID(2), groupName: 'B1', groupPath: 'B/B1', itemCount: 2 },
    ]);
    const flat = flattenForRender(tree, new Set()); // nothing expanded
    expect(flat.map((f) => f.node.label)).toEqual(['A', 'B']);
    expect(flat.map((f) => f.depth)).toEqual([0, 0]);
  });

  it('emits children of an expanded parent with depth+1', () => {
    const tree = buildTree([
      { groupId: UUID(1), groupName: 'A1', groupPath: 'A/A1', itemCount: 1 },
      { groupId: UUID(2), groupName: 'A2', groupPath: 'A/A2', itemCount: 2 },
    ]);
    const flat = flattenForRender(tree, new Set(['A']));
    expect(flat.map((f) => `${f.depth}:${f.node.label}`)).toEqual(['0:A', '1:A1', '1:A2']);
  });
});
