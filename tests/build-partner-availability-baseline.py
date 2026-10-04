import json,pathlib,re
qa=pathlib.Path(__file__).parent
capture=json.loads((qa/'fixtures/partner-availability-live-schema.json').read_text(encoding='utf8'))
base=capture['baseline'];meta=capture['metadata'];acl=capture['acl']
q=lambda x:'"'+str(x).replace('"','""')+'"'
def col(c):
    typ=c['udt'][1:]+'[]' if c['type']=='ARRAY' else (c['udt'] if c['type']=='USER-DEFINED' else c['type'])
    return q(c['name'])+' '+typ+(' default '+c['default'] if c['default'] else '')+(' not null' if c['nullable']=='NO' else '')
sql=['set check_function_bodies=off;',
     "do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end$$;",
     'create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;',
     "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
     "create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;",
     'create table auth.users('+','.join(col(c) for c in acl['auth_columns'])+');alter table auth.users add primary key(id);']
for t in acl['tables']:
    sql.append('create table public.'+q(t['name'])+'('+','.join(col(c) for c in base['columns'] if c['table']==t['name'])+');')
# Functions are copied verbatim from catalog, not replaced with test mock RPCs.
for f in base['definitions']:sql.append(f['definition']+';')
for k in sorted(base['constraints'],key=lambda k: k['type']=='f'):
    sql.append('alter table public.'+q(k['table'])+' add constraint '+q(k['name'])+' '+k['definition']+';')
for i in base['indexes']:
    if not any(k['name']==i['indexname'] for k in base['constraints']):sql.append(i['indexdef']+';')
priv={'a':'INSERT','r':'SELECT','w':'UPDATE','d':'DELETE','D':'TRUNCATE','x':'REFERENCES','t':'TRIGGER','m':'MAINTAIN'}
for t in acl['tables']:
    if t['rls']:sql.append('alter table public.'+q(t['name'])+' enable row level security;')
    if t['acl']:
        for entry in t['acl'][1:-1].split(','):
            role,letters=entry.split('/')[0].split('=')
            sql.append('grant '+','.join(priv[x] for x in letters if x in priv)+' on public.'+q(t['name'])+' to '+(q(role) if role else 'public')+';')
for c in base['column_acl']:
    for entry in c['acl'][1:-1].split(','):
        role,letters=entry.split('/')[0].split('=')
        for x in letters:
            if x in priv:sql.append('grant '+priv[x]+'('+q(c['column'])+') on public.'+q(c['table'])+' to '+(q(role) if role else 'public')+';')
for p in acl['policies']:
    sql.append('create policy '+q(p['policyname'])+' on public.'+q(p['tablename'])+' as '+p['permissive']+' for '+p['cmd']+' to '+','.join(q(r) if r!='public' else 'public' for r in p['roles'])+(' using ('+p['qual']+')' if p['qual'] else '')+(' with check ('+p['with_check']+')' if p['with_check'] else '')+';')
for f in meta['functions']:
    if not any(d['name']==f['name'] and d['args']==f['args'] for d in base['definitions']):continue
    signature='public.'+f['name']+'('+f['args']+')'
    if f['acl'] and f['acl'].startswith('{=X/postgres,'):
        sql.append('grant execute on function '+signature+' to public;')
    else:
        sql.append('revoke all on function '+signature+' from public,anon,authenticated,service_role;')
    if f['acl']:
        for entry in f['acl'][1:-1].split(','):
            role,letters=entry.split('/')[0].split('=')
            if 'X' in letters:sql.append('grant execute on function '+signature+' to '+(q(role) if role else 'public')+';')
for t in base['triggers']:
    if any(f['name']==t['function'] for f in base['definitions']):
        assert t['definition'] is not None
        sql.append(t['definition']+';')
sql.append('alter default privileges in schema public grant all on tables to service_role;')
(pathlib.Path(__import__('os').environ['DAYO_LOCAL_BASELINE_SQL'])).write_bytes('\n'.join(sql).encode('utf8'))
print('Metadata-only baseline built: '+str(len(acl['tables']))+' tables, '+str(len(base['definitions']))+' unchanged RPC definitions; no production rows or secrets.')
