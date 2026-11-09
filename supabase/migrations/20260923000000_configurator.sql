-- Apparel configurator backend.
-- Principle: the browser is untrusted. Anonymous clients never touch tables directly;
-- they call narrow SECURITY DEFINER functions (validated, size-limited, rate-limited),
-- and checkout goes through the add-to-cart edge function, which re-validates and re-prices.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- rate limiting
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security; -- no policies: internal only

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- Caller identity for anonymous rate limits (PostgREST exposes request headers).
create or replace function public.client_key() returns text language sql stable set search_path = '' as $$
  select coalesce(
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
    'unknown')
$$;

-- ---------------------------------------------------------------- tenant admins & catalogs
create table public.tenant_admins (
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id text not null,
  primary key (user_id, tenant_id)
);
alter table public.tenant_admins enable row level security;
create policy "admins see own memberships" on public.tenant_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_tenant_admin(p_tenant text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_admins where user_id = auth.uid() and tenant_id = p_tenant)
$$;

create table public.catalogs (
  tenant_id text primary key,
  catalog jsonb not null check (jsonb_typeof(catalog) = 'object' and catalog ? 'products' and catalog ? 'pricing'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
alter table public.catalogs enable row level security;
create policy "published catalogs are public" on public.catalogs for select using (true);
create policy "tenant admins insert" on public.catalogs for insert to authenticated with check (public.is_tenant_admin(tenant_id));
create policy "tenant admins update" on public.catalogs for update to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy "tenant admins delete" on public.catalogs for delete to authenticated using (public.is_tenant_admin(tenant_id));

create or replace function public.touch_catalog() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger catalogs_touch before insert or update on public.catalogs for each row execute function public.touch_catalog();

-- ---------------------------------------------------------------- designs (save / share)
create table public.designs (
  id text primary key check (id ~ '^[A-Z]{1,12}-[A-Z2-9]{6}$'),
  tenant_id text not null check (tenant_id ~ '^[a-z0-9-]{1,40}$'),
  schema_version int not null,
  design jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.designs enable row level security; -- no policies: access only via functions below

create or replace function public.save_design(p_tenant text, p_prefix text, p_design jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  prefix text := left(regexp_replace(upper(coalesce(p_prefix, '')), '[^A-Z]', '', 'g'), 12);
  new_id text;
  b bytea;
begin
  if not public.hit_rate_limit('save:' || public.client_key(), 60, 3600) then
    raise exception 'Too many saves — please wait a moment.' using errcode = 'P0429';
  end if;
  if octet_length(p_design::text) > 2000000 then
    raise exception 'Design is too large.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_design) <> 'object'
     or jsonb_typeof(p_design -> 'areas') <> 'object'
     or (p_design ->> 'productId') is null or (p_design ->> 'modelId') is null
     or jsonb_typeof(p_design -> 'schemaVersion') <> 'number' then
    raise exception 'Design is malformed.' using errcode = '22023';
  end if;
  if prefix = '' then prefix := 'DESIGN'; end if;
  loop
    b := extensions.gen_random_bytes(6);
    new_id := prefix || '-';
    for i in 0..5 loop
      new_id := new_id || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.designs (id, tenant_id, schema_version, design)
      values (new_id, p_tenant, (p_design ->> 'schemaVersion')::int, p_design);
      return new_id;
    exception when unique_violation then
      -- astronomically rare collision: try another id
    end;
  end loop;
end $$;

create or replace function public.get_design(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select design from public.designs where id = upper(p_id)
$$;

grant execute on function public.save_design(text, text, jsonb) to anon, authenticated;
grant execute on function public.get_design(text) to anon, authenticated;

-- ---------------------------------------------------------------- assets (object storage + metadata)
create table public.assets (
  id text primary key check (id ~ '^a_[0-9a-f]{24}$'),  -- content hash (sha-256 prefix) → dedupe, unguessable
  tenant_id text not null,
  kind text not null check (kind in ('raster', 'svg', 'font', 'model')),
  mime text not null,
  name text not null,
  width int not null default 0,
  height int not null default 0,
  has_alpha boolean not null default false,
  bytes int not null check (bytes > 0 and bytes <= 26214400),
  path text not null,
  created_at timestamptz not null default now()
);
alter table public.assets enable row level security; -- via functions only

create or replace function public.register_asset(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.hit_rate_limit('asset:' || public.client_key(), 200, 3600) then
    raise exception 'Too many uploads — please wait a moment.' using errcode = 'P0429';
  end if;
  -- Only register objects that really exist in storage (uploaded under the same content-hash path).
  if not exists (select 1 from storage.objects o where o.bucket_id = 'uploads' and o.name = p ->> 'path') then
    raise exception 'Uploaded file not found.' using errcode = '22023';
  end if;
  insert into public.assets (id, tenant_id, kind, mime, name, width, height, has_alpha, bytes, path)
  values (p ->> 'id', p ->> 'tenantId', p ->> 'kind', p ->> 'mime', left(p ->> 'name', 200),
          coalesce((p ->> 'width')::int, 0), coalesce((p ->> 'height')::int, 0), coalesce((p ->> 'hasAlpha')::boolean, false),
          (p ->> 'bytes')::int, p ->> 'path')
  on conflict (id) do nothing;
end $$;

create or replace function public.get_asset(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'kind', kind, 'mime', mime, 'name', name, 'width', width, 'height', height,
                            'hasAlpha', has_alpha, 'bytes', bytes, 'path', path, 'createdAt', created_at)
  from public.assets where id = p_id
$$;
grant execute on function public.register_asset(jsonb) to anon, authenticated;
grant execute on function public.get_asset(text) to anon, authenticated;

-- Private bucket. SVGs are stored as text/plain so a raw object URL can never execute script
-- in a browser; rasters keep their image type. Size and type limits are enforced by Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 26214400,
        array['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'model/gltf-binary'])
on conflict (id) do nothing;

-- Content-addressed paths only: <tenant>/<a_hash>.<ext>  or  previews/<CONFIG-ID>-<view>.webp
create policy "upload content-addressed objects" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'uploads' and (
    name ~ '^[a-z0-9-]{1,40}/a_[0-9a-f]{24}\.(png|jpg|webp|svg|ttf|otf|woff|woff2|glb)$'
    or name ~ '^previews/[A-Z]{1,12}-[A-Z2-9]{6}-[a-z]{1,12}\.webp$'));
-- Needed so clients can mint short-lived signed URLs; object names are 96-bit content hashes.
create policy "read uploads via signed urls" on storage.objects for select to anon, authenticated
  using (bucket_id = 'uploads');

-- ---------------------------------------------------------------- cart (written only by the edge function)
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  session_id text not null check (length(session_id) between 16 and 64),
  configuration_id text not null references public.designs (id),
  result jsonb not null,
  server_total numeric(12, 2) not null,
  currency text not null,
  requires_approval boolean not null default false,
  status text not null default 'in_cart' check (status in ('in_cart', 'ordered', 'removed')),
  created_at timestamptz not null default now()
);
alter table public.cart_items enable row level security; -- service role only

create or replace function public.get_cart(p_session text) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select c.result || jsonb_build_object('cartItemId', c.id, 'serverTotal', c.server_total, 'currency', c.currency, 'status', c.status)
  from public.cart_items c where c.session_id = p_session and c.status = 'in_cart' order by c.created_at
$$;
create or replace function public.remove_cart_item(p_session text, p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.cart_items set status = 'removed' where id = p_id and session_id = p_session
$$;
grant execute on function public.get_cart(text) to anon, authenticated;
grant execute on function public.remove_cart_item(text, uuid) to anon, authenticated;
