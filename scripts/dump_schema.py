"""Reconstruct the public schema as SQL, straight from the Postgres catalog.

The Supabase CLI's `db dump` needs Docker, which this machine does not have. Postgres can
describe itself, though: pg_get_constraintdef, pg_get_indexdef, pg_get_functiondef and
pg_get_triggerdef each return the exact source text, so the output below is generated rather
than guessed. Read-only — this never writes to the source database.

Usage:  python scripts/dump_schema.py <source-db-url> <out.sql>
"""
import sys
import psycopg

SRC, OUT = sys.argv[1], sys.argv[2]
parts = []


def w(s=""):
    parts.append(s)


with psycopg.connect(SRC, connect_timeout=30) as conn, conn.cursor() as cur:
    w("-- GS Team schema, generated from the live database by scripts/dump_schema.py")
    cur.execute("select now()")
    w(f"-- generated {cur.fetchone()[0]}")
    w("\nset search_path = public, extensions;\n")

    # 0. Extensions. A column defaulting to uuid_generate_v4() fails on a fresh project unless
    #    uuid-ossp is installed first; Supabase ships these but does not enable them all.
    cur.execute("""
        select e.extname, n.nspname
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        where e.extname not in ('plpgsql')
        order by e.extname
    """)
    exts = cur.fetchall()
    if exts:
        w("-- extensions")
        for name, schema in exts:
            w(f'create extension if not exists "{name}" with schema {schema};')
        w()

    # 1. Enums and other custom types, before anything that uses them.
    cur.execute("""
        select t.typname, array_agg(e.enumlabel order by e.enumsortorder)
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname order by t.typname
    """)
    types = cur.fetchall()
    if types:
        w("-- types")
        for name, labels in types:
            vals = ", ".join("'" + l.replace("'", "''") + "'" for l in labels)
            w(f"create type public.{name} as enum ({vals});")
        w()

    # 1b. Sequences, before the tables whose defaults call nextval() on them. Identity columns
    #     carry their own sequence and are excluded, or the create below would collide.
    cur.execute("""
        select s.sequencename, s.data_type, s.start_value, s.increment_by, s.min_value, s.max_value
        from pg_sequences s
        where s.schemaname = 'public'
          and not exists (
            select 1 from pg_depend d
            join pg_class c on c.oid = d.objid and c.relname = s.sequencename
            where d.deptype = 'i')
        order by s.sequencename
    """)
    seqs = cur.fetchall()
    if seqs:
        w("-- sequences")
        for name, dtype, start, inc, minv, maxv in seqs:
            w(f"create sequence if not exists public.{name} as {dtype} "
              f"start with {start} increment by {inc} minvalue {minv} maxvalue {maxv};")
        w()

    # 2. Tables and columns. Defaults come through verbatim, which keeps gen_random_uuid(),
    #    now() and nextval() sequences intact.
    cur.execute("""
        select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname
    """)
    tables = [r[0] for r in cur.fetchall()]

    w("-- tables")
    for t in tables:
        cur.execute("""
            select column_name, data_type, udt_name, character_maximum_length,
                   numeric_precision, numeric_scale, is_nullable, column_default,
                   is_identity, identity_generation
            from information_schema.columns
            where table_schema='public' and table_name=%s
            order by ordinal_position
        """, (t,))
        cols = []
        for (name, dtype, udt, clen, nprec, nscale, nullable, default,
             is_identity, identity_gen) in cur.fetchall():
            if dtype == "USER-DEFINED":
                typ = f"public.{udt}"
            elif dtype == "ARRAY":
                typ = udt.lstrip("_") + "[]"
            elif dtype == "character varying" and clen:
                typ = f"varchar({clen})"
            elif dtype == "numeric" and nprec:
                typ = f"numeric({nprec},{nscale or 0})"
            elif dtype == "timestamp with time zone":
                typ = "timestamptz"
            elif dtype == "timestamp without time zone":
                typ = "timestamp"
            else:
                typ = dtype
            line = f'  "{name}" {typ}'
            if is_identity == "YES":
                line += f" generated {identity_gen.lower()} as identity"
            elif default is not None:
                line += f" default {default}"
            if nullable == "NO":
                line += " not null"
            cols.append(line)
        w(f'create table public."{t}" (')
        w(",\n".join(cols))
        w(");")
    w()

    # 3. Constraints. Primary keys first so foreign keys can reference them.
    w("-- constraints")
    for kind in ("p", "u", "c", "f"):
        cur.execute("""
            select rel.relname, con.conname, pg_get_constraintdef(con.oid)
            from pg_constraint con
            join pg_class rel on rel.oid = con.conrelid
            join pg_namespace n on n.oid = rel.relnamespace
            where n.nspname='public' and con.contype=%s
            order by rel.relname, con.conname
        """, (kind,))
        for table, name, definition in cur.fetchall():
            w(f'alter table public."{table}" add constraint "{name}" {definition};')
    w()

    # 4. Indexes that are not already implied by a constraint.
    cur.execute("""
        select indexdef from pg_indexes
        where schemaname='public'
          and indexname not in (
            select con.conname from pg_constraint con
            join pg_class rel on rel.oid = con.conrelid
            join pg_namespace n on n.oid = rel.relnamespace
            where n.nspname='public')
        order by tablename, indexname
    """)
    # Collected here, written after the materialized views — one of these indexes sits on a
    # matview, which has to exist first.
    idx = [r[0] for r in cur.fetchall()]

    # 5. Views.
    cur.execute("""
        select c.relname, pg_get_viewdef(c.oid, true)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relkind='v' order by c.relname
    """)
    views = cur.fetchall()
    if views:
        w("-- views")
        for name, definition in views:
            w(f"create or replace view public.{name} as\n{definition}\n")

    # 5b. Materialized views. Easy to miss — relkind is 'm', not 'v' — and the app has one,
    #     v_client_sub_scores, which a function selects from.
    cur.execute("""
        select c.relname, pg_get_viewdef(c.oid, true)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relkind='m' order by c.relname
    """)
    matviews = cur.fetchall()
    if matviews:
        w("-- materialized views")
        for name, definition in matviews:
            w(f"create materialized view public.{name} as\n{definition}\n")

    if idx:
        w("-- indexes")
        for d in idx:
            w(d + ";")
        w()

    # 6. Functions. After the views: a SQL-language function body is parsed at creation,
    #    so a function selecting from a view fails if the view is not there yet.
    cur.execute("""
        select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.prokind in ('f','p')
        order by p.proname
    """)
    fns = [r[0] for r in cur.fetchall()]
    if fns:
        w("-- functions")
        for d in fns:
            w(d + ";\n")

    # 7. Triggers.
    cur.execute("""
        select pg_get_triggerdef(tg.oid)
        from pg_trigger tg
        join pg_class rel on rel.oid = tg.tgrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname='public' and not tg.tgisinternal
        order by rel.relname, tg.tgname
    """)
    trg = [r[0] for r in cur.fetchall()]
    if trg:
        w("-- triggers")
        for d in trg:
            w(d + ";")
        w()

    # 8. Row level security: the enable flag, then every policy.
    cur.execute("""
        select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relrowsecurity order by c.relname
    """)
    rls = [r[0] for r in cur.fetchall()]
    if rls:
        w("-- row level security")
        for t in rls:
            w(f'alter table public."{t}" enable row level security;')
        w()

    cur.execute("""
        select tablename, policyname, permissive, roles, cmd, qual, with_check
        from pg_policies where schemaname='public'
        order by tablename, policyname
    """)
    pols = cur.fetchall()
    if pols:
        w("-- policies")
        for table, name, permissive, roles, cmd, qual, check in pols:
            sql = f'create policy "{name}" on public."{table}"'
            if permissive and permissive.upper() != "PERMISSIVE":
                sql += " as restrictive"
            sql += f" for {cmd.lower()}"
            if roles:
                sql += " to " + ", ".join(roles)
            if qual:
                sql += f" using ({qual})"
            if check:
                sql += f" with check ({check})"
            w(sql + ";")
        w()

    # 9. Grants on tables, so anon/authenticated keep the access the app expects.
    cur.execute("""
        select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type)
        from information_schema.role_table_grants
        where table_schema='public' and grantee in ('anon','authenticated','service_role')
        group by table_name, grantee order by table_name, grantee
    """)
    grants = cur.fetchall()
    if grants:
        w("-- grants")
        for table, grantee, privs in grants:
            w(f'grant {privs.lower()} on public."{table}" to {grantee};')
        w()

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

print(f"wrote {OUT}: {len(parts)} lines, {len(tables)} tables, {len(pols)} policies, "
      f"{len(fns)} functions, {len(trg)} triggers")
