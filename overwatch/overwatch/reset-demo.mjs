import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';
import {Warehouse} from './domain.mjs';
const root=dirname(fileURLToPath(import.meta.url));
if(!process.argv.includes('--yes')){console.error('This deletes all demo transactions, inventory, history and custom products. Run with --yes after stopping Overwatch.');process.exit(1);}
const port=Number(process.env.PORT)||3000;
const listening=await new Promise(resolveResult=>{
  const socket=createConnection({host:'127.0.0.1',port});
  socket.setTimeout(1500);
  socket.once('connect',()=>{socket.destroy();resolveResult(true);});
  socket.once('error',e=>{socket.destroy();resolveResult(e.code!=='ECONNREFUSED');});
  socket.once('timeout',()=>{socket.destroy();resolveResult(true);});
});
if(listening){console.error('Reset stopped: port '+port+' is still in use. Stop the Overwatch server with Ctrl+C, then run this again.');process.exit(1);}
const map=JSON.parse(readFileSync(resolve(root,'warehouse.json'),'utf8'));
const w=new Warehouse(process.env.DB_PATH||resolve(root,'data/warehouse.sqlite'),map);
try{
  w.tx(()=>{
    w.db.exec('DELETE FROM placement_evidence; DELETE FROM inventory; DELETE FROM tasks; DELETE FROM batches; DELETE FROM events; DELETE FROM blocked_edges; DELETE FROM products; DELETE FROM sqlite_sequence WHERE name=\'events\';');
    for(const p of map.products)w.db.prepare('INSERT INTO products VALUES(?,?,?,?,?)').run(p.sku,p.name,p.category,p.preferred,p.unit);
  });
  w.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  console.log('RESET COMPLETE: 0 tasks, 0 batches, 0 inventory, 0 events, 0 blocked paths. Printed-label catalogue restored. API settings unchanged.');
}finally{w.db.close();}
