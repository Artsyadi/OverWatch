import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Warehouse} from '../domain.mjs';
import {ScanGate} from '../public/scan-gate.mjs';
import {StepScanner,scanCommand} from '../public/step-scanner.mjs';
import {shortestRoute} from '../public/route.mjs';
const map=JSON.parse(readFileSync(new URL('../warehouse.json',import.meta.url)));
test('worker UI pauses after receipt, resumes by voice, blocks duplicates red, submits by done, and completes voice placements with photos',async()=>{
 const w=new Warehouse(':memory:',map),nodes=new Map(),storage=new Map();let checkpoint=null;
 const element=()=>({hidden:false,open:false,disabled:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector:()=>element(),getContext:()=>({}),scrollIntoView(){}});
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,querySelector:element,querySelectorAll:()=>[],addEventListener(){},body:element(),hidden:false};
 const c=vm.createContext({VoiceInput:class{pause(){}resume(){}stop(){}},ScanGate,StepScanner,scanCommand,shortestRoute,document,location:{search:''},URLSearchParams,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{addEventListener(){}},navigator:{vibrate(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},crypto:{randomUUID},console,
 fetch:async(path,opts)=>{const b=opts.body?JSON.parse(opts.body):{};let result,ok=true;
 try{
 if(path==='/api/state')result={...w.snapshot(),checkpoint,vision:{configured:false}};
 else if(path==='/api/batches/start')result=w.startBatch();
 else if(path==='/api/draft')result=w.draft(b);
 else if(path==='/api/checkpoint')result=checkpoint={node:b.code.slice(4),source:b.source,at:Date.now()};
 else if(path==='/api/pickup')result=w.pickup(b,checkpoint);
 else if(path.endsWith('/submit'))result=w.submitBatch(path.split('/')[3]);
 else if(path.endsWith('/shelf'))result=w.verifyShelf(path.split('/')[3],b.code,b.source);
 else if(path.endsWith('/item'))result=w.verifyItem(path.split('/')[3],b.code,b.source);
 else if(path.endsWith('/place'))result=w.place(path.split('/')[3],b);
 else throw Error('Unexpected API '+path);
 }catch(e){ok=false;result={error:e.message,code:e.code};}
 return {ok,status:ok?200:409,json:async()=>structuredClone(result)};
 }});
 const source=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 try{
 vm.runInContext(source,c);await vm.runInContext('refresh()',c);
 await vm.runInContext('startBatch()',c);await vm.runInContext("processCode('OWP-RICE')",c);
 assert.equal(w.snapshot().tasks.length,1);assert.equal(nodes.get('notice-title').textContent,'Scan complete');
 await vm.runInContext("processCode('OWP-OATS')",c);assert.equal(w.snapshot().tasks.length,1);
 vm.runInContext("handleCommand('yes scan the next item')",c);await vm.runInContext("processCode('OWP-RICE')",c);
 assert.equal(nodes.get('notice').className,'notice red');assert.equal(w.snapshot().tasks.length,1);
 vm.runInContext("handleCommand('yes scan the next item')",c);await vm.runInContext("processCode('OWP-OATS')",c);
 vm.runInContext("handleCommand('done')",c);await new Promise(r=>setImmediate(r));
 assert.equal(w.snapshot().batches[0].state,'submitted');assert.equal(w.snapshot().inventory.length,0);
 await vm.runInContext("processCode('OWP-TEA')",c);assert.equal(w.snapshot().tasks.length,2);
 const snapshot=w.snapshot();w.approveBatch(snapshot.batches[0].id,{approved:true,items:snapshot.tasks.map(t=>({id:t.id,quantity:1}))});
 await vm.runInContext('refresh()',c);await vm.runInContext("handleCommand('begin put away')",c);
 c.proof={image:'data:image/jpeg;base64,'+readFileSync(new URL('fixtures/placement.jpg',import.meta.url)).toString('base64'),capturedAt:Date.now()};
 for(let i=0;i<2;i++){
 assert.equal(vm.runInContext('task()',c),null);
 await vm.runInContext("processCode('OWP-RICE')",c);assert.equal(vm.runInContext('task()',c),null);
 await vm.runInContext("processCode('OWN:RECEIVING')",c);assert.equal(vm.runInContext('currentRoute()',c),null);
 await vm.runInContext("processCode('OWP-TEA')",c);assert.equal(vm.runInContext('task()',c),null);
 const desired=i===0?'OWP-OATS':'OWP-RICE';
 await vm.runInContext(`processCode('${desired}')`,c);
 const active=vm.runInContext('task()',c);assert.equal(active.sku,desired);
 assert.ok(vm.runInContext('currentRoute()',c));
 await vm.runInContext(`processCode('OWL:${active.shelf}')`,c);await vm.runInContext(`processCode('${active.sku}')`,c);
 await vm.runInContext("handleCommand('item on right location',proof)",c);
 assert.equal(w.task(active.id).state,'placed');assert.equal(w.evidence(active.id).confirmation,'voice');
 if(i===0)await vm.runInContext("handleCommand('yes')",c);
 }
 assert.equal(w.snapshot().evidence.length,2);assert.ok(nodes.get('notice-text').textContent.includes('Demo complete'));
 }finally{w.db.close();}
});
