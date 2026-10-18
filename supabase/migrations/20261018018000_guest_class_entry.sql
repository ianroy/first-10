-- CLS-007. Real guest principals; no fake auth/projects, raw policies or activity data.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE firstten_private.guest_entry_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL,issuer_id uuid NOT NULL,
 request_id uuid NOT NULL,payload_hash text NOT NULL,token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[0-9a-f]{64}$'),
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 200),uses integer NOT NULL DEFAULT 0 CHECK(uses>=0 AND uses<=max_uses),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(class_id,issuer_id) REFERENCES public.classes(id,user_id) ON DELETE CASCADE,
 UNIQUE(class_id,request_id),CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days')
);
CREATE TABLE firstten_private.guest_capabilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL,team_id uuid NOT NULL,principal_id uuid,
 kind text NOT NULL CHECK(kind IN ('team_invite','team_return','principal_recovery')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 200),
 uses integer NOT NULL DEFAULT 0 CHECK(uses>=0 AND uses<=max_uses),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(team_id,class_id) REFERENCES public.class_teams(id,class_id) ON DELETE CASCADE,
 FOREIGN KEY(principal_id) REFERENCES public.class_guest_principals(id) ON DELETE CASCADE,
 CHECK((kind='principal_recovery')=(principal_id IS NOT NULL)),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days')
);
ALTER TABLE public.class_guest_principals ADD CONSTRAINT guest_principal_real_scope UNIQUE(id,class_id,team_id);
ALTER TABLE firstten_private.guest_capabilities ADD CONSTRAINT recovery_real_principal FOREIGN KEY(principal_id,class_id,team_id) REFERENCES public.class_guest_principals(id,class_id,team_id) ON DELETE CASCADE;
CREATE TABLE firstten_private.class_guest_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid NOT NULL,team_id uuid NOT NULL,principal_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[0-9a-f]{64}$'),expires_at timestamptz NOT NULL,
 revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(principal_id,class_id,team_id) REFERENCES public.class_guest_principals(id,class_id,team_id) ON DELETE CASCADE,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE TABLE firstten_private.guest_admission_buckets (
 bucket_hash text NOT NULL CHECK(bucket_hash~'^[0-9a-f]{64}$'),window_start timestamptz NOT NULL,
 attempts integer NOT NULL CHECK(attempts>0),PRIMARY KEY(bucket_hash,window_start)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['guest_entry_links','guest_capabilities','class_guest_sessions','guest_admission_buckets'] LOOP
  EXECUTE format('ALTER TABLE firstten_private.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON firstten_private.%I FROM PUBLIC,anon,authenticated,service_role',n);
 END LOOP;
END $$;
CREATE FUNCTION firstten_private.guest_secret() RETURNS text LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT encode(extensions.gen_random_bytes(32),'hex') $$;
CREATE FUNCTION firstten_private.guest_hash(p_secret text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$ SELECT encode(sha256(convert_to(p_secret,'UTF8')),'hex') $$;
CREATE FUNCTION firstten_private.entry_projection(e firstten_private.guest_entry_links) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',e.id,'classId',e.class_id,'expiresAt',e.expires_at,'revokedAt',e.revoked_at,'maxUses',e.max_uses,'uses',e.uses,'createdAt',e.created_at) $$;
REVOKE ALL ON FUNCTION firstten_private.guest_secret(),firstten_private.guest_hash(text),firstten_private.entry_projection(firstten_private.guest_entry_links) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_guest_entry(p_class_id uuid,p_days integer,p_max_uses integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.classes;e firstten_private.guest_entry_links;secret text;hash text;issued timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF p_class_id IS NULL OR p_request_id IS NULL OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 30 OR p_max_uses IS NULL OR p_max_uses NOT BETWEEN 1 AND 200 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT * INTO c FROM public.classes WHERE id=p_class_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 hash:=firstten_private.guest_hash(jsonb_build_object('days',p_days,'maxUses',p_max_uses)::text);
 SELECT * INTO e FROM firstten_private.guest_entry_links WHERE class_id=p_class_id AND request_id=p_request_id;
 IF FOUND THEN
  IF e.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('ok',true,'data',firstten_private.entry_projection(e),'token',NULL,'replayed',true);
 END IF;
 IF (SELECT count(*) FROM firstten_private.guest_entry_links WHERE class_id=p_class_id AND revoked_at IS NULL AND expires_at>clock_timestamp())>=10 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY'); END IF;
 secret:=firstten_private.guest_secret();issued:=clock_timestamp();
 IF c.access_expires_at<=issued THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 INSERT INTO firstten_private.guest_entry_links(class_id,issuer_id,request_id,payload_hash,token_hash,max_uses,expires_at,created_at)
 VALUES(c.id,c.user_id,p_request_id,hash,firstten_private.guest_hash(secret),p_max_uses,least(issued+p_days*interval '1 day',c.access_expires_at),issued) RETURNING * INTO e;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.entry_projection(e),'token',secret,'replayed',false);
END $$;
CREATE FUNCTION public.list_guest_entries(p_class_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 IF firstten_private.class_role(p_class_id,true) IS DISTINCT FROM 'owner' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(firstten_private.entry_projection(e) ORDER BY e.created_at DESC),'[]'::jsonb) INTO items FROM (SELECT * FROM firstten_private.guest_entry_links WHERE class_id=p_class_id ORDER BY created_at DESC LIMIT 50)e;
 RETURN jsonb_build_object('ok',true,'data',items);
END $$;
CREATE FUNCTION public.revoke_guest_entry(p_class_id uuid,p_entry_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 UPDATE firstten_private.guest_entry_links SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_entry_id AND class_id=p_class_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

-- A short, bounded counter stores no IP or browser fingerprint. Server supplies
-- HMAC of trusted platform IP; missing trusted IP shares the conservative bucket.
CREATE FUNCTION firstten_private.consume_guest_admission(p_client_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bucket text;used integer;window_time timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 -- Consistent global then client lock order; inserts atomically serialize limits.
 FOREACH bucket IN ARRAY ARRAY[firstten_private.guest_hash('global-guest-entry'),p_client_hash] LOOP
  INSERT INTO firstten_private.guest_admission_buckets(bucket_hash,window_start,attempts) VALUES(bucket,window_time,1)
  ON CONFLICT(bucket_hash,window_start) DO UPDATE SET attempts=least(firstten_private.guest_admission_buckets.attempts+1,1001) RETURNING attempts INTO used;
  IF used>(CASE WHEN bucket=p_client_hash THEN 120 ELSE 500 END) THEN RETURN false; END IF;
 END LOOP;
 -- Bounded maintenance; PRV003 owns the full retention process.
 DELETE FROM firstten_private.guest_admission_buckets WHERE (bucket_hash,window_start) IN
 (SELECT bucket_hash,window_start FROM firstten_private.guest_admission_buckets WHERE window_start<clock_timestamp()-interval '1 day' LIMIT 100);
 RETURN true;
END $$;
CREATE FUNCTION firstten_private.resolve_guest(p_session text) RETURNS public.class_guest_principals
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE principal public.class_guest_principals;
BEGIN
 IF p_session IS NULL OR p_session !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT p.* INTO principal FROM public.class_guest_principals p
 JOIN firstten_private.class_guest_sessions s ON s.principal_id=p.id AND s.class_id=p.class_id AND s.team_id=p.team_id
 JOIN public.class_teams t ON t.id=p.team_id AND t.class_id=p.class_id
 JOIN public.classes c ON c.id=p.class_id
 WHERE s.token_hash=firstten_private.guest_hash(p_session) AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
 AND p.revoked_at IS NULL AND t.archived_at IS NULL AND c.archived_at IS NULL AND c.access_expires_at>clock_timestamp()
 AND EXISTS(SELECT 1 FROM auth.users WHERE id=c.user_id);
 RETURN principal;
END $$;
CREATE FUNCTION firstten_private.guest_view(p public.class_guest_principals) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.classes;t public.class_teams;items jsonb;
BEGIN
 SELECT * INTO c FROM public.classes WHERE id=p.class_id;
 SELECT * INTO t FROM public.class_teams WHERE id=p.team_id AND class_id=p.class_id;
 SELECT coalesce(jsonb_agg(firstten_private.assignment_projection(a) ORDER BY a.id),'[]'::jsonb) INTO items
 FROM(SELECT * FROM public.assignments WHERE class_id=p.class_id AND state='published' ORDER BY id LIMIT 50)a;
 RETURN jsonb_build_object('classId',c.id,'className',c.name,'mode',c.mode,'instructions',c.instructions,
 'accessExpiresAt',c.access_expires_at,'retentionDays',c.retention_days,'aiEnabled',false,
 'teamId',t.id,'teamAlias',t.alias,'principalId',p.id,'principalAlias',p.alias,'assignments',items);
END $$;
CREATE FUNCTION firstten_private.mint_guest_cap(p_class uuid,p_team uuid,p_principal uuid,p_kind text,p_deadline timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE secret text:=firstten_private.guest_secret();issued timestamptz:=clock_timestamp();
BEGIN
 IF p_deadline<=issued THEN RAISE EXCEPTION 'Guest capability expired during exchange' USING ERRCODE='PGX01'; END IF;
 INSERT INTO firstten_private.guest_capabilities(class_id,team_id,principal_id,kind,token_hash,max_uses,expires_at,created_at)
 VALUES(p_class,p_team,p_principal,p_kind,firstten_private.guest_hash(secret),CASE WHEN p_kind='principal_recovery' THEN 1 ELSE 12 END,least(p_deadline,issued+CASE WHEN p_kind='team_invite' THEN interval '1 day' ELSE interval '30 days' END),issued);
 RETURN secret;
END $$;
CREATE FUNCTION public.exchange_guest_entry(p_kind text,p_token text,p_team_alias text,p_principal_alias text,p_client_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.classes;t public.class_teams;p public.class_guest_principals;e firstten_private.guest_entry_links;
 cap firstten_private.guest_capabilities;target uuid;bucket_used integer;session_secret text;recovery text;team_return text;team_invite text;issued timestamptz;deadline timestamptz;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('entry','team_invite','team_return','principal_recovery') OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$'
 OR p_team_alias IS NULL OR char_length(p_team_alias)>80 OR p_principal_alias IS NULL OR char_length(p_principal_alias)>80 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 IF NOT firstten_private.consume_guest_admission(p_client_hash) THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED'); END IF;
 IF p_kind='entry' THEN SELECT class_id INTO target FROM firstten_private.guest_entry_links WHERE token_hash=firstten_private.guest_hash(p_token);
 ELSE SELECT class_id INTO target FROM firstten_private.guest_capabilities WHERE token_hash=firstten_private.guest_hash(p_token) AND kind=p_kind; END IF;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 INSERT INTO firstten_private.guest_admission_buckets(bucket_hash,window_start,attempts)
 VALUES(firstten_private.guest_hash('guest-entry:'||p_token),date_trunc('minute',clock_timestamp()),1)
 ON CONFLICT(bucket_hash,window_start) DO UPDATE SET attempts=least(firstten_private.guest_admission_buckets.attempts+1,121) RETURNING attempts INTO bucket_used;
 IF bucket_used>120 THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED'); END IF;
 BEGIN -- Roll back partial scope creation while outer admission counters persist.
 SELECT * INTO c FROM public.classes WHERE id=target FOR UPDATE;
 IF NOT FOUND OR c.archived_at IS NOT NULL OR c.access_expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=c.user_id) THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_kind='entry' THEN
  SELECT * INTO e FROM firstten_private.guest_entry_links WHERE class_id=target AND token_hash=firstten_private.guest_hash(p_token) FOR UPDATE;
  IF e.revoked_at IS NOT NULL OR e.expires_at<=clock_timestamp() OR e.issuer_id<>c.user_id THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  IF e.uses>=e.max_uses OR (SELECT count(*) FROM public.class_teams WHERE class_id=target)>=200 THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY'); END IF;
  INSERT INTO public.class_teams(class_id,issued_by,alias) VALUES(target,c.user_id,coalesce(nullif(btrim(p_team_alias),''),'Team '||substr(firstten_private.guest_secret(),1,4))) RETURNING * INTO t;
 ELSE
  SELECT * INTO cap FROM firstten_private.guest_capabilities WHERE class_id=target AND kind=p_kind AND token_hash=firstten_private.guest_hash(p_token) FOR UPDATE;
  IF cap.id IS NULL OR cap.revoked_at IS NOT NULL OR cap.expires_at<=clock_timestamp() OR cap.uses>=cap.max_uses THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  SELECT * INTO t FROM public.class_teams WHERE id=cap.team_id AND class_id=target FOR UPDATE;
  IF NOT FOUND OR t.archived_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 END IF;
 IF (SELECT count(*) FROM firstten_private.guest_capabilities WHERE team_id=t.id)>=256 THEN
  RETURN jsonb_build_object('ok',false,'code',CASE WHEN p_kind='principal_recovery' THEN 'RECOVERY_UNAVAILABLE' ELSE 'CAPACITY' END);
 END IF;
 IF p_kind='principal_recovery' THEN
  SELECT * INTO p FROM public.class_guest_principals WHERE id=cap.principal_id AND class_id=target AND team_id=t.id FOR UPDATE;
  IF NOT FOUND OR p.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
  UPDATE firstten_private.class_guest_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE principal_id=p.id;
  UPDATE firstten_private.guest_capabilities SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE principal_id=p.id AND kind='principal_recovery';
 ELSE
  IF (SELECT count(*) FROM public.class_guest_principals WHERE class_id=target)>=1000 OR (SELECT count(*) FROM public.class_guest_principals WHERE team_id=t.id)>=12 THEN RAISE EXCEPTION 'Guest space capacity reached' USING ERRCODE='PGC01'; END IF;
  INSERT INTO public.class_guest_principals(class_id,team_id,issued_by,alias) VALUES(target,t.id,c.user_id,coalesce(nullif(btrim(p_principal_alias),''),'Learner '||substr(firstten_private.guest_secret(),1,4))) RETURNING * INTO p;
 END IF;
 IF p_kind='entry' THEN
  UPDATE firstten_private.guest_entry_links SET uses=uses+1 WHERE id=e.id;
  team_return:=firstten_private.mint_guest_cap(target,t.id,NULL,'team_return',c.access_expires_at);
  team_invite:=firstten_private.mint_guest_cap(target,t.id,NULL,'team_invite',c.access_expires_at);
 ELSE UPDATE firstten_private.guest_capabilities SET uses=uses+1 WHERE id=cap.id; END IF;
 recovery:=firstten_private.mint_guest_cap(target,t.id,p.id,'principal_recovery',c.access_expires_at);
 issued:=clock_timestamp();deadline:=least(issued+interval '24 hours',c.access_expires_at);
 IF deadline<=issued OR (p_kind='entry' AND e.expires_at<=issued) OR (p_kind<>'entry' AND cap.expires_at<=issued) THEN RAISE EXCEPTION 'Guest access expired during entry' USING ERRCODE='PGX01'; END IF;
 session_secret:=firstten_private.guest_secret();
 INSERT INTO firstten_private.class_guest_sessions(class_id,team_id,principal_id,token_hash,expires_at,created_at) VALUES(target,t.id,p.id,firstten_private.guest_hash(session_secret),deadline,issued);
 RETURN jsonb_build_object('ok',true,'data',firstten_private.guest_view(p),'sessionToken',session_secret,'sessionExpiresAt',deadline,
 'secrets',jsonb_build_object('principalRecovery',recovery,'teamReturn',team_return,'teamInvite',team_invite));
EXCEPTION WHEN SQLSTATE 'PGC01' THEN RETURN jsonb_build_object('ok',false,'code','CAPACITY');
 WHEN SQLSTATE 'PGX01' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');
 END;
END $$;
CREATE FUNCTION public.get_guest_session(p_session text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.class_guest_principals;
BEGIN
 p:=firstten_private.resolve_guest(p_session);
 IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 RETURN jsonb_build_object('ok',true,'data',firstten_private.guest_view(p));
END $$;
CREATE FUNCTION public.manage_guest_session(p_session text,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.class_guest_principals;c public.classes;secret text;target uuid;
BEGIN
 IF p_operation IS NULL OR p_operation NOT IN('logout','team_invite','rotate_team_return','rotate_principal_recovery') THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT'); END IF;
 SELECT class_id INTO target FROM firstten_private.class_guest_sessions WHERE token_hash=firstten_private.guest_hash(p_session);
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.classes WHERE id=target FOR UPDATE;
 p:=firstten_private.resolve_guest(p_session);
 IF p.id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 BEGIN
 IF p_operation='logout' THEN
  UPDATE firstten_private.class_guest_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE token_hash=firstten_private.guest_hash(p_session);
  RETURN jsonb_build_object('ok',true);
 ELSIF (SELECT count(*) FROM firstten_private.guest_capabilities WHERE team_id=p.team_id)>=256 THEN RETURN jsonb_build_object('ok',false,'code','RATE_LIMITED');
 ELSIF p_operation='team_invite' THEN
  UPDATE firstten_private.guest_capabilities SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE team_id=p.team_id AND kind='team_invite';
  secret:=firstten_private.mint_guest_cap(p.class_id,p.team_id,NULL,'team_invite',c.access_expires_at);
 ELSIF p_operation='rotate_team_return' THEN
  UPDATE firstten_private.guest_capabilities SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE team_id=p.team_id AND kind='team_return';
  secret:=firstten_private.mint_guest_cap(p.class_id,p.team_id,NULL,'team_return',c.access_expires_at);
 ELSE
  UPDATE firstten_private.guest_capabilities SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE principal_id=p.id AND kind='principal_recovery';
  secret:=firstten_private.mint_guest_cap(p.class_id,p.team_id,p.id,'principal_recovery',c.access_expires_at);
 END IF;
 RETURN jsonb_build_object('ok',true,'token',secret);
 EXCEPTION WHEN SQLSTATE 'PGX01' THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');
 END;
END $$;
-- Safe teacher management projections. No session/capability hashes or secrets.
CREATE FUNCTION public.list_guest_teams(p_class_id uuid,p_cursor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r text;items jsonb;next_cursor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 r:=firstten_private.class_role(p_class_id,true);
 IF r IS NULL OR r NOT IN('owner','teacher') THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'alias',t.alias,'archivedAt',t.archived_at,'members',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'alias',p.alias,'revokedAt',p.revoked_at) ORDER BY p.id),'[]'::jsonb) FROM public.class_guest_principals p WHERE p.team_id=t.id)) ORDER BY t.id),'[]'::jsonb)
 INTO items FROM(SELECT * FROM public.class_teams WHERE class_id=p_class_id AND(p_cursor IS NULL OR id>p_cursor)ORDER BY id LIMIT 50)t;
 IF jsonb_array_length(items)=50 AND EXISTS(SELECT 1 FROM public.class_teams WHERE class_id=p_class_id AND id>(items->49->>'id')::uuid)THEN next_cursor:=(items->49->>'id')::uuid;END IF;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('items',items,'nextCursor',next_cursor));
