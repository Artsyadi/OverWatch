import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Warehouse} from '../domain.mjs';
import {shortestRoute} from '../public/route.mjs';
const map=JSON.parse(readFileSync(new URL('../warehouse.json',import.meta.url)));
const draft=(w,id='request-0001',code='OWP-RICE')=>w.draft({code,requestId:id,source:'camera'});
const approve=(w,t,quantity=1)=>w.approve(t.id,{approved:true,quantity});

test('pending scan does not create stock; explicit approval does; retries never duplicate',()=>{
  const w=new Warehouse(':memory:',map),t=draft(w);
  assert.equal(w.snapshot().inventory.length,0);
  assert.equal(draft(w).id,t.id);
  assert.throws(()=>w.approve(t.id,{quantity:2}),/approval/);
  assert.equal(approve(w,t,2).shelf,'A-R1-S1');
  approve(w,t,2);
  assert.equal(w.snapshot().inventory.length,1);assert.equal(w.snapshot().inventory[0].qty,2);
  assert.equal(w.snapshot().inventory[0].location,'RECEIVING');w.db.close();
});
test('wrong shelf and wrong product block completion; correct verified workflow persists once',()=>{
  const w=new Warehouse(':memory:',map),t=approve(w,draft(w),3);
  assert.equal(w.verifyShelf(t.id,'OWL:A-R1-S2').correct,false);
  assert.throws(()=>w.place(t.id,{approved:true}),/Verify/);
  w.verifyShelf(t.id,'OWL:A-R1-S1');
  assert.equal(w.verifyItem(t.id,'OWP-OATS').correct,false);
  assert.throws(()=>w.place(t.id,{approved:true}),/Verify/);
  assert.equal(w.verifyItem(t.id,'OWP-RICE').correct,true);
  assert.throws(()=>w.place(t.id,{approved:false}),/confirmation/);
  w.place(t.id,{approved:true});w.place(t.id,{approved:true});
  assert.equal(w.snapshot().inventory[0].location,'A-R1-S1');assert.equal(w.snapshot().inventory[0].qty,3);
  assert.equal(w.snapshot().events.filter(e=>e.kind==='placement_confirmed').length,1);w.db.close();
});
test('verification expires and a wrong shelf invalidates previous correct item verification',()=>{
  const w=new Warehouse(':memory:',map),t=approve(w,draft(w));
  w.verifyShelf(t.id,'OWL:A-R1-S1');w.verifyItem(t.id,'OWP-RICE');w.verifyShelf(t.id,'OWL:B-R1-S1');
  assert.throws(()=>w.place(t.id,{approved:true}),/Verify/);
  w.verifyShelf(t.id,'OWL:A-R1-S1');w.verifyItem(t.id,'OWP-RICE');
  w.db.prepare('UPDATE tasks SET shelf_seen=? WHERE id=?').run(Date.now()-61000,t.id);
  assert.throws(()=>w.place(t.id,{approved:true}),/expired/);w.db.close();
});
test('shelf capacity includes reserved receipts; unsuitable or full locations cannot be assigned',()=>{
  const w=new Warehouse(':memory:',map);
  const a=approve(w,draft(w,'request-0001'),12);assert.equal(a.shelf,'A-R1-S1');
  const b=approve(w,draft(w,'request-0002'),12);assert.equal(b.shelf,'A-R1-S2');
  const c=draft(w,'request-0003');assert.throws(()=>approve(w,c),/capacity/);
  assert.equal(w.task(c.id).state,'draft');assert.equal(w.snapshot().inventory.length,2);w.db.close();
});
test('unknown barcode needs operator details and category; manual input is labelled',()=>{
  const w=new Warehouse(':memory:',map),t=w.draft({code:'1234567890123',requestId:'unknown-0001',source:'manual'});
  assert.throws(()=>approve(w,t),/name/);
  const r=w.approve(t.id,{approved:true,quantity:1,name:'New tea',category:'beverage'});
  assert.equal(r.shelf,'B-R1-S1');assert.equal(r.source,'manual');w.db.close();
});
test('routing avoids a blocked edge and reports no route if all exits are blocked',()=>{
  assert.deepEqual(shortestRoute(map,'RECEIVING','RACK_A').nodes,['RECEIVING','WEST','RACK_A']);
  assert.equal(shortestRoute(map,'RECEIVING','RACK_A',['receiving-west']),null);
  assert.deepEqual(shortestRoute(map,'RECEIVING','RACK_B').nodes,['RECEIVING','WEST','RACK_A','EAST','RACK_B']);
  assert.equal(shortestRoute(map,'RECEIVING','RACK_A',['receiving-west','receiving-east']),null);
  assert.equal(shortestRoute(map,'UNKNOWN','RACK_A'),null);
});
test('inventory and blocked paths survive a database restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'overwatch-')),path=join(dir,'db.sqlite');
  let w=new Warehouse(path,map);approve(w,draft(w));w.block('receiving-west','Box on walkway','operator');w.db.close();
  w=new Warehouse(path,map);assert.equal(w.snapshot().inventory.length,1);assert.equal(w.snapshot().blocked[0].id,'receiving-west');
  assert.throws(()=>w.clear('receiving-west',false),/confirm/);w.clear('receiving-west',true);assert.equal(w.snapshot().blocked.length,0);w.db.close();rmSync(dir,{recursive:true});
});
test('invalid quantities and location labels do not become product inventory',()=>{
  const w=new Warehouse(':memory:',map);
  assert.throws(()=>draft(w,'request-0001','OWL:A-R1-S1'),/product/);
  const t=draft(w);
  for(const quantity of [-1,0,1.5,NaN,101])assert.throws(()=>approve(w,t,quantity),/whole number/);
  assert.equal(w.snapshot().inventory.length,0);w.db.close();
});
