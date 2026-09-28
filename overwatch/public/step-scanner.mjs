// One deliberate permission permits one receipt attempt, including a rejected duplicate.
export class StepScanner {
  constructor(){this.armed=false;}
  arm(){this.armed=true;}
  pause(){this.armed=false;}
  claim(){if(!this.armed)return false;this.armed=false;return true;}
}
export function scanCommand(raw){
  const text=raw.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(['done','i am done','i m done','finish batch','stop scanning','done stop scanning'].includes(text))return 'done';
  if(['yes','next','next item','scan next item','scan the next item','yes scan next item','yes scan the next item','move to next item','move to the next item'].includes(text))return 'next';
  return null;
}
