import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {Warehouse} from '../domain.mjs';
import {StepScanner,scanCommand} from '../public/step-scanner.mjs';
const map=JSON.parse(readFileSync(new URL('../warehouse.json',import.meta.url)));
test('a command permits one scan; duplicate consumes permission; done freezes approval queue',()=>{
 const w=new Warehouse(':memory:',map),g=new StepScanner();let n=0;
 const b=w.startBatch();
 const attempt=code=>{if(!g.claim())return;return w.draft({batchId:b.id,code,requestId:`step-request-${++n}`,source:'camera'});};
 try{
 assert.equal(attempt('OWP-RICE'),undefined);g.arm();attempt('OWP-RICE');
 assert.equal(attempt('OWP-OATS'),undefined);assert.equal(w.snapshot().tasks.length,1);
 g.arm();assert.throws(()=>attempt('OWP-RICE'),e=>e.code==='DUPLICATE_BARCODE');
 assert.equal(attempt('OWP-OATS'),undefined);g.arm();attempt('OWP-OATS');
 g.arm();g.pause();assert.equal(attempt('OWP-TEA'),undefined);w.submitBatch(b.id);
 assert.equal(w.snapshot().tasks.length,2);assert.equal(w.snapshot().inventory.length,0);
 assert.equal(scanCommand('Yes, scan the next item.'),'next');assert.equal(scanCommand('done'),'done');
 assert.equal(scanCommand('I am not done'),null);assert.equal(scanCommand('Do not scan the next item'),null);
 }finally{w.db.close();}
});
test('reset clears existing records, restores catalogue, and refuses an active server',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ow-reset-')),path=join(dir,'db.sqlite');
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 let w=new Warehouse(path,map);const b=w.startBatch();w.draft({batchId:b.id,code:'OWP-RICE',requestId:'reset-request-1'});w.db.close();
 const reset=()=>spawnSync(process.execPath,['reset-demo.mjs','--yes'],{cwd:new URL('..',import.meta.url),env:{...process.env,DB_PATH:path,PORT:String(port)},encoding:'utf8'});
 try{
 assert.equal(reset().status,1);w=new Warehouse(path,map);assert.equal(w.snapshot().tasks.length,1);w.db.close();
 await new Promise(r=>server.close(r));const result=reset();assert.equal(result.status,0,result.stderr);
 w=new Warehouse(path,map);const s=w.snapshot();for(const k of ['tasks','batches','inventory','events','blocked'])assert.equal(s[k].length,0);
 assert.equal(s.products.length,map.products.length);w.db.close();
 }finally{server.close();rmSync(dir,{recursive:true,force:true});}
});
