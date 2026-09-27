import type { Actor, Command, Event, Order, Proposal, Task, TaskKind, World } from './types';
import { CATALOGUE, PICKUP, route, same } from './navigation';
export const taskNames: Record<TaskKind, string> = { replenish: 'Replenish pick shelf', pick: 'Pick & verify item', load: 'Confirm tote loaded', transport: 'Transport to catalogue', receive: 'Receive tote', check: 'Check order contents', pack: 'Pack complete order', dispatch: 'Confirm carrier handoff' };
const uid = () => crypto.randomUUID();
export const quantity = (s: World, sku: string, location?: string) => s.stock.filter(x => x.sku === sku && (!location || x.location === location)).reduce((n, x) => n + x.qty, 0);
export const available = (s: World, sku: string) => quantity(s, sku) - s.reservations.filter(x => x.sku === sku).reduce((n, x) => n + x.qty, 0);
export const selectedOrder = (s: World) => s.orders.find(o => o.id === s.selectedOrder)!;
export const orderTasks = (s: World, id: string) => s.tasks.filter(t => t.orderId === id);
export const canDo = (a: Actor, t: Task) => a.available && a.capabilities.includes(t.kind);
export function log(s: World, actor: string, type: string, message: string, meta: Partial<Event> = {}) {
    s.events.push({ id: uid(), at: new Date().toISOString(), actor, type, message, orderId: null, taskId: null, sku: null, qty: null, from: null, to: null, ...meta });
}
function incident(s: World, t: Task | null, orderId: string, title: string, detail: string) {
    if (!s.incidents.some(i => i.open && i.orderId === orderId && i.taskId === (t?.id ?? null) && i.title === title)) {
        s.incidents.push({ id: uid(), taskId: t?.id ?? null, orderId, title, detail, open: true });
        log(s, 'Overwatch', 'alert', `${title}: ${detail}`, { orderId, taskId: t?.id ?? null });
    }
}
function closeIncidents(s: World, taskId: string, title?: string) { s.incidents.filter(i => i.open && i.taskId === taskId && (!title || i.title === title)).forEach(i => i.open = false); }
function moveStock(s: World, sku: string, qty: number, from: string, to: string, actor: string, t: Task) {
    const stock = s.stock.find(x => x.sku === sku && x.location === from);
    if (!Number.isInteger(qty) || qty <= 0 || !stock || stock.qty < qty)
        throw new Error('Not enough stock at the expected location. Report the discrepancy.');
    stock.qty -= qty;
    if (to !== 'DISPATCHED') {
        let dst = s.stock.find(x => x.sku === sku && x.location === to);
        if (!dst) {
            dst = { sku, location: to, qty: 0 };
            s.stock.push(dst);
        }
        dst.qty += qty;
    }
    log(s, actor, 'inventory', `${sku} × ${qty}: ${from} → ${to}`, { orderId: t.orderId, taskId: t.id, sku, qty, from, to });
}
export function shortage(s: World, o: Order): string { return o.lines.filter(l => available(s, l.sku) < l.qty).map(l => `${l.sku}: need ${l.qty}, available ${available(s, l.sku)}`).join('; '); }
export function canonicalTasks(s: World, o: Order): Task[] {
    const tasks: Task[] = [];
    function add(kind: TaskKind, sku: string | null = null, qty = 0, from = '', to = '') {
        const id = `${o.id}-${tasks.length + 1}`;
        tasks.push({ id, orderId: o.id, kind, title: taskNames[kind], sku, qty, from, to, dependsOn: tasks.length ? [tasks[tasks.length - 1].id] : [], actorId: null, status: 'queued', reason: '', carrying: false, route: [] });
    }
    for (const l of o.lines) {
        const p = s.products.find(p => p.sku === l.sku)!;
        const missing = Math.max(0, l.qty - quantity(s, l.sku, p.shelf));
        if (missing)
            add('replenish', l.sku, missing, p.overstock, p.shelf);
    }
    for (const l of o.lines) {
        const p = s.products.find(p => p.sku === l.sku)!;
        add('pick', l.sku, l.qty, p.shelf, o.tote);
    }
    add('load', null, 0, 'Picking station', o.tote);
    add('transport', null, 0, 'Picking station', 'Catalogue');
    add('receive', null, 0, o.tote, 'Catalogue');
    add('check');
    add('pack');
    add('dispatch', null, 0, o.tote, 'DISPATCHED');
    return tasks;
}
export function rulesPlan(s: World, goal: string, incidentId: string | null = null): Proposal | null {
    if (incidentId) {
        const i = s.incidents.find(x => x.id === incidentId && x.open);
        if (!i)
            return null;
        const t = s.tasks.find(x => x.id === i.taskId);
        const old = s.actors.find(x => x.id === t?.actorId);
        const alt = t && !t.carrying ? s.actors.find(a => a.id !== old?.id && canDo(a, t) && !s.tasks.some(x => x.id !== t.id && x.actorId === a.id && ['active', 'paused', 'blocked'].includes(x.status))) : undefined;
        const reassign = t && (!old?.available) && alt;
        return { id: uid(), orderId: i.orderId, summary: reassign ? `Assign ${t.title.toLowerCase()} to ${alt.name}, who is available and qualified.` : t?.carrying && !old?.available ? 'Restore the carrying robot before resuming. The tote remains with that robot.' : i.title === 'Route blocked' ? 'Clear a cross-aisle, then resume the transport mission.' : 'Verify the reported issue at the source, then approve resuming this task. No inventory adjustment is assumed.', steps: [], source: 'rules', note: 'Rules-based recovery', incidentId, recovery: reassign ? 'reassign' : 'resume', targetTaskId: t?.id ?? null, targetActorId: reassign ? alt.id : null, revision: s.revision };
    }
    const match = goal.match(/\b(1042|1043)\b/);
    const orderIds = new Set([...goal.matchAll(/\b(1042|1043)\b/g)].map(m => m[1]));
    if (!match || orderIds.size !== 1 || !/\b(fulfill|fulfil|process|prepare|complete|ship|dispatch|pick|pack)\b/i.test(goal) || /\b(don't|do not|cancel|stop|never)\b/i.test(goal))
        return null;
    const o = s.orders.find(o => o.id === match[1])!;
    const missing = shortage(s, o);
    const ts = canonicalTasks(s, o);
    return { id: uid(), orderId: o.id, summary: missing ? `Hold order #${o.id}: ${missing}. Keep the order together until stock is available.` : `Fulfill order #${o.id} with verified human picking, robot transport, and catalogue checks before dispatch.`, steps: ts.map(t => ({ kind: t.kind, actorId: s.actors.find(a => canDo(a, t))?.id ?? s.actors.find(a => a.capabilities.includes(t.kind))!.id, reason: t.kind === 'transport' ? 'A transport robot handles the tote after the worker confirms loading.' : 'A qualified human confirms the physical action.' })), source: 'rules', note: 'Rules-based planner · supported demo workflow', incidentId: null, recovery: 'none', targetTaskId: null, targetActorId: null, revision: s.revision };
}
export function validateProposal(s: World, p: Proposal): string | null {
    if (!p || !Array.isArray(p.steps) || !['live_ai', 'rules'].includes(p.source))
        return 'Invalid planner response.';
    const o = s.orders.find(x => x.id === p.orderId);
    if (!o)
        return 'The plan references an unknown order.';
    if (p.incidentId) {
        const i = s.incidents.find(i => i.id === p.incidentId && i.open && i.orderId === p.orderId);
        if (!i)
            return 'This incident is no longer open.';
        const t = s.tasks.find(t => t.id === p.targetTaskId && t.id === i.taskId && t.orderId === o.id);
        if (!t)
            return 'This order needs stock before it can resume. No executable recovery is available.';
        if (!['resume', 'reassign'].includes(p.recovery))
            return 'Invalid recovery action.';
        if (p.recovery === 'reassign') {
            const a = s.actors.find(a => a.id === p.targetActorId);
            if (!a || !canDo(a, t) || t.carrying)
                return 'Recovery cannot reassign this task to that actor.';
        }
        return null;
    }
    if (o.status !== 'new' && o.status !== 'held')
        return 'This order already has an approved plan.';
    if (s.revision !== p.revision)
        return 'Warehouse state changed. Generate a fresh plan before approval.';
    const ts = canonicalTasks(s, o);
    if (p.steps.length !== ts.length)
        return 'The plan omits required fulfillment steps.';
    for (let n = 0; n < ts.length; n++) {
        const a = s.actors.find(a => a.id === p.steps[n].actorId);
        if (p.steps[n].kind !== ts[n].kind || !a?.capabilities.includes(ts[n].kind))
            return 'The plan contains an invalid step or worker capability.';
    }
    return null;
}
function dependenciesDone(s: World, t: Task) { return t.dependsOn.every(id => s.tasks.find(x => x.id === id)?.status === 'done'); }
function busy(s: World, id: string, except: string) { return s.tasks.some(t => t.id !== except && t.actorId === id && ['active', 'paused', 'blocked'].includes(t.status)); }
function setRobotRoute(s: World, t: Task) {
    const a = s.actors.find(a => a.id === t.actorId)!;
    const next = route(a.position, t.carrying ? CATALOGUE : PICKUP, s.closure);
    if (!next) {
        t.status = 'blocked';
        t.reason = 'No open route';
        t.route = [];
        incident(s, t, t.orderId, 'Route blocked', 'Both cross-aisles are closed. Clear a route to continue.');
        return;
    }
    t.route = next.slice(1);
    t.status = 'active';
    t.reason = '';
    closeIncidents(s, t.id, 'Route blocked');
}
function schedule(s: World) {
    if (s.paused)
        return;
    for (const t of s.tasks) {
        if (t.status === 'done' || t.status === 'paused' || !dependenciesDone(s, t))
            continue;
        if (t.status === 'blocked' && !['No available worker', 'Worker unavailable', 'No open route'].includes(t.reason))
            continue;
        let a = s.actors.find(a => a.id === t.actorId);
        if (t.carrying && (!a || !a.available)) {
            t.status = 'blocked';
            t.reason = 'Carrying robot unavailable';
            incident(s, t, t.orderId, 'Robot stopped', 'Restore the carrying robot. The tote cannot be reassigned in transit.');
            continue;
        }
        if (t.status === 'blocked' && t.reason === 'No open route' && a?.available) {
            setRobotRoute(s, t);
            continue;
        }
        if (!a || !canDo(a, t) || busy(s, a.id, t.id)) {
            if (t.status === 'active' && a) {
                t.status = 'blocked';
                t.reason = 'Worker unavailable';
                incident(s, t, t.orderId, 'Worker unavailable', 'Review an available replacement and approve reassignment.');
                continue;
            }
            const replacement = s.actors.find(x => canDo(x, t) && !busy(s, x.id, t.id));
            if (!replacement) {
                t.status = 'blocked';
                t.reason = 'No available worker';
                incident(s, t, t.orderId, 'No available worker', 'Restore a qualified worker or robot to continue.');
                continue;
            }
            if (t.actorId && t.actorId !== replacement.id)
                log(s, 'Overwatch', 'assignment', `${t.title}: ${t.actorId} → ${replacement.id} before execution`, { taskId: t.id, orderId: t.orderId });
            a = replacement;
            t.actorId = a.id;
        }
        if (t.status !== 'active') {
            t.status = 'active';
            t.reason = '';
            closeIncidents(s, t.id, 'No available worker');
            log(s, 'Overwatch', 'task', `${t.title} assigned to ${a.name}`, { taskId: t.id, orderId: t.orderId });
        }
        if (t.kind === 'transport')
            setRobotRoute(s, t);
    }
}
function completeTask(s: World, t: Task, actor: string) { t.status = 'done'; t.reason = ''; t.route = []; closeIncidents(s, t.id); log(s, actor, 'completed', `${t.title} completed`, { taskId: t.id, orderId: t.orderId }); }
function assertTote(s: World, o: Order) {
    for (const l of o.lines)
        if (quantity(s, l.sku, o.tote) !== l.qty)
            throw new Error('The tote does not contain every required item. Dispatch is blocked.');
    if (s.stock.some(p => p.location === o.tote && p.qty > 0 && !o.lines.some(l => l.sku === p.sku)))
        throw new Error('The tote contains an unexpected item. Report the mismatch before proceeding.');
}
function reassign(s: World, t: Task, actorId: string) {
    const a = s.actors.find(x => x.id === actorId);
    if (!a || !canDo(a, t) || busy(s, a.id, t.id) || t.carrying || t.status === 'done')
        throw new Error('That reassignment is not available. A loaded robot must retain its tote.');
    const before = t.actorId;
    t.actorId = a.id;
    t.status = 'queued';
    t.reason = '';
    t.route = [];
    closeIncidents(s, t.id);
    log(s, 'Supervisor', 'assignment', `${t.title}: ${before ?? 'unassigned'} → ${a.id}`, { taskId: t.id, orderId: t.orderId });
}
export function apply(world: World, c: Command): {
    world: World;
    error?: string;
} {
    if ('actionId' in c && world.applied.includes(c.actionId))
        return { world };
    if (c.type === 'tick' && (world.paused || !world.tasks.some(t => t.kind === 'transport' && t.status === 'active')))
        return { world };
    const s = structuredClone(world);
    try {
        if (c.type === 'approve') {
            const p = c.proposal;
            const invalid = validateProposal(s, p);
            if (invalid)
                throw new Error(invalid);
            const o = s.orders.find(o => o.id === p.orderId)!;
            if (p.incidentId) {
                const t = s.tasks.find(t => t.id === p.targetTaskId)!;
                if (p.recovery === 'reassign')
                    reassign(s, t, p.targetActorId!);
                else {
                    const a = s.actors.find(a => a.id === t.actorId);
                    if (!a?.available)
                        throw new Error('Restore the assigned actor or approve a valid reassignment first.');
                    if (t.kind === 'transport' && !route(a.position, t.carrying ? CATALOGUE : PICKUP, s.closure))
                        throw new Error('A route is still blocked. Clear a cross-aisle first.');
                    t.status = 'queued';
                    t.reason = '';
                    closeIncidents(s, t.id);
                }
                log(s, 'Supervisor', 'recovery', `Approved recovery: ${p.summary}`, { orderId: o.id, taskId: t.id });
            }
            else {
                const missing = shortage(s, o);
                if (missing) {
                    o.status = 'held';
                    o.holdReason = missing;
                    incident(s, null, o.id, 'Insufficient inventory', `${missing}. Entire order held; no partial shipment.`);
                }
                else {
                    const ts = canonicalTasks(s, o);
                    ts.forEach((t, i) => t.actorId = p.steps[i].actorId);
                    s.tasks.push(...ts);
                    o.status = 'active';
                    o.holdReason = '';
                    s.reservations.push(...o.lines.map(l => ({ orderId: o.id, ...l })));
                    s.incidents.filter(i => i.orderId === o.id && !i.taskId).forEach(i => i.open = false);
                    log(s, 'Supervisor', 'approval', `Approved ${p.source === 'live_ai' ? 'AI' : 'rules-based'} plan for #${o.id}; ${ts.length} tasks.`, { orderId: o.id });
                    for (const l of o.lines)
                        log(s, 'Overwatch', 'reservation', `Reserved ${l.sku} × ${l.qty} for #${o.id}`, { orderId: o.id, sku: l.sku, qty: l.qty });
                }
            }
        }
        else if (c.type === 'complete') {
            const t = s.tasks.find(t => t.id === c.taskId);
            if (!t || t.status !== 'active' || s.paused || !dependenciesDone(s, t))
                throw new Error('This task is not ready for completion.');
            const a = s.actors.find(a => a.id === c.actorId);
            if (!a || a.kind !== 'human' || !canDo(a, t) || t.actorId !== a.id)
                throw new Error('Only the assigned available worker can confirm this task.');
            const o = s.orders.find(o => o.id === t.orderId)!;
            if (t.kind === 'replenish' || t.kind === 'pick') {
                if (c.sku?.trim().toUpperCase() !== t.sku)
                    throw new Error(`Wrong item. Expected ${t.sku}. No inventory changed.`);
                if (c.qty !== t.qty)
                    throw new Error(`Confirm exactly ${t.qty} item(s). No inventory changed.`);
                moveStock(s, t.sku!, t.qty, t.from, t.to, a.name, t);
            }
            if (['load', 'check', 'pack', 'dispatch'].includes(t.kind))
                assertTote(s, o);
            if (t.kind === 'dispatch') {
                for (const l of o.lines)
                    moveStock(s, l.sku, l.qty, o.tote, 'DISPATCHED', a.name, t);
                s.reservations = s.reservations.filter(r => r.orderId !== o.id);
                o.status = 'dispatched';
                o.toteLocation = 'Carrier handoff';
            }
            if (t.kind === 'receive')
                o.toteLocation = 'Catalogue';
            completeTask(s, t, a.name);
        }
        else if (c.type === 'tick') {
            for (const t of s.tasks.filter(t => t.kind === 'transport' && t.status === 'active')) {
                const a = s.actors.find(a => a.id === t.actorId)!;
                if (!a.available)
                    continue;
                setRobotRoute(s, t);
                if (t.status !== 'active')
                    continue;
                if (t.route.length)
                    a.position = t.route.shift()!;
                const o = s.orders.find(o => o.id === t.orderId)!;
                if (!t.carrying && same(a.position, PICKUP)) {
                    t.carrying = true;
                    o.toteLocation = `On ${a.id}`;
                    log(s, a.name, 'handoff', `${o.tote} collected at picking station`, { taskId: t.id, orderId: o.id });
                    setRobotRoute(s, t);
                }
                if (t.carrying && same(a.position, CATALOGUE)) {
                    o.toteLocation = 'Catalogue receiving';
                    t.carrying = false;
                    completeTask(s, t, a.name);
                }
            }
        }
        else if (c.type === 'pause') {
            s.paused = c.paused;
            log(s, 'Supervisor', 'control', c.paused ? 'Operations paused' : 'Operations resumed');
        }
        else if (c.type === 'speed') {
            s.speed = [1, 2, 4].includes(c.speed) ? c.speed : 1;
        }
        else if (c.type === 'closure') {
            s.closure = c.closure;
            log(s, 'Demo control', 'obstruction', c.closure === 'none' ? 'Both cross-aisles reopened' : c.closure === 'main' ? 'Main cross-aisle blocked. Alternate route requested.' : 'Both cross-aisles blocked.');
            for (const t of s.tasks.filter(t => t.kind === 'transport' && ['active', 'blocked'].includes(t.status))) {
                const a = s.actors.find(a => a.id === t.actorId);
                if (!a?.available || !['', 'No open route'].includes(t.reason))
                    continue;
                setRobotRoute(s, t);
                if (t.status === 'active')
                    log(s, 'Overwatch', 'routing', `Route recalculated for ${a.id}: ${t.route.length} segments`, { taskId: t.id, orderId: t.orderId });
            }
        }
        else if (c.type === 'availability') {
            const a = s.actors.find(a => a.id === c.actorId);
            if (!a)
                throw new Error('Unknown actor.');
            a.available = c.available;
            log(s, 'Demo control', 'availability', `${a.name} ${c.available ? 'available' : 'unavailable'}`);
            if (!a.available)
                for (const t of s.tasks.filter(t => t.actorId === a.id && t.status === 'active')) {
                    t.status = 'blocked';
                    t.reason = t.carrying ? 'Carrying robot unavailable' : 'Awaiting reassignment approval';
                    incident(s, t, t.orderId, 'Worker unavailable', t.carrying ? 'Restore the carrying robot, then approve resuming. Tote location is preserved.' : 'Request recovery and approve an available replacement.');
                }
        }
        else if (c.type === 'report') {
            const t = s.tasks.find(t => t.id === c.taskId);
            const a = s.actors.find(a => a.id === c.actorId);
            if (!t || t.status === 'done' || !a || a.id !== t.actorId || !c.message.trim())
                throw new Error('Select your active task and describe the problem.');
            t.status = 'blocked';
            t.reason = 'Worker reported issue';
            incident(s, t, t.orderId, 'Worker report', c.message.trim().slice(0, 400));
            log(s, a.name, 'message', c.message.trim().slice(0, 400), { taskId: t.id, orderId: t.orderId });
        }
        else if (c.type === 'taskPause') {
            const t = s.tasks.find(t => t.id === c.taskId);
            if (!t || t.status === 'done' || t.status === 'blocked')
                throw new Error('Resolve blocked work through incident recovery before using pause/resume.');
            if (c.paused) {
                t.status = 'paused';
                t.reason = 'Supervisor pause';
            }
            else {
                if (t.status !== 'paused')
                    throw new Error('Use incident recovery for blocked work.');
                t.status = 'queued';
                t.reason = '';
            }
            log(s, 'Supervisor', 'control', `${t.title} ${c.paused ? 'paused' : 'resumed'}`, { taskId: t.id, orderId: t.orderId });
        }
        else if (c.type === 'reassign') {
            const t = s.tasks.find(t => t.id === c.taskId);
            if (!t)
                throw new Error('Unknown task.');
            reassign(s, t, c.actorId);
        }
        else if (c.type === 'resolve') {
            const i = s.incidents.find(i => i.id === c.incidentId && i.open);
            if (!i || !c.message.trim())
                throw new Error('Enter a response to an open incident.');
            log(s, 'Supervisor', 'message', c.message.trim().slice(0, 400), { taskId: i.taskId, orderId: i.orderId });
        }
        else if (c.type === 'selectOrder') {
            if (!s.orders.some(o => o.id === c.orderId))
                throw new Error('Unknown order.');
            s.selectedOrder = c.orderId;
        }
        if ('actionId' in c)
            s.applied.push(c.actionId);
        schedule(s);
        s.revision++;
        return { world: s };
    }
    catch (error) {
        return { world, error: error instanceof Error ? error.message : 'Action rejected.' };
    }
}
export const STAGES: {
    name: string;
    kinds: TaskKind[];
}[] = [{ name: 'Reserved', kinds: [] }, { name: 'Picking', kinds: ['replenish', 'pick', 'load'] }, { name: 'Transport', kinds: ['transport'] }, { name: 'Received', kinds: ['receive'] }, { name: 'Checked', kinds: ['check'] }, { name: 'Packed', kinds: ['pack'] }, { name: 'Dispatched', kinds: ['dispatch'] }];
export function stages(s: World, id: string) { const ts = orderTasks(s, id); return STAGES.map((stage, i) => { const matching = ts.filter(t => stage.kinds.includes(t.kind)); return { ...stage, done: i === 0 ? ts.length > 0 : matching.length > 0 && matching.every(t => t.status === 'done') }; }); }
