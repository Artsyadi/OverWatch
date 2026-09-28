import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Warehouse} from '../domain.mjs';
import {transcribeCommand} from '../transcription.mjs';
import {UtteranceGate,wavBytes,VoiceInput} from '../public/voice-input.mjs';
import {scanCommand} from '../public/step-scanner.mjs';
const map=JSON.parse(readFileSync(new URL('../warehouse.json',import.meta.url)));
const photo=()=>({image:'data:image/jpeg;base64,'+readFileSync(new URL('fixtures/placement.jpg',import.meta.url)).toString('base64'),capturedAt:Date.now()});
test('placement photo is atomic with verified placement, idempotent, and expires after 24 hours',()=>{
 const w=new Warehouse(':memory:',map);
 try{
 const t=w.draft({code:'OWP-RICE',requestId:'proof-test-0001'});w.approve(t.id,{approved:true,quantity:1});
 assert.throws(()=>w.place(t.id,{approved:true,evidence:photo(),confirmationSource:'voice'}),/Verify/);assert.equal(w.snapshot().evidence.length,0);
 w.verifyShelf(t.id,'OWL:A-R1-S1');w.verifyItem(t.id,'OWP-RICE');
 assert.throws(()=>w.place(t.id,{approved:true,evidence:{...photo(),capturedAt:Date.now()-31000}}),/expired/);
 assert.equal(w.task(t.id).state,'verified');assert.equal(w.snapshot().inventory[0].location,'RECEIVING');
 w.place(t.id,{approved:true,evidence:photo(),confirmationSource:'voice'});const e=w.evidence(t.id);
 assert.equal(e.confirmation,'voice');assert.equal(w.snapshot().inventory[0].location,'A-R1-S1');
 w.place(t.id,{approved:true,evidence:photo(),confirmationSource:'voice'});assert.equal(w.snapshot().evidence.length,1);
 w.purgeEvidence(e.expires);assert.throws(()=>w.evidence(t.id),e=>e.status===404);assert.equal(w.task(t.id).state,'placed');assert.equal(w.snapshot().inventory[0].qty,1);
 }finally{w.db.close();}
});
test('silence never produces an API recording; short speech yields valid WAV; prompt text is not a command',()=>{
 const gate=new UtteranceGate(48000),silence=new Float32Array(2048),speech=new Float32Array(2048).fill(.08);
 for(let i=0;i<100;i++)assert.equal(gate.push(silence).chunks,undefined);
 for(let i=0;i<6;i++)gate.push(speech);
 let chunks;for(let i=0;i<20;i++)chunks=gate.push(silence).chunks||chunks;
 assert.ok(chunks);const wav=wavBytes(chunks,48000);assert.equal(Buffer.from(wav).toString('ascii',0,4),'RIFF');
 assert.equal(scanCommand('Scan complete. Scan next item?'),null);assert.equal(scanCommand('Yes.'),'next');assert.equal(scanCommand('Done.'),'done');
});
test('speech playback invalidates a delayed transcription before it can submit a batch',async()=>{
 let resolveTranscription,commands=0;
 const input=new VoiceInput({transcribe:()=>new Promise(r=>resolveTranscription=r),onCommand:()=>commands++,onStatus(){},getContext:()=>({key:'batch'})});
 input.enabled=true;input.paused=false;input.context={sampleRate:48000};input.gate={push:()=>({rms:.1,chunks:[new Float32Array(4096).fill(.1)]}),reset(){}};
 const pending=input.frame(new Float32Array(2048));input.pause();resolveTranscription({text:'done'});await pending;
 assert.equal(commands,0);assert.equal(input.processing,false);
});
test('transcription posts real WAV multipart data and exposes actionable upstream failures',async()=>{
 const audio=Buffer.from(wavBytes([new Float32Array(4096).fill(.1)],48000)).toString('base64');
 let calls=0;
 const fetchImpl=async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(opts.body.get('file').type,'audio/wav');assert.equal(opts.body.get('response_format'),'json');return {ok:true,json:async()=>({text:'Yes.'})};};
 assert.deepEqual(await transcribeCommand({audio,mime:'audio/wav'},{apiKey:'test-placeholder',fetchImpl}),{text:'Yes.'});assert.equal(calls,1);
 await assert.rejects(()=>transcribeCommand({audio,mime:'audio/wav'},{apiKey:'test-placeholder',fetchImpl:async()=>({ok:false,status:429})}),/billing/);
 await assert.rejects(()=>transcribeCommand({audio:'bad',mime:'audio/wav'},{apiKey:'test-placeholder',fetchImpl}),/WAV/);
});
