import { z } from 'zod';
export const taskKind = z.enum(['replenish', 'pick', 'load', 'transport', 'receive', 'check', 'pack', 'dispatch']);
const str = z.string().max(500);
const id = z.string().min(1).max(80);
const qty = z.number().int().min(0).max(100000);
const point = z.object({ x: z.number().int().min(0).max(18), y: z.number().int().min(0).max(11) });
export const worldSchema = z.object({
    version: z.literal(1), revision: qty, paused: z.boolean(), speed: z.union([z.literal(1), z.literal(2), z.literal(4)]), closure: z.enum(['none', 'main', 'all']), selectedOrder: id,
    products: z.array(z.object({ sku: id, name: str, variant: str, shelf: id, overstock: id, color: str })).max(20),
    stock: z.array(z.object({ sku: id, location: id, qty })).max(100),
    orders: z.array(z.object({ id, customer: str, lines: z.array(z.object({ sku: id, qty: qty.min(1) })).min(1).max(20), status: z.enum(['new', 'active', 'held', 'dispatched']), holdReason: str, billing: z.literal('prepaid'), tote: id, toteLocation: str })).max(20),
    actors: z.array(z.object({ id, name: str, kind: z.enum(['human', 'robot']), role: str, capabilities: z.array(taskKind).max(8), available: z.boolean(), position: point })).max(20),
    tasks: z.array(z.object({ id, orderId: id, kind: taskKind, title: str, sku: id.nullable(), qty, from: str, to: str, dependsOn: z.array(id).max(20), actorId: id.nullable(), status: z.enum(['queued', 'active', 'blocked', 'paused', 'done']), reason: str, carrying: z.boolean(), route: z.array(point).max(240) })).max(100),
    reservations: z.array(z.object({ orderId: id, sku: id, qty })).max(100),
    incidents: z.array(z.object({ id, taskId: id.nullable(), orderId: id, title: str, detail: str, open: z.boolean() })).max(1000),
    events: z.array(z.object({ id, at: str, actor: str, type: str, message: z.string().max(2000), orderId: id.nullable(), taskId: id.nullable(), sku: id.nullable(), qty: qty.nullable(), from: str.nullable(), to: str.nullable() })).max(10000), applied: z.array(id).max(10000)
});
export const requestSchema = z.object({ goal: z.string().min(1).max(500), state: worldSchema, incidentId: id.nullable().optional() });
export const aiPlanSchema = z.object({
    orderId: z.string(), summary: z.string(), steps: z.array(z.object({ kind: taskKind, actorId: z.string(), reason: z.string() })),
    recovery: z.enum(['none', 'resume', 'reassign']), targetTaskId: z.string().nullable(), targetActorId: z.string().nullable(), clarification: z.string().nullable()
});
