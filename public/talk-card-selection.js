/* Talk Card selection only: explicit metadata, no profile/matching/AI input. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DayOTalkCardSelection = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var KEYS = ['drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school'];
  var GROUPS = {auto:null,daily:['daily','taste','korea-life'],travel:['korea-trip','world-trip','culture'],food:['food'],balance:['balance']};
  var RELATED = {
    drama:['movies','books_webtoon'], movies:['drama','youtube','music'], youtube:['movies','drama'],
    music:['movies','drama'], travel:['food_cafe'], food_cafe:['travel'], books_webtoon:['drama','movies']
  };
  var RELATED_CATEGORIES = {travel:['culture'],food_cafe:['daily','culture'],exercise:['daily'],pets:['daily'],work_school:['daily','culture'],games:['daily'],fashion_beauty:['daily']};
  function canonical(values) { return Array.from(new Set(Array.isArray(values) ? values.filter(function(k){return KEYS.indexOf(k)!==-1;}) : [])); }
  function pool(cards,group) { var categories=GROUPS[group];return cards.filter(function(c){return c.active!==false && (!categories || categories.indexOf(c.category)!==-1);}); }
  function pick(cards,options) {
    options=options||{};
    var random=options.random||Math.random,group=GROUPS.hasOwnProperty(options.group)?options.group:'auto';
    var available=pool(cards,group),used=new Set(options.used||[]),recent=new Set(options.recent||[]),interests=canonical(options.interests);
    if (!available.length) return null;
    var unseen=available.filter(function(c){return !used.has(c.id);}),exhausted=unseen.length===0;
    if (exhausted) unseen=available.filter(function(c){return c.id!==options.currentId;});
    if (!unseen.length) unseen=available;
    var different=unseen.filter(function(c){return c.id!==options.currentId;});
    if(different.length)unseen=different;
    // Strong cooldown, not a permanent ban: prefer any fresh card inside the explicit category.
    var fresh=unseen.filter(function(c){return !recent.has(c.id);});
    var candidates=fresh.length?fresh:unseen;
    var relatedKeys=canonical(interests.flatMap(function(k){return RELATED[k]||[];}));
    var relatedCats=interests.flatMap(function(k){return RELATED_CATEGORIES[k]||[];});
    var primary=[],related=[],wildcard=[];
    candidates.forEach(function(c){
      var tags=canonical(c.interestKeys);
      if (c.deck!=='balance' && tags.some(function(k){return interests.indexOf(k)!==-1;})) primary.push(c);
      else if (c.deck!=='balance' && (tags.some(function(k){return relatedKeys.indexOf(k)!==-1;}) || relatedCats.indexOf(c.category)!==-1)) related.push(c);
      else wildcard.push(c);
    });
    var pools=[{name:'primary',weight:0.7,cards:primary},{name:'related',weight:0.2,cards:related},{name:'wildcard',weight:0.1,cards:wildcard}].filter(function(p){return p.cards.length;});
    var total=pools.reduce(function(n,p){return n+p.weight;},0),draw=random()*total,chosen=pools[pools.length-1];
    for(var i=0;i<pools.length;i++){draw-=pools[i].weight;if(draw<0){chosen=pools[i];break;}}
    var eligible=chosen.cards;
    if(chosen.name==='primary') {
      // Choose an available interest first, so a large travel deck cannot monopolize a small food deck.
      var liveKeys=interests.filter(function(k){return eligible.some(function(c){return (c.interestKeys||[]).indexOf(k)!==-1;});});
      var key=liveKeys[Math.floor(random()*liveKeys.length)];
      eligible=eligible.filter(function(c){return (c.interestKeys||[]).indexOf(key)!==-1;});
    }
    var card=eligible[Math.min(eligible.length-1,Math.floor(random()*eligible.length))];
    return {card:card,poolSource:chosen.name,selectionSource:exhausted?'fallback':group==='auto'?chosen.name:'manual',exhausted:exhausted,recentFallback:!fresh.length,group:group};
  }
  return {keys:KEYS,groups:GROUPS,canonical:canonical,pool:pool,pick:pick};
});
