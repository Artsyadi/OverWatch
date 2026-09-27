export type TaskKind = 'replenish' | 'pick' | 'load' | 'transport' | 'receive' | 'check' | 'pack' | 'dispatch';
export type TaskStatus = 'queued' | 'active' | 'blocked' | 'paused' | 'done';
export type Point = {
    x: number;
    y: number;
};
export type Actor = {
    id: string;
    name: string;
    kind: 'human' | 'robot';
    role: string;
    capabilities: TaskKind[];
    available: boolean;
    position: Point;
};
export type Product = {
    sku: string;
    name: string;
    variant: string;
    shelf: string;
    overstock: string;
    color: string;
};
export type Stock = {
    sku: string;
    location: string;
    qty: number;
};
export type Order = {
    id: string;
    customer: string;
    lines: {
        sku: string;
        qty: number;
    }[];
    status: 'new' | 'active' | 'held' | 'dispatched';
    holdReason: string;
    billing: 'prepaid';
    tote: string;
    toteLocation: string;
};
export type Task = {
    id: string;
    orderId: string;
    kind: TaskKind;
    title: string;
    sku: string | null;
    qty: number;
    from: string;
    to: string;
    dependsOn: string[];
    actorId: string | null;
    status: TaskStatus;
    reason: string;
    carrying: boolean;
    route: Point[];
};
export type PlanStep = {
    kind: TaskKind;
    actorId: string;
    reason: string;
};
export type Proposal = {
    id: string;
    orderId: string;
    summary: string;
    steps: PlanStep[];
    source: 'live_ai' | 'rules';
    note: string;
    incidentId: string | null;
    recovery: 'none' | 'resume' | 'reassign';
    targetTaskId: string | null;
    targetActorId: string | null;
    revision: number;
};
export type Event = {
    id: string;
    at: string;
    actor: string;
    type: string;
    message: string;
    orderId: string | null;
    taskId: string | null;
    sku: string | null;
    qty: number | null;
    from: string | null;
    to: string | null;
};
export type Incident = {
    id: string;
    taskId: string | null;
    orderId: string;
    title: string;
    detail: string;
    open: boolean;
};
export type World = {
    version: 1;
    revision: number;
    products: Product[];
    stock: Stock[];
    orders: Order[];
    actors: Actor[];
    tasks: Task[];
    reservations: {
        orderId: string;
        sku: string;
        qty: number;
    }[];
    events: Event[];
    incidents: Incident[];
    applied: string[];
    paused: boolean;
    speed: number;
    closure: 'none' | 'main' | 'all';
    selectedOrder: string;
};
export type Command = {
    type: 'approve';
    proposal: Proposal;
    actionId: string;
} | {
    type: 'complete';
    taskId: string;
    actorId: string;
    sku?: string;
    qty?: number;
    actionId: string;
} | {
    type: 'tick';
} | {
    type: 'pause';
    paused: boolean;
} | {
    type: 'speed';
    speed: number;
} | {
    type: 'closure';
    closure: World['closure'];
} | {
    type: 'availability';
    actorId: string;
    available: boolean;
} | {
    type: 'report';
    taskId: string;
    message: string;
    actorId: string;
    actionId: string;
} | {
    type: 'taskPause';
    taskId: string;
    paused: boolean;
} | {
    type: 'reassign';
    taskId: string;
    actorId: string;
    actionId: string;
} | {
    type: 'resolve';
    incidentId: string;
    message: string;
    actionId: string;
} | {
    type: 'selectOrder';
    orderId: string;
};
