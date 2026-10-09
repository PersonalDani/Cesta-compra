create table if not exists public.listas (
  code text primary key check (char_length(code) between 20 and 64),
  name text not null default 'Lista de la compra' check (char_length(name) <= 80),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listas enable row level security;
revoke all on public.listas from anon, authenticated;

create or replace function public.lista_crear(p_name text, p_items jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := replace(gen_random_uuid()::text, '-', '');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'lista_vacia';
  end if;
  if pg_column_size(p_items) > 300000 then
    raise exception 'lista_demasiado_grande';
  end if;
  insert into public.listas(code, name, items)
  values (c, left(coalesce(nullif(trim(p_name), ''), 'Lista de la compra'), 80), p_items);
  return c;
end;
$$;

create or replace function public.lista_leer(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('name', name, 'items', items, 'created_at', created_at, 'updated_at', updated_at)
  from public.listas
  where code = p_code;
$$;

create or replace function public.lista_marcar(p_code text, p_k text, p_v boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.listas;
begin
  update public.listas
     set items = (
           select coalesce(jsonb_agg(case when e->>'k' = p_k then jsonb_set(e, '{done}', to_jsonb(coalesce(p_v, false))) else e end order by ord), '[]'::jsonb)
             from jsonb_array_elements(items) with ordinality as x(e, ord)
         ),
         updated_at = now()
   where code = p_code
  returning * into r;
  if not found then
    raise exception 'lista_no_existe';
  end if;
  return jsonb_build_object('name', r.name, 'items', r.items, 'created_at', r.created_at, 'updated_at', r.updated_at);
end;
$$;

revoke all on function public.lista_crear(text, jsonb) from public;
revoke all on function public.lista_leer(text) from public;
revoke all on function public.lista_marcar(text, text, boolean) from public;
grant execute on function public.lista_crear(text, jsonb) to anon, authenticated;
grant execute on function public.lista_leer(text) to anon, authenticated;
grant execute on function public.lista_marcar(text, text, boolean) to anon, authenticated;
