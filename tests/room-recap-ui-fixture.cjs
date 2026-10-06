/* Network-free preview helpers extracted from the actual room markup/functions. */
const fs=require('node:fs'),path=require('node:path'),ts=require('node:module').createRequire(path.join(__dirname, '../admin/package.json'))('typescript');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const room=read('public/room.html');
const scripts=Array.from(room.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),m=>m[1]).join('\n');
function functions(source,names){
 const ast=ts.createSourceFile('ui.js',source,ts.ScriptTarget.Latest,true),found=new Map();
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name&&names.includes(n.name.text))found.set(n.name.text,n.getText(ast));ts.forEachChild(n,visit);}visit(ast);
 return names.map(name=>{if(!found.has(name))throw Error('missing '+name);return found.get(name);}).join('\n');
}
const styles=Array.from(room.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),m=>m[1]).join('\n');
const markup=room.slice(room.indexOf('  <div class="studio">'),room.indexOf('  <!-- Word Help Bottom Sheet -->'));
const category=room.match(/var TALK_CARD_CATEGORY_LABELS = (\{[\s\S]*?\n    \});/)[1];
const groups=room.match(/var TALK_CARD_GROUPS = (\{[\s\S]*?\n    \});/)[1];
const uiCode=`var micBtn=document.getElementById('micBtn'),camBtn=document.getElementById('camBtn');
var talkCardData=window.DayOTalkCards, TALK_CARD_GROUPS=${groups},TALK_CARD_CATEGORY_LABELS=${category},talkCardState={category:'daily',index:0,updatedAt:1};
${functions(scripts,['t','ctrlBtnLabel','setCtrlBtnContent','renderHelpBtnLabels','liveApi','renderMicLabel','renderCamLabel','getLocalMediaStream','getLocalVideoTrack','canControlTalkCards','cardsForTalkCategory','pickNextTalkIndex','renderTalkCardQuestion'])}
renderMicLabel();renderCamLabel();renderHelpBtnLabels();renderTalkCardQuestion(false);`;
module.exports={room,styles,markup,scripts,functions,uiCode,read};
