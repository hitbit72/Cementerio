-- =====================================================================
-- ESQUEMA: Gestión Cementerio (Jimena)
-- Motor: PostgreSQL / Supabase
-- =====================================================================
-- Cómo usarlo:
--   1. Supabase > SQL Editor > pegar este script completo > Run
--   2. Registra tu primer usuario desde la app (Supabase Auth)
--   3. Ejecuta manualmente:
--        update public.profiles set role = 'admin' where email = 'tu_email@ejemplo.com';
--      para convertirte en admin (todos los usuarios nuevos entran como 'consulta')
--
-- NOTA SOBRE LOS IDs:
--   Las tablas de datos (poblacion, provincia, sector, nichos, propietario,
--   difunto, relacion, recibos) usan VARCHAR(50) en vez de UUID nativo.
--   Esto te permite, al importar tus datos del Excel, asignar tú mismo el
--   id (p.ej. reutilizar un código antiguo) en vez de que sea obligatoriamente
--   un UUID generado. Si no indicas un id al insertar, se autogenera un UUID
--   como texto igualmente.
--   La tabla `profiles` SÍ mantiene UUID nativo porque está obligatoriamente
--   ligada a auth.users(id), que Supabase gestiona como UUID.
-- =====================================================================

create extension if not exists "uuid-ossp";

-- =====================================================================
-- 1. TIPOS
-- =====================================================================

create type app_role as enum ('admin', 'avanzado', 'consulta');
create type sector_tipo as enum ('Nicho', 'Tumba');
create type nicho_estado as enum ('Ocupado', 'Vacio', 'Reservado');
create type recibo_estado as enum ('Pagado', 'Pendiente', 'Anulado');

-- =====================================================================
-- 2. PERFILES DE USUARIO (vincula auth.users con un rol de la app)
--    Se mantiene en UUID: debe coincidir con auth.users(id)
-- =====================================================================

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nombre     text,
  role       app_role not null default 'consulta',
  created_at timestamptz not null default now()
);

-- Crea automáticamente un perfil (rol 'consulta') cuando alguien se registra
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: ¿el usuario autenticado actual es admin?
create function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: ¿el usuario autenticado es 'admin' o 'avanzado'?
-- (mismos privilegios de escritura que admin, salvo usuarios y alta/baja de sectores)
create function public.is_admin_or_avanzado()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'avanzado')
  );
$$;

-- =====================================================================
-- 3. AUDITORÍA AUTOMÁTICA (columnas + trigger reutilizable)
--    cusuario/musuario siguen en UUID porque referencian a profiles(id)
-- =====================================================================

create function public.set_audit_fields()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    new.fcreado := now();
    new.cusuario := auth.uid();
  end if;
  new.fmodificado := now();
  new.musuario := auth.uid();
  return new;
end;
$$;

-- =====================================================================
-- 4. CATÁLOGOS
-- =====================================================================

create table public.poblacion (
  id     varchar(50) primary key default uuid_generate_v4()::text,
  nombre text not null unique
);

create table public.provincia (
  id     varchar(50) primary key default uuid_generate_v4()::text,
  nombre text not null unique
);

-- =====================================================================
-- 5. SECTOR
-- =====================================================================

create table public.sector (
  id            varchar(50) primary key default uuid_generate_v4()::text,
  nombre        text not null,
  filas         int not null default 0,
  columnas      int not null default 0,
  inicio        int not null default 1,
  orden         int not null default 0,
  tipo          sector_tipo not null default 'Nicho',
  situacion     text,
  plano_img     text,          -- ruta en Supabase Storage
  observaciones text,
  fcreado       timestamptz,
  cusuario      uuid references public.profiles(id),
  fmodificado   timestamptz,
  musuario      uuid references public.profiles(id)
);

create trigger sector_audit
  before insert or update on public.sector
  for each row execute function public.set_audit_fields();

-- =====================================================================
-- 6. NICHOS (unidades individuales dentro de un sector)
-- =====================================================================

create table public.nichos (
  id            varchar(50) primary key default uuid_generate_v4()::text,
  numero_nicho  int not null,
  sector_id     varchar(50) not null references public.sector(id) on delete cascade,
  -- `estado` se recalcula automáticamente (ver trigger sync_nicho_estado más abajo)
  -- a partir de si el nicho tiene o no difuntos asignados. 'Reservado' es la
  -- única excepción: es una decisión manual, no derivada, y el trigger no la toca.
  estado        nicho_estado,
  observaciones text,
  unique (sector_id, numero_nicho)
);

create index idx_nichos_sector on public.nichos(sector_id);

-- =====================================================================
-- 7. PROPIETARIO (titulares / familiares responsables)
-- =====================================================================

create table public.propietario (
  id            varchar(50) primary key default uuid_generate_v4()::text,
  nombre        text not null,
  apellidos     text,
  mote          text,
  dni           text,
  direccion     text,
  telefono      text,
  poblacion_id  varchar(50) references public.poblacion(id),
  provincia_id  varchar(50) references public.provincia(id),
  cp            text,
  email         text,
  observaciones text,
  fcreado       timestamptz,
  cusuario      uuid references public.profiles(id),
  fmodificado   timestamptz,
  musuario      uuid references public.profiles(id)
);

