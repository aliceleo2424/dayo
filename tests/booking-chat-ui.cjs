const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('public/room.html','utf8'),start=source.indexOf('    async function handleSendMessage()'),end=source.indexOf('    window.handleSendMessage',start),send=source.slice(start,end);
(async()=>{for(const locale of ['ko','en']){
 const dom=new JSDOM('<form id="chatForm"><input id="chatInput"><button type="submit">Send</button></form>');
 const input=dom.window.document.querySelector('input'),button=dom.window.document.querySelector('button');let resolve,fail=true,calls=0,broadcasts=[];
 input.reportValidity=()=>true;
 const context={document:dom.window.document,window:{DayOI18n:{getLang:()=>locale}},chatInput:input,chatForm:input.form,chatSending:false,canonicalChat:()=>({send:async text=>{calls++;if(fail)throw Error('failed');await new Promise(r=>resolve=r);return {id:'id',booking_id:'booking',text};}}),ensureChatChannel:()=>({send:async p=>broadcasts.push(p)}),Promise};
 vm.createContext(context);vm.runInContext(send,context);
 input.value='  Original message  ';await context.handleSendMessage();assert.equal(input.value,'  Original message  ');assert.equal(button.disabled,false);assert.match(input.validationMessage,locale==='ko'?/저장하지/:/Could not save/);
 fail=false;const pending=context.handleSendMessage();await context.handleSendMessage();assert.equal(calls,2);assert.equal(button.disabled,true);resolve();await pending;assert.equal(input.value,'');assert.equal(button.disabled,false);assert.equal(broadcasts.length,1);assert.deepEqual(Object.keys(broadcasts[0].payload).sort(),['bookingId','messageId']);assert(!JSON.stringify(broadcasts).includes('Original message'));
 dom.window.close();}
 const src=fs.readFileSync('public/room.html','utf8');for(const match of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
 console.log('PASS actual existing chat send handler: KO/EN failure keeps input, duplicate click suppressed, successful save clears input, controls reset, Broadcast notifications contain no message text; room inline scripts parse.');
})().catch(e=>{console.error(e);process.exitCode=1;});
