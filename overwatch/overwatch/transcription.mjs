import {AppError,requireThat} from './domain.mjs';
export async function transcribeCommand(b,{apiKey,model='gpt-4o-mini-transcribe',fetchImpl=fetch}){
  requireThat(!!apiKey,'Voice API is not configured. Add OPENAI_API_KEY and restart.',503);
  requireThat(b.mime==='audio/wav'&&typeof b.audio==='string'&&b.audio.length<=1500000&&/^[A-Za-z0-9+/]+={0,2}$/.test(b.audio),'Invalid command recording.');
  const audio=Buffer.from(b.audio,'base64');
  requireThat(audio.length>=1000&&audio.toString('ascii',0,4)==='RIFF'&&audio.toString('ascii',8,12)==='WAVE','Invalid WAV recording.');
  const form=new FormData();form.append('file',new Blob([audio],{type:'audio/wav'}),'command.wav');form.append('model',model);form.append('language','en');form.append('response_format','json');
  // No command vocabulary prompt: avoid biasing silence/noise toward an action.
  let r;try{r=await fetchImpl('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form,signal:AbortSignal.timeout(15000)});}catch{throw new AppError('Transcription connection timed out. Please repeat your command.',503);}
  if(!r.ok)throw new AppError(r.status===401?'API key rejected. Check the server settings.':r.status===429?'Voice API limit reached. Check API billing or wait and retry.':'Voice transcription failed. Please repeat your command.',503);
  const result=await r.json();return {text:typeof result.text==='string'?result.text.slice(0,240):''};
}
