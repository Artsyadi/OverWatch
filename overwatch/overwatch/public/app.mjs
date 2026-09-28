import {shortestRoute} from './route.mjs';
import {ScanGate} from './scan-gate.mjs';
import {StepScanner,scanCommand} from './step-scanner.mjs';
import {VoiceInput} from './voice-input.mjs';
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,activeId=localStorage.getItem('ow-active-task'),stream=null,detector=null,scanning=false,busy=false;
let voice=localStorage.getItem('ow-voice')!=='off',lastInstruction='Start the camera and scan one product label.',lastSpeech='',lastSpeechAt=0;
let lastRead='',lastReadAt=0,lastWarnAt=0,scanTimer=null,autoTimer=null,visionBusy=false,activeCamera=null;
let previousTaskJSON='',previousRouteSignature='',allowNewScan=true,connectionGood=true;
const reviewMode=new URLSearchParams(location.search).get('review')==='1';
let workflowMode=localStorage.getItem('ow-workflow-mode')||(activeId?'putaway':'scan');
let selectedBatch=localStorage.getItem('ow-batch'),previousBatchJSON='',hudMode=false;
let pickupStage=workflowMode==='putaway'?'receiving':null;
if(pickupStage){activeId=null;localStorage.removeItem('ow-active-task');}
const scanGate=new ScanGate(),stepScanner=new StepScanner();
let commandEnabled=false,micTimer=null,speechActive=false,speechSerial=0,pendingFinish=false;
const voiceInput=new VoiceInput({
  transcribe:body=>api('/api/transcribe',body),getContext:commandContext,
  onCommand:async(text,context)=>{if(context.key!==commandContextKey())return;$('heard-command').textContent='Heard: '+(text||'(no words)');await handleCommand(text,context.evidence);},
  onStatus:(text,level=0)=>{$('mic-status').textContent=text;$('mic-level').value=level;if(text.startsWith('Voice error:'))notice('yellow','Voice command failed',text.slice(13));}
});
const batch=()=>state?.batches?.find(b=>b.id===selectedBatch)||null;
const batchTasks=()=>state?.tasks.filter(t=>t.batch_id===selectedBatch&&t.state!=='cancelled')||[];
const readyTasks=()=>state?.tasks.filter(t=>['received','verified'].includes(t.state))||[];
const task=()=>state?.tasks.find(t=>t.id===activeId)||null;
const nodeName=id=>state?.map.nodes.find(n=>n.id===id)?.name||id;
async function api(path,body){
  let response;
  try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Connection lost. No confirmation received. Reconnect and retry; duplicate approvals will not add stock twice.');}
  const result=await response.json();
  if(!response.ok){if(response.status===401){$('login').hidden=false;$('workspace').hidden=true;toggleHUD(false);stopCamera();}const error=new Error(result.error||'Request failed.');error.code=result.code;throw error;}
  return result;
}
function speak(text,force=false){
  lastInstruction=text;
  if(!voice||!('speechSynthesis'in window))return;
  if(!force&&text===lastSpeech&&Date.now()-lastSpeechAt<12000)return;
  lastSpeech=text;lastSpeechAt=Date.now();const serial=++speechSerial;speechActive=true;pauseMic();speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=1.02;
  const finish=()=>{if(serial===speechSerial){speechActive=false;scheduleMic();}};
  utterance.onend=utterance.onerror=finish;speechSynthesis.speak(utterance);
  // Some Android speech engines omit onend. Resume only after playback actually stops.
  const check=()=>{if(serial!==speechSerial||!speechActive)return;if(!speechSynthesis.speaking&&!speechSynthesis.pending)finish();else setTimeout(check,250);};setTimeout(check,700);
}
function notice(level,title,description,read=true){
  $('notice').className=`notice ${level}`;$('notice-title').textContent=title;$('notice-text').textContent=description;
  $('notice').querySelector('.notice-icon').textContent=level==='yellow'?'△':level==='red'?'!':level==='green'?'✓':'◎';
  if(read)speak(`${title}. ${description}`);
  if(level==='yellow'||level==='red')navigator.vibrate?.(level==='red'?[120,60,120]:90);
}
function setActive(t){activeId=t?.id||null;previousTaskJSON='';if(activeId)localStorage.setItem('ow-active-task',activeId);else localStorage.removeItem('ow-active-task');if(t){const i=state.tasks.findIndex(x=>x.id===t.id);if(i>=0)state.tasks[i]=t;else state.tasks.unshift(t);}renderTask();renderRoute();renderBatch();}
async function refresh(){
  try{
    const oldBatch=batch()?.state;
    state=await api('/api/state');connectionGood=true;$('connection').classList.remove('offline');$('connection').innerHTML='<span class="dot"></span> Connected';
    $('login').hidden=true;$('workspace').hidden=false;
    if(activeId&&!task()){activeId=null;localStorage.removeItem('ow-active-task');} if(!state.tasks.length&&!state.batches.length){workflowMode='scan';localStorage.setItem('ow-workflow-mode','scan');selectedBatch=null;localStorage.removeItem('ow-batch');stepScanner.pause();}
    if(!batch()||(!['collecting','submitted'].includes(batch().state)&&state.batches.some(b=>['collecting','submitted'].includes(b.state))))selectedBatch=state.batches.find(b=>['collecting','submitted'].includes(b.state))?.id||state.batches[0]?.id||null;
    if(selectedBatch)localStorage.setItem('ow-batch',selectedBatch);
    renderBatch();
    if(!reviewMode&&oldBatch==='submitted'&&batch()?.state==='approved'){if(commandEnabled)beginPutaway();else notice('green','Batch approved','Your laptop review is complete. Start voice demo to begin put-away.');}
    const signature=JSON.stringify(task());if(signature!==previousTaskJSON)renderTask();
    renderRoute();if($('records-dialog').open)renderRecords();
  }catch(e){connectionGood=false;$('connection').classList.add('offline');$('connection').textContent='Disconnected';stopAuto();if(!$('login').hidden)return;notice('yellow','Connection unavailable',e.message,false);}
}
function currentRoute(){
  const t=workflowMode==='putaway'&&!pickupStage?task():null,cp=state?.checkpoint;
  if(!t?.shelf||!cp||Date.now()-cp.at>180000)return null;
  const shelf=state.map.shelves.find(s=>s.id===t.shelf);
  return shortestRoute(state.map,cp.node,shelf.node,state.blocked.map(b=>b.id));
}
function renderTask(){
  const t=task();previousTaskJSON=JSON.stringify(t);
  if(reviewMode||workflowMode==='scan'){ $('task-content').innerHTML='';renderWorkerHUD();return;}
  if(pickupStage){
    $('task-reference').textContent='PICK UP AN APPROVED ITEM';
    $('task-content').innerHTML=`<span class="task-eyebrow">02 / PICKUP</span><h2 class="task-title">${pickupStage==='receiving'?'Start at Receiving.':'Which product did you pick up?'}</h2><p class="task-copy">${pickupStage==='receiving'?'Scan the RECEIVING QR at the entrance.':'Scan the product label. Its approved task determines your shelf and route.'}</p><p class="task-note">No item selected yet. Inventory stays at Receiving until verified placement.</p>`;
    renderWorkerHUD();return;
  }
  const step=!t||t.state==='draft'?1:t.state==='placed'||t.shelf_seen?3:2;
  for(let i=1;i<=3;i++)$('step-'+i).className=i<step?'done':i===step?'active':'';
  $('task-reference').textContent=t?`TASK ${t.id.slice(0,6).toUpperCase()}`:'NO ACTIVE TASK';
  $('hud-task').textContent=!t?'SCAN A PRODUCT':t.state==='draft'?'APPROVE RECEIPT':t.state==='placed'?'PLACEMENT CONFIRMED':t.shelf_seen?'VERIFY PRODUCT':`DESTINATION / ${t.shelf}`;
  $('scan-hint').textContent=!t?'Hold one product label inside the frame':t.state==='draft'?'Review the receipt below before continuing':t.state==='placed'?'Tap Receive another to start a new task':t.shelf_seen?'Rescan the product, then confirm placement':'Scan a checkpoint or the assigned shelf';
  if(!t||t.state==='cancelled'){
    const pending=state.tasks.filter(x=>['draft','received','verified'].includes(x.state));
    $('task-content').innerHTML=`<span class="task-eyebrow">01 / RECEIVE</span><h2 class="task-title">Every item.<br>A clear destination.</h2><p class="task-copy">Point the camera at a product label. Review its details before anything enters inventory.</p><div class="empty-list"><div class="empty-row"><span>01</span><p>Scan a product label</p></div><div class="empty-row"><span>02</span><p>Review and approve the receipt</p></div><div class="empty-row"><span>03</span><p>Follow checkpoints to the right shelf</p></div></div>${pending.length?'<h3 class="task-copy">Resume an unfinished task</h3>'+pending.map(p=>`<button class="secondary resume-task" data-action="resume" data-id="${p.id}">${escapeHTML(p.name||p.sku)} <small>${escapeHTML(p.state)}</small></button>`).join(''):''}`;
    return;
  }
  if(t.state==='draft'){
    const known=state.products.some(p=>p.sku===t.sku);
    $('task-content').innerHTML=`<span class="task-eyebrow">01 / HUMAN APPROVAL</span><h2 class="task-title">Review this receipt.</h2><div class="sku-line">${escapeHTML(t.sku)} · ${t.source==='camera'?'Camera scan':'Manual entry'}</div><form id="approval-form"><div class="receipt-fields"><div><label for="product-name">PRODUCT NAME</label><input id="product-name" value="${escapeHTML(t.name)}" maxlength="100" placeholder="Enter product name" ${known?'readonly':''} required></div><div><label for="quantity">QUANTITY</label><input id="quantity" type="number" min="1" max="100" step="1" value="1" required inputmode="numeric"></div><div class="full"><label for="category">STORAGE CATEGORY</label><select id="category" ${known?'disabled':''}>${['dry','beverage','canned'].map(c=>`<option value="${c}" ${c===t.category?'selected':''}>${c==='dry'?'Dry goods':c==='beverage'?'Beverages':'Canned goods'}</option>`).join('')}</select></div></div><p class="task-note">${known?'Catalogue match found.':'Unknown barcode: you are creating a product record.'} No inventory has been added. Approval records receipt and reserves an available shelf.</p><div class="task-buttons"><button class="primary" type="submit">Approve receipt <span>✓</span></button><button class="secondary" type="button" data-action="discard">Discard</button></div></form>`;
  }else if(t.state==='placed'){
    allowNewScan=false;
    $('task-content').innerHTML=`<div class="success-mark">✓</div><span class="task-eyebrow">WORKFLOW COMPLETE</span><h2 class="task-title">Right item.<br>Right place.</h2><p class="task-copy">Placement confirmed by you. Inventory and task history have been updated.</p><div class="success-data"><div><span>PRODUCT</span><strong>${escapeHTML(t.name)}</strong></div><div><span>QUANTITY</span><strong>${t.qty}</strong></div><div><span>LOCATION</span><strong>${escapeHTML(t.shelf)}</strong></div><div><span>STATUS</span><strong>Stored</strong></div></div><button class="primary" data-action="new">Choose next approved item ↗</button>`;
  }else{
    const freshShelf=t.shelf_seen&&Date.now()-t.shelf_seen<60000,freshItem=t.item_seen&&Date.now()-t.item_seen<60000;
    $('task-content').innerHTML=`<span class="task-eyebrow">${t.shelf_seen?'03 / VERIFY PLACEMENT':'02 / PUT-AWAY'}</span><h2 class="task-title">${escapeHTML(t.name)}</h2><div class="sku-line">${escapeHTML(t.sku)} · ${t.qty} ${t.qty===1?'unit':'units'} received</div><div class="destination"><span class="arrow">↗</span><div><span class="micro">ASSIGNED LOCATION</span><strong>${escapeHTML(t.shelf)}</strong><small>${escapeHTML(state.map.shelves.find(s=>s.id===t.shelf)?.name)}</small></div></div><ul class="verification-list"><li class="passed">✓ Receipt approved · ${t.qty} units</li><li class="${freshShelf?'passed':''}">${freshShelf?'✓':'○'} Scan the assigned shelf label</li><li class="${freshItem?'passed':''}">${freshItem?'✓':'○'} Rescan the matching product at the shelf</li><li>○ Place item, point camera at it, say “item on right location”</li></ul><button class="primary" data-action="place" ${freshShelf&&freshItem&&t.state==='verified'?'':'disabled'}>Confirm placed on ${escapeHTML(t.shelf)} ✓</button><p class="task-note">Shelf and product checks expire after 60 seconds. Your placement confirmation saves a camera photo for 24 hours.</p>`;
  }
}
function renderRoute(){
  if(!state)return;
  const t=workflowMode==='putaway'&&!pickupStage?task():null,cp=state.checkpoint,fresh=cp&&Date.now()-cp.at<180000,route=currentRoute();
  const signature=JSON.stringify([t?.id,t?.state,cp,route,state.blocked]);
  if(signature!==previousRouteSignature){$('facing-confirm').checked=false;stopAuto();previousRouteSignature=signature;}
  const nodes=state.map.nodes;
  const point=id=>nodes.find(n=>n.id===id);
  const svgEdges=state.map.edges.map(e=>{const a=point(e.a),b=point(e.b),blocked=state.blocked.some(x=>x.id===e.id),planned=route?.edges.includes(e.id);return `<line x1="${a.x*3}" y1="${a.y*1.8+10}" x2="${b.x*3}" y2="${b.y*1.8+10}" stroke="${blocked?'#d4a12b':planned?'#71a344':'#d4dec9'}" stroke-width="${planned?5:3}" ${blocked?'stroke-dasharray="5 4"':''}/>`;}).join('');
  const svgNodes=nodes.map(n=>{const current=fresh&&cp.node===n.id,dest=t?.shelf&&state.map.shelves.find(s=>s.id===t.shelf)?.node===n.id;return `<g><circle cx="${n.x*3}" cy="${n.y*1.8+10}" r="${current?8:5}" fill="${current?'#243e2d':dest?'#94c666':'#f9fbf6'}" stroke="#75905f" stroke-width="2"/>${current?`<circle cx="${n.x*3}" cy="${n.y*1.8+10}" r="3" fill="#b7f46a"/>`:''}<text x="${n.x*3}" y="${n.y*1.8+10+(n.id==='RECEIVING'?22:-13)}" text-anchor="middle" font-size="9" fill="#52654b" font-family="monospace">${escapeHTML(n.id.replace('_',' '))}</text></g>`;}).join('');
  $('route-map').innerHTML=`<svg role="img" aria-label="Schematic warehouse map with scanned checkpoint and planned route" viewBox="0 0 300 200">${svgEdges}${svgNodes}</svg>`;
  $('hud-location').textContent=fresh?`Last scanned: ${nodeName(cp.node)}`:'Location unverified · scan a checkpoint';
  let instruction='Scan the RECEIVING checkpoint to establish your location.';
  if(t?.shelf&&t.state!=='placed'){
    if(!fresh)instruction='Scan a checkpoint label. We need your current location before giving a route.';
    else if(!route)instruction='No available route on this map. Stop and ask for assistance; inspect blocked paths before reopening them.';
    else if(route.nodes.length===1)instruction=`At the destination checkpoint. Find ${t.shelf}, scan its shelf label, then rescan the product.`;
    else instruction=`From ${nodeName(route.nodes[0])}, follow the marked path to ${nodeName(route.nodes[1])}. Scan its checkpoint when you arrive.`;
  }else if(t?.state==='placed')instruction='Put-away complete. Start the next receipt when ready.';
  if(pickupStage)instruction=pickupStage==='receiving'?'Scan the RECEIVING QR to begin put-away.':'Scan the product you picked up. Its approved destination determines the route.';
  $('route-instruction').textContent=instruction;
  if(t?.shelf&&t.state!=='placed')$('hud-task').textContent=!fresh?'SCAN A CHECKPOINT':!route?'STOP / NO AVAILABLE ROUTE':route.nodes.length===1?`VERIFY SHELF / ${t.shelf}`:`DESTINATION / ${t.shelf}`;
  if(route?.nodes.length>1&&t&&['received','verified'].includes(t.state))$('hud-task').textContent=`NEXT CHECKPOINT / ${route.nodes[1].replace('_',' ')}`;
  const hasNext=!!(route?.edges.length&&t&&['received','verified'].includes(t.state));
  $('facing-text').textContent=hasNext?`I am stopped at ${nodeName(route.nodes[0])}, facing the path to ${nodeName(route.nodes[1])}.`:'Scan a checkpoint to identify the next path segment.';
  $('facing-confirm').disabled=!hasNext;
  $('inspect-path').disabled=!hasNext||!stream||!state.vision.configured||visionBusy;
  $('auto-vision').disabled=!hasNext||!stream||!state.vision.configured;
  $('report-block').disabled=!hasNext;
  $('vision-badge').textContent=state.vision.configured?'AI CONFIGURED':'AI OFF';
  $('vision-help').textContent=state.vision.configured?'A reduced camera frame is sent to OpenAI for each check. Stay stopped while checking.':'Add your API key to the server’s .env and restart to enable real image analysis. Operator reports work now.';
  renderWorkerHUD();
  $('blocked-list').innerHTML=state.blocked.map(b=>`<div class="blocked-item"><b>Blocked: ${escapeHTML(b.id)}</b><p>${escapeHTML(b.reason)} · ${b.source==='camera_ai'?'Camera AI observation':'Operator report'}</p><button class="secondary" data-action="clear-path" data-id="${escapeHTML(b.id)}">I inspected this path: reopen</button></div>`).join('');
}
async function run(action){if(busy)return;busy=true;try{await action();}catch(e){notice(e.code==='DUPLICATE_BARCODE'?'red':'yellow',e.code==='DUPLICATE_BARCODE'?'Duplicate barcode blocked':'Action needs attention',e.message);}finally{busy=false;if(pendingFinish){pendingFinish=false;submitBatch();}}}
async function processCode(code,source='camera'){
  if(!state||busy||!connectionGood)return;
  if(workflowMode==='scan'&&(!stepScanner.armed||pendingFinish))return;
  await run(async()=>{
    const t=workflowMode==='putaway'&&!pickupStage?task():null;
    if(reviewMode)return;
    if(workflowMode==='putaway'&&pickupStage){
      if(code==='OWN:RECEIVING'){
        state.checkpoint=await api('/api/checkpoint',{code,source});pickupStage='product';renderTask();renderRoute();
        notice('green','Receiving recognised','Scan the product you are picking up.');return;
      }
      if(pickupStage==='receiving'){notice('yellow','Start at Receiving','Scan the RECEIVING QR first.');return;}
      if(code.startsWith('OWN:')||code.startsWith('OWL:')){notice('yellow','Scan your product','Show the label on the approved product you picked up.');return;}
      const picked=await api('/api/pickup',{code,source,batchId:selectedBatch});
      pickupStage=null;setActive(picked);
      notice('green',`${picked.name} selected`,`Take it to ${picked.shelf}. ${$('route-instruction').textContent}`);return;
    }
    if(code.startsWith('OWN:')){
      state.checkpoint=await api('/api/checkpoint',{code,source});renderRoute();
      notice('green','Checkpoint recognised',$('route-instruction').textContent);return;
    }
    if(code.startsWith('OWL:')){
      if(!t||!['received','verified'].includes(t.state)){notice('yellow','Receive an item first','Scan a product and approve its receipt before verifying a shelf.');return;}
      const result=await api(`/api/tasks/${t.id}/shelf`,{code,source});setActive(result.task);
      notice(result.correct?'green':'yellow',result.correct?'Correct shelf':'Wrong shelf',result.correct?'Correct location. Show the product label.':`This task belongs at ${t.shelf}. Placement has not been recorded.`);return;
    }
    if(t&&['received','verified'].includes(t.state)){
      if(!t.shelf_seen||Date.now()-t.shelf_seen>=60000){notice('yellow','Scan the shelf first',`Scan ${t.shelf}, then scan the product again.`);return;}
      const result=await api(`/api/tasks/${t.id}/item`,{code,source});setActive(result.task);
      notice(result.correct?'green':'yellow',result.correct?'Product and shelf match':'Wrong product',result.correct?'Place the item, point the camera at it, and say item on right location.':`Expected ${t.name}. Scan the correct product before completing.`);return;
    }
    if(workflowMode==='putaway'){notice('yellow','Choose an approved item','Open Details and choose the next approved item.');return;}
    if(!batch()||batch().state!=='collecting'){notice('yellow','Batch is not open','Start a new batch or wait for laptop approval.');return;}
    if(!stepScanner.claim())return;
    renderBatch();
    const pending=await api('/api/draft',{code,requestId:crypto.randomUUID(),source,batchId:selectedBatch});
    state.tasks.unshift(pending);renderBatch();renderWorkerHUD();
    notice('green',source==='camera'?'Scan complete':'Manual entry saved',`${pending.name||pending.sku} · ${batchTasks().length} saved. Scan next item?`,false);
    speak('Scan complete. Scan next item?',true);
  });
}
async function initDetector(){
  if(!('BarcodeDetector'in window)){
    $('scanner-state').textContent='Scanner unavailable';
    notice('yellow','Barcode scanner unavailable','Use Chrome on your Android phone. Manual entry is available and is recorded separately.');return false;
  }
  const supported=await BarcodeDetector.getSupportedFormats();
  const formats=['qr_code','code_128','ean_13','ean_8','upc_a','upc_e','data_matrix'].filter(f=>supported.includes(f));
  if(!formats.length)throw new Error('No supported barcode formats. Use Chrome on your Pixel.');
  detector=new BarcodeDetector({formats});$('scanner-state').textContent='Barcode + QR ready';return true;
}
const scanCanvas=document.createElement('canvas'),scanCtx=scanCanvas.getContext('2d',{willReadFrequently:true});
async function scanLoop(){
  if(!stream)return;
  try{
    const v=$('video');
    if(detector&&(workflowMode!=='scan'||(batch()?.state==='collecting'&&stepScanner.armed))&&!busy&&!scanning&&v.readyState>=2&&!document.hidden&&!$('records-dialog').open&&!$('setup-dialog').open&&!$('confirm-dialog').open){
      scanning=true;
      // Decode the full uncropped video frame; object-fit:contain preserves what the user sees.
      const scale=Math.min(1,1280/v.videoWidth);scanCanvas.width=v.videoWidth*scale;scanCanvas.height=v.videoHeight*scale;scanCtx.drawImage(v,0,0,scanCanvas.width,scanCanvas.height);
      const detections=await detector.detect(scanCanvas),codes=[...new Set(detections.map(d=>d.rawValue).filter(Boolean))];
      if(codes.length>1){scanGate.read(codes);if(Date.now()-lastWarnAt>8000){notice('yellow','More than one label visible','Move closer so only the label you want is in view.');lastWarnAt=Date.now();}}
      else {const code=scanGate.read(codes);if(code)await processCode(code,'camera');}
    }
  }catch(e){if(Date.now()-lastWarnAt>15000){notice('yellow','Scanner could not read this frame','Hold the label steady with good light and try again.',false);lastWarnAt=Date.now();}}
  finally{scanning=false;if(stream)scanTimer=setTimeout(scanLoop,450);}
}
async function startCamera(deviceId){
  try{
    if(!isSecureContext)throw new Error('Open the HTTPS tunnel URL on your phone. A plain Wi-Fi IP address cannot access the camera.');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access is unavailable in this browser. Use Chrome on your Pixel.');
    stopCamera();scanGate.reset();
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:deviceId?{deviceId:{exact:deviceId},width:{ideal:1280},height:{ideal:720}}:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
    const video=$('video');video.srcObject=stream;await video.play();activeCamera=stream.getVideoTracks()[0].getSettings().deviceId;
    $('camera-empty').hidden=true;$('camera-hud').hidden=false;$('camera-state').textContent='CAMERA LIVE';$('camera-dot').classList.remove('dim');$('pause-camera').hidden=false;
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');$('switch-camera').hidden=devices.length<2;
    await initDetector();renderRoute();scanLoop();
    notice('neutral','Camera ready','Hold one product or location label in view.');
    try{await navigator.wakeLock?.request('screen');}catch{}
    stream.getVideoTracks()[0].addEventListener('ended',()=>{stopCamera();notice('yellow','Camera stopped','Tap Start camera to reconnect.');});
  }catch(e){stopCamera();$('camera-error').textContent=e.name==='NotAllowedError'?'Camera permission was denied. Allow Camera in Chrome site settings, then try again.':e.message;}
}
function stopCamera(){clearTimeout(scanTimer);stopAuto();if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}$('video').srcObject=null;$('camera-empty').hidden=false;$('camera-hud').hidden=true;$('camera-state').textContent='CAMERA OFF';$('camera-dot').classList.add('dim');$('pause-camera').hidden=true;$('switch-camera').hidden=true;if(state)renderRoute();}
function stopAuto(){if(autoTimer){clearInterval(autoTimer);autoTimer=null;}$('auto-vision').textContent='Auto: off';}
async function checkPath(){
  if(visionBusy||!stream||!task())return;
  if(!$('facing-confirm').checked){notice('yellow','Confirm your camera direction','Stop at the last scanned checkpoint and face the next marked path. Check the confirmation box first.');return;}
  const route=currentRoute();if(!route?.edges.length)return;
  const v=$('video');if(!v.videoWidth)return;
  const c=document.createElement('canvas'),scale=Math.min(1,768/v.videoWidth);c.width=v.videoWidth*scale;c.height=v.videoHeight*scale;c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  const taskId=task().id,edge=route.edges[0];visionBusy=true;$('inspect-path').disabled=true;$('observation').textContent='Checking this camera frame…';
  try{
    const r=await api('/api/vision',{image:c.toDataURL('image/jpeg',0.65),capturedAt:Date.now(),facingConfirmed:true,taskId,edge});
    if(task()?.id!==taskId)return;
    $('observation').textContent=`${new Date(r.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})} · ${r.summary}`;
    await refresh();
    if(!r.stillRelevant){notice('yellow','Observation is out of date','The task or route changed while the camera was being checked.');return;}
    if(r.blocked){stopAuto();$('facing-confirm').checked=false;notice(r.status==='stop'?'red':'yellow',r.status==='stop'?'Stop and inspect':'Obstruction observed',`${r.summary} ${$('route-instruction').textContent}`);}
    else if(r.status==='uncertain'||r.confidence<0.75){notice('yellow','View is uncertain',r.summary);}
    else if(r.status==='no_visible_obstruction'){notice('neutral','Frame checked',`${r.summary} Continue to check your surroundings.`);}
    else notice('yellow','Possible obstruction',r.summary);
  }catch(e){stopAuto();$('observation').textContent=`Check failed: ${e.message}`;notice('yellow','Camera AI unavailable',e.message);}
  finally{visionBusy=false;renderRoute();}
}
function renderRecords(){
  const inventory=state.inventory;
  $('records-content').innerHTML=`<h3>Inventory · ${inventory.reduce((a,i)=>a+i.qty,0)} approved units</h3>${inventory.length?`<table class="records-table"><thead><tr><th>Product</th><th>Qty</th><th>Location</th></tr></thead><tbody>${inventory.map(i=>`<tr><td>${escapeHTML(i.name)}</td><td>${i.qty}</td><td>${escapeHTML(i.location)}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">No approved inventory yet. Pending scans do not count as stock.</p>'}<h3>Placement photos · retained 24 hours</h3>${(state.evidence||[]).map(e=>`<div class="event-row"><div><b>${escapeHTML(state.tasks.find(t=>t.id===e.task_id)?.name||e.task_id)}</b><p>${escapeHTML(state.tasks.find(t=>t.id===e.task_id)?.shelf)} · ${new Date(e.captured_at).toLocaleString()} · expires ${new Date(e.expires).toLocaleString()}</p><a href="/api/evidence/${e.task_id}" target="_blank" rel="noopener"><img src="/api/evidence/${e.task_id}" alt="Operator-confirmed placement photo" style="max-width:240px;width:100%;border-radius:8px"></a></div></div>`).join('')||'<p>No unexpired placement photos.</p>'}<h3>Recent events</h3>${state.events.map(e=>`<div class="event-row"><time>${new Date(e.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><div><b>${escapeHTML(e.kind.replaceAll('_',' '))}</b><p>${escapeHTML(Object.entries(e.detail).filter(([k])=>!['confidence','model','stillRelevant'].includes(k)).map(([k,v])=>`${k}: ${v}`).join(' · '))}</p></div></div>`).join('')||'<p class="muted">Your workflow history will appear here.</p>'}`;
}
function confirmAction(title,description){return new Promise(resolve=>{const d=$('confirm-dialog');$('confirm-title').textContent=title;$('confirm-description').textContent=description;d.returnValue='cancel';d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true});d.showModal();});}
async function approveReceipt(){
  const form=$('approval-form');if(!form||!form.reportValidity())return;
  await run(async()=>{const t=await api(`/api/tasks/${task().id}/approve`,{approved:true,quantity:Number($('quantity').value),name:$('product-name').value,category:$('category').value});setActive(t);await refresh();notice('green','Receipt approved',`${t.qty} units of ${t.name}. Assigned to ${t.shelf}. ${$('route-instruction').textContent}`);$('viewfinder').scrollIntoView({behavior:'smooth',block:'center'});});
}
function capturePlacement(){
  const v=$('video');
  if(!stream||v.readyState<2||!v.videoWidth)throw Error('Camera is not ready. Point it at the placed item and repeat your confirmation.');
  const c=document.createElement('canvas'),scale=Math.min(1,960/v.videoWidth);c.width=v.videoWidth*scale;c.height=v.videoHeight*scale;c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  return {image:c.toDataURL('image/jpeg',0.7),capturedAt:Date.now()};
}
function commandContextKey(){return JSON.stringify([workflowMode,pickupStage,selectedBatch,batch()?.state,stepScanner.armed,activeId,task()?.state]);}
function commandContext(){let evidence=null;if(workflowMode==='putaway'&&task()?.state==='verified'){try{evidence=capturePlacement();}catch{}}return {key:commandContextKey(),evidence};}
async function placeItem(confirmationSource='operator',evidence=null){await run(async()=>{
  if(!task()||!['verified','placed'].includes(task().state))throw Error('Scan the correct shelf and product first.');
  const t=await api(`/api/tasks/${task().id}/place`,{approved:true,confirmationSource,evidence:evidence||capturePlacement()});
  setActive(t);stopAuto();await refresh();
  const more=readyTasks().length;
  notice('green','Placement confirmed',`${t.name} is recorded at ${t.shelf}. Photo saved for 24 hours. ${more?'Next item?':'All items are placed. Demo complete.'}`);
});}
document.addEventListener('submit',e=>{
  if(e.target.id==='batch-review-form'){e.preventDefault();approveBatchReview();}
  if(e.target.id==='approval-form'){e.preventDefault();approveReceipt();}
  if(e.target.id==='manual-form'){e.preventDefault();const code=$('manual-code').value.trim();if(code)processCode(code,'manual');}
});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';const button=e.target.querySelector('button');button.disabled=true;try{await api('/api/login',{code:$('access-code').value});$('access-code').value='';await refresh();}catch(err){$('login-error').textContent=err.message;}finally{button.disabled=false;}});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled||busy)return;
  const action=b.dataset.action;
  if(action==='resume'){const chosen=state.tasks.find(t=>t.id===b.dataset.id);if(chosen?.batch_id){selectedBatch=chosen.batch_id;localStorage.setItem('ow-batch',selectedBatch);}beginPutaway();}
  if(action==='new')beginPutaway();
  if(action==='start-batch')await startBatch();
  if(action==='submit-batch')await submitBatch();
  if(action==='next-scan')resumeScan();
  if(action==='begin-putaway')beginPutaway();
  if(action==='review-batch'){selectedBatch=b.dataset.id;previousBatchJSON='';renderBatch();}
  if(action==='remove-scan'&&await confirmAction('Remove this pending scan?','No stock has been added. This barcode cannot be scanned again in this same batch.'))await run(async()=>{await api(`/api/tasks/${b.dataset.id}/cancel`,{});await refresh();});
  if(action==='discard')await run(async()=>{await api(`/api/tasks/${task().id}/cancel`,{});await refresh();setActive(null);notice('neutral','Scan discarded','No inventory was added. Scan another product when ready.');});
  if(action==='place')await placeItem();
  if(action==='clear-path'&&await confirmAction('Reopen this route segment?',`Only confirm after you have physically inspected ${b.dataset.id} and removed the obstruction.`))await run(async()=>{await api('/api/unblock',{edge:b.dataset.id,approved:true});await refresh();notice('green','Path reopened','Route updated after your inspection.');});
});
$('glasses-toggle').onclick=()=>toggleHUD(!hudMode);$('exit-glasses').onclick=()=>toggleHUD(false);
$('hud-next').onclick=resumeScan;
$('hud-primary').onclick=()=>{if(workflowMode==='scan'){if(batch()?.state==='collecting')submitBatch();else if(batch()?.state==='approved')beginPutaway();else if(!batch())startBatch();}else if(task()?.state==='verified')placeItem();else{toggleHUD(false);$('batch-content').scrollIntoView();}};
$('start-camera').onclick=()=>{if(voice)speak('Starting camera.',true);startCamera();};
$('pause-camera').onclick=stopCamera;
$('switch-camera').onclick=async()=>{const cameras=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');const i=cameras.findIndex(d=>d.deviceId===activeCamera);startCamera(cameras[(i+1)%cameras.length]?.deviceId);};
$('repeat-voice').onclick=()=>speak(lastInstruction,true);
$('show-task').onclick=()=>{toggleHUD(false);$('batch-content').scrollIntoView({behavior:'smooth',block:'start'});};
function updateVoice(){$('audio-toggle').textContent=voice?'Voice on':'Voice off';$('audio-toggle').setAttribute('aria-pressed',String(voice));}
$('audio-toggle').onclick=()=>{voice=!voice;localStorage.setItem('ow-voice',voice?'on':'off');updateVoice();if(voice)speak('Spoken guidance enabled.',true);else{speechSerial++;speechActive=false;window.speechSynthesis?.cancel();scheduleMic();}};updateVoice();
$('open-records').onclick=()=>{renderRecords();$('records-dialog').showModal();};$('open-setup').onclick=()=>$('setup-dialog').showModal();
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('inspect-path').onclick=checkPath;
$('facing-confirm').onchange=()=>{if(!$('facing-confirm').checked)stopAuto();};
$('auto-vision').onclick=()=>{
  if(autoTimer){stopAuto();return;}
  if(!$('facing-confirm').checked){notice('yellow','Confirm your camera direction','Check the box to confirm you are stopped and facing the next marked path.');return;}
  autoTimer=setInterval(()=>{if(!visionBusy&&!document.hidden)checkPath();},6000);$('auto-vision').textContent='Auto: on';checkPath();
};
$('report-block').onclick=async()=>{
  const route=currentRoute();if(!route?.edges.length)return;
  const edge=route.edges[0];
  if(await confirmAction('Report this path blocked?',`Confirm there is an obstruction between ${nodeName(route.nodes[0])} and ${nodeName(route.nodes[1])}. This is logged as your report, not an AI observation.`))await run(async()=>{await api('/api/block',{edge,approved:true,reason:'Operator observed an obstruction on the next path segment.'});await refresh();notice('yellow','Path marked blocked',$('route-instruction').textContent);});
};
function pauseMic(){clearTimeout(micTimer);voiceInput.pause();}
function stopMic(){commandEnabled=false;voiceInput.stop();$('voice-command').textContent='Start voice demo';}
function scheduleMic(){clearTimeout(micTimer);if(commandEnabled&&!speechActive&&!document.hidden&&!reviewMode){voiceInput.resume();$('voice-command').textContent='Voice demo on · stop';}}
async function handleCommand(raw,evidence=null){
  const text=raw.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const command=scanCommand(text);
  if(command==='done'){
    if(workflowMode!=='scan'||batch()?.state!=='collecting')return;
    stepScanner.pause();renderBatch();
    if(busy)pendingFinish=true;else await submitBatch();
  }else if(command==='next'){
    if(workflowMode==='putaway'&&task()?.state==='placed'){beginPutaway();return;}
    resumeScan();
  }else if(text==='begin put away'||text==='begin putaway')beginPutaway();
  else if(['item on right location','item in right location','item is on right location','item is in the right location','item on the right location','item is on the right location','confirm placement','confirm placed'].includes(text)){
    if(task()?.state==='verified')await placeItem('voice',evidence);else notice('yellow','Verify first','Scan the correct shelf and product before confirming placement.');
  }else if(text==='repeat'||text==='repeat instruction')speak(lastInstruction,true);
  else if(text==='where next')speak($('route-instruction').textContent,true);
  else if(text==='check path')checkPath();
  else if(text)notice('yellow','Please repeat','Command not recognised.',false);
}
async function startVoiceDemo(){
  if(reviewMode)return;
  if(commandEnabled){stopMic();return;}
  if(!state?.voice?.configured){notice('yellow','Voice API is not configured','Check the API key in your server settings and restart.');return;}
  try{
    voice=true;localStorage.setItem('ow-voice','on');updateVoice();
    await voiceInput.start();commandEnabled=true;pauseMic();
    if(!stream)await startCamera();
    if(!stream)throw Error('Camera must be running for the voice demo.');
    if(batch()?.state==='submitted')notice('green','Waiting for approval','Approve this batch on your laptop.');
    else if(readyTasks().length)beginPutaway();
    else if(batch()?.state==='collecting'){workflowMode='scan';localStorage.setItem('ow-workflow-mode','scan');stepScanner.pause();renderBatch();notice('green','Batch ready','Scan next item?');}
    else await startBatch();
    $('voice-command').textContent='Voice demo on · stop';
    toggleHUD(true);if(!speechActive)scheduleMic();
  }catch(e){stopMic();notice('yellow','Voice demo could not start',e.message);}
}
$('voice-command').onclick=startVoiceDemo;
$('start-voice-demo').onclick=startVoiceDemo;
function resumeScan(){
  if(busy||reviewMode||workflowMode!=='scan'||batch()?.state!=='collecting')return;
  if(stepScanner.armed)return;stepScanner.arm();scanGate.reset();renderBatch();
  notice('green','Ready to scan','Show only the next product label.',false);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAuto();pauseMic();$('facing-confirm').checked=false;}else scheduleMic();});
