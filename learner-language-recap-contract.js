/* Canonical, learner-only AI correction admission. No generated/fallback speech. */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./learner-expressions.js') : root.DayOLearnerExpressions);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOLearnerRecapContract = api;
})(typeof window !== 'undefined' ? window : globalThis, function (learner) {
  'use strict';
  var VERSION = 'dayo_learner_recap_v1';
  function text(v) { return typeof v === 'string' ? v.trim() : ''; }
  function language(v) { return ({en:'en',english:'en',es:'es',spanish:'es',fr:'fr',french:'fr',ko:'ko',korean:'ko'})[text(v).toLowerCase()] || ''; }
  function normalized(v) { return text(v).normalize('NFKC').toLowerCase().replace(/[.,!?“”"']/g,'').replace(/\s+/g,' '); }
  function words(v) { return (text(v).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []); }
  function candidateText(v, lang) {
    var s=text(v), w=words(s);
    if (!language(lang) || s.length<12 || s.length>320 || w.length<3 || w.length>40) return false;
    if (/@|https?:|www\.|\d{5}|[<>�]|\[(?:inaudible|unknown)\]|\.\.\.|…/i.test(s)) return false;
    if (new Set(w).size / w.length < 0.6) return false;
    if (/\b(?:a|an|the|and|but|because|to|with|my|your|el|la|de|que|le|une|un|avec|et)\s*[.!?]*$/i.test(s)) return false;
    if (lang==='en') return !!learner && learner.isQuizQualityCandidate(s);
    if (lang==='ko') return /[가-힣]/.test(s) && !/[A-Za-z]/.test(s);
    if (/[가-힣\u3040-\u30ff\u3400-\u9fff]/.test(s)) return false;
    if (lang==='es') return /\b(?:soy|eres|es|somos|estoy|está|estaba|fui|fue|tengo|tiene|voy|va|fue|gusta|gustan|quiero|puedo|hice|hago|comí|visité|hablo|viajo|he|ha|estuve|vi)\b/i.test(s);
    return /\b(?:suis|es|est|sommes|sont|étais|était|ai|as|a|avais|vais|va|aime|aimes|aimons|peux|peut|veux|suis|allé|allée|fait|parle|voyage|visité)\b/i.test(s);
  }
  function candidates(log, lang) {
    lang=language(lang);
    if (!log || log.participant_role!=='learner' || !Array.isArray(log.transcript) || !text(log.id)) return [];
    var seen={};
    return log.transcript.slice(-60).filter(function(row){
      if (!row || row.speaker!=='learner' || !/^[a-zA-Z0-9_-]{1,80}$/.test(text(row.id))) return false;
      if (!text(row.timestamp) || !Number.isFinite(Date.parse(row.timestamp))) return false;
      if (row.confidence!=null && (!Number.isFinite(Number(row.confidence)) || Number(row.confidence)<0.85)) return false;
      var s=text(row.text),key=normalized(s);
      if (!candidateText(s,lang) || seen[key]) return false;
      seen[key]=true; return true;
    }).slice(-8).map(function(row){
      return {source_log_id:log.id,source_utterance_id:row.id,source_timestamp:row.timestamp,original_text:text(row.text)};
    });
  }
  function conservativeEdit(original, suggested) {
    var a=words(original), b=words(suggested), overlap=new Set(a.filter(function(w){return b.indexOf(w)!==-1;})).size;
    if (!b.length || b.length>40 || overlap/Math.max(new Set(a).size,new Set(b).size)<0.45) return false;
    var numbers=function(v){return (v.match(/\d+/g)||[]).sort().join(',');};
    if (numbers(original)!==numbers(suggested)) return false;
    var names=function(v){return (v.match(/[\p{L}'’-]+/gu)||[]).slice(1).filter(function(w){return /^[\p{Lu}]/u.test(w)&&w!=='I';}).map(function(w){return w.toLowerCase();});};
    return names(suggested).every(function(name){return words(original).indexOf(name)!==-1;});
  }
  function validate(items, source, lang) {
    var seen={};
    return (Array.isArray(items)?items:[]).filter(function(x){
      if (!x || typeof x!=='object' || x.meaning_preserved!==true || x.correction_needed!==true || typeof x.confidence!=='number' || x.confidence<0.94 || x.confidence>1) return false;
      var c=source.find(function(row){return row.source_utterance_id===x.source_utterance_id;});
      if (!c || x.original_text!==c.original_text || seen[c.source_utterance_id]) return false;
      var suggestion=text(x.suggested_text),reason=text(x.short_reason);
      if (!['grammar','naturalness','word_choice'].includes(x.correction_type) || !reason || reason.length>180) return false;
      if (!suggestion || suggestion.length>320 || /@|https?:|www\.|[<>�]/i.test(suggestion+reason)) return false;
      if (normalized(c.original_text)===normalized(suggestion) || !conservativeEdit(c.original_text,suggestion)) return false;
      if (lang==='ko'&&!/[가-힣]/.test(suggestion)) return false;
      if (lang!=='ko'&&/[가-힣\u3040-\u30ff\u3400-\u9fff]/.test(suggestion)) return false;
      seen[c.source_utterance_id]=true; return true;
    }).slice(0,3).map(function(x){
      var c=source.find(function(row){return row.source_utterance_id===x.source_utterance_id;});
      return {schema_version:1,generator:VERSION,source:'learner_recognized_speech',speaker:'learner',source_log_id:c.source_log_id,source_utterance_id:c.source_utterance_id,source_timestamp:c.source_timestamp,original_text:c.original_text,suggested_text:text(x.suggested_text),correction_type:x.correction_type,short_reason:text(x.short_reason),meaning_preserved:true,correction_needed:true,confidence:x.confidence};
    });
  }
  function mergeFeedback(base, corrections, metadata) {
    // Replace only this generator's entries. Evaluation chips and other legacy
    // learner feedback are preserved; Partner fields cannot enter this payload.
    var kept=(Array.isArray(base)?base:[]).filter(function(x){return !x||x.generator!==VERSION;});
    return kept.concat((Array.isArray(corrections)?corrections:[]).slice(0,3),metadata?[metadata]:[]);
  }
  return {VERSION:VERSION,language:language,normalized:normalized,candidateText:candidateText,candidates:candidates,validate:validate,mergeFeedback:mergeFeedback};
});