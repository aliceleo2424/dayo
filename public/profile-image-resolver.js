/* Shared profile URL resolver. No Auth metadata, discovery queries or generated fallback. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DayOProfileImageURL=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function safe(value){value=String(value||'').trim();if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))return value;if(/^\/(?!\/)[^\\\s]+$/.test(value))return value;try{var url=new URL(value);return url.protocol==='https:'?url.href:'';}catch(_){return '';}}
 function resolve(value){value=safe(value);if(!value||/\/images\/partner-avatars\//i.test(value))return '';try{var url=new URL(value);if(/(^|\.)(dicebear\.com|dicebear\.net)$/i.test(url.hostname)||/(^|\.)avatars\.dicebear\.com$/i.test(url.hostname))return '';}catch(_){}return value;}
 return {safe:safe,resolve:resolve,hasPhoto:function(value){return !!resolve(value);}};
});
