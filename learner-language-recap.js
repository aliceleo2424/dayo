/* Optional enrichment before the existing learner report merge. Never changes
 * Quiz preview, summary, expressions, scores, Partner fields or lifecycle state. */
(function(){'use strict';
var pending={};
async function generate(options){
  var session=await options.db.auth.getSession(),token=session&&session.data&&session.data.session&&session.data.session.access_token;
  if(!token)return null;
  if(options.ensureTranscript){var timer;try{await Promise.race([options.ensureTranscript(),new Promise(resolve=>{timer=setTimeout(resolve,1800);})]);}finally{clearTimeout(timer);}}
  var controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500);
  try{
    var locale=window.DayOI18n&&window.DayOI18n.getLang?window.DayOI18n.getLang():document.documentElement.lang;
    var result=await fetch('/api/learner-language-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({booking_id:options.bookingId,locale:String(locale||'en').toLowerCase()}),signal:controller.signal});
    if(!result.ok)return null;
    var data=await result.json();
    return data&&Array.isArray(data.corrections)&&data.metadata?data:null;
  }finally{clearTimeout(timeout);}
}
window.DayOLearnerLanguageRecap={async enrichReview(options){
  var payload=options.payload,contract=window.DayOLearnerRecapContract;
  if(!contract||!options.db||!options.bookingId)return payload;
  var key=options.bookingId,result;
  try{
    if(!pending[key])pending[key]=generate(options);
    result=await pending[key];
    if(!result){delete pending[key];return payload;}
    return Object.assign({},payload,{feedback:contract.mergeFeedback(payload.feedback,result.corrections,result.metadata)});
  }catch(_){delete pending[key];return payload;}
}};
})();