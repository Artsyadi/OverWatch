import { seed } from '../shared/seed';
import { worldSchema } from '../shared/schema';
import type { World } from '../shared/types';
export const STORAGE_KEY = 'overwatch-demo-v1';
export function restore(raw: string | null): World {
    if (raw)
        try {
            const parsed = worldSchema.safeParse(JSON.parse(raw));
            if (parsed.success && parsed.data.orders.length === 2 && parsed.data.actors.length === 4) {
                const s=parsed.data;
                const referencesValid=s.orders.some(o=>o.id===s.selectedOrder)
                    && s.orders.every(o=>o.lines.every(l=>s.products.some(p=>p.sku===l.sku)))
                    && s.stock.every(p=>s.products.some(product=>product.sku===p.sku))
                    && s.tasks.every(t=>s.orders.some(o=>o.id===t.orderId)
                        && (!t.actorId||s.actors.some(a=>a.id===t.actorId))
                        && t.dependsOn.every(id=>s.tasks.some(previous=>previous.id===id)));
                if(referencesValid)return { ...s, paused: s.tasks.some(t => t.status !== 'done') || s.paused };
            }
        }
        catch { }
    return seed();
}
