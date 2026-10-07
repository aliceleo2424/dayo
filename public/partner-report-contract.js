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
 // Supported topic rules preserve known entities and combine only nearby evidence.
 // This is a conservative local heuristic, not a multilingual NLP/PII model.
 function topicText(value){return clean(value,12000).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[/|]+/g,' ');}
 var themeRules=[
  {id:'seoul_cafes',label:'Seoul Forest cafés',groups:[/\bseoul\s+forest\b/,/\b(?:cafes?|coffee)\b/],concept:'a cozy café near Seoul Forest',suppresses:['seoul_forest']},
  {id:'pasta_home',label:'making pasta at home',groups:[/\bpasta\b/,/\b(?:cook(?:ing|ed)?|mak(?:e|ing))\b/,/\bhome\b/],concept:'making pasta in a home kitchen',suppresses:['pasta_cooking']},
  {id:'busan_trip',label:'Busan trip',groups:[/\bbusan\b/,/\b(?:travel(?:ing|ling)?|trip|beach)\b/],concept:'a trip to Busan'},
  {id:'kpop_concerts',label:'K-pop concerts',groups:[/\bk[- ]?pop\b/,/\bconcerts?\b/],concept:'a K-pop concert venue with lights and a stage'},
  {id:'seoul_rain',label:'rainy weather in Seoul',groups:[/\bseoul\b/,/\brain(?:y|ing)?\b/,/\bweather\b/],concept:'a rainy day in Seoul'},
  {id:'cafe_study',label:'studying at a café',groups:[/\bstud(?:y|ying|ied)\b/,/\bcafes?\b/],concept:'books and a warm drink on a café study table'},
  {id:'pasta_cooking',label:'making pasta',groups:[/\bpasta\b/,/\b(?:cook(?:ing|ed)?|mak(?:e|ing))\b/],concept:'preparing pasta in a kitchen'},
  {id:'seoul_forest',label:'Seoul Forest',groups:[/\bseoul\s+forest\b/],concept:'a peaceful walk through Seoul Forest'},
  {id:'jeju_island',label:'Jeju Island',groups:[/\bjeju\s+island\b/],concept:'the scenery of Jeju Island'},
  {id:'korean_drama',label:'Korean dramas',groups:[/\bkorean\s+dramas?\b/],concept:'a cozy television and sofa for watching Korean dramas'},
  {id:'live_music',label:'live music',groups:[/\blive\s+music\b/],concept:'a small live music stage with instruments'},
  {id:'street_food',label:'street food',groups:[/\bstreet\s+food\b/],concept:'a colorful street food stall'},
  {id:'homemade_pasta',label:'homemade pasta',groups:[/\bhomemade\s+pasta\b/],concept:'a plate of homemade pasta'},
  {id:'reading_books',label:'reading books',groups:[/\bread(?:ing)?\b/,/\bbooks?\b/],concept:'books and a comfortable reading corner'},
  {id:'hiking_mountains',label:'mountain hiking',groups:[/\bhik(?:e|ing)\b/,/\bmountains?\b/],concept:'a mountain hiking trail'}
 ];
 function supports(rule,text){return rule.groups.every(function(group){return group.test(text);});}
 function suggestions(context){
  context=context||{};
  var rows=(Array.isArray(context.transcript)?context.transcript:[]).filter(function(row){return row&&typeof row==='object'&&['partner','me','local'].includes(String(row.speaker||'').toLowerCase());}).slice(-40).map(function(row){return topicText(clean(row.text||row.message,600));});
  var card=context.talkCard||{},topic=topicText(context.topic||''),cardText=topicText(card.topic||card.question_en||''),contextText=topic+' '+cardText;
  var ranked=[];
  themeRules.forEach(function(rule,index){
   var exact=rows.filter(function(row){return supports(rule,row);}).length;
   var near=rows.some(function(_,i){return supports(rule,rows.slice(i,i+3).join(' ').slice(0,600));});
   var shared=rule.groups.every(function(group){return group.test(rows.join(' '))||group.test(contextText);})&&rule.groups.some(function(group){return group.test(rows.join(' '));})&&rule.groups.some(function(group){return group.test(contextText);});
   var contextual=supports(rule,contextText);
   if(!exact&&!near&&!shared&&!contextual)return;
   var score=exact>1?30+exact*3:exact?18:shared?14:near?10:3;
   if(contextual&&(exact||near))score+=5;
   score+=rule.groups.length;
   ranked.push({rule:rule,score:score,index:index});
  });
  // Keep a complete entity/topic rather than its shorter overlapping version.
  ranked=ranked.filter(function(candidate){return !ranked.some(function(other){return (other.rule.suppresses||[]).includes(candidate.rule.id);});});
  return ranked.sort(function(a,b){return b.score-a.score||a.index-b.index;}).slice(0,3).map(function(item){return item.rule.label;});
 }
 var memoryThemes={cafe_coffee:'a small café memory centered on a coffee cup, with a quiet table corner',cafe_busy:'a café table corner with a gentle suggestion of a busy café using abstract chairs, no people',cafe_rabbit:'a café memory and a subtle symbolic rabbit motif on the paper margin, not a real rabbit inside a café',cafe_coffee_busy:'a café memory centered on a coffee cup, with a gentle suggestion of a busy café using abstract chairs',cafe_coffee_rabbit:'a café memory centered on a coffee cup and a subtle symbolic rabbit motif on the paper margin; the rabbit is a remembered topic, not a real rabbit in a café',cafe_busy_rabbit:'a café memory with abstract chairs suggesting a busy café and a subtle symbolic rabbit motif, not a real rabbit in a café',cafe_coffee_busy_rabbit:'a café memory centered on a coffee cup, a subtle symbolic rabbit motif on the paper margin, and a gentle suggestion of a busy café using abstract chairs; the rabbit is not a real rabbit in a café'};
 function storyIllustrations(topics){var safe=(Array.isArray(topics)?topics:[]).filter(t=>t&&typeof t.quote==='string'&&Array.isArray(t.source_utterance_ids)&&t.source_utterance_ids.includes(t.id));var cafe=safe.some(t=>t.label==='Food & cafés'&&/\bcaf[eé]s?\b/i.test(t.quote));if(!cafe)return [];var words=safe.flatMap(t=>t.words||t.nouns||[]);var coffee=words.includes('coffee'),busy=words.includes('crowded'),rabbit=safe.some(t=>t.label==='Pets'&&/\brabbits?\b/i.test(t.quote));if(!coffee&&!busy&&!rabbit)return [];var theme='cafe'+(coffee?'_coffee':'')+(busy?'_busy':'')+(rabbit?'_rabbit':'');return [{theme:theme,label:'Today’s conversation memory',concept_key:theme}];}
 function illustrationKey(theme){return memoryThemes[theme]?theme:null;}
 function illustrationConcept(theme){
  var safe=safeKeyword(theme);if(!safe)return '';if(memoryThemes[safe])return memoryThemes[safe];
  var normalized=topicText(safe),exact=themeRules.find(function(rule){return topicText(rule.label)===normalized;});
  if(exact)return exact.concept;
  var supported=themeRules.find(function(rule){return supports(rule,normalized);});if(supported)return supported.concept;
  // Manual topics can use safe concrete subjects; unknown names/private places
  // are never interpolated into the external provider prompt.
  var subjects={pottery:'a pottery wheel and handmade ceramic bowls',coffee:'a cozy cup of coffee',pasta:'a plate of pasta',cafe:'a cozy café',cafes:'a cozy café',baking:'freshly baked bread',painting:'a painting workspace',gardening:'a peaceful garden'};
  return subjects[normalized]||'';
 }
 function illustrationUrl(keyword,seed){var concept=illustrationConcept(keyword);if(!concept)return null;
  var prompt='Warm watercolor and colored pencil on soft paper: '+concept+'. Ivory #FFFBF4, sage #5F7D63, beige #F8F0E3, warm brown. Contemporary editorial diary/postcard mood, simple focal composition. No photorealism, stock scene, anime, chibi, mascot, 3D, neon, faces, text, letters or logos.';
  return 'https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt)+'?width=400&height=400&nologo=true&seed='+encodeURIComponent(seed||1);
 }
 var api={illustrationAvailable:false,treats:Object.freeze(treats),templates:templates,note:note,suggestions:suggestions,safeKeyword:safeKeyword,illustrationConcept:illustrationConcept,illustrationUrl:illustrationUrl,storyIllustrations:storyIllustrations,illustrationKey:illustrationKey};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DayOPartnerReportContract=api;
})(typeof window!=='undefined'?window:this);
