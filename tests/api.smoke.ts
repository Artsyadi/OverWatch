import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { seed } from '../shared/seed';
const url='http://127.0.0.1:3128';let server:ChildProcess;
beforeAll(async()=>{
  server=spawn(process.execPath,['dist/server.js'],{cwd:process.cwd(),env:{...process.env,PORT:'3128',NODE_ENV:'production',OPENAI_API_KEY:''},stdio:'pipe',windowsHide:true});
  let logs='';server.stderr?.on('data',c=>logs+=c.toString());
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(`Test server exited: ${logs}`);try{const r=await fetch(url+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,75));}
  throw Error(`Test server did not start: ${logs}`);
});
afterAll(()=>server?.kill());
describe('production HTTP application',()=>{
  it('serves the built UI and correct runtime health',async()=>{const html=await (await fetch(url)).text();expect(html).toContain('Overwatch');expect(html).toMatch(/\/assets\/index-/);expect(html).not.toContain('/src/main.tsx');const health=await (await fetch(url+'/api/health')).json();expect(health).toMatchObject({ok:true,aiConfigured:false});});
  it('returns an actionable, explicitly rules-based plan',async()=>{const response=await fetch(url+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Fulfill order #1042',state:seed()})});expect(response.status).toBe(200);const body=await response.json();expect(body.mode).toBe('rules');expect(body.proposal.orderId).toBe('1042');expect(body.proposal.steps).toHaveLength(9);});
  it('clarifies unsupported goals and rejects malformed state',async()=>{const post=(body:unknown)=>fetch(url+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const unknown=await (await post({goal:'Build a truck',state:seed()})).json();expect(unknown.proposal).toBeNull();expect(unknown.clarification).toBeTruthy();expect((await post({goal:'Fulfill 1042',state:{}})).status).toBe(400);});
  it('keeps unknown API paths separate from client navigation',async()=>{expect((await fetch(url+'/api/missing')).status).toBe(404);expect((await fetch(url+'/orders')).status).toBe(200);});
});
