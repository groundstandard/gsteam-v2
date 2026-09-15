"""Take the full side copy of the live scoreboard that Bobby asked for.

> "Can you maybe clone this and just save this on the side?" — Bobby, September 14 [3:49:31]

No pg_dump on this machine and the Supabase CLI needs Docker, so the copy is taken through
Postgres itself: the schema is regenerated from the catalog by dump_schema.py, and every row of
every table is streamed out with COPY ... TO in CSV, gzipped as it goes. Auth is included —
without auth.users and auth.identities a restored clone has the data but nobody can log in.

Read-only against the source. Nothing here writes to the live database.

The output folder holds client records for all 90 accounts. It is not for git and not for
anywhere public.

Usage:  python scripts/dump_clone.py <source-db-url> <out-dir>
"""
import gzip
import json
import pathlib
import sys
from datetime import datetime, timezone

import psycopg

SRC = sys.argv[1]
OUT = pathlib.Path(sys.argv[2])

# Copied whole. auth.users carries a generated column (confirmed_at) that a restore must not
# try to write, so columns are recorded per table rather than assumed.
AUTH_TABLES = ["users", "identities", "mfa_factors", "sessions"]


def table_columns(cur, schema, table):
    cur.execute("""
        select column_name, is_generated
        from information_schema.columns
        where table_schema = %s and table_name = %s
        order by ordinal_position
    """, (schema, table))
    return [(c, g == "ALWAYS") for c, g in cur.fetchall()]


def dump_table(conn, schema, table, dest):
    """Stream one table out as gzipped CSV. Returns (columns, rows)."""
    with conn.cursor() as cur:
        spec = table_columns(cur, schema, table)
        cols = [c for c, generated in spec if not generated]
        if not cols:
            return [], 0
        collist = ", ".join(f'"{c}"' for c in cols)
        rows = 0
        dest.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(dest, "wb") as fh:
            with cur.copy(
                f'copy (select {collist} from "{schema}"."{table}") to stdout with (format csv)'
            ) as cp:
                for chunk in cp:
                    fh.write(chunk)
                    rows += bytes(chunk).count(b"\n")
    return cols, rows


def main():
    started = datetime.now(timezone.utc)
    manifest = {
        "source": SRC.split("@")[-1],
        "taken_at": started.isoformat(),
        "why": "Bobby, 2026-09-14 [3:49:31]: clone it, save it on the side.",
        "tables": [],
    }

    with psycopg.connect(SRC, connect_timeout=30) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute("select version()")
            manifest["postgres"] = cur.fetchone()[0].split(" on ")[0]

            # Ordinary tables only — views and matviews are rebuilt by the schema, not copied.
            cur.execute("""
                select c.relname
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                order by c.relname
            """)
            public_tables = [r[0] for r in cur.fetchall()]

        total = 0
        for t in public_tables:
            cols, rows = dump_table(conn, "public", t, OUT / "data" / f"public.{t}.csv.gz")
            manifest["tables"].append({"schema": "public", "table": t,
                                       "columns": cols, "rows": rows})
            total += rows
            print(f"  public.{t}: {rows} rows", flush=True)

        for t in AUTH_TABLES:
            try:
                cols, rows = dump_table(conn, "auth", t, OUT / "data" / f"auth.{t}.csv.gz")
            except psycopg.Error as exc:
                print(f"  auth.{t}: skipped — {str(exc).splitlines()[0][:60]}")
                conn.rollback()
                continue
            manifest["tables"].append({"schema": "auth", "table": t,
                                       "columns": cols, "rows": rows})
            total += rows
            print(f"  auth.{t}: {rows} rows", flush=True)

    manifest["total_rows"] = total
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    size = sum(p.stat().st_size for p in (OUT / "data").glob("*.gz"))
    print(f"\n{len(manifest['tables'])} tables, {total} rows, {size/1024/1024:.1f} MB compressed")
    print(f"written to {OUT}")


main()
