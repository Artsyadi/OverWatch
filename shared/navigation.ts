import type { Point, World } from './types';
export const GRID = { width: 19, height: 12 };
export const PICKUP: Point = { x: 5, y: 9 };
export const CATALOGUE: Point = { x: 15, y: 8 };
export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export function obstacle(p: Point, closure: World['closure']): boolean {
    if (p.x < 0 || p.y < 0 || p.x >= GRID.width || p.y >= GRID.height)
        return true;
    // Rack footprints and catalogue fixtures are impassable. Two cross-aisles connect zones.
    if ([2, 3, 6, 7].includes(p.x) && (p.y >= 2 && p.y <= 4 || p.y >= 6 && p.y <= 7))
        return true;
    if (p.x === 10 && p.y !== 3 && p.y !== 9)
        return true;
    if (p.x === 10 && closure === 'all')
        return true;
    if (p.x === 10 && p.y === 9 && closure === 'main')
        return true;
    return false;
}
export function route(start: Point, end: Point, closure: World['closure']): Point[] | null {
    const key = (p: Point) => `${p.x},${p.y}`;
    const queue: Point[] = [start];
    const parents = new Map<string, Point | null>([[key(start), null]]);
    for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        if (same(p, end)) {
            const path: Point[] = [];
            let cur: Point | null = p;
            while (cur) {
                path.unshift(cur);
                cur = parents.get(key(cur)) ?? null;
            }
            return path;
        }
        for (const n of [{ x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }, { x: p.x - 1, y: p.y }]) {
            if (!obstacle(n, closure) && !parents.has(key(n))) {
                parents.set(key(n), p);
                queue.push(n);
            }
        }
    }
    return null;
}
