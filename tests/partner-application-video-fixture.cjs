const assert=require('node:assert/strict');
function withDuration(buffer,seconds){
 // SeekHead also contains this ID; the actual Info element follows it.
 const id=buffer.lastIndexOf(Buffer.from([0x15,0x49,0xa9,0x66]));assert(id>=0,'WebM Info missing');
 const offset=id+4;let width=1,mask=0x80;while(!(buffer[offset]&mask)){width++;mask>>=1;}
 let size=buffer[offset]&(mask-1);for(let i=1;i<width;i++)size=size*256+buffer[offset+i];
 const existingDuration=buffer.indexOf(Buffer.from([0x44,0x89,0x88]),offset+width);
 if(existingDuration>=offset+width && existingDuration+11<=offset+width+size){const updated=Buffer.from(buffer);updated.writeDoubleBE(seconds*1000,existingDuration+3);return updated;}
 const duration=Buffer.alloc(11);duration.set([0x44,0x89,0x88]);duration.writeDoubleBE(seconds*1000,3);
 const updated=Buffer.from(buffer.subarray(offset,offset+width));let next=size+duration.length;
 for(let i=width-1;i>=0;i--){updated[i]=next&255;next=Math.floor(next/256);}updated[0]|=mask;
 return Buffer.concat([buffer.subarray(0,offset),updated,buffer.subarray(offset+width,offset+width+size),duration,buffer.subarray(offset+width+size)]);
}
async function createVideo(browser){const maker=await browser.newPage();
  const recording=Buffer.from(await maker.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;canvas.getContext('2d').fillRect(0,0,160,90);
   const stream=canvas.captureStream(5),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
   const draw=setInterval(()=>{canvas.getContext('2d').fillStyle=Date.now()%2?'red':'blue';canvas.getContext('2d').fillRect(0,0,160,90)},50);
   recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(r=>recorder.onstop=r);recorder.start();await new Promise(r=>setTimeout(r,700));recorder.stop();await done;clearInterval(draw);stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  }));await maker.close();return {video:withDuration(recording,35),shortVideo:withDuration(recording,10)};}
module.exports={createVideo};
