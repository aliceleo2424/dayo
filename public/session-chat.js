/* Existing session chat: persistence first; Broadcast only notifies canonical reads. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DayOSessionChat=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
function bounded(operation){var timer;return Promise.race([operation,new Promise(function(_,reject){timer=setTimeout(function(){reject(Error('chat_timeout'));},8000);})]).finally(function(){clearTimeout(timer);});}
function create(db,access,onMessage){
 var seen=new Set(),pending=null,reading=null,readAgain=false,sending=null;
 var key='dayo_chat_pending:'+access.bookingId+':'+access.userId,storage;
 try{storage=globalThis.sessionStorage;pending=JSON.parse(storage.getItem(key)||'null');if(pending&&(!pending.id||typeof pending.text!=='string'))pending=null;}catch(_){}
 function remember(){try{if(storage){if(pending)storage.setItem(key,JSON.stringify(pending));else storage.removeItem(key);}}catch(_){} }
 function accept(m){
  if(!m||m.booking_id!==access.bookingId||!m.id||typeof m.text!=='string'||!Number.isFinite(Date.parse(m.created_at)))return false;
  if(!((m.sender_id===access.learnerId&&m.sender_role==='learner')||(m.sender_id===access.partnerId&&m.sender_role==='partner')))return false;
  if(pending&&pending.id===m.id&&m.sender_id===access.userId){pending=null;remember();}
  if(!seen.has(m.id)){seen.add(m.id);onMessage(m,m.sender_id===access.userId);}return true;
 }
 function load(){
  if(reading){readAgain=true;return reading;}
  reading=(async function(){do{readAgain=false;var r=await bounded(db.from('booking_chat_messages').select('booking_id,id,sender_id,sender_role,text,created_at').eq('booking_id',access.bookingId).order('created_at').order('id').limit(500));if(r.error)throw Error('chat_read_failed');(r.data||[]).forEach(accept);}while(readAgain);})().finally(function(){reading=null;});return reading;
 }
 function send(text){
  if(sending)return sending;
  if(typeof text!=='string'||!text.trim()||text.length>1000)return Promise.reject(Error('invalid_chat_message'));
  if(!pending||pending.text!==text)pending={id:globalThis.crypto.randomUUID(),text:text};remember();
  var request={p_booking_id:access.bookingId,p_message_id:pending.id,p_text:pending.text};
  sending=(async function(){var r=await bounded(db.rpc('send_booking_chat_message',request));if(r.error||!r.data)throw Error('chat_save_failed');var m=Array.isArray(r.data)?r.data[0]:r.data;if(!accept(m)||m.id!==request.p_message_id||m.text!==text||m.sender_id!==access.userId)throw Error('chat_identity');return m;})().finally(function(){sending=null;});return sending;
 }
 return {load:load,send:send};
}
return {create:create};});