END $$;
CREATE FUNCTION public.revoke_guest_scope(p_class_id uuid,p_team_id uuid,p_principal_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); END IF;
 PERFORM 1 FROM public.classes WHERE id=p_class_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 IF p_principal_id IS NULL THEN UPDATE public.class_teams SET archived_at=coalesce(archived_at,clock_timestamp()) WHERE id=p_team_id AND class_id=p_class_id;
 ELSE UPDATE public.class_guest_principals SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_principal_id AND team_id=p_team_id AND class_id=p_class_id; END IF;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND'); END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION firstten_private.consume_guest_admission(text),firstten_private.resolve_guest(text),firstten_private.guest_view(public.class_guest_principals),firstten_private.mint_guest_cap(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_guest_entry(uuid,integer,integer,uuid),public.list_guest_entries(uuid),public.revoke_guest_entry(uuid,uuid),public.list_guest_teams(uuid,uuid),public.revoke_guest_scope(uuid,uuid,uuid),public.exchange_guest_entry(text,text,text,text,text),public.get_guest_session(text),public.manage_guest_session(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_guest_entry(uuid,integer,integer,uuid),public.list_guest_entries(uuid),public.revoke_guest_entry(uuid,uuid),public.list_guest_teams(uuid,uuid),public.revoke_guest_scope(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_guest_entry(text,text,text,text,text),public.get_guest_session(text),public.manage_guest_session(text,text) TO service_role;
COMMENT ON TABLE firstten_private.class_guest_sessions IS 'Hash-only HttpOnly cookie session; scoped real guest principal and team, never auth.users/projects. No activity content until CLS008.';
COMMIT;
