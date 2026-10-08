const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/insta-card-export.js'),'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'insta-card-export.js'),'utf8'));
async function scenario(name,options){
 const dom=new JSDOM('<!doctype html><button id="save">Save</button>',{runScripts:'outside-only'}),w=dom.window,button=w.document.getElementById('save');let downloads=0,shares=0,blobs=0;const alerts=[],deadlines=[];
 w.DayOI18n={getLang:()=>options.ko?'ko':'en'};w.alert=m=>alerts.push(m);const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>{deadlines.push(ms);return timer(fn,ms===5000||ms===12000?5:ms)};
 Object.defineProperty(w.navigator,'userAgent',{value:options.mobile?'Mozilla/5.0 (iPhone)':'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0'});
 Object.defineProperty(w.navigator,'canShare',{value:()=>options.supported!==false});Object.defineProperty(w.navigator,'share',{value:()=>{shares++;if(options.share==='pending')return new Promise(()=>{});if(options.share==='reject')return Promise.reject(Object.assign(Error('raw secret error'),{name:'NotAllowedError'}));if(options.share==='abort')return Promise.reject(Object.assign(Error('cancel'),{name:'AbortError'}));return Promise.resolve()}});
 w.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download.startsWith('DayO_Card_'),true);downloads++};
 w.eval(source.replace(/\}\)\(\);\s*$/,'window.__testExport = exportRenderedMemory;})();'));
 const canvas={toBlob:cb=>{blobs++;if(options.blob==='pending')return;if(options.blob==='null')return cb(null);cb(new w.Blob(['png'],{type:'image/png'}))},toDataURL:type=>{assert.equal(type,'image/png');if(options.png==='fail')throw Error('raw PNG error');return 'data:image/png;base64,aQ=='}};
 const pending=w.__testExport(canvas,button);if(button.disabled){assert.equal(button.getAttribute('aria-busy'),'true');await w.__testExport(canvas,button);}await pending;
 assert.equal(shares,options.expectedShares||0,name);assert.equal(downloads,options.expectedDownloads===undefined?1:options.expectedDownloads,name);assert.equal(button.disabled,false,name);assert.equal(button.hasAttribute('aria-busy'),false,name);assert.equal(alerts.length,options.png==='fail'?1:0,name);
 if(alerts.length){assert.equal(button.textContent,'Save');assert.equal(alerts[0],options.ko?'저장하지 못했어요. 다시 시도해주세요.':'Could not save your card. Please try again.');}else{assert.equal(button.textContent,options.ko?'저장 완료':'Saved');await w.__testExport(canvas,button);assert.equal(button.disabled,false);}
 if(!options.mobile){assert.equal(blobs,0);assert.equal(shares,0)}if(options.blob==='pending')assert(deadlines.includes(5000));if(options.mobile&&options.share==='pending')assert(deadlines.includes(12000));dom.window.close();return name;
}
(async()=>{const results=[];for(const [name,o] of [
 ['desktop ignores supported native share',{share:'pending'}],
 ['mobile share success',{mobile:true,expectedShares:1,expectedDownloads:0}],
 ['mobile unsupported download',{mobile:true,supported:false}],
 ['mobile rejection fallback',{mobile:true,share:'reject',expectedShares:1}],
 ['mobile cancellation fallback',{mobile:true,share:'abort',expectedShares:1}],
 ['mobile share timeout fallback',{mobile:true,share:'pending',expectedShares:1}],
 ['mobile Blob timeout fallback',{mobile:true,blob:'pending'}],
 ['mobile null Blob fallback',{mobile:true,blob:'null'}],
 ['PNG error clears loading',{png:'fail',expectedDownloads:0}],
 ['Korean localized PNG error',{png:'fail',ko:true,expectedDownloads:0}]
 ])results.push(await scenario(name,o));console.log(JSON.stringify({pass:results},null,2))})().catch(e=>{console.error(e);process.exitCode=1});


