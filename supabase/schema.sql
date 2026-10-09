create table if not exists public.cestas (
  code text primary key check (char_length(code) between 20 and 64),
  cart jsonb not null default '[]'::jsonb,
  saved jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cestas enable row level security;
revoke all on public.cestas from anon, authenticated;

create or replace function public.cesta_crear()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.cestas(code) values (c);
  return c;
end;
$$;

create or replace function public.cesta_leer(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('cart', cart, 'saved', saved, 'updated_at', updated_at)
  from public.cestas
  where code = p_code;
$$;

create or replace function public.cesta_op(p_code text, p_op jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.cestas;
  t text := p_op->>'t';
  k text := p_op->>'k';
  c jsonb;
  s jsonb;
begin
  select * into r from public.cestas where code = p_code for update;
  if not found then
    raise exception 'cesta_no_existe';
  end if;

  c := r.cart;
  s := r.saved;

  if t = 'add' then
    k := p_op->'item'->>'k';
    if k is null then
      raise exception 'item_sin_clave';
    end if;
    if exists (select 1 from jsonb_array_elements(c) e where e->>'k' = k) then
      select jsonb_agg(
               case when e->>'k' = k
                    then jsonb_set(e, '{q}', to_jsonb(round(((e->>'q')::numeric + coalesce((p_op->'item'->>'q')::numeric, 1)), 2)))
                    else e end
               order by ord)
        into c
        from jsonb_array_elements(c) with ordinality as x(e, ord);
    else
      c := c || jsonb_build_array(p_op->'item');
    end if;

  elsif t = 'qty' then
    if coalesce((p_op->>'q')::numeric, 0) <= 0 then
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
        into c
        from jsonb_array_elements(c) with ordinality as x(e, ord)
       where e->>'k' <> k;
    else
      select coalesce(jsonb_agg(case when e->>'k' = k then jsonb_set(e, '{q}', p_op->'q') else e end order by ord), '[]'::jsonb)
        into c
        from jsonb_array_elements(c) with ordinality as x(e, ord);
    end if;

  elsif t = 'done' then
    select coalesce(jsonb_agg(case when e->>'k' = k then jsonb_set(e, '{done}', coalesce(p_op->'v', 'false'::jsonb)) else e end order by ord), '[]'::jsonb)
      into c
      from jsonb_array_elements(c) with ordinality as x(e, ord);

  elsif t = 'del' then
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
      into c
      from jsonb_array_elements(c) with ordinality as x(e, ord)
     where e->>'k' <> k;

  elsif t = 'cart' then
    c := coalesce(p_op->'items', '[]'::jsonb);

  elsif t = 'saved' then
    s := coalesce(p_op->'items', '[]'::jsonb);

  else
    raise exception 'operacion_desconocida';
  end if;

  if jsonb_typeof(c) <> 'array' or jsonb_typeof(s) <> 'array' then
    raise exception 'formato_invalido';
  end if;

  if pg_column_size(c) > 400000 or pg_column_size(s) > 900000 then
    raise exception 'cesta_demasiado_grande';
  end if;

  update public.cestas
     set cart = c, saved = s, updated_at = now()
   where code = p_code
  returning * into r;

  return jsonb_build_object('cart', r.cart, 'saved', r.saved, 'updated_at', r.updated_at);
end;
$$;

create or replace function public.cesta_ping()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('ok', true, 'cestas', count(*), 'at', now()) from public.cestas;
$$;

revoke all on function public.cesta_ping() from public;
grant execute on function public.cesta_ping() to anon, authenticated;
revoke all on function public.cesta_crear() from public;
revoke all on function public.cesta_leer(text) from public;
revoke all on function public.cesta_op(text, jsonb) from public;
grant execute on function public.cesta_crear() to anon, authenticated;
grant execute on function public.cesta_leer(text) to anon, authenticated;
grant execute on function public.cesta_op(text, jsonb) to anon, authenticated;
