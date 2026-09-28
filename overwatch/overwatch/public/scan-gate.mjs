// One capture per presentation, not per video frame. A deliberate re-presentation
// reaches the server, where batch uniqueness is enforced even across devices.
export class ScanGate {
  constructor(){this.code=null;this.lastSeen=0;}
  read(values,now=Date.now()){
    const codes=[...new Set(values.filter(Boolean))];
    if(codes.length!==1){if(now-this.lastSeen>900)this.code=null;return null;}
    const code=codes[0],fresh=code!==this.code||now-this.lastSeen>900;
    this.code=code;this.lastSeen=now;return fresh?code:null;
  }
  reset(){this.code=null;this.lastSeen=0;}
}
