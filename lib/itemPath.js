// Given the full list of items (locations/containers) for a user, builds a
// lookup table and a path-building function — walks parent_id all the way
// up to the root, producing something like:
//   ["Apartment", "Bedroom", "Red Box 1", "Drawer 1"]
//
// Usage:
//   const itemsById = buildItemsById(items)
//   buildPath(someItemId, itemsById) -> array of names, root first
//   pathString(someItemId, itemsById) -> "Apartment / Bedroom / Red Box 1 / Drawer 1"

export function buildItemsById(items) {
  return Object.fromEntries((items || []).map(i => [i.id, i]))
}

export function buildPath(itemId, itemsById, maxDepth = 25) {
  const names = []
  let currentId = itemId
  let depth = 0
  while (currentId && depth < maxDepth) {
    const node = itemsById[currentId]
    if (!node) break
    names.unshift(node.name)
    currentId = node.parent_id
    depth++
  }
  return names
}

export function pathString(itemId, itemsById, separator = ' / ') {
  return buildPath(itemId, itemsById).join(separator)
}

// For a contents row (a logged tool), builds the full path including the
// tool itself at the end: "Apartment / Bedroom / Red Box 1 / Drawer 1 / Drill Hercules"
export function contentPathString(row, itemsById, separator = ' / ') {
  const containerPath = row.parent_item_id ? buildPath(row.parent_item_id, itemsById) : []
  const fullPath = [...containerPath, row.item_name || row.category || 'Untitled']
  return fullPath.join(separator)
}
