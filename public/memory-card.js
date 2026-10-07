/* Dedicated 4:5 Memory Card raster renderer. Never captures a modal or UI chrome. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DayOMemoryCard=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';
var WIDTH=1080,HEIGHT=1350,IVORY='#FFFBF4',SAGE='#5F7D63',BEIGE='#F8F0E3',INK='#51433c';
function lines(ctx,text,width,font){ctx.font=font;var out=[];String(text||'').split(/\r?\n/).forEach(paragraph=>{var line='';var tokens=paragraph.match(/\S+|\s+/g)||[];tokens.forEach(token=>{if(!token.trim()){if(line)line+=' ';return;}if(ctx.measureText(line+token).width<=width){line+=token;return;}if(line.trim())out.push(line.trim());line='';if(ctx.measureText(token).width<=width){line=token;return;}for(var ch of Array.from(token)){if(ctx.measureText(line+ch).width>width&&line){out.push(line);line=ch;}else line+=ch;}});out.push(line.trim());});return out;}

function layout(ctx,m,hasImage){
 var storyTitle=m.locale==='ko'?'오늘의 이야기':'Today’s stories',topicText=(m.topics||[]).slice(0,2).join(' · '),quotes=(m.expressions||[]).slice(0,2),letter=m.letter||'',title=m.title||(m.locale==='ko'?m.partner+'과 나눈 오늘의 대화':'Today’s conversation with '+m.partner);
 var titleSize=hasImage?44:60,titleLines=lines(ctx,title,920,'600 '+titleSize+'px sans-serif');
 if(titleLines.length>3){titleSize=36;titleLines=lines(ctx,title,920,'600 36px sans-serif');}
 var titleHeight=titleLines.length*titleSize*1.2,headingBottom=190+titleHeight+(hasImage?52:24);
 // Keep the full Letter. Shorten the image/quote allocation before reducing its type.
 for(var count=quotes.length;count>=0;count--){for(var imageHeight of hasImage?[460,300,180]:[0]){for(var size=hasImage?38:52;size>=20;size-=2){
  var bodySize=hasImage?28:36,lineHeight=size*1.4,topicLines=topicText?lines(ctx,topicText,920,'600 '+bodySize+'px sans-serif'):[],quoteLines=quotes.slice(0,count).flatMap(q=>lines(ctx,'“'+q+'”',920,bodySize+'px sans-serif').concat(['']));
  var storyHeight=(topicLines.length||quoteLines.length?48:0)+(topicLines.length+quoteLines.length)*bodySize*1.4;
  var letterTitle=lines(ctx,'Letter from '+m.partner,864,'700 32px sans-serif'),letterLines=lines(ctx,letter,864,size+'px sans-serif'),letterHeight=letter?letterTitle.length*40+letterLines.length*lineHeight+64:0;
  var contentHeight=headingBottom+(hasImage?imageHeight+30:0)+storyHeight+letterHeight+24;
  if(contentHeight<=1230)return {storyTitle,topicLines,quoteLines,letterLines,letterTitle,titleLines,titleSize,titleHeight,headingBottom,storyHeight,letterHeight,imageHeight,bodySize,size,lineHeight,contentHeight};
 }}}
 return {overflow:true};
}
async function image(url,options){if(!url)return null;var ImageClass=options.Image||Image;return new Promise(resolve=>{var img=new ImageClass(),done=false,timer=setTimeout(()=>finish(null),options.imageTimeout||8000);function finish(value){if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(value);}img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>finish(img.naturalWidth?img:null);img.onerror=()=>finish(null);img.src=url;});}
async function render(model,options){
 var o=options||{},m=model||{};if(m.kind!=='dayo_memory_card_v1')throw Error('memory-card-source');
 var doc=o.document||document,canvas=doc.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;var ctx=canvas.getContext('2d');if(!ctx)throw Error('memory-card-canvas');
 var picture=await image(m.image,o),plan=layout(ctx,m,!!picture);
 if(plan.overflow&&picture){picture=null;plan=layout(ctx,m,false);}
 if(plan.overflow)throw Error('memory-card-content-too-long');
 ctx.fillStyle=IVORY;ctx.fillRect(0,0,WIDTH,HEIGHT);ctx.fillStyle=SAGE;ctx.fillRect(64,60,8,60);ctx.font='700 50px sans-serif';ctx.fillText('DayO',94,107);
 ctx.fillStyle=INK;ctx.font='24px sans-serif';var metadata=[m.date,m.language,m.partner].filter(Boolean).join(' · ');lines(ctx,metadata,920,'24px sans-serif').slice(0,2).forEach((line,i)=>ctx.fillText(line,80,155+i*33));
 var y=190;ctx.fillStyle=INK;ctx.font='600 '+plan.titleSize+'px sans-serif';plan.titleLines.forEach(line=>{ctx.fillText(line,80,y+plan.titleSize);y+=plan.titleSize*1.2;});
 if(picture){ctx.fillStyle=SAGE;ctx.font='24px sans-serif';ctx.fillText(m.locale==='ko'?'오늘의 이야기, 그림으로 그려봤어요.':'A small illustration of today’s conversation.',80,y+36);y=plan.headingBottom;var ratio=Math.min(920/picture.naturalWidth,plan.imageHeight/picture.naturalHeight),w=picture.naturalWidth*ratio,h=picture.naturalHeight*ratio;ctx.drawImage(picture,(WIDTH-w)/2,y+(plan.imageHeight-h)/2,w,h);y+=plan.imageHeight+30;}else y=plan.headingBottom;
 if(plan.topicLines.length||plan.quoteLines.length){ctx.font='600 28px sans-serif';ctx.fillStyle=SAGE;ctx.fillText(plan.storyTitle,80,y+30);y+=48;ctx.fillStyle=INK;ctx.font='600 '+plan.bodySize+'px sans-serif';plan.topicLines.forEach(line=>{ctx.fillText(line,80,y+plan.bodySize);y+=plan.bodySize*1.4;});ctx.font=plan.bodySize+'px sans-serif';plan.quoteLines.forEach(line=>{ctx.fillText(line,80,y+plan.bodySize);y+=plan.bodySize*1.4;});}
 if(m.letter){y+=24;var top=y;ctx.fillStyle=BEIGE;ctx.fillRect(64,top,952,plan.letterHeight);ctx.fillStyle=SAGE;ctx.font='700 32px sans-serif';y=top+26;plan.letterTitle.forEach(line=>{ctx.fillText(line,108,y+32);y+=40;});ctx.fillStyle=INK;ctx.font=plan.size+'px sans-serif';y+=12;plan.letterLines.forEach(line=>{ctx.fillText(line,108,y+plan.size);y+=plan.lineHeight;});}
 ctx.strokeStyle='#e8dfd1';ctx.beginPath();ctx.moveTo(80,1265);ctx.lineTo(1000,1265);ctx.stroke();ctx.fillStyle=SAGE;ctx.font='500 23px sans-serif';ctx.fillText(m.locale==='ko'?'대화가 쌓이면, 자신감도 쌓여요.':'With every conversation, confidence grows.',80,1310);
 canvas.setAttribute('aria-label','DayO Memory Card');canvas.dataset.memoryImage=picture?'shown':'hidden';return canvas;
}
return {WIDTH,HEIGHT,render,layout,lines};
});
