'use strict';
const assert=require('node:assert/strict');
const {createRetryHandler,MAX_BATCHES}=require('../api/booking-notifications-retry');
const secret='fixture-retry-secret-with-at-least-32-characters';
const config={url:'https://fixture.supabase.test',serviceKey:'fixture-service',resendKey:'fixture-provider',retrySecret:secret};
async function invoke(handler,body={},authorization='Bearer '+secret,method='POST') {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(raw){this.body=JSON.parse(raw);}};
  await handler({method,headers:{authorization},body},res);return res;
}
async function schedulerSQL(){
  const {PGlite}=require('@electric-sql/pglite');
  const fs=require('node:fs'),path=require('node:path');
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/proposals/booking_notification_retry_scheduler.sql'),'utf8');
  const functionSQL=sql.slice(sql.indexOf('create function public.invoke_'),sql.indexOf('-- Leave inactive'));
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema vault;create schema extensions;
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values('dayo_booking_notification_retry_secret','fixture-retry-secret-with-at-least-32-characters');
      create type extensions.http_header as(field text,value text);
      create type extensions.http_request as(method text,uri text,headers extensions.http_header[],content_type text,content text);
      create type extensions.http_response as(status integer,content_type text,headers extensions.http_header[],content text);
      create table fixture_response(status integer,content text);
      insert into fixture_response values(200,'{"ok":true,"sent":0,"failed":1,"review":0,"batches":2}');
      create table fixture_requests(body jsonb,url text);
      create function extensions.http_set_curlopt(text,text) returns boolean language plpgsql as $$ begin if ($1,$2) not in (('CURLOPT_TIMEOUT_MS','55000'),('CURLOPT_CONNECTTIMEOUT','5')) then raise exception 'Unsupported HTTP 1.6 option'; end if; return true; end $$;
      create function extensions.http(r extensions.http_request) returns extensions.http_response language plpgsql as $$
      declare result extensions.http_response;
      begin
        if r.method<>'POST' or r.content_type<>'application/json' or r.headers[1].field<>'Authorization' then raise exception 'Wrong HTTP request';end if;
        insert into public.fixture_requests values(r.content::jsonb,r.uri);
        select status,'application/json',null,content into result from public.fixture_response;return result;
      end;$$;`);
    await db.exec(functionSQL);
    const result=(await db.query('select public.invoke_booking_notification_retry() as result')).rows[0].result;
    assert.deepEqual(result,{status:200,sent:0,failed:1,review:0,batches:2});
    const id='11111111-1111-4111-8111-111111111111';
    await db.query('select public.invoke_booking_notification_retry($1,$2)',[id,'booking_cancelled']);
    const requests=(await db.query('select * from fixture_requests')).rows;
    assert.deepEqual(requests.map(r=>r.body),[{}, {bookingId:id,event:'booking_cancelled'}]);
    assert.equal(requests.every(r=>r.url==='https://www.dayotalk.com/api/booking-notifications-retry'),true);
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal((await db.query("select has_function_privilege($1,'public.invoke_booking_notification_retry(uuid,text)','execute') allowed",[role])).rows[0].allowed,false);
    }
    await assert.rejects(db.query('select public.invoke_booking_notification_retry($1,null)',[id]),/Invalid retry scope/);
    await db.exec('update fixture_response set status=503');
    await assert.rejects(db.query('select public.invoke_booking_notification_retry()'),/Booking retry endpoint HTTP 503/);
    await db.exec("update fixture_response set status=200,content='bad response'");
    await assert.rejects(db.query('select public.invoke_booking_notification_retry()'),/Invalid booking retry endpoint response/);
    await db.exec("update vault.decrypted_secrets set decrypted_secret='too-short'");
    await assert.rejects(db.query('select public.invoke_booking_notification_retry()'),/Scheduler secret is unavailable/);
    console.log('Actual scheduler SQL function fixtures passed with a local HTTP stub; no external requests.');
  }finally{await db.close();}
}

async function main(){
  await schedulerSQL();
  let calls=0;
  const handler=createRetryHandler({config,service:{},dispatch:async()=>{calls++;return {sent:0,failed:0,review:0};}});
  for(const token of [undefined,'','Bearer wrong','Bearer fixture-service','Bearer '+secret+'extra']) assert.equal((await invoke(handler,{},token===undefined?null:token)).statusCode,401);
  assert.equal(calls,0,'Unauthorized requests never reach the outbox');
  assert.equal((await invoke(handler,{},'Bearer '+secret,'GET')).statusCode,405);
  for(const body of [[],42,true,'42','true',{email:'customer@example.com'},{bookingId:'bad',event:'booking_confirmed'},'{bad']) assert.equal((await invoke(handler,body)).statusCode,400);
  assert.equal(calls,0);
  const empty=await invoke(handler);assert.equal(empty.statusCode,200);assert.equal(empty.body.batches,1);assert.equal(calls,1);assert.equal(empty.headers['Cache-Control'],'private, no-store');
  assert.equal((await invoke(createRetryHandler({config:{...config,retrySecret:''}}))).statusCode,401);
  let scope;
  const scoped=createRetryHandler({config,service:{},dispatch:async(s,c,x)=>{scope=x;return {sent:0,failed:0,review:0};}});
  const id='11111111-1111-4111-8111-111111111111';await invoke(scoped,{bookingId:id,event:'booking_cancelled'});assert.deepEqual(scope,{bookingId:id,eventType:'booking_cancelled'});
  const busy=await invoke(createRetryHandler({config,service:{},dispatch:async()=>({sent:2,failed:0,review:0})}));assert.equal(busy.body.batches,MAX_BATCHES);assert.equal(busy.body.sent,10);
  let clock=0;const timed=await invoke(createRetryHandler({config,service:{},now:()=>clock,dispatch:async()=>{clock+=25000;return {sent:0,failed:2,review:0};}}));assert.equal(timed.body.batches,2);assert.equal(timed.body.failed,4);
  const failed=await invoke(createRetryHandler({config,service:{},dispatch:async()=>{throw Error('secret provider body customer@example.com');}}));assert.equal(failed.statusCode,503);assert.equal(JSON.stringify(failed.body).includes('@'),false);
  console.log('Retry endpoint fixtures passed: dedicated auth, fail closed, strict scope, batch/time bounds, fixed private errors.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
