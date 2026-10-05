(function(root){
 'use strict';
 var treats=[['americano','Americano','Great energy'],['green_tea','Green Tea','Calm & comfortable'],['vanilla_latte','Vanilla Latte','Warm conversation'],['cookie','Cookie','Curious questions'],['croissant','Croissant','Great storyteller'],['macaron','Macaron','Lovely conversation']].map(function(x){return Object.freeze({code:x[0],label:x[1],meaning:x[2]});});
 var templates=[['a','Nice talking'],['b','Keep it going'],['c','Your stories'],['d','Great questions'],['e','Today’s topic'],['f','Recommendation'],['g','Custom message']];
 var languageLabels={en:'English',english:'English',es:'Spanish',spanish:'Spanish',fr:'French',french:'French',ko:'Korean',korean:'Korean'};
 function clean(value,max){return String(value||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max||60);}
 function safeKeyword(value){var text=clean(value,60);return text&& !/@|https?:|www\.|\d{5}|[<>\{\}]/i.test(text)?text:'';}
 function note(id,context,recommendation){
  context=context||{};var lang=languageLabels[String(context.language||'').toLowerCase()]||'',inLanguage=lang?' in '+lang:'';
  if(id==='a')return 'It was so nice talking with you'+inLanguage+' today.\nHave a great day!';
  if(id==='b')return 'You did a great job keeping the conversation going'+inLanguage+' today!';
  if(id==='c')return 'I really enjoyed hearing your stories today.\nHope we can talk again soon!';
  if(id==='d')return 'You asked great questions today.\nKeep speaking with confidence!';
  if(id==='e')return context.topic?'I loved talking about '+clean(context.topic,80)+' with you today!':'';
  if(id==='f')return recommendation?'I recommend '+clean(recommendation,120)+' — I think you’d enjoy it!':'';
  return '';
 }
 // Conservative noun vocabulary: never pretend token frequency is a grammar/POS model.
 // Unknown topics remain manual input rather than inventing a topic or a learner sentence.
 var nouns=['café','coffee','pasta','pizza','food','restaurant','cooking','baking','bread','dessert','tea','cake','chocolate','music','concert','guitar','piano','movie','cinema','drama','book','webtoon','game','football','baseball','tennis','yoga','hiking','cycling','swimming','beach','mountain','park','museum','art','painting','photography','fashion','shopping','cat','dog','pet','garden','flower','travel','trip','festival','university','school','work','culture'];
 var phrases=['Seoul Forest','K-pop concert','K-pop','Busan trip','Jeju Island'];
 function suggestions(context){
  context=context||{};
  var transcript=(context.transcript||[]).filter(function(row){return row&&typeof row==='object'&&['partner','me','local'].includes(String(row.speaker||'').toLowerCase());}).map(function(row){return clean(row.text||row.message,1000);}).join(' ').slice(-12000);
  var card=context.talkCard||{},fallback=clean(card.topic||card.question_en,500),sessionTopic=clean(context.topic,80),topicText=fallback+' '+sessionTopic;
  var ranked=[];
  function extract(text,weight){
   var lower=text.toLowerCase();
   phrases.forEach(function(phrase){var count=lower.split(phrase.toLowerCase()).length-1;if(count)add(phrase,count*weight+2);});
   nouns.forEach(function(noun){var term=noun==='café'?'caf[eé]s?':noun+'s?';var matches=lower.match(new RegExp('(?:^|[^a-zé])'+term+'(?=$|[^a-zé])','g'));if(matches)add(noun==='café'?'Café':noun.charAt(0).toUpperCase()+noun.slice(1),matches.length*weight);});
  }
  function add(label,score){var found=ranked.find(function(x){return x.label.toLowerCase()===label.toLowerCase();});if(found)found.score+=score;else ranked.push({label:label,score:score,order:ranked.length});}
  extract(transcript,3);extract(topicText,1);
  // A short explicit topic is valid context, unlike an entire question/speech turn.
  if(!ranked.length&&safeKeyword(sessionTopic))add(sessionTopic,1);
  return ranked.sort(function(a,b){return b.score-a.score||a.order-b.order;}).map(function(x){return x.label;}).filter(function(label,i,all){return !all.some(function(other,j){return j<i&&other.toLowerCase().includes(label.toLowerCase());});}).slice(0,3);
 }
 function illustrationUrl(keyword,seed){var safe=safeKeyword(keyword);if(!safe)return null;
  var prompt='A simple warm editorial illustration of '+safe+'. DayO cream, sage and soft coral palette. Cozy minimal composition. No text, no typography, no letters, no speech bubbles.';
  return 'https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt)+'?width=400&height=400&nologo=true&seed='+encodeURIComponent(seed||1);
 }
 var api={treats:Object.freeze(treats),templates:templates,note:note,suggestions:suggestions,safeKeyword:safeKeyword,illustrationUrl:illustrationUrl};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DayOPartnerReportContract=api;
})(typeof window!=='undefined'?window:this);
