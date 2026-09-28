import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {Warehouse} from '../domain.mjs';
import {ScanGate} from '../public/scan-gate.mjs';
const map=JSON.parse(readFileSync(new URL('../warehouse.json',import.meta.url)));
const scan=(w,b,sku,key)=>w.draft({batchId:b.id,code:sku,requestId:key,source:'camera'});

test('batch rejects repeated barcodes, survives reload, freezes review, and approves once',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ow-batch-')),path=join(dir,'db.sqlite');let w=new Warehouse(path,map);
 try{
 const b=w.startBatch();assert.equal(w.startBatch().id,b.id);
 const rice=scan(w,b,'OWP-RICE','batch-request-001');const oats=scan(w,b,'OWP-OATS','batch-request-002');
 assert.equal(scan(w,b,'OWP-RICE','batch-request-001').id,rice.id);
 assert.throws(()=>scan(w,b,'OWP-OATS','batch-request-001'),/original receipt/);
 assert.throws(()=>scan(w,b,'OWP-RICE','batch-request-003'),e=>e.code==='DUPLICATE_BARCODE');
 assert.equal(w.snapshot().inventory.length,0);assert.equal(w.snapshot().tasks.length,2);
 assert.throws(()=>w.approve(rice.id,{approved:true,quantity:1}),/complete batch/);
 assert.throws(()=>w.verifyShelf(rice.id,'OWL:A-R1-S1'),/Approve/);
 assert.throws(()=>w.approveBatch(b.id,{approved:true,items:[]}),/laptop review/);
 w.db.close();w=new Warehouse(path,map);assert.equal(w.snapshot().batches[0].state,'collecting');assert.equal(w.snapshot().tasks.length,2);
 w.submitBatch(b.id);assert.throws(()=>scan(w,b,'OWP-TEA','batch-request-004'),/closed/);
 assert.throws(()=>w.approveBatch(b.id,{items:[]}),/approval/);
 assert.throws(()=>w.approveBatch(b.id,{approved:true,items:[{id:rice.id,quantity:1}]}),/every pending/);
 const review={approved:true,items:[{id:rice.id,quantity:1},{id:oats.id,quantity:1}]};
 w.approveBatch(b.id,review);w.approveBatch(b.id,review);assert.equal(w.snapshot().inventory.length,2);
 assert.equal(w.snapshot().events.filter(e=>e.kind==='batch_approved').length,1);
 w.verifyShelf(rice.id,'OWL:A-R1-S1');assert.equal(w.verifyItem(rice.id,'OWP-RICE').correct,true);w.place(rice.id,{approved:true});
 assert.equal(w.task(rice.id).state,'placed');assert.equal(w.snapshot().inventory.length,2);
 const next=w.startBatch();assert.notEqual(next.id,b.id);scan(w,next,'OWP-RICE','new-batch-request');
 }finally{w.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('a capacity failure rolls back every receipt and product in the batch',()=>{
 const w=new Warehouse(':memory:',map);try{
 const b=w.startBatch(),a=scan(w,b,'OWP-RICE','atomic-request-01'),c=scan(w,b,'OWP-OATS','atomic-request-02');w.submitBatch(b.id);
 assert.throws(()=>w.approveBatch(b.id,{approved:true,items:[{id:a.id,quantity:12},{id:c.id,quantity:13}]}),/capacity/);
 assert.equal(w.snapshot().inventory.length,0);assert.equal(w.task(a.id).state,'draft');assert.equal(w.batch(b.id).state,'submitted');
 w.approveBatch(b.id,{approved:true,items:[{id:a.id,quantity:1},{id:c.id,quantity:1}]});assert.equal(w.snapshot().inventory.length,2);
 }finally{w.db.close();}
});
test('review removal never creates stock and an empty discarded batch does not block the next batch',()=>{
 const w=new Warehouse(':memory:',map);try{
 const b=w.startBatch(),a=scan(w,b,'OWP-RICE','cancel-request-01');
 assert.throws(()=>w.cancel(a.id),/review/);w.submitBatch(b.id);w.cancel(a.id);
 assert.equal(w.snapshot().inventory.length,0);assert.equal(w.batch(b.id).state,'cancelled');assert.notEqual(w.startBatch().id,b.id);
 }finally{w.db.close();}
});
test('scan gate suppresses continuous frames but allows a real re-presentation to trigger duplicate checks',()=>{
 const g=new ScanGate();assert.equal(g.read(['A','A'],1000),'A');assert.equal(g.read(['A'],1450),null);assert.equal(g.read(['A'],1900),null);
 g.read([],2400);g.read([],2901);assert.equal(g.read(['A'],3350),'A');assert.equal(g.read(['B'],3800),'B');assert.equal(g.read(['A'],4250),'A');
 assert.equal(g.read(['B','C'],4500),null);g.reset();assert.equal(g.read(['A'],4600),'A');
});
test('additive v1 migration retains approved stock and permits legacy put-away',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ow-migrate-')),path=join(dir,'db.sqlite');
 const db=new DatabaseSync(path);db.exec(`CREATE TABLE tasks(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,sku TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,qty INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,shelf TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,shelf_seen INTEGER,item_seen INTEGER,source TEXT NOT NULL);
 INSERT INTO tasks VALUES('legacy','legacy-request','OWP-RICE','Rice','dry',1,'received','A-R1-S1',1,1,NULL,NULL,'camera');
 CREATE TABLE inventory(task_id TEXT PRIMARY KEY,sku TEXT NOT NULL,qty INTEGER NOT NULL,location TEXT NOT NULL);
 INSERT INTO inventory VALUES('legacy','OWP-RICE',1,'RECEIVING');`);db.close();
 const w=new Warehouse(path,map);try{assert.equal(w.task('legacy').batch_id,null);assert.equal(w.snapshot().inventory[0].qty,1);w.verifyShelf('legacy','OWL:A-R1-S1');w.verifyItem('legacy','OWP-RICE');w.place('legacy',{approved:true});assert.equal(w.snapshot().inventory[0].location,'A-R1-S1');}finally{w.db.close();rmSync(dir,{recursive:true,force:true});}
});
