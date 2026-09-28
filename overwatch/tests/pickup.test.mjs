import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Warehouse} from '../domain.mjs';
const map=JSON.parse(readFileSync(new URL('../warehouse.json',import.meta.url)));
test('pickup requires fresh Receiving and approved stock; chosen barcode controls task and resets checks',()=>{
 const w=new Warehouse(':memory:',map);const receiving={node:'RECEIVING',at:Date.now()};
 try{
 const rice=w.draft({code:'OWP-RICE',requestId:'pickup-test-rice'}),oats=w.draft({code:'OWP-OATS',requestId:'pickup-test-oats'});
 assert.throws(()=>w.pickup({code:'OWP-RICE'},receiving),/approved/);
 w.approve(rice.id,{approved:true,quantity:1});w.approve(oats.id,{approved:true,quantity:1});
 assert.throws(()=>w.pickup({code:'OWP-RICE'}),/RECEIVING/);
 assert.throws(()=>w.pickup({code:'OWP-RICE'},{node:'WEST',at:Date.now()}),/RECEIVING/);
 assert.throws(()=>w.pickup({code:'OWP-RICE'},{node:'RECEIVING',at:Date.now()-180001}),/RECEIVING/);
 w.verifyShelf(oats.id,'OWL:A-R1-S2');w.verifyItem(oats.id,'OWP-OATS');
 const picked=w.pickup({code:'OWP-OATS',source:'camera'},receiving);assert.equal(picked.id,oats.id);assert.equal(picked.shelf,'A-R1-S2');assert.equal(picked.shelf_seen,null);assert.equal(picked.item_seen,null);
 assert.equal(w.snapshot().inventory.filter(i=>i.location==='RECEIVING').length,2);
 assert.equal(w.snapshot().events.find(e=>e.kind==='product_picked_up').detail.sku,'OWP-OATS');
 w.verifyShelf(oats.id,'OWL:A-R1-S2');w.verifyItem(oats.id,'OWP-OATS');w.place(oats.id,{approved:true});
 assert.throws(()=>w.pickup({code:'OWP-OATS'},receiving),/approved/);
 }finally{w.db.close();}
});
