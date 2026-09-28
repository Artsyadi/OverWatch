import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {win32,posix} from 'node:path';
import {requireThat} from '../domain.mjs';

// Execute the server's actual static-file boundary check with both path implementations.
// This catches Windows separator regressions even when CI runs on Linux.
const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const guard=source.split('\n').find(line=>line.includes('requireThat(file.startsWith'));
assert.ok(guard,'Static file boundary check exists');
const check=new Function('file','root','relative','resolve','sep','requireThat',guard);
for(const [platform,p,root] of [['Windows',win32,'C:\\Users\\Yash\\overwatch'],['Linux',posix,'/home/yash/overwatch']]){
  test(`${platform}: serve public assets and reject paths outside the public folder`,()=>{
    for(const asset of ['index.html','app.mjs','style.css','labels.pdf','vendor/decoder.js']){
      assert.doesNotThrow(()=>check(p.resolve(root,'public',asset),root,asset,p.resolve,p.sep,requireThat));
    }
    for(const asset of ['../server.mjs','.env','../public-other/index.html','nested/.secret']){
      assert.throws(()=>check(p.resolve(root,'public',asset),root,asset,p.resolve,p.sep,requireThat),/Not found/);
    }
    assert.throws(()=>check(p.resolve(root,'server.mjs'),root,'server.mjs',p.resolve,p.sep,requireThat),/Not found/);
    if(platform==='Windows')assert.throws(()=>check(p.resolve(root,'public','nested\\.secret'),root,'nested\\.secret',p.resolve,p.sep,requireThat),/Not found/);
  });
}
