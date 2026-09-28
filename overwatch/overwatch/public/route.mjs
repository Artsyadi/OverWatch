// Coordinates are schematic. A checkpoint scan, not this drawing, establishes location.
export function shortestRoute(map, start, goal, blocked = []) {
  const ids = map.nodes.map(n => n.id);
  if (!ids.includes(start) || !ids.includes(goal)) return null;
  const distances = Object.fromEntries(ids.map(id => [id, Infinity]));
  const previous = {}, remaining = new Set(ids), blockedSet = new Set(blocked);
  distances[start] = 0;
  while (remaining.size) {
    const current = [...remaining].sort((a,b) => distances[a]-distances[b])[0];
    if (!Number.isFinite(distances[current])) break;
    remaining.delete(current);
    if (current === goal) break;
    for (const edge of map.edges) {
      if (blockedSet.has(edge.id)) continue;
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
      if (!next || !remaining.has(next)) continue;
      const candidate = distances[current] + edge.cost;
      if (candidate < distances[next]) { distances[next] = candidate; previous[next] = {node:current, edge:edge.id}; }
    }
  }
  if (!Number.isFinite(distances[goal])) return null;
  const nodes=[goal], edges=[];
  while (nodes[0] !== start) { const p=previous[nodes[0]]; edges.unshift(p.edge); nodes.unshift(p.node); }
  return {nodes, edges, cost:distances[goal]};
}
