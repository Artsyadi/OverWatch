import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export class AppError extends Error { constructor(message,status=400,code=null){super(message);this.status=status;this.code=code;} }
export function requireThat(condition,message,status=400){if(!condition)throw new AppError(message,status);}
export function parseScan(value){
  requireThat(typeof value==='string' && value.trim().length>0 && value.length<=160,'Scan a valid label.');
  const code=value.trim();
  if(code.startsWith('OWL:'))return {type:'shelf',code:code.slice(4)};
  if(code.startsWith('OWN:'))return {type:'checkpoint',code:code.slice(4)};
  return {type:'product',code};
}
export class Warehouse {
  constructor(path,map){
    this.map=map;
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS products(sku TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,preferred TEXT,unit TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,sku TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,qty INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,shelf TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,shelf_seen INTEGER,item_seen INTEGER,source TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inventory(task_id TEXT PRIMARY KEY REFERENCES tasks(id),sku TEXT NOT NULL,qty INTEGER NOT NULL,location TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,kind TEXT NOT NULL,task_id TEXT,detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocked_edges(id TEXT PRIMARY KEY,reason TEXT NOT NULL,source TEXT NOT NULL,at INTEGER NOT NULL);
    `);
    // Additive migration: v1 stock and receipt history are preserved.
    if(!this.db.prepare('PRAGMA table_info(tasks)').all().some(c=>c.name==='batch_id'))this.db.exec('ALTER TABLE tasks ADD COLUMN batch_id TEXT');
    this.db.exec(`CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,state TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS batch_sku_once ON tasks(batch_id,sku) WHERE batch_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_batch ON batches((1)) WHERE state IN ('collecting','submitted');`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS placement_evidence(task_id TEXT PRIMARY KEY REFERENCES tasks(id),image BLOB NOT NULL,mime TEXT NOT NULL,captured_at INTEGER NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,confirmation TEXT NOT NULL);`);
    this.purgeEvidence();
    for(const p of map.products)this.db.prepare('INSERT OR IGNORE INTO products VALUES(?,?,?,?,?)').run(p.sku,p.name,p.category,p.preferred,p.unit);
  }
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  event(kind,task,detail){this.db.prepare('INSERT INTO events(at,kind,task_id,detail) VALUES(?,?,?,?)').run(Date.now(),kind,task,JSON.stringify(detail));}
  task(id){const t=this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);requireThat(t,'Task not found.',404);return t;}
  purgeEvidence(now=Date.now()){this.db.prepare('DELETE FROM placement_evidence WHERE expires<=?').run(now);}
  evidence(id){this.purgeEvidence();const row=this.db.prepare('SELECT * FROM placement_evidence WHERE task_id=?').get(id);requireThat(row,'Placement photo is unavailable or has expired.',404);return row;}
  snapshot(){this.purgeEvidence();return {evidence:this.db.prepare('SELECT task_id,captured_at,created,expires,confirmation FROM placement_evidence ORDER BY created DESC').all(),map:this.map,batches:this.db.prepare('SELECT * FROM batches ORDER BY created DESC').all(),products:this.db.prepare('SELECT * FROM products ORDER BY name').all(),tasks:this.db.prepare('SELECT * FROM tasks ORDER BY created DESC').all(),inventory:this.db.prepare('SELECT i.*,p.name FROM inventory i JOIN products p ON i.sku=p.sku ORDER BY i.rowid DESC').all(),events:this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 60').all().map(e=>({...e,detail:JSON.parse(e.detail)})),blocked:this.db.prepare('SELECT * FROM blocked_edges').all()};}
  batch(id){const b=this.db.prepare('SELECT * FROM batches WHERE id=?').get(id);requireThat(b,'Batch not found.',404);return b;}
  startBatch(){return this.tx(()=>{
    const open=this.db.prepare("SELECT * FROM batches WHERE state IN ('collecting','submitted')").get();
    if(open)return open;
    const id=randomUUID(),now=Date.now();this.db.prepare("INSERT INTO batches VALUES(?,'collecting',?,?)").run(id,now,now);
    this.event('batch_started',null,{batch:id});return this.batch(id);
  });}
  submitBatch(id){return this.tx(()=>{
    const b=this.batch(id);if(b.state==='submitted'||b.state==='approved')return b;
    requireThat(b.state==='collecting','Batch is not open.',409);
    requireThat(this.db.prepare("SELECT COUNT(*) n FROM tasks WHERE batch_id=? AND state='draft'").get(id).n>0,'Scan at least one product before sending for review.');
    this.db.prepare("UPDATE batches SET state='submitted',updated=? WHERE id=?").run(Date.now(),id);
    this.event('batch_submitted',null,{batch:id});return this.batch(id);
  });}
  approveBatch(id,{approved,items}){
    requireThat(approved===true,'Human approval is required.');
    return this.tx(()=>{
      const b=this.batch(id);
      const tasks=this.db.prepare("SELECT * FROM tasks WHERE batch_id=? AND state!='cancelled' ORDER BY created").all(id);
      if(b.state==='approved')return {batch:b,tasks};
      requireThat(b.state==='submitted','Finish scanning and send this batch for laptop review first.',409);
      requireThat(Array.isArray(items)&&items.length===tasks.length&&tasks.length>0,'Review every pending item before approving the batch.',409);
      requireThat(items.every(i=>i&&typeof i==='object'&&typeof i.id==='string'),'Invalid review item.');
      requireThat(new Set(items.map(i=>i.id)).size===tasks.length&&items.every(i=>tasks.some(t=>t.id===i.id)),'The review no longer matches this batch. Reload it.',409);
      for(const item of items)this.approveInside(item.id,{...item,approved:true});
      this.db.prepare("UPDATE batches SET state='approved',updated=? WHERE id=?").run(Date.now(),id);
      this.event('batch_approved',null,{batch:id,items:tasks.length,approvedBy:'review_operator'});
      return {batch:this.batch(id),tasks:tasks.map(t=>this.task(t.id))};
    });
  }
  draft({code,requestId,source='camera',batchId=null}){
    const scan=parseScan(code);requireThat(scan.type==='product','Scan a product label, not a location label.');
    requireThat(typeof requestId==='string' && /^[\w-]{8,100}$/.test(requestId),'Missing scan request ID.');
    requireThat(['camera','manual'].includes(source),'Invalid scan source.');
    return this.tx(()=>{
      const old=this.db.prepare('SELECT * FROM tasks WHERE request_key=?').get(requestId);
      if(old){requireThat(old.sku===scan.code&&old.batch_id===batchId,'Scan request does not match its original receipt.',409);return old;}
      if(batchId){
        const b=this.batch(batchId);requireThat(b.state==='collecting','This batch is closed for scanning. Review it on the laptop.',409);
        if(this.db.prepare('SELECT id FROM tasks WHERE batch_id=? AND sku=?').get(batchId,scan.code))throw new AppError('Duplicate barcode. This product is already in this batch. Nothing was added.',409,'DUPLICATE_BARCODE');
        requireThat(this.db.prepare('SELECT COUNT(*) n FROM tasks WHERE batch_id=?').get(batchId).n<100,'Batch limit reached. Send these 100 labels for review.',409);
      }
      const p=this.db.prepare('SELECT * FROM products WHERE sku=?').get(scan.code), id=randomUUID(), now=Date.now();
      this.db.prepare('INSERT INTO tasks(id,request_key,sku,name,category,state,created,updated,source,batch_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,requestId,scan.code,p?.name||'',p?.category||'dry','draft',now,now,source,batchId);
      this.event('scan_pending',id,{sku:scan.code,source,batch:batchId});return this.task(id);
    });
  }
  approve(id,details){
    requireThat(!this.task(id).batch_id,'Approve this receipt through its complete batch on the laptop.',409);
    return this.tx(()=>this.approveInside(id,details));
  }
  approveInside(id,{approved,quantity,name,category}){
    requireThat(approved===true,'Human approval is required.');
    requireThat(Number.isInteger(quantity)&&quantity>0&&quantity<=100,'Quantity must be a whole number from 1 to 100.');
      let t=this.task(id);
      if(['received','verified','placed'].includes(t.state))return t;
      requireThat(t.state==='draft','This receipt is no longer pending.',409);
      const known=this.db.prepare('SELECT * FROM products WHERE sku=?').get(t.sku);
      const productName=known?.name||(typeof name==='string'?name.trim():'');
      const productCategory=known?.category||category;
      requireThat(productName.length>=1&&productName.length<=100,'Enter the product name.');
      requireThat(this.map.shelves.some(s=>s.category===productCategory),'Choose a supported storage category.');
      // Received tasks reserve space. Inventory is not counted twice when put-away completes.
      const reserved=this.db.prepare("SELECT shelf,SUM(qty) qty FROM tasks WHERE state IN ('received','verified','placed') GROUP BY shelf").all();
      const candidates=this.map.shelves.filter(s=>s.category===productCategory&&s.capacity-(reserved.find(r=>r.shelf===s.id)?.qty||0)>=quantity);
      candidates.sort((a,b)=>(a.id===known?.preferred?-1:0)-(b.id===known?.preferred?-1:0));
      requireThat(candidates.length,'No compatible shelf has enough capacity. Reduce quantity or ask a supervisor.',409);
      const shelf=candidates[0].id;
      if(!known)this.db.prepare('INSERT INTO products VALUES(?,?,?,?,?)').run(t.sku,productName,productCategory,shelf,'unit');
      this.db.prepare("UPDATE tasks SET name=?,category=?,qty=?,state='received',shelf=?,updated=? WHERE id=?").run(productName,productCategory,quantity,shelf,Date.now(),id);
      this.db.prepare("INSERT INTO inventory(task_id,sku,qty,location) VALUES(?,?,?,'RECEIVING')").run(id,t.sku,quantity);
      this.event('receipt_approved',id,{sku:t.sku,name:productName,quantity,shelf,approvedBy:'operator'});
      return this.task(id);
  }
  verifyShelf(id,code,source='camera'){
    const scan=parseScan(code);requireThat(scan.type==='shelf','Scan a shelf QR label.');
    requireThat(['camera','manual'].includes(source),'Invalid scan source.');
    return this.tx(()=>{
      const t=this.task(id);requireThat(['received','verified'].includes(t.state),'Approve receipt before verifying placement.',409);
      const correct=scan.code===t.shelf;
      this.db.prepare("UPDATE tasks SET shelf_seen=?,item_seen=NULL,state='received',updated=? WHERE id=?").run(correct?Date.now():null,Date.now(),id);
      this.event(correct?'shelf_verified':'wrong_shelf',id,{expected:t.shelf,observed:scan.code,source});
      return {correct,task:this.task(id)};
    });
  }
  verifyItem(id,code,source='camera'){
    const scan=parseScan(code);requireThat(scan.type==='product','Scan the product barcode.');
    requireThat(['camera','manual'].includes(source),'Invalid scan source.');
    return this.tx(()=>{
      const t=this.task(id);requireThat(['received','verified'].includes(t.state),'Task is not ready for item verification.',409);
      requireThat(t.shelf_seen&&Date.now()-t.shelf_seen<60000,'Scan the assigned shelf again first.',409);
      const correct=scan.code===t.sku;
      this.db.prepare('UPDATE tasks SET item_seen=?,state=?,updated=? WHERE id=?').run(correct?Date.now():null,correct?'verified':'received',Date.now(),id);
      this.event(correct?'item_verified':'wrong_item',id,{expected:t.sku,observed:scan.code,source});return {correct,task:this.task(id)};
    });
  }
  pickup({code,source='camera',batchId},checkpoint){
    const scan=parseScan(code);requireThat(scan.type==='product','Scan the product you picked up.');
    requireThat(['camera','manual'].includes(source),'Invalid scan source.');
    requireThat(checkpoint?.node==='RECEIVING'&&Date.now()-checkpoint.at<180000,'Scan the RECEIVING checkpoint, then the product you picked up.',409);
    return this.tx(()=>{
      const candidates=this.db.prepare("SELECT * FROM tasks WHERE sku=? AND state IN ('received','verified') ORDER BY created").all(scan.code);
      const preferred=batchId?candidates.filter(t=>t.batch_id===batchId):[];
      const matches=preferred.length?preferred:candidates;
      requireThat(matches.length>0,'This product has no approved item awaiting put-away. Scan an approved product.',409);
      requireThat(matches.length===1,'Multiple approved receipts match this barcode. Select the intended batch or queue entry, then scan Receiving and the product again.',409);
      const t=matches[0];
      this.db.prepare("UPDATE tasks SET state='received',shelf_seen=NULL,item_seen=NULL,updated=? WHERE id=?").run(Date.now(),t.id);
      this.event('product_picked_up',t.id,{sku:t.sku,shelf:t.shelf,checkpoint:'RECEIVING',source});
      return this.task(t.id);
    });
  }
  place(id,{approved,evidence,confirmationSource='operator'}){
    requireThat(approved===true,'Human placement confirmation is required.');
    return this.tx(()=>{
      const t=this.task(id);if(t.state==='placed')return t;
      requireThat(t.state==='verified'&&t.shelf_seen&&t.item_seen,'Verify both the assigned shelf and product before completing.',409);
      requireThat(Date.now()-t.shelf_seen<60000&&Date.now()-t.item_seen<60000,'Verification expired. Scan shelf and product again.',409);
      if(evidence){
        requireThat(['voice','operator'].includes(confirmationSource),'Invalid confirmation source.');
        requireThat(typeof evidence.image==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(evidence.image)&&evidence.image.length<=750000,'Invalid placement photo.');
        requireThat(Number.isFinite(evidence.capturedAt)&&Math.abs(Date.now()-evidence.capturedAt)<30000,'Placement photo expired. Point at the item and confirm again.',409);
        const image=Buffer.from(evidence.image.split(',')[1],'base64');
        requireThat(image.length>100&&image[0]===255&&image[1]===216&&image[2]===255&&image[image.length-2]===255&&image[image.length-1]===217,'Invalid JPEG photo.');
        this.db.prepare('INSERT INTO placement_evidence VALUES(?,?,?,?,?,?,?)').run(id,image,'image/jpeg',evidence.capturedAt,Date.now(),Date.now()+24*3600000,confirmationSource);
      }
      this.db.prepare("UPDATE tasks SET state='placed',updated=? WHERE id=?").run(Date.now(),id);
      this.db.prepare('UPDATE inventory SET location=? WHERE task_id=?').run(t.shelf,id);
      this.event('placement_confirmed',id,{shelf:t.shelf,quantity:t.qty,confirmedBy:confirmationSource,photoSaved:!!evidence});return this.task(id);
    });
  }
  cancel(id){return this.tx(()=>{const t=this.task(id);requireThat(t.state==='draft','Only an unapproved scan can be discarded.',409);if(t.batch_id)requireThat(this.batch(t.batch_id).state==='submitted','Send the batch for review before removing items.',409);this.db.prepare("UPDATE tasks SET state='cancelled',updated=? WHERE id=?").run(Date.now(),id);this.event('scan_discarded',id,{});if(t.batch_id&&!this.db.prepare("SELECT id FROM tasks WHERE batch_id=? AND state='draft'").get(t.batch_id)){this.db.prepare("UPDATE batches SET state='cancelled',updated=? WHERE id=?").run(Date.now(),t.batch_id);}return this.task(id);});}
  block(id,reason,source){
    requireThat(this.map.edges.some(e=>e.id===id),'Unknown route segment.');
    requireThat(typeof reason==='string'&&reason.length>0&&reason.length<=400,'Provide a short obstruction description.');
    this.db.prepare('INSERT INTO blocked_edges VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,source=excluded.source,at=excluded.at').run(id,reason,source,Date.now());
    this.event('route_blocked',null,{edge:id,reason,source});
  }
  clear(id,approved){requireThat(approved===true,'Inspect the path and confirm it is clear.');this.db.prepare('DELETE FROM blocked_edges WHERE id=?').run(id);this.event('route_reopened',null,{edge:id,confirmedBy:'operator'});}
}
