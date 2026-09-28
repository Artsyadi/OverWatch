export function wavBytes(chunks,sampleRate){
  const length=chunks.reduce((n,c)=>n+c.length,0),buffer=new ArrayBuffer(44+length*2),v=new DataView(buffer);
  const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,length*2,true);
  let at=44;for(const c of chunks)for(const x of c){const y=Math.max(-1,Math.min(1,x));v.setInt16(at,y*(y<0?32768:32767),true);at+=2;}return new Uint8Array(buffer);
}
export class UtteranceGate {
  constructor(sampleRate){this.sampleRate=sampleRate;this.reset();}
  reset(){this.pre=[];this.chunks=[];this.active=false;this.voiced=0;this.silence=0;this.total=0;}
  push(samples){
    let energy=0;for(const x of samples)energy+=x*x;
    const rms=Math.sqrt(energy/samples.length),ms=samples.length*1000/this.sampleRate;
    const loud=rms>=0.012;
    if(!this.active){this.pre.push(samples);while(this.pre.length>6)this.pre.shift();if(!loud)return {rms};this.active=true;this.chunks=this.pre;this.pre=[];}
    else this.chunks.push(samples);
    this.total+=ms;if(loud){this.voiced+=ms;this.silence=0;}else this.silence+=ms;
    if(this.silence>=650||this.total>=8000){const chunks=this.chunks,valid=this.voiced>=130&&this.total<8000;this.reset();return {rms,chunks:valid?chunks:null};}
    return {rms};
  }
}
// Only captures while listening. App speech, hidden pages, and pending requests close the gate.
export class VoiceInput {
  constructor({transcribe,onCommand,onStatus,getContext}){Object.assign(this,{transcribe,onCommand,onStatus,getContext});this.enabled=false;this.paused=true;this.epoch=0;this.blockedUntil=0;this.processing=false;}
  async start(){
    if(this.enabled)return;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context||!navigator.mediaDevices?.getUserMedia)throw Error('Microphone capture is unavailable. Use Chrome over HTTPS.');
    this.context=new Context();await this.context.resume();
    try{
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      await this.context.audioWorklet.addModule('/audio-capture.mjs?v=4');
      this.node=new AudioWorkletNode(this.context,'command-capture');this.source=this.context.createMediaStreamSource(this.stream);
      this.source.connect(this.node);this.node.connect(this.context.destination);
      this.gate=new UtteranceGate(this.context.sampleRate);this.enabled=true;
      this.node.port.onmessage=e=>this.frame(e.data);
      this.stream.getAudioTracks()[0].addEventListener('ended',()=>{this.stop();this.onStatus('Microphone disconnected. Restart voice demo.');});
      this.resume();
    }catch(e){this.stop();throw e;}
  }
  pause(){this.paused=true;this.epoch++;this.gate?.reset();if(this.enabled)this.onStatus('Speaking · wait');}
  resume(){if(!this.enabled)return;this.paused=false;this.blockedUntil=Date.now()+800;this.gate.reset();this.onStatus('Getting ready to listen…');}
  stop(){this.enabled=false;this.paused=true;this.epoch++;this.source?.disconnect();this.node?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());this.context?.close().catch(()=>{});this.onStatus('Microphone off');}
  async frame(samples){
    if(!this.enabled||this.paused||this.processing||Date.now()<this.blockedUntil)return;
    const {rms,chunks}=this.gate.push(samples);this.onStatus(this.gate.active?'Hearing you…':'Listening · say your command',Math.min(1,rms*12));
    if(!chunks)return;
    const epoch=this.epoch,context=this.getContext();this.processing=true;this.onStatus('Understanding…');
    try{
      const bytes=wavBytes(chunks,this.context.sampleRate);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const result=await this.transcribe({audio:btoa(binary),mime:'audio/wav'});
      if(this.enabled&&!this.paused&&epoch===this.epoch)await this.onCommand(result.text,context);
    }catch(e){if(this.enabled&&epoch===this.epoch)this.onStatus('Voice error: '+e.message);}
    finally{this.processing=false;this.gate?.reset();this.blockedUntil=Date.now()+500;}
  }
}
