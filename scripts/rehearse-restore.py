from pathlib import Path
import subprocess,json,hashlib
container='supabase_db_hdwnnuvqqkkpontcdbwa'
prefix='firstten_restore_20261018_'
source=prefix+'source';target=prefix+'target'
metadata=json.loads(subprocess.check_output(['docker','inspect',container]))[0]
assert metadata['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']=='55322'
def sql(db,text):
 result=subprocess.run(['docker','exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-At'],input=text,text=True,capture_output=True,timeout=30)
 if result.returncode:raise RuntimeError(result.stderr[:1600])
 return result.stdout.strip()
existing=sql('postgres',"SELECT datname FROM pg_database WHERE datname IN ('"+source+"','"+target+"');")
assert not existing, 'Owned rehearsal database already exists; inspect rather than overwrite.'
for name in [source,target]:sql('postgres','CREATE DATABASE '+name+';')
prelude="""CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb DEFAULT '{}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role; CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);"""
sql(source,prelude)
root=Path(__file__).resolve().parents[1]
files=sorted((root/'supabase/migrations').glob('*.sql'))
# Back up the actual prior schema, then replay the real pending intake migration.
old=[p for p in files if p.name<'20261018004000_founding_partners.sql'];pending=[p for p in files if p.name=='20261018004000_founding_partners.sql'];assert len(old)==5 and len(pending)==1
for p in old:
 sql(source,p.read_text());sql(source,"INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('"+p.name[:14]+"','"+p.stem[15:]+"');")
uid='f17e0000-0000-4000-8000-000000000001';pid='f17e0000-0000-4000-8000-000000000010'
sql(source,f"INSERT INTO auth.users(id) VALUES ('{uid}'); INSERT INTO public.projects(id,user_id,name,stage,checklist) VALUES ('{pid}','{uid}','Disposable restore fixture',2,'{{\"fixture\":true,\"unknownCount\":null}}'); INSERT INTO public.contacts(user_id,project_id,first_name,why) VALUES ('{uid}','{pid}','Fictional peer','Restore rehearsal only');")
query="SELECT jsonb_build_object('project',(SELECT to_jsonb(p) FROM public.projects p),'contacts',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.contacts c))::text;"
before=sql(source,query)
dump=subprocess.run(['docker','exec',container,'pg_dump','-U','postgres','-d',source,'-Fc','--no-owner'],capture_output=True,timeout=30,check=True).stdout
archive=Path('/private/tmp/firstten-disposable-restore-20261018.dump');archive.write_bytes(dump)
r=subprocess.run(['docker','exec','-i',container,'pg_restore','-U','postgres','-d',target,'--no-owner','--exit-on-error'],input=dump,capture_output=True,timeout=30)
if r.returncode:raise RuntimeError(r.stderr.decode()[:1600])
for p in pending:
 sql(target,p.read_text());sql(target,"INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('"+p.name[:14]+"','"+p.stem[15:]+"');")
assert sql(target,query)==before,'Restored fixture differs'
assert sql(target,"SELECT count(*) FROM supabase_migrations.schema_migrations;")=='6'
assert sql(target,"SELECT count(*) FROM firstten_private.founding_partner_submissions;")=='0'
assert sql(target,"SELECT has_table_privilege('anon','firstten_private.founding_partner_submissions','SELECT');")=='f'
# Reapplying the migration plan skips recorded versions; verify no pending versions remain.
recorded=set(sql(target,'SELECT version FROM supabase_migrations.schema_migrations;').splitlines())
assert all(p.name[:14] in recorded for p in old+pending)
report={'source':'disposable local-only fixture database','restored_project_count':1,'restored_contact_count':1,'fixture_content_match':True,'original_stage':2,'pending_migration_replayed':'20261018004000','recorded_versions':6,'second_plan_pending':0,'anonymous_intake_read':False,'dump_sha256':hashlib.sha256(dump).hexdigest(),'production_read_or_write':False,'full_supabase_auth_restore':False}
Path('/private/tmp/firstten-restore-rehearsal.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
# Clean up only these two databases, created and named by this invocation.
for name in [source,target]:sql('postgres','DROP DATABASE '+name+';')
print('Owned disposable rehearsal databases removed; original local/hosted databases preserved.')
