import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowDownLeft, ArrowRight, Box, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardList, Download, Hexagon, LayoutDashboard, MapPin, Package, Pause, Play, RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, TriangleAlert, Users, X, Bot, ScanLine } from 'lucide-react';
import type { Command, Proposal, Task, World } from '../shared/types';
import { apply, available, canonicalTasks, orderTasks, quantity, rulesPlan, selectedOrder, shortage, stages, taskNames } from '../shared/engine';
import { seed } from '../shared/seed';
import { restore, STORAGE_KEY } from './store';
import WarehouseMap from './WarehouseMap';
import VoiceInput from './VoiceInput';
type Page = 'Operations' | 'Orders' | 'Inventory' | 'Workforce' | 'Activity';
const uid = () => crypto.randomUUID();
const statusText = (s: string) => ({ new: 'Ready to plan', active: 'In progress', queued: 'Waiting', blocked: 'Blocked', paused: 'Paused', done: 'Complete', held: 'On hold', dispatched: 'Dispatched' }[s] ?? s);
const iconSize = 18;
function Badge({ status }: {
    status: string;
}) { return <span className={`badge ${['done', 'dispatched'].includes(status) ? 'green' : ['held', 'blocked'].includes(status) ? 'amber' : status === 'active' ? 'blue' : 'subdued'}`}>{statusText(status)}</span>; }
export default function App() {
    const [world, setWorld] = useState<World>(() => { try {
        return restore(localStorage.getItem(STORAGE_KEY));
    }
    catch {
        return seed();
    } });
    const worldRef = useRef(world);
    worldRef.current = world;
    const [page, setPage] = useState<Page>('Operations');
    const [role, setRole] = useState<'supervisor' | 'worker'>('supervisor');
    const [worker, setWorker] = useState('H1');
    const [goal, setGoal] = useState('Fulfill order #1042');
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [planning, setPlanning] = useState(false);
    const [notice, setNotice] = useState('');
    const [controls, setControls] = useState(false);
    const [help, setHelp] = useState(false);
    const [ai, setAi] = useState(false);
    const [mode, setMode] = useState('Rules-based planner');
    const [filter, setFilter] = useState('');
    const [resetConfirm, setResetConfirm] = useState(false);
    const [storageError, setStorageError] = useState(false);
    const requestId = useRef(0);
    const order = selectedOrder(world);
    const tasks = orderTasks(world, order.id);
    const progress = stages(world, order.id);
    const done = progress.filter(s => s.done).length;
    useEffect(() => { fetch('/api/health').then(r => r.json()).then(data => { setAi(data.aiConfigured); setMode(data.aiConfigured ? 'Live AI available' : 'Rules-based planner'); }).catch(() => { }); }, []);
    useEffect(() => { try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
        setStorageError(false);
    }
    catch {
        setStorageError(true);
    } }, [world]);
    function act(c: Command) { const result = apply(worldRef.current, c); worldRef.current = result.world; setWorld(result.world); if (result.error)
        setNotice(result.error);
    else
        setNotice(''); return !result.error; }
    useEffect(() => { const timer = setInterval(() => { const result = apply(worldRef.current, { type: 'tick' }); worldRef.current = result.world; setWorld(result.world); }, 700 / world.speed); return () => clearInterval(timer); }, [world.speed]);
    async function requestPlan(incidentId: string | null = null) {
        const epoch = ++requestId.current;
        const snapshot = worldRef.current;
        setPlanning(true);
        setNotice('');
        setProposal(null);
        try {
            const r = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: incidentId ? 'Suggest recovery for the selected incident' : goal, state: { ...snapshot, events: snapshot.events.slice(-30), applied: [] }, incidentId }), signal: AbortSignal.timeout(25000) });
            if (!r.ok)
                throw new Error('Planner unavailable');
            const data = await r.json();
            if (epoch !== requestId.current)
                return;
            setProposal(data.proposal);
            setMode(data.mode === 'live_ai' ? 'Live AI planner' : data.proposal?.note ?? 'Rules-based planner');
            if (data.clarification)
                setNotice(data.clarification);
        }
        catch {
            if (epoch !== requestId.current)
                return;
            const p = rulesPlan(snapshot, goal, incidentId);
            if (p)
                p.note = 'Rules-based fallback · planner connection unavailable';
            setProposal(p);
            setMode('Rules-based fallback');
            if (!p)
                setNotice('Try “Fulfill order #1042” or “Fulfill order #1043”.');
        }
        finally {
            if (epoch === requestId.current)
                setPlanning(false);
        }
    }
    function selectOrder(id: string) { act({ type: 'selectOrder', orderId: id }); setGoal(`Fulfill order #${id}`); setProposal(null); }
    function reset() { requestId.current++; const next = seed(); worldRef.current = next; setWorld(next); setProposal(null); setPlanning(false); setNotice(''); setGoal('Fulfill order #1042'); setWorker('H1'); setRole('supervisor'); setPage('Operations'); setResetConfirm(false); setControls(false); setMode(ai ? 'Live AI available' : 'Rules-based planner'); }
    function exportHistory() { const blob = new Blob([JSON.stringify({ site: 'Bookstore demo', exportedAt: new Date().toISOString(), events: world.events }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'overwatch-history.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
    const openIncidents = world.incidents.filter(i => i.open && i.orderId === order.id);
    return <div className="app-shell">
    <aside className="sidebar"><a className="brand" aria-label="Overwatch home" title="Overwatch" href="#" onClick={e => { e.preventDefault(); setPage('Operations'); setRole('supervisor'); }}><span className="brand-mark"><Hexagon size={24}/><i /></span>overwatch<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-icon"><Box size={19}/></span><div><strong>Bookstore warehouse</strong><small>Demo workspace</small></div><ChevronDown size={14}/></div>
      <span className="nav-label">WORKSPACE</span><nav>{([{ name: 'Operations', icon: LayoutDashboard }, { name: 'Orders', icon: ClipboardList }, { name: 'Inventory', icon: Package }, { name: 'Workforce', icon: Users }, { name: 'Activity', icon: Activity }] as const).map(({ name, icon: Icon }) => <button key={name} aria-label={name} title={name} className={`nav-item ${page === name && role === 'supervisor' ? 'selected' : ''}`} onClick={() => { setPage(name); setRole('supervisor'); }}><Icon size={iconSize}/>{name}{name === 'Orders' && <span className="nav-count">2</span>}{name === 'Activity' && world.incidents.some(i => i.open) && <i className="nav-alert"/>}</button>)}</nav>
      <div className="sidebar-note"><span className="eyebrow">BUILT FOR THE HANDOFF</span><p>Humans. Robots.<br />One shared workflow.</p><span className="demo-tag"><i className="dot robot"/> Simulated warehouse</span></div>
      <div className="sidebar-bottom"><button className="nav-item" aria-label="Demo walkthrough" title="Demo walkthrough" onClick={() => setHelp(true)}><CircleHelp size={iconSize}/>Demo walkthrough</button><div className="profile"><span className="avatar supervisor">S</span><div><strong>Supervisor</strong><small>Full operations access</small></div></div></div>
    </aside>
    <main><header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> {role === 'worker' ? 'Worker station' : page}</div><div className="topbar-actions"><span className="live-indicator"><i className={`dot ${world.paused ? 'warning' : 'robot'}`}/>{world.paused ? 'Operations paused' : 'System running'}</span><div className="role-switch"><button className={role === 'supervisor' ? 'active' : ''} onClick={() => setRole('supervisor')}>Supervisor</button><button className={role === 'worker' ? 'active' : ''} onClick={() => setRole('worker')}>Worker view</button></div></div></header>
      <div className={`content ${page === 'Operations' && role === 'supervisor' ? 'operations-view' : ''}`}><div className="page-heading"><div><span className="eyebrow">{role === 'worker' ? 'HUMAN WORKSPACE' : 'OPERATIONS CONTROL'}</span><h1>{role === 'worker' ? 'Your next move.' : page === 'Operations' ? 'Warehouse overview' : page === 'Activity' ? 'Every action, accounted for.' : page}</h1><p>{role === 'worker' ? 'Confirm the work. Keep the whole team in sync.' : page === 'Operations' ? 'One place to coordinate every worker and every handoff.' : page === 'Inventory' ? 'Track stock from the shelf to the tote to the carrier.' : page === 'Orders' ? 'Every item verified. Every order kept together.' : page === 'Workforce' ? 'Capabilities and availability determine who gets the next task.' : 'A shared record of work, decisions and inventory movements.'}</p></div><div className="heading-actions"><button className="button ghost" onClick={() => act({ type: 'pause', paused: !world.paused })}>{world.paused ? <Play size={16}/> : <Pause size={16}/>} {world.paused ? 'Resume' : 'Pause'}</button><button className={`button ghost ${controls ? 'pressed' : ''}`} onClick={() => setControls(!controls)}><Settings2 size={16}/> Demo controls</button></div></div>
      {world.paused && <div className="banner amber"><Pause size={17}/>Operations are paused. Resume to move robots or confirm worker tasks.<button onClick={() => act({ type: 'pause', paused: false })}>Resume operations <ArrowRight size={14}/></button></div>}
      {storageError && <div className="banner amber">Browser storage is unavailable. Keep this tab open; refreshing will reset the demo.</div>}
      {notice && <div className="banner notice" role="alert"><TriangleAlert size={18}/><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={17}/></button></div>}
      {controls && <section className="demo-controls"><div><strong>Simulation controls</strong><small>Changes here affect the running warehouse.</small></div><label>Cross-aisles<select aria-label="Cross-aisle obstruction" value={world.closure} onChange={e => act({ type: 'closure', closure: e.target.value as World['closure'] })}><option value="none">Both open</option><option value="main">Block main aisle</option><option value="all">Block both aisles</option></select></label><label>Robot speed<select aria-label="Simulation speed" value={world.speed} onChange={e => act({ type: 'speed', speed: Number(e.target.value) })}><option value="1">1× normal</option><option value="2">2× speed</option><option value="4">4× speed</option></select></label><label>Atlas · R1<select aria-label="Atlas availability" value={world.actors.find(a => a.id === 'R1')!.available ? 'online' : 'offline'} onChange={e => act({ type: 'availability', actorId: 'R1', available: e.target.value === 'online' })}><option value="online">Available</option><option value="offline">Unavailable</option></select></label><button className="button ghost" onClick={() => setResetConfirm(true)}><RotateCcw size={15}/>Reset demo</button></section>}
      {role === 'worker' ? <WorkerStation world={world} worker={worker} setWorker={setWorker} act={act}/> : <>
      {page === 'Operations' && <>
        <form className="goal-bar" onSubmit={e => { e.preventDefault(); requestPlan(); }}><span className="goal-icon"><Sparkles size={23}/></span><div><label htmlFor="goal">WHAT NEEDS TO GET DONE?</label><input id="goal" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Describe a warehouse goal…" maxLength={500}/></div><span className="ai-mode"><i className={`dot ${mode.startsWith('Live') ? 'robot' : 'warning'}`}/>{mode.startsWith('Live') ? 'Live AI' : 'Rules-based'}</span><button className="button primary" disabled={planning} type="submit">{planning ? 'Planning…' : 'Review plan'}<ArrowRight size={17}/></button></form>
        <div className="metrics"><Metric label="Active tasks" value={String(world.tasks.filter(t => t.status === 'active').length)} detail={`${world.tasks.filter(t => t.status === 'queued').length} waiting in queue`} icon={<ClipboardList size={18}/>}/><Metric label="Workers available" value={`${world.actors.filter(a => a.kind === 'human' && a.available).length}`} total="/ 2" icon={<Users size={18}/>}/><Metric label="Robots available" value={`${world.actors.filter(a => a.kind === 'robot' && a.available).length}`} total="/ 2" icon={<Bot size={18}/>}/><Metric label="Orders dispatched" value={String(world.orders.filter(o => o.status === 'dispatched').length)} total="/ 2" icon={<Box size={18}/>}/></div>
        <div className="operations-grid"><div className="left-stack"><WarehouseMap world={world}/><OrderProgress world={world} selectOrder={selectOrder}/></div><div className="right-stack"><section className="panel task-panel"><div className="panel-heading"><h2>Task queue <span className="count">{tasks.length}</span></h2><span className="eyebrow">#{order.id}</span></div><p className="panel-description">Blocked and active first · select a task to manage</p><div className="task-list">{tasks.length ? [...tasks].sort((a, b) => { const priority = { blocked: 0, active: 1, paused: 2, queued: 3, done: 4 }; return priority[a.status] - priority[b.status]; }).map(t => <TaskRow key={t.id} task={t} world={world} act={act}/>) : <div className="empty-state"><ClipboardList size={32}/><h3>{order.status==='held'?'Order held for stock':'Ready for the first move'}</h3><p>{order.status==='held'?'No work has been released. All items must be available before fulfillment starts.':'Review and approve a plan to turn this order into assigned work.'}</p></div>}</div></section><section className={`panel incidents-panel ${openIncidents.length ? 'has-alert' : ''}`}><div className="panel-heading"><h2><TriangleAlert size={17}/> Needs attention</h2><span className="count">{openIncidents.length}</span></div>{openIncidents.length ? openIncidents.map(i => <div className="incident" key={i.id}><strong>{i.title}</strong><p>{i.detail}</p>{i.taskId ? <button className="button recovery-button" disabled={planning} onClick={() => requestPlan(i.id)}><Sparkles size={14}/>Suggest recovery<ArrowRight size={14}/></button> : <small>Awaiting replenishment. Partial dispatch is disabled.</small>}<IncidentReply incidentId={i.id} act={act}/></div>) : <div className="quiet-state"><ShieldCheck size={24}/><div><strong>All clear</strong><p>Exceptions appear here with the next action.</p></div></div>}</section></div></div>
        <section className="panel activity-preview"><div className="panel-heading"><h2>Latest activity</h2><button className="text-button" onClick={() => setPage('Activity')}>View all activity <ArrowRight size={14}/></button></div><EventList world={world} limit={4}/></section>
      </>}
      {page === 'Orders' && <><div className="order-cards">{world.orders.map(o => <button key={o.id} className={`order-card panel ${world.selectedOrder === o.id ? 'chosen' : ''}`} onClick={() => selectOrder(o.id)}><div><span className="eyebrow">ORDER #{o.id}</span><Badge status={o.status}/></div><h2>{o.customer}</h2><p>{o.lines.reduce((n, l) => n + l.qty, 0)} items · Tote {o.tote}</p>{o.lines.map(l => <span key={l.sku}>{world.products.find(p => p.sku === l.sku)?.name} <b>×{l.qty}</b></span>)}{o.holdReason && <p className="amber-text">{o.holdReason}</p>}<small>Billing: prepaid · {o.toteLocation}</small></button>)}</div><OrderProgress world={world} selectOrder={selectOrder}/><button className="button primary mt" onClick={() => { setPage('Operations'); setGoal(`Fulfill order #${order.id}`); }}>Open order #{order.id} in operations <ArrowRight size={16}/></button></>}
      {page === 'Inventory' && <section className="panel"><div className="panel-heading"><h2>Stock ledger</h2><span className="badge subdued">4 products · simulated inventory</span></div><div className="table-wrap"><table><thead><tr><th>Product / SKU</th><th>Pick shelf</th><th>Overstock</th><th>In totes</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead><tbody>{world.products.map(p => <tr key={p.sku}><td><div className="product-cell"><span className="product-icon" style={{ background: p.color + '20', color: p.color }}><Package size={23}/></span><div><strong>{p.name}</strong><small>{p.sku} · {p.variant}</small></div></div></td><td><strong className={quantity(world, p.sku, p.shelf) === 0 ? 'amber-text' : ''}>{quantity(world, p.sku, p.shelf)}</strong><small>{p.shelf}</small></td><td>{quantity(world, p.sku, p.overstock)}<small>{p.overstock}</small></td><td>{world.stock.filter(s => s.sku === p.sku && s.location.startsWith('T-')).reduce((n, s) => n + s.qty, 0)}</td><td>{quantity(world, p.sku)}</td><td>{world.reservations.filter(r => r.sku === p.sku).reduce((n, r) => n + r.qty, 0)}</td><td><span className={`badge ${available(world, p.sku) === 0 ? 'amber' : 'green'}`}>{available(world, p.sku)}</span></td></tr>)}</tbody></table></div><div className="table-note"><ShieldCheck size={16}/>Picking moves stock into a tote. Warehouse on-hand decreases only at dispatch.</div></section>}
      {page === 'Workforce' && <div className="workforce-grid">{world.actors.map(a => { const t = world.tasks.find(t => t.actorId === a.id && ['active', 'blocked', 'paused'].includes(t.status)); return <section className="panel actor-card" key={a.id}><div className="actor-card-head"><span className={`avatar large ${a.kind}`}>{a.kind === 'robot' ? <Bot size={25}/> : a.name.split(' ').map(n => n[0]).join('')}</span><span className={`badge ${a.available ? 'green' : 'subdued'}`}>{a.available ? 'Available' : 'Offline'}</span></div><h2>{a.name} <small>{a.id}</small></h2><p>{a.role}{a.kind === 'robot' ? ' · simulated' : ''}</p><div className="capabilities">{a.capabilities.map(c => <span key={c}>{c}</span>)}</div><div className="assignment"><small>CURRENT ASSIGNMENT</small><strong>{t ? t.title : 'Ready for assignment'}</strong>{t && <Badge status={t.status}/>}</div><button className="button ghost" onClick={() => act({ type: 'availability', actorId: a.id, available: !a.available })}>{a.available ? 'Mark unavailable' : 'Restore availability'}</button></section>; })}</div>}
      {page === 'Activity' && <section className="panel"><div className="panel-heading"><div className="search"><Search size={16}/><input aria-label="Search activity" placeholder="Search events, SKU, worker…" value={filter} onChange={e => setFilter(e.target.value)}/></div><button className="button ghost" onClick={exportHistory}><Download size={16}/>Export history</button></div><EventList world={world} filter={filter}/></section>}
      </>}
      <footer className="page-footer"><span>OVERWATCH <span> / </span> ORIGIN WEEKEND 2026</span><span>Demo data · Robot simulation · {mode}</span></footer>
      </div>
    </main>
    {proposal && <PlanReview world={world} proposal={proposal} error={notice} close={() => {setProposal(null);setNotice('');}} approve={() => { if (act({ type: 'approve', proposal, actionId: proposal.id })) {
        setProposal(null);
        if (proposal.orderId !== world.selectedOrder)
            selectOrder(proposal.orderId);
    } }}/>} 
    {help && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Demo walkthrough"><div className="modal-heading"><h2>Your 60-second walkthrough</h2><button className="icon-button" aria-label="Close walkthrough" onClick={() => setHelp(false)}><X size={20}/></button></div><ol className="walkthrough"><li>Review “Fulfill order #1042” and approve the plan.</li><li>Switch to Worker view. Replenish HD-202, pick NB-101 and HD-202, then confirm the tote loaded.</li><li>Open Demo controls and block the main aisle. Watch Atlas take the other cross-aisle.</li><li>After arrival, switch to Leo and confirm receipt, checking, packing and carrier handoff.</li><li>Open Inventory and Activity to inspect the final counts and every handoff.</li></ol><p className="muted">Item IDs are entered manually. Robots and goods are simulated. Without an API key, the planner is rules-based. No live carrier or payment system is connected.</p><button className="button primary" onClick={() => setHelp(false)}>Got it <ArrowRight size={16}/></button></section></div>}
    {resetConfirm && <div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-label="Reset demo"><h2>Start a fresh demo?</h2><p>This clears this browser’s tasks, inventory changes and activity. Export your history first if you want to keep it.</p><div className="modal-actions"><button className="button ghost" onClick={() => setResetConfirm(false)}>Keep current demo</button><button className="button primary" onClick={reset}><RotateCcw size={16}/>Reset everything</button></div></section></div>}
  </div>;
}
function PlanReview({world,proposal,error,close,approve}:{world:World;proposal:Proposal;error:string;close:()=>void;approve:()=>void}) {
    const order=world.orders.find(o=>o.id===proposal.orderId)!;
    const held=!proposal.incidentId&&Boolean(shortage(world,order));
    const tasks=canonicalTasks(world,order);
    return <div className="modal-backdrop"><section className="modal plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className="modal-heading"><span className="modal-icon"><Sparkles size={25}/></span><button className="icon-button" aria-label="Close plan" onClick={close}><X size={20}/></button></div>
      <span className="eyebrow">{proposal.incidentId?'EXCEPTION RECOVERY':held?'INVENTORY CHECK':'PROPOSED WORKFLOW'}</span>
      <h2 id="plan-title">{proposal.incidentId?'A clear next step.':held?`Keep order #${order.id} together.`:`Let’s fulfill #${order.id}.`}</h2>
      <span className={`badge ${proposal.source==='live_ai'?'green':'amber'}`}>{proposal.source==='live_ai'?'Live AI proposal':'Rules-based proposal'}</span>
      <p>{proposal.summary}</p>
      {error&&<div className="banner notice" role="alert"><TriangleAlert size={17}/>{error}</div>}
      {held?<div className="banner amber">Stock is insufficient. Approval records an order hold. No picking or shipment will start.</div>:proposal.steps.length>0&&<div className="plan-steps">{proposal.steps.map((step,i)=><div key={i}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{taskNames[step.kind]}{tasks[i]?.sku?` · ${tasks[i].sku} × ${tasks[i].qty}`:''}</strong><small>{step.reason}</small></div><b>{step.actorId}</b></div>)}</div>}
      <small className="plan-note">{proposal.note}. Stock and task prerequisites are checked again on approval.</small>
      <div className="modal-actions"><button className="button ghost" onClick={close}>Cancel</button><button className="button primary" onClick={approve}><Check size={17}/>{proposal.incidentId?'Approve recovery':held?'Confirm order hold':'Approve & start'}</button></div>
    </section></div>;
}
function Metric({ label, value, total, detail, icon }: {
    label: string;
    value: string;
    total?: string;
    detail?: string;
    icon: React.ReactNode;
}) { return <div className="metric"><div>{icon}{label}</div><strong>{value}<span>{total}</span></strong>{detail && <small>{detail}</small>}</div>; }
function OrderProgress({ world, selectOrder }: {
    world: World;
    selectOrder: (id: string) => void;
}) { const o = selectedOrder(world), ss = stages(world, o.id), done = ss.filter(s => s.done).length; return <section className="panel order-progress"><div className="panel-heading"><div className="order-select"><Box size={18}/><select aria-label="Selected order" value={o.id} onChange={e => selectOrder(e.target.value)}>{world.orders.map(o => <option key={o.id} value={o.id}>Order #{o.id}</option>)}</select><Badge status={o.status}/></div><strong>{Math.round(done / ss.length * 100)}% <small>complete</small></strong></div><div className="progress-track"><div style={{ width: `${done / ss.length * 100}%` }}/></div><div className="stage-list">{ss.map((s, i) => <div key={s.name} className={s.done ? 'done' : i === done ? 'current' : ''}><span>{s.done ? <Check size={11}/> : i + 1}</span><small>{s.name}</small></div>)}</div><div className="progress-foot"><span>{done} of {ss.length} fulfillment stages</span><span>{o.tote} · {o.toteLocation}</span></div></section>; }
function TaskRow({ task: t, world, act }: {
    task: Task;
    world: World;
    act: (c: Command) => boolean;
}) { const [expanded, setExpanded] = useState(false); const a = world.actors.find(a => a.id === t.actorId); return <div className={`task-row ${t.status}`}><button className="task-main" aria-expanded={expanded} aria-controls={`details-${t.id}`} onClick={() => setExpanded(!expanded)}><span className={`task-symbol ${t.kind === 'transport' ? 'robot' : 'human'}`}>{t.status === 'blocked' ? <TriangleAlert size={16}/> : t.status === 'done' ? <Check size={15}/> : t.kind === 'transport' ? <Bot size={16}/> : <Box size={16}/>}</span><span><strong>{t.title}</strong><small>{t.sku ? `${t.sku} × ${t.qty} · ` : ''}{a?.name ?? 'Awaiting worker'}</small></span><Badge status={t.status}/><ChevronDown size={14} className={`task-chevron ${expanded ? 'expanded' : ''}`}/></button>{t.reason && <p className="task-reason">{t.reason}</p>}<div id={`details-${t.id}`} hidden={!expanded} className="task-details"><span className="task-controls-label">Supervisor controls</span><small>{t.from && `${t.from} → ${t.to}`}{t.dependsOn.length ? ' · Starts after the previous task' : ''}</small>{t.status !== 'done' && <div><button className="button tiny ghost" onClick={() => act({ type: 'taskPause', taskId: t.id, paused: t.status !== 'paused' })}>{t.status === 'paused' ? 'Resume task' : 'Pause task'}</button>{!t.carrying && <select aria-label={`Reassign ${t.id}`} value="" onChange={e => { if (e.target.value)
    act({ type: 'reassign', taskId: t.id, actorId: e.target.value, actionId: uid() }); }}><option value="">Reassign…</option>{world.actors.filter(a => a.id !== t.actorId && a.available && a.capabilities.includes(t.kind)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</div>}</div></div>; }
function EventList({ world, limit, filter = '' }: {
    world: World;
    limit?: number;
    filter?: string;
}) { const events = [...world.events].reverse().filter(e => `${e.message} ${e.actor} ${e.type}`.toLowerCase().includes(filter.toLowerCase())).slice(0, limit); return <div className="event-list">{events.length ? events.map(e => <div className="event-row" key={e.id}><span className={`event-icon ${e.type === 'alert' ? 'amber' : ''}`}>{e.type === 'inventory' ? <ArrowDownLeft size={16}/> : e.type === 'completed' ? <CheckCircle2 size={16}/> : e.type === 'alert' ? <TriangleAlert size={16}/> : <Activity size={16}/>}</span><div><strong>{e.message}</strong><small>{e.actor}{e.orderId ? ` · Order #${e.orderId}` : ''}{e.taskId ? ` · ${e.taskId}` : ''}</small></div><time>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>) : <div className="empty-state">No matching events.</div>}</div>; }
function IncidentReply({ incidentId, act }: {
    incidentId: string;
    act: (c: Command) => boolean;
}) { const [reply, setReply] = useState(''); return <form className="incident-reply" onSubmit={e => { e.preventDefault(); if (act({ type: 'resolve', incidentId, message: reply, actionId: uid() }))
    setReply(''); }}><input aria-label="Supervisor reply" placeholder="Reply to the worker…" value={reply} maxLength={400} onChange={e => setReply(e.target.value)}/><VoiceInput onTranscript={text => setReply(previous => `${previous.trim()} ${text}`.trim().slice(0, 400))}/><button aria-label="Send reply" disabled={!reply.trim()}><Send size={14}/></button></form>; }
function WorkerStation({ world, worker, setWorker, act }: {
    world: World;
    worker: string;
    setWorker: (v: string) => void;
    act: (c: Command) => boolean;
}) {
    const actor = world.actors.find(a => a.id === worker)!;
    const task = world.tasks.find(t => t.actorId === worker && ['active', 'blocked', 'paused'].includes(t.status));
    const other = world.tasks.find(t => t.actorId !== worker && t.status === 'active' && world.actors.find(a => a.id === t.actorId)?.kind === 'human');
    return <div className="worker-layout"><div><div className="worker-tabs">{world.actors.filter(a => a.kind === 'human').map(a => <button key={a.id} className={worker === a.id ? 'selected' : ''} onClick={() => setWorker(a.id)}><span className="avatar small human">{a.id}</span><span>{a.name}<small>{a.role}</small></span></button>)}</div>{task ? <WorkerTask key={task.id} world={world} task={task} act={act}/> : <section className="panel worker-empty"><CheckCircle2 size={45}/><h2>You’re all caught up, {actor.name.split(' ')[0]}.</h2><p>{other ? 'The next step is ready at the other worker station.' : 'Your next instruction appears when its prerequisites are complete.'}</p>{other && <button className="button primary" onClick={() => setWorker(other.actorId!)}>Switch to {world.actors.find(a => a.id === other.actorId)?.name}<ArrowRight size={16}/></button>}</section>}<section className="panel worker-messages"><div className="panel-heading"><h2>Task communication</h2><span className="badge subdued">Shared with supervisor</span></div><EventList world={{ ...world, events: world.events.filter(e => ['message', 'recovery', 'alert'].includes(e.type)&&e.orderId===(task?.orderId??world.selectedOrder)) }} limit={5}/></section></div><WarehouseMap world={world}/></div>;
}
function WorkerTask({ world, task: t, act }: {
    world: World;
    task: Task;
    act: (c: Command) => boolean;
}) {
    const [sku, setSku] = useState('');
    const [qty, setQty] = useState(String(t.qty || 1));
    const [report, setReport] = useState('');
    const [reportOpen, setReportOpen] = useState(false);
    const scan = t.kind === 'pick' || t.kind === 'replenish';
    const o = world.orders.find(o => o.id === t.orderId)!;
    const product = world.products.find(p => p.sku === t.sku);
    const descriptions: Record<string, string> = { replenish: `Move ${t.qty} ${product?.name} from ${t.from} into pick shelf ${t.to}. Confirm the item ID and quantity after the move.`, pick: `Pick ${t.qty} ${product?.name} from ${t.from} and place it in tote ${t.to}. Confirm the item ID before continuing.`, load: `Confirm that all items for #${o.id} are inside tote ${o.tote} and the tote is ready at the loading station. A robot will collect it next.`, receive: `Confirm tote ${o.tote} has arrived at catalogue receiving.`, check: `Verify every listed item and quantity inside ${o.tote}. Report any mismatch before continuing.`, pack: `Pack the verified order together and attach the label for #${o.id}. Billing is prepaid in this demo.`, dispatch: `Confirm the complete package is handed to the carrier. This records dispatch, not delivery.` };
    function submit(e: FormEvent) { e.preventDefault(); act({ type: 'complete', taskId: t.id, actorId: t.actorId!, sku, qty: Number(qty), actionId: uid() }); }
    return <section className="panel worker-task"><div className="panel-heading"><span className="eyebrow">ORDER #{t.orderId} · {t.actorId}</span><Badge status={t.status}/></div><div className="worker-task-body"><span className="large-task-icon">{scan ? <ScanLine size={30}/> : <Package size={30}/>}</span><h2>{t.title}</h2><p>{descriptions[t.kind]}</p>{t.reason && <div className="banner amber">{t.reason}</div>}<div className="task-location"><MapPin size={17}/>{t.from ? `${t.from} → ${t.to}` : `Catalogue · Tote ${o.tote}`}</div>
      {!scan && <div className="order-checklist">{o.lines.map(l => <div key={l.sku}><CheckCircle2 size={16}/><span>{world.products.find(p => p.sku === l.sku)?.name}<small>{l.sku}</small></span><b>×{l.qty}</b></div>)}</div>}
      <form onSubmit={submit}><fieldset disabled={world.paused || t.status !== 'active'}>{scan && <div className="scan-fields"><label>Item ID<input autoComplete="off" aria-label="Item ID" placeholder={`Enter ${t.sku}`} value={sku} onChange={e => setSku(e.target.value)} maxLength={50} required/></label><label>Quantity<input aria-label="Quantity" type="number" min="1" max="100" value={qty} onChange={e => setQty(e.target.value)} required/></label></div>}<button className="button primary full" type="submit"><Check size={18}/>{scan ? 'Verify item & confirm' : t.kind === 'dispatch' ? 'Confirm carrier handoff' : t.kind === 'load' ? 'Confirm tote loaded' : t.kind === 'receive' ? 'Confirm tote received' : t.kind === 'check' ? 'Confirm contents checked' : 'Confirm order packed'}</button></fieldset></form><small className="demo-disclosure">{scan ? 'Demo: manual ID entry represents a scan. No camera is connected.' : 'Confirmations record your action in the shared order history.'}</small>
      <button className="text-button report-button" onClick={() => setReportOpen(!reportOpen)}><TriangleAlert size={15}/>Report a problem</button>{reportOpen && <form className="report-form" onSubmit={e => { e.preventDefault(); if (act({ type: 'report', taskId: t.id, actorId: t.actorId!, message: report, actionId: uid() })) {
        setReport('');
        setReportOpen(false);
    } }}><textarea aria-label="Problem description" placeholder="What is preventing you from completing the task?" value={report} onChange={e => setReport(e.target.value)} maxLength={400} required/><button className="button ghost">Send to supervisor <Send size={14}/></button></form>}
    </div></section>;
}