create trigger propietario_audit
  before insert or update on public.propietario
  for each row execute function public.set_audit_fields();

create index idx_propietario_dni on public.propietario(dni);

-- =====================================================================
-- 8. DIFUNTO
-- =====================================================================

create table public.difunto (
  id            varchar(50) primary key default uuid_generate_v4()::text,
  num_registro  text,
  nombre        text not null,
  apellidos     text,
  fnacido       date,
  ffallecido    date,
  -- Edad introducida manualmente por el usuario (ya no se calcula):
  -- en muchos registros se conoce la edad y la fecha de fallecimiento,
  -- pero no la de nacimiento, y no compensa exigirla solo para derivar la edad.
  edad          int,
  causa         text,
  direccion     text,
  poblacion_id  varchar(50) references public.poblacion(id),
  nicho_id      varchar(50) references public.nichos(id),
  observaciones text,
  fmodificado   timestamptz,
  musuario      uuid references public.profiles(id)
);

create trigger difunto_audit
  before insert or update on public.difunto
  for each row execute function public.set_audit_fields();

create index idx_difunto_nicho on public.difunto(nicho_id);
create index idx_difunto_apellidos on public.difunto(apellidos);

-- ---------------------------------------------------------------------
-- Sincronización automática de nichos.estado a partir de los difuntos
-- asignados (alta / baja / traslado de nicho). 'Reservado' es la única
-- excepción: no se deriva, así que el trigger nunca lo pisa.
-- ---------------------------------------------------------------------

create function public.sync_nicho_estado(p_nicho_id varchar)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_nicho_id is null then
    return;
  end if;

  update public.nichos
  set estado = (case
    when (select count(*) from public.difunto where nicho_id = p_nicho_id) > 0 then 'Ocupado'
    else 'Vacio'
  end)::nicho_estado
  where id = p_nicho_id;
end;
$$;

create function public.trg_difunto_sync_nicho()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.sync_nicho_estado(new.nicho_id);
  elsif TG_OP = 'UPDATE' then
    if new.nicho_id is distinct from old.nicho_id then
      perform public.sync_nicho_estado(old.nicho_id);
      perform public.sync_nicho_estado(new.nicho_id);
    end if;
  elsif TG_OP = 'DELETE' then
    perform public.sync_nicho_estado(old.nicho_id);
  end if;
  return null;
end;
$$;

create trigger difunto_sync_nicho_estado
  after insert or delete or update of nicho_id on public.difunto
  for each row execute function public.trg_difunto_sync_nicho();

-- =====================================================================
-- 9. RELACION (Difunto <-> Propietario/Familiar)
-- =====================================================================

create table public.relacion (
  id            varchar(50) primary key default uuid_generate_v4()::text,
  difunto_id    varchar(50) not null references public.difunto(id) on delete cascade,
  familiar_id   varchar(50) not null references public.propietario(id) on delete cascade,
  relacion      text,          -- p.ej. 'Hijo(a)', 'Nieto(a)'
  observaciones text,
  unique (difunto_id, familiar_id)
);

create index idx_relacion_difunto on public.relacion(difunto_id);
create index idx_relacion_familiar on public.relacion(familiar_id);

-- =====================================================================
-- 10. RECIBOS
-- =====================================================================

create table public.recibos (
  id             varchar(50) primary key default uuid_generate_v4()::text,
  propietario_id varchar(50) references public.propietario(id),
  fecha          date not null default current_date,
  expediente     text,
  docnum         text,
  mutua          text,
  referencia     text,
  entidad        text,
  importe        numeric(10,2) not null default 0,
  nicho_id       varchar(50) references public.nichos(id),
  fecha_pago     date,
  estado         recibo_estado not null default 'Pendiente',
  observaciones  text,
  fcreado        timestamptz,
  cusuario       uuid references public.profiles(id),
  fmodificado    timestamptz,
  musuario       uuid references public.profiles(id)
);

create trigger recibos_audit
  before insert or update on public.recibos
  for each row execute function public.set_audit_fields();

create index idx_recibos_propietario on public.recibos(propietario_id);
create index idx_recibos_nicho on public.recibos(nicho_id);

-- =====================================================================
-- 11. ROW LEVEL SECURITY
--     Regla general: cualquier usuario autenticado (admin, avanzado o
--     consulta) lee. 'admin' y 'avanzado' insertan/actualizan/borran en
--     casi todo, salvo dos excepciones:
--       - `profiles` (usuarios/roles): solo 'admin'
--       - `sector`: crear/borrar solo 'admin' ('avanzado' sí puede editar)
-- =====================================================================

alter table public.profiles     enable row level security;
alter table public.poblacion    enable row level security;
alter table public.provincia    enable row level security;
alter table public.sector       enable row level security;
alter table public.nichos       enable row level security;
alter table public.propietario  enable row level security;
alter table public.difunto      enable row level security;
alter table public.relacion     enable row level security;
alter table public.recibos      enable row level security;

