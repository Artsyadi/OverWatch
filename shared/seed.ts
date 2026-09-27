import type { World } from './types';
export const seed = (): World => ({
    version: 1, revision: 0, paused: false, speed: 1, closure: 'none', selectedOrder: '1042', tasks: [], reservations: [], incidents: [], applied: [],
    products: [
        { sku: 'NB-101', name: 'Campus notebook', variant: 'Forest · A5', shelf: 'A1', overstock: 'A1-TOP', color: '#abd6ac' },
        { sku: 'HD-202', name: 'USC hoodie', variant: 'Cardinal · M', shelf: 'A2', overstock: 'A2-TOP', color: '#c48e84' },
        { sku: 'BT-303', name: 'Insulated bottle', variant: 'Ivory · 20 oz', shelf: 'B1', overstock: 'B1-TOP', color: '#d2c6a5' },
        { sku: 'CP-404', name: 'Campus cap', variant: 'Black · One size', shelf: 'B2', overstock: 'B2-TOP', color: '#a9b4c7' }
    ],
    stock: [{ sku: 'NB-101', location: 'A1', qty: 8 }, { sku: 'NB-101', location: 'A1-TOP', qty: 12 }, { sku: 'HD-202', location: 'A2', qty: 0 }, { sku: 'HD-202', location: 'A2-TOP', qty: 4 }, { sku: 'BT-303', location: 'B1', qty: 5 }, { sku: 'BT-303', location: 'B1-TOP', qty: 8 }, { sku: 'CP-404', location: 'B2', qty: 0 }, { sku: 'CP-404', location: 'B2-TOP', qty: 0 }],
    orders: [
        { id: '1042', customer: 'Campus online order', lines: [{ sku: 'NB-101', qty: 1 }, { sku: 'HD-202', qty: 1 }], status: 'new', holdReason: '', billing: 'prepaid', tote: 'T-14', toteLocation: 'Picking station' },
        { id: '1043', customer: 'Campus pickup order', lines: [{ sku: 'BT-303', qty: 1 }, { sku: 'CP-404', qty: 1 }], status: 'new', holdReason: '', billing: 'prepaid', tote: 'T-15', toteLocation: 'Picking station' }
    ],
    actors: [
        { id: 'H1', name: 'Maya Chen', kind: 'human', role: 'Inventory associate', capabilities: ['replenish', 'pick', 'load'], available: true, position: { x: 3, y: 5 } },
        { id: 'H2', name: 'Leo Park', kind: 'human', role: 'Catalogue associate', capabilities: ['receive', 'check', 'pack', 'dispatch'], available: true, position: { x: 15, y: 8 } },
        { id: 'R1', name: 'Atlas', kind: 'robot', role: 'Tote transport', capabilities: ['transport'], available: true, position: { x: 5, y: 9 } },
        { id: 'R2', name: 'Scout', kind: 'robot', role: 'Tote transport', capabilities: ['transport'], available: true, position: { x: 2, y: 10 } }
    ],
    events: [{ id: 'seed', at: new Date().toISOString(), actor: 'Overwatch', type: 'site', message: 'Bookstore demo loaded. Four products, two orders. Robots and stock are simulated.', orderId: null, taskId: null, sku: null, qty: null, from: null, to: null }]
});
