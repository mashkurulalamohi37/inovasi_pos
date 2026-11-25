export type CategoryLike = { id: string; parent_id: string | null };

/** Depth-first order (roots first, children under parent) for tree/indented rendering. */
export function orderCategoryTree<T extends CategoryLike>(rows: T[]): Array<T & { depth: number }> {
  const byParent = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.parent_id ?? "";
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const seen = new Set<string>();
  const out: Array<T & { depth: number }> = [];
  const visit = (parentKey: string, depth: number) => {
    for (const r of byParent.get(parentKey) ?? []) {
      if (seen.has(r.id)) continue; // guard against any stray cycle in the data
      seen.add(r.id);
      out.push({ ...r, depth });
      visit(r.id, depth + 1);
    }
  };
  visit("", 0);
  // Orphans (parent_id points at a row not in this list)
  for (const r of rows) {
    if (!seen.has(r.id)) out.push({ ...r, depth: 0 });
  }
  return out;
}

/** id + all descendant ids, e.g. to exclude from an edit-target's own parent picker. */
export function descendantIds<T extends CategoryLike>(rows: T[], rootId: string): Set<string> {
  const byParent = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      if (!out.has(child.id)) { out.add(child.id); stack.push(child.id); }
    }
  }
  return out;
}