-- profiles: cada uno ve su propio perfil; solo 'admin' ve/gestiona todos
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin());

-- Plantilla de políticas repetida para cada tabla de datos (sector aparte, ver abajo)
do $$
declare
  t text;
begin
  foreach t in array array['poblacion','provincia','nichos','propietario','difunto','relacion','recibos']
  loop
    execute format('create policy "%s_select_all" on public.%s for select to authenticated using (true);', t, t);
    execute format('create policy "%s_insert_admin" on public.%s for insert to authenticated with check (public.is_admin_or_avanzado());', t, t);
    execute format('create policy "%s_update_admin" on public.%s for update to authenticated using (public.is_admin_or_avanzado());', t, t);
    execute format('create policy "%s_delete_admin" on public.%s for delete to authenticated using (public.is_admin_or_avanzado());', t, t);
  end loop;
end $$;

-- Sector: todos leen; 'admin' y 'avanzado' editan; solo 'admin' crea o borra
create policy "sector_select_all" on public.sector
  for select to authenticated using (true);

create policy "sector_insert_admin" on public.sector
  for insert to authenticated with check (public.is_admin());

create policy "sector_update_admin" on public.sector
  for update to authenticated using (public.is_admin_or_avanzado());

create policy "sector_delete_admin" on public.sector
  for delete to authenticated using (public.is_admin());

-- =====================================================================
-- 12. VISTA AGREGADA DE SECTORES (evita el límite de 1000 filas)
--     La sección "Sectores" de la app pide los conteos ya calculados
--     aquí (una fila por sector), y solo consulta los nichos/difuntos de
--     UN sector concreto al abrir su ficha — nunca todo el cementerio
--     de golpe.
-- =====================================================================

create or replace view public.v_sector_resumen
with (security_invoker = true)
as
select
    s.id,
    s.nombre,
    s.filas,
    s.columnas,
    s.orden,
    s.inicio,
    s.tipo,
    s.situacion,
    s.plano_img,
    s.observaciones,
    count(n.id) as total_nichos,
    count(n.id) filter (where n.estado = 'Ocupado')  as nichos_ocupados,
    count(n.id) filter (where n.estado = 'Vacio')     as nichos_vacios,
    count(n.id) filter (where n.estado = 'Reservado') as nichos_reservados
from public.sector s
left join public.nichos n
    on n.sector_id = s.id
group by
    s.id, s.nombre, s.filas, s.columnas, s.orden, s.inicio,
    s.tipo, s.situacion, s.plano_img, s.observaciones
order by s.nombre;

grant select on public.v_sector_resumen to authenticated;

-- =====================================================================
-- 13. VISTA DE RECIBOS CON PROPIETARIO/NICHO/SECTOR APLANADOS
--     Permite a la app buscar y filtrar en una sola consulta por nombre,
--     apellidos, apodo o DNI del propietario, y por el nombre/id del
--     sector — datos que viven en tablas relacionadas y no serían
--     buscables directamente sobre `recibos`.
-- =====================================================================

create or replace view public.v_recibos_resumen
with (security_invoker = true)
as
select
    r.id,
    r.fecha,
    r.expediente,
    r.docnum,
    r.mutua,
    r.referencia,
    r.entidad,
    r.importe,
    r.fecha_pago,
    r.estado,
    r.nicho_id,
    r.propietario_id,
    r.observaciones,
    p.nombre      as nombre_p,
    p.apellidos   as apellido_p,
    p.mote        as mote_p,
    p.dni         as dni_p,
    n.numero_nicho as nicho,
    s.id          as sector_id,
    s.nombre      as sector
from public.recibos r
left join public.propietario p
    on p.id = r.propietario_id
left join public.nichos n
    on n.id = r.nicho_id
left join public.sector s
    on s.id = n.sector_id;

grant select on public.v_recibos_resumen to authenticated;

-- =====================================================================
-- 14. VISTA DE ASOCIADOS (relación difunto ↔ familiar) CON NICHO/SECTOR
--     Permite mostrar en la ficha de un propietario, junto a cada difunto
--     asociado, su nicho y sector (p.ej. "Sector 3 Nº45") sin tener que
--     hacer una consulta aparte para cada uno.
-- =====================================================================

create or replace view public.v_asociados_resumen
with (security_invoker = true)
as
select
    r.id,
    r.relacion,
    r.difunto_id,
    r.familiar_id,
    r.observaciones,
    d.nombre        as nombre_d,
    d.apellidos     as apellidos_d,
    d.num_registro  as num_registro_d,
    d.ffallecido    as fallecido_d,
    d.edad          as edad_d,
    d.nicho_id      as nicho_id,
    n.numero_nicho,
    n.sector_id,
    s.nombre        as sector_nombre
from public.relacion r
left join public.difunto d
    on d.id = r.difunto_id
left join public.nichos n
    on n.id = d.nicho_id
left join public.sector s
    on s.id = n.sector_id;

grant select on public.v_asociados_resumen to authenticated;

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