window.addEventListener('offline',()=>{connectionGood=false;stopAuto();notice('yellow','You are offline','Approvals need a server connection. Reconnect before continuing.');});
window.addEventListener('online',refresh);
setInterval(()=>{if(!document.hidden&&!busy&&state)refresh();},3000);
setInterval(()=>{renderWorkerHUD();const t=task();if(t&&['received','verified'].includes(t.state)&&t.shelf_seen&&Date.now()-t.shelf_seen>=60000){const b=document.querySelector('[data-action="place"]');if(b&&!b.disabled)renderTask();}},1000);

function toggleHUD(on){
  hudMode=on&&!reviewMode;document.body.classList.toggle('glasses-mode',hudMode);
  if(hudMode&&!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});
  if(!hudMode&&document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
  $('exit-glasses').hidden=!hudMode;$('glasses-toggle').textContent=hudMode?'Exit glasses':'Glasses view';
  renderWorkerHUD();
}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&hudMode){hudMode=false;document.body.classList.remove('glasses-mode');$('exit-glasses').hidden=true;$('glasses-toggle').textContent='Glasses view';renderWorkerHUD();}});
function renderWorkerHUD(){
  if(!state)return;
  const b=batch(),items=batchTasks(),t=task();
  $('hud-batch').textContent=b?`${items.length} LABELS · ${b.state.toUpperCase()}`:'NO BATCH';
  $('hud-primary').hidden=!hudMode||commandEnabled;
  $('hud-next').hidden=commandEnabled||reviewMode||workflowMode!=='scan'||b?.state!=='collecting';
  $('hud-next').disabled=stepScanner.armed||busy;
  $('hud-next').textContent=stepScanner.armed?'Scanner ready':'Next item';
  if(workflowMode==='scan'){
    $('task-reference').textContent=b?`BATCH ${b.id.slice(0,6).toUpperCase()}`:'START A BATCH';
    $('hud-task').textContent=b?.state==='collecting'?`${stepScanner.armed?'READY TO SCAN':'SCANNING PAUSED'} / ${items.length} SAVED`:b?.state==='submitted'?'WAITING FOR LAPTOP APPROVAL':b?.state==='approved'?'BATCH APPROVED':'START A BATCH';
    $('scan-hint').textContent=b?.state==='collecting'?(stepScanner.armed?'Show one product label':'Say “Yes” to scan or “Done” to finish'):b?.state==='submitted'?'Scans saved · inventory unchanged':b?.state==='approved'?'Begin put-away to select an approved item':'Tap Start batch, then start the camera';
    $('hud-primary').textContent=b?.state==='collecting'?'Finish batch':b?.state==='approved'?'Begin put-away':b?.state==='submitted'?'Awaiting approval':'Start batch';
    $('hud-primary').disabled=b?.state==='submitted'||(b?.state==='collecting'&&!items.length);
    for(let i=1;i<=3;i++)$('step-'+i).className=i===1?'active':'';
  }else{
    $('hud-primary').textContent=t?.state==='verified'?'Confirm placed':'Choose item';
    $('hud-primary').disabled=t?.state==='verified'&&(!t.shelf_seen||Date.now()-t.shelf_seen>=60000||!t.item_seen||Date.now()-t.item_seen>=60000);
    if(pickupStage||!t){$('hud-task').textContent=pickupStage==='product'?'SCAN THE PRODUCT YOU PICKED UP':'SCAN RECEIVING';$('scan-hint').textContent=pickupStage==='product'?'Product scan selects its approved task and destination':'Return to Receiving and scan its QR';}
    if(t?.shelf)$('hud-batch').textContent=`${t.name} · ${t.shelf}`;
  }
  document.body.classList.toggle('navigating',workflowMode==='putaway'&&!pickupStage&&!!t?.shelf&&!t?.shelf_seen);
}
function renderBatch(){
  if(!state)return;
  const b=batch(),items=batchTasks();
  const signature=JSON.stringify([reviewMode,workflowMode,stepScanner.armed,b,items,state.batches,reviewMode?null:readyTasks().map(t=>[t.id,t.state])]);
  if(signature===previousBatchJSON){renderWorkerHUD();return;}previousBatchJSON=signature;
  const id=b?.id.slice(0,6).toUpperCase();
  const otherBatches=state.batches.filter(x=>x.state==='submitted'&&x.id!==selectedBatch);
  const switches=otherBatches.map(x=>`<button class="secondary" data-action="review-batch" data-id="${x.id}">Review batch ${x.id.slice(0,6).toUpperCase()}</button>`).join('');
  if(reviewMode){
    $('batch-content').innerHTML=`<span class="task-eyebrow">LAPTOP / HUMAN REVIEW</span><h2 class="task-title">${b?'Batch '+id:'Waiting for scans.'}</h2><p class="task-copy">Pending scans are saved separately. Stock and shelf reservations change only when you approve.</p>${switches}`;
    if(!b){$('batch-content').innerHTML+='<p>Start a batch on the phone. This view refreshes automatically.</p>';return;}
    if(b.state==='collecting'){$('batch-content').innerHTML+=`<div class="batch-status">Scanning in progress · ${items.length} unique labels.<br>Tap Finish batch on the phone to unlock review.</div>${items.map(t=>`<p>${escapeHTML(t.name||t.sku)} <small>${escapeHTML(t.sku)}</small></p>`).join('')}`;return;}
    if(b.state==='cancelled'){$('batch-content').innerHTML+='<p>All scans were removed. No inventory was added. Start a new batch on the phone.</p>';return;}
    if(b.state==='approved'){$('batch-content').innerHTML+=`<div class="batch-status">✓ Approved · ${items.reduce((n,t)=>n+t.qty,0)} units</div><p>The worker can now choose items for put-away.</p>${items.map(t=>`<p>${escapeHTML(t.name)} · ${t.qty} → ${escapeHTML(t.shelf)} · ${escapeHTML(t.state)}</p>`).join('')}`;return;}
    $('batch-content').innerHTML+=`<form id="batch-review-form"><p class="task-note">One row per barcode. Identical packs can share a barcode: enter their verified total quantity in that row. Removing a row does not add stock.</p>${items.map(t=>{
      const known=state.products.some(p=>p.sku===t.sku);
      return `<fieldset class="review-item" data-task="${t.id}"><legend>${escapeHTML(t.sku)} · ${t.source==='camera'?'Camera scan':'Manual entry'}</legend><label>Product name<input name="name" value="${escapeHTML(t.name)}" ${known?'readonly':''} required maxlength="100"></label><label>Quantity<input name="quantity" type="number" value="1" min="1" max="100" step="1" required></label><label>Category<select name="category" ${known?'disabled':''}>${['dry','beverage','canned'].map(c=>`<option value="${c}" ${t.category===c?'selected':''}>${c}</option>`).join('')}</select></label><button type="button" class="text-btn" data-action="remove-scan" data-id="${t.id}">Remove from review</button></fieldset>`;
    }).join('')}<button type="submit" class="primary" ${items.length?'':'disabled'}>Approve ${items.length} reviewed products</button><p id="review-error" class="error-text" role="alert"></p></form>`;
    if(!items.length)$('batch-content').innerHTML+='<p>All scans removed. Start a new batch on the phone.</p>';
  }else{
    let html=`<div class="batch-heading"><span class="task-eyebrow">BATCH ${id||'RECEIVING'}</span><span class="pill">${b?.state.toUpperCase()||'READY'}</span></div>`;
    if(workflowMode==='scan'&&b?.state==='collecting')html+=`<h2 class="task-title">Scan one item at a time.</h2><p class="task-copy">${items.length} unique labels saved. Nothing added to stock yet. Each scan pauses automatically. Start voice demo once. After “Scan complete. Scan next item?” say “Yes” or “Done”. A duplicate attempt gives a red alert.</p><div class="pending-chips">${items.map(t=>`<span>✓ ${escapeHTML(t.name||t.sku)}</span>`).join('')}</div><button class="secondary" data-action="next-scan" ${stepScanner.armed?'disabled':''}>${stepScanner.armed?'Scanner ready':'Next item'}</button><button class="primary" data-action="submit-batch" ${items.length?'':'disabled'}>Finish batch · send to laptop</button>`;
    else if(workflowMode==='scan'&&b?.state==='submitted')html+=`<h2 class="task-title">Ready for laptop review.</h2><p class="task-copy">${items.length} labels saved. Open Laptop review on your laptop, check quantities, and approve. This phone will update automatically.</p><div class="batch-status">Waiting for human approval</div>`;
    else if(workflowMode==='scan'&&b?.state==='approved')html+=`<h2 class="task-title">Batch approved.</h2><p class="task-copy">Scan Receiving, then the product you picked up. Follow its checkpoints and verify the shelf.</p><button class="primary" data-action="begin-putaway">Begin put-away</button><button class="secondary" data-action="start-batch">Start new batch</button>`;
    else html+=`<p class="task-copy">Scan a batch on this phone. Review and approve it on your laptop before put-away.</p><button class="secondary" data-action="start-batch">${b&&['collecting','submitted'].includes(b.state)?'Return to batch':'Start new batch'}</button>`;
    const ready=readyTasks();
    if(ready.length)html+='<h3>Approved put-away queue</h3>'+ready.map(t=>`<button class="secondary resume-task" data-action="resume" data-id="${t.id}">${escapeHTML(t.name)} · ${t.qty}<small>${escapeHTML(t.shelf)}</small></button>`).join('');
    $('batch-content').innerHTML=html;
  }
  renderWorkerHUD();
}
async function startBatch(){await run(async()=>{
  const b=await api('/api/batches/start',{});selectedBatch=b.id;localStorage.setItem('ow-batch',selectedBatch);
  workflowMode='scan';pickupStage=null;localStorage.setItem('ow-workflow-mode',workflowMode);activeId=null;localStorage.removeItem('ow-active-task');scanGate.reset();stepScanner.pause();
  await refresh();if(b.state==='collecting'&&!batchTasks().length)stepScanner.arm();renderBatch();renderTask();notice('green',b.state==='collecting'?'Batch ready':'Batch awaiting review',b.state==='collecting'?(stepScanner.armed?'Show the first product label.':'Scan next item?'):'Open Laptop review to approve your saved scans.');
});}
async function submitBatch(){if(!batch()||batch().state!=='collecting')return;stepScanner.pause();renderBatch();if(busy){pendingFinish=true;return;}await run(async()=>{
  await api(`/api/batches/${selectedBatch}/submit`,{});await refresh();notice('green','Batch sent for review','Scans saved. Approve the batch on your laptop before put-away.');
});}
function beginPutaway(){
  if(!readyTasks().length){notice('neutral','No items awaiting put-away','All items are placed. Demo complete.');return;}
  workflowMode='putaway';pickupStage='receiving';localStorage.setItem('ow-workflow-mode',workflowMode);stopAuto();setActive(null);scanGate.reset();
  notice('green','Ready for pickup','Scan the RECEIVING QR to begin put-away.');
}
async function approveBatchReview(){
  if(!reviewMode)return;
  const form=$('batch-review-form');if(!form?.reportValidity())return;
  const items=[...form.querySelectorAll('[data-task]')].map(el=>({id:el.dataset.task,name:el.elements.namedItem('name').value,quantity:Number(el.elements.namedItem('quantity').value),category:el.elements.namedItem('category').value}));
  const batchId=selectedBatch;
  if(!await confirmAction('Approve this batch?',`Record ${items.reduce((n,i)=>n+i.quantity,0)} units across ${items.length} products and assign available shelves?`))return;
  await run(async()=>{try{await api(`/api/batches/${batchId}/approve`,{approved:true,items});await refresh();}catch(e){$('review-error').textContent=e.message;throw e;}});
}
if(reviewMode){
  document.body.classList.add('review-mode');$('glasses-toggle').hidden=true;
  document.querySelector('.page-heading h1').textContent='Review the batch. Release the work.';
  $('review-link').textContent='Worker view ↗';$('review-link').href='/';
  document.title='Overwatch · Laptop review';
}
refresh();
