import { useState } from 'react';
import type { World, Actor } from '../shared/types';
import { quantity } from '../shared/engine';
const px = (x: number) => 46 + x * 36;
const py = (y: number) => 45 + y * 31;
export default function WarehouseMap({ world }: {
    world: World;
}) {
    const [selected, setSelected] = useState('R1');
    const actor = world.actors.find(a => a.id === selected)!;
    const current = world.tasks.find(t => t.actorId === selected && ['active', 'blocked', 'paused'].includes(t.status));
    const rack = (x: number, y: number, id: string, sku: string) => <g key={id}>
    <text x={px(x)} y={py(y) - 13} className="map-label">{id} · {world.products.find(p => p.sku === sku)?.name}</text>
    <rect x={px(x) - 8} y={py(y) - 8} width="86" height="80" rx="5" fill="#252d28" stroke="#485348"/>
    {[0, 1, 2, 3, 4, 5].map(n => <rect key={n} x={px(x) + n % 3 * 26} y={py(y) + Math.floor(n / 3) * 26} width="18" height="20" rx="2" fill={quantity(world, sku, id) > n ? '#617a54' : '#333b33'} stroke={quantity(world, sku, id) > n ? '#8ca277' : '#475045'}/>)}
    <rect x={px(x) - 8} y={py(y) + 50} width="86" height="22" rx="3" fill="#202621"/><text x={px(x)} y={py(y) + 65} className="map-tiny">TOP</text><text x={px(x) + 70} y={py(y) + 65} textAnchor="end" className="map-tiny map-units">{quantity(world, sku, `${id}-TOP`)} units</text>
  </g>;
    function marker(a: Actor) {
        const x = px(a.position.x), y = py(a.position.y);
        const robot = a.kind === 'robot';
        return <g key={a.id} className="actor-marker" transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`Inspect ${a.name}`} onClick={() => setSelected(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ')
            setSelected(a.id); }}>
    {selected === a.id && <circle r="24" fill="none" stroke={robot ? '#b7e8ae' : '#b5adf1'} strokeDasharray="3 4" opacity=".7"/>}
    {robot ? <rect x="-15" y="-15" width="30" height="30" rx="9" fill={a.available ? '#b7e8ae' : '#545c55'}/> : <circle r="15" fill={a.available ? '#b5adf1' : '#545c55'}/>}
    <text y="4" textAnchor="middle" className="map-actor-text">{a.id}</text>
  </g>;
    }
    return <section className="panel map-panel"><div className="panel-heading"><div><span className="eyebrow">WAREHOUSE FLOOR</span><h2>Bookstore · Ground floor</h2></div><span className="badge subdued">2D simulation</span></div>
    <div className="map-legend"><span><i className="dot human"/>Human</span><span><i className="dot robot"/>Robot</span><span><i className="dot stock"/>Stock</span><span><i className="dot warning"/>Obstruction</span></div>
    <svg className="warehouse" viewBox="0 0 765 445" role="img" aria-label="Warehouse simulation with inventory racks, two cross-aisles and catalogue packing area">
      <defs><pattern id="floor-grid" width="36" height="31" patternUnits="userSpaceOnUse"><path d="M 36 0 L 0 0 0 31" fill="none" stroke="#29322a" strokeWidth=".5"/></pattern><pattern id="hazard" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="4" height="9" fill="#c99445" opacity=".45"/></pattern></defs>
      <rect x="17" y="12" width="730" height="415" rx="8" fill="#19211b" stroke="#394038"/>
      <rect x="17" y="12" width="730" height="415" rx="8" fill="url(#floor-grid)"/>
      <text x="39" y="37" className="map-zone">INVENTORY</text><text x="454" y="37" className="map-zone">CATALOGUE</text>
      <path d={`M${px(10)} 12 V${py(3) - 19} M${px(10)} ${py(3) + 19} V${py(9) - 19} M${px(10)} ${py(9) + 19} V427`} stroke="#505b4f" strokeWidth="5"/>
      <text x="53" y="212" className="map-tiny">AISLE A</text><text x="53" y="331" className="map-tiny">AISLE B</text>
      {rack(2, 2, 'A1', 'NB-101')}{rack(6, 2, 'A2', 'HD-202')}{rack(2, 6, 'B1', 'BT-303')}{rack(6, 6, 'B2', 'CP-404')}
      <g><rect x="453" y="65" width="245" height="51" rx="5" fill="#232c25" stroke="#475547"/><text x="470" y="85" className="map-label">CHECKING & PROCESSING</text><text x="470" y="102" className="map-tiny">Verification before packing</text></g>
      {[0, 1].map(n => <g key={n}><rect x={463 + n * 125} y="174" width="98" height="51" rx="5" fill="#34382c" stroke="#5c604c"/><rect x={489 + n * 125} y="186" width="34" height="26" rx="2" fill="#8a805b" stroke="#b3a778"/><path d={`M${506 + n * 125} 186 v26`} stroke="#c8be92"/><text x={512 + n * 125} y="246" textAnchor="middle" className="map-tiny">PACK STATION {n + 1}</text></g>)}
      <g aria-label="Outbound, carrier handoff"><rect x="606" y="362" width="125" height="49" rx="6" fill="#25342a" stroke="#435d47" strokeDasharray="5 4"/><text x="668.5" y="382" textAnchor="middle" className="map-station-title">Outbound</text><text x="668.5" y="398" textAnchor="middle" className="map-station-caption">Carrier handoff</text></g>
      <g aria-label="Tote loading, robot pickup"><rect x="265" y="362" width="125" height="49" rx="6" fill="#28372a" stroke="#688361" strokeDasharray="4 4"/><text x="327.5" y="382" textAnchor="middle" className="map-station-title">Tote loading</text><text x="327.5" y="398" textAnchor="middle" className="map-station-caption">Robot pickup</text></g>
      {world.tasks.filter(t => t.kind === 'transport' && t.route.length > 0).map(t => { const a = world.actors.find(a => a.id === t.actorId)!; return <polyline key={t.id} points={[a.position, ...t.route].map(p => `${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke="#b2e3a6" strokeWidth="3" strokeDasharray="6 5" opacity=".8"/>; })}
      {world.closure !== 'none' && <g><rect x={px(10) - 18} y={py(9) - 17} width="36" height="34" rx="3" fill="#4d3a21"/><rect x={px(10) - 18} y={py(9) - 17} width="36" height="34" rx="3" fill="url(#hazard)"/><text x={px(10)} y={py(9) + 5} textAnchor="middle" fill="#ffe0a3" fontSize="18" fontWeight="700">!</text></g>}
      {world.closure === 'all' && <rect x={px(10) - 18} y={py(3) - 17} width="36" height="34" rx="3" fill="url(#hazard)"/>}
      {world.actors.map(marker)}
    </svg>
    <div className="map-footer"><div><span className={`avatar small ${actor.kind}`}>{actor.id}</span><span><strong>{actor.name}</strong><small>{current ? current.title : actor.available ? 'Ready for assignment' : 'Unavailable'}</small></span></div><span className={`badge ${!actor.available ? 'amber' : current?.status === 'active' ? 'green' : 'subdued'}`}>{!actor.available ? 'Offline' : current?.status ?? 'Available'}</span></div>
  </section>;
}
