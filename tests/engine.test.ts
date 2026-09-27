import { describe, expect, it } from 'vitest';
import { apply, available, quantity, rulesPlan, stages, validateProposal } from '../shared/engine';
import { seed } from '../shared/seed';
import { CATALOGUE, PICKUP, obstacle, route } from '../shared/navigation';
import { restore } from '../src/store';
import type { Command, Task, World } from '../shared/types';
const id = () => crypto.randomUUID();
function command(s: World, c: Command) { const result = apply(s, c); expect(result.error).toBeUndefined(); return result.world; }
function approve(s = seed(), order = '1042') { const proposal = rulesPlan(s, `Fulfill order #${order}`)!; return command(s, { type: 'approve', proposal, actionId: id() }); }
function complete(s: World, t: Task) { return command(s, { type: 'complete', taskId: t.id, actorId: t.actorId!, sku: t.sku ?? undefined, qty: t.qty, actionId: id() }); }
function untilTransport(s = approve()) { for (let i = 0; i < 10; i++) {
    const t = s.tasks.find(t => t.status === 'active')!;
    if (t.kind === 'transport')
        return s;
    s = complete(s, t);
} throw Error('Transport not reached'); }
function finish(s: World) { for (let i = 0; i < 250; i++) {
    if (s.orders[0].status === 'dispatched')
        return s;
    const t = s.tasks.find(t => t.status === 'active');
    if (!t)
        throw Error('Workflow stuck');
    s = t.kind === 'transport' ? command(s, { type: 'tick' }) : complete(s, t);
} throw Error('Workflow did not finish'); }
describe('warehouse execution', () => {
    it('fulfills every stage and conserves stock until dispatch', () => {
        let s = approve();
        expect(available(s, 'NB-101')).toBe(19);
        expect(quantity(s, 'NB-101')).toBe(20);
        s = untilTransport(s);
        expect(quantity(s, 'NB-101')).toBe(20);
        expect(quantity(s, 'HD-202')).toBe(4);
        expect(quantity(s, 'NB-101', 'T-14')).toBe(1);
        expect(quantity(s, 'HD-202', 'A2-TOP')).toBe(3);
        s = finish(s);
        expect(s.tasks.every(t => t.status === 'done')).toBe(true);
        expect(quantity(s, 'NB-101')).toBe(19);
        expect(quantity(s, 'HD-202')).toBe(3);
        expect(s.reservations).toEqual([]);
        expect(stages(s, '1042').every(s => s.done)).toBe(true);
        expect(s.orders[0].toteLocation).toBe('Carrier handoff');
        expect(s.events.filter(e => e.type === 'inventory' && e.to === 'DISPATCHED')).toHaveLength(2);
    });
    it('rejects wrong SKU, quantity and unassigned worker without changing stock or history', () => {
        const s = approve(), t = s.tasks[0];
        for (const override of [{ sku: 'BAD' }, { qty: 2 }, { actorId: 'H2' }]) {
            const r = apply(s, { type: 'complete', taskId: t.id, actorId: 'H1', sku: t.sku!, qty: t.qty, actionId: id(), ...override });
            expect(r.error).toBeTruthy();
            expect(r.world).toBe(s);
        }
    });
    it('deduplicates command IDs and rejects repeated completion with a new ID', () => {
        const s = approve(), t = s.tasks[0];
        const c: Command = { type: 'complete', taskId: t.id, actorId: 'H1', sku: t.sku!, qty: t.qty, actionId: id() };
        const after = command(s, c);
        expect(command(after, c)).toBe(after);
        expect(apply(after, { ...c, actionId: id() }).error).toMatch(/not ready/);
        expect(quantity(after, 'HD-202', 'A2')).toBe(1);
    });
    it('holds the entire unavailable order without reserving any items', () => {
        const s = approve(seed(), '1043');
        expect(s.orders[1].status).toBe('held');
        expect(s.tasks).toEqual([]);
        expect(s.reservations).toEqual([]);
        expect(quantity(s, 'BT-303')).toBe(13);
        expect(s.incidents[0].detail).toContain('no partial shipment');
    });
    it('rejects missing dependencies, unknown actors, invalid plans and stale approvals', () => {
        const s = seed();
        const p = rulesPlan(s, 'Fulfill #1042')!;
        const skipped = { ...p, steps: p.steps.slice(1) };
        expect(validateProposal(s, skipped)).toMatch(/omits/);
        const bad = structuredClone(p);
        bad.steps[0].actorId = 'R1';
        expect(validateProposal(s, bad)).toMatch(/capability/);
        const stale = command(s, { type: 'availability', actorId: 'R1', available: false });
        expect(apply(stale, { type: 'approve', proposal: p, actionId: id() }).error).toMatch(/changed/);
        const approved = approve();
        const later = approved.tasks.find(t => t.kind === 'pack')!;
        expect(apply(approved, { type: 'complete', taskId: later.id, actorId: 'H2', actionId: id() }).error).toMatch(/not ready/);
    });
    it('does not dispatch a tote with missing or unexpected contents', () => {
        let s = untilTransport();
        while (s.tasks.find(t => t.kind === 'transport')!.status !== 'done')
            s = command(s, { type: 'tick' });
        while (s.tasks.find(t => t.status === 'active')!.kind !== 'dispatch')
            s = complete(s, s.tasks.find(t => t.status === 'active')!);
        const t = s.tasks.find(t => t.kind === 'dispatch')!;
        const missing = structuredClone(s);
        missing.stock.find(p => p.location === 'T-14' && p.sku === 'HD-202')!.qty = 0;
        expect(apply(missing, { type: 'complete', taskId: t.id, actorId: 'H2', actionId: id() }).error).toMatch(/every required/);
        const extra = structuredClone(s);
        extra.stock.push({ location: 'T-14', sku: 'CP-404', qty: 1 });
        expect(apply(extra, { type: 'complete', taskId: t.id, actorId: 'H2', actionId: id() }).error).toMatch(/unexpected/);
        expect(quantity(s, 'NB-101')).toBe(20);
    });
    it('requires approval to resume worker-reported issues and records both directions of communication', () => {
        let s = approve(), t = s.tasks[0];
        s = command(s, { type: 'report', taskId: t.id, actorId: 'H1', message: 'Damaged box; inspection needed', actionId: id() });
        const incident = s.incidents[0];
        expect(s.tasks[0].status).toBe('blocked');
        expect(apply(s, { type: 'taskPause', taskId: t.id, paused: true }).error).toBeTruthy();
        s = command(s, { type: 'resolve', incidentId: incident.id, message: 'Use the inspected replacement box', actionId: id() });
        expect(s.tasks[0].status).toBe('blocked');
        const p = rulesPlan(s, 'Recovery', incident.id)!;
        s = command(s, { type: 'approve', proposal: p, actionId: id() });
        expect(s.tasks[0].status).toBe('active');
        expect(s.incidents[0].open).toBe(false);
        expect(s.events.filter(e => e.type === 'message').map(e => e.actor)).toEqual(['Maya Chen', 'Supervisor']);
    });
    it('reports full progress even when replenishment was unnecessary', () => {
        const s = seed();
        s.stock.find(p => p.sku === 'HD-202' && p.location === 'A2')!.qty = 1;
        const done = finish(approve(s));
        expect(done.tasks.some(t => t.kind === 'replenish')).toBe(false);
        expect(stages(done, '1042').filter(s => s.done)).toHaveLength(7);
    });
});
describe('responsive robot simulation', () => {
    it('routes around racks and switches cross-aisles when the main aisle closes', () => {
        const direct = route(PICKUP, CATALOGUE, 'none')!, alt = route(PICKUP, CATALOGUE, 'main')!;
        expect(direct.some(p => p.x === 10 && p.y === 9)).toBe(true);
        expect(alt.some(p => p.x === 10 && p.y === 3)).toBe(true);
        expect(alt.length).toBeGreaterThan(direct.length);
        expect(alt.every(p => !obstacle(p, 'main'))).toBe(true);
        expect(route(PICKUP, CATALOGUE, 'all')).toBeNull();
        let s = command(untilTransport(), { type: 'tick' });
        s = command(s, { type: 'closure', closure: 'main' });
        expect(s.tasks.find(t => t.kind === 'transport')!.route.some(p => p.x === 10 && p.y === 3)).toBe(true);
        expect(finish(s).orders[0].status).toBe('dispatched');
    });
    it('pauses when no route exists and resumes after the route is restored', () => {
        let s = command(untilTransport(), { type: 'tick' });
        s = command(s, { type: 'closure', closure: 'all' });
        const pos = s.actors[2].position;
        expect(s.tasks.find(t => t.kind === 'transport')!.status).toBe('blocked');
        s = command(s, { type: 'tick' });
        expect(s.actors[2].position).toEqual(pos);
        expect(s.incidents.some(i => i.open && i.title === 'Route blocked')).toBe(true);
        s = command(s, { type: 'closure', closure: 'main' });
        expect(s.tasks.find(t => t.kind === 'transport')!.status).toBe('active');
        expect(s.incidents.some(i => i.open && i.title === 'Route blocked')).toBe(false);
        expect(finish(s).orders[0].status).toBe('dispatched');
    });
    it('assigns an available replacement before a mission starts', () => {
        let s = approve();
        s = command(s, { type: 'availability', actorId: 'R1', available: false });
        s = untilTransport(s);
        expect(s.tasks.find(t => t.kind === 'transport')!.actorId).toBe('R2');
        expect(finish(s).orders[0].status).toBe('dispatched');
    });
    it('requires supervisor approval to reassign an active but unloaded robot', () => {
        let s = untilTransport();
        s = command(s, { type: 'availability', actorId: 'R1', available: false });
        expect(s.tasks.find(t => t.kind === 'transport')!.actorId).toBe('R1');
        const p = rulesPlan(s, 'Recovery', s.incidents[0].id)!;
        expect(p.recovery).toBe('reassign');
        s = command(s, { type: 'approve', proposal: p, actionId: id() });
        expect(s.tasks.find(t => t.kind === 'transport')!.actorId).toBe('R2');
        expect(finish(s).orders[0].status).toBe('dispatched');
    });
    it('never transfers a loaded tote to another robot after a failure', () => {
        let s = command(untilTransport(), { type: 'tick' });
        const t = s.tasks.find(t => t.kind === 'transport')!;
        expect(t.carrying).toBe(true);
        s = command(s, { type: 'availability', actorId: 'R1', available: false });
        expect(s.orders[0].toteLocation).toBe('On R1');
        expect(apply(s, { type: 'reassign', taskId: t.id, actorId: 'R2', actionId: id() }).error).toBeTruthy();
        const p = rulesPlan(s, 'Recovery', s.incidents[0].id)!;
        expect(apply(s, { type: 'approve', proposal: p, actionId: id() }).error).toMatch(/Restore/);
        s = command(s, { type: 'availability', actorId: 'R1', available: true });
        expect(s.tasks.find(t => t.kind === 'transport')!.status).toBe('blocked');
        s = command(s, { type: 'approve', proposal: p, actionId: id() });
        expect(finish(s).orders[0].status).toBe('dispatched');
    });
    it('holds without an available robot and honors global pause', () => {
        let s = approve();
        for (const actorId of ['R1', 'R2'])
            s = command(s, { type: 'availability', actorId, available: false });
        for (let i = 0; i < 4; i++)
            s = complete(s, s.tasks.find(t => t.status === 'active')!);
        expect(s.tasks.find(t => t.kind === 'transport')!.reason).toBe('No available worker');
        s = command(s, { type: 'availability', actorId: 'R2', available: true });
        s = command(s, { type: 'pause', paused: true });
        expect(command(s, { type: 'tick' })).toBe(s);
        s = command(s, { type: 'pause', paused: false });
        expect(finish(s).orders[0].status).toBe('dispatched');
    });
});
describe('demo persistence and goal handling', () => {
    it('restores in-progress work paused without losing the ledger', () => { const s = untilTransport(); const restored = restore(JSON.stringify(s)); expect(restored.paused).toBe(true); expect(restored.stock).toEqual(s.stock); expect(restored.events).toEqual(s.events); expect(finish(command(restored, { type: 'pause', paused: false })).orders[0].status).toBe('dispatched'); });
    it('starts clean for malformed data or a fresh browser', () => { expect(restore('{broken').tasks).toEqual([]); expect(restore(null).orders[0].status).toBe('new'); expect(seed().reservations).toEqual([]); });
    it('rejects persisted state with broken references',()=>{const s=seed();s.selectedOrder='missing';expect(restore(JSON.stringify(s)).selectedOrder).toBe('1042');const active=approve();active.tasks[0].actorId='missing';expect(restore(JSON.stringify(active)).tasks).toEqual([]);});
    it('asks for clarification for unsupported, ambiguous and negated goals', () => { for (const goal of ['Build a truck', 'Fulfill 9999', 'Fulfill 1042 and 1043', 'Do not fulfill 1042'])
        expect(rulesPlan(seed(), goal)).toBeNull(); });
});
