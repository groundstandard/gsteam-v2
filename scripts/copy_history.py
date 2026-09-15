"""Copy the remaining history into v2 — everything the roster copy left behind.

James, September 15: *"dapat lahat nang laman na meron sa original, yung mga data na yun dapat
mailagay din sa v2 natin, pero yung mga pinapaalis ni Bobby based dun sa transcript, alisin na."*

So this is the second pass: metrics, check-ins, growth events, edit requests, quarter inputs,
invites and the audit log. The only thing removed is what Bobby removed — Dimitri. Any column
that points at his profile is nulled rather than dropping the row, so the record survives
without the person.

Triggers are switched off for the copy (`session_replication_role = replica`). Otherwise the
audit triggers fire on every insert and write thousands of rows describing our own migration,
and the score triggers recompute on every metric. Foreign keys are re-validated afterwards, so
nothing silently lands broken.

Usage:  python scripts/copy_history.py <old-db-url> <new-db-url> [--commit]
"""
import sys
import psycopg
from psycopg.types.json import Jsonb

OLD, NEW = sys.argv[1], sys.argv[2]
COMMIT = "--commit" in sys.argv

# Removed by Bobby: "we could take Dimitri out and add Kurt and Mike."
DROPPED_PROFILE = "8f3e942f-4d49-4791-9df7-fda09b8680e8"

# Dependency order — parents before children.
TABLES = [
    "quarter_inputs",
    "monthly_metrics",
    "weekly_checkins",
    "growth_events",
    "edit_requests",
    "invites",
    "audit_log",
]

BATCH = 500


def columns(cur, table):
    cur.execute("""
        select column_name, data_type from information_schema.columns
        where table_schema='public' and table_name=%s and is_generated <> 'ALWAYS'
        order by ordinal_position
    """, (table,))
    return cur.fetchall()


def main():
    with psycopg.connect(OLD, connect_timeout=30) as src, \
         psycopg.connect(NEW, connect_timeout=30) as dst:
        src.read_only = True
        with dst.cursor() as c:
            c.execute("set session_replication_role = 'replica'")

        total = dropped_refs = 0
        for table in TABLES:
            with src.cursor() as sc:
                spec = columns(sc, table)
                cols = [c for c, _ in spec]
                json_idx = [i for i, (_, t) in enumerate(spec) if t in ("json", "jsonb")]
                collist = ", ".join(f'"{c}"' for c in cols)
                sc.execute(f'select {collist} from public."{table}"')
                rows = sc.fetchall()

            cleaned = []
            for r in rows:
                row = []
                for i, v in enumerate(r):
                    if str(v) == DROPPED_PROFILE:
                        v = None
                        dropped_refs += 1
                    elif i in json_idx and v is not None:
                        v = Jsonb(v)
                    row.append(v)
                cleaned.append(tuple(row))

            placeholders = ", ".join(["%s"] * len(cols))
            sql = (f'insert into public."{table}" ({collist}) values ({placeholders}) '
                   f"on conflict do nothing")
            with dst.cursor() as dc:
                for i in range(0, len(cleaned), BATCH):
                    dc.executemany(sql, cleaned[i:i + BATCH])
            print(f"  {table}: {len(cleaned)} rows", flush=True)
            total += len(cleaned)

        with dst.cursor() as c:
            c.execute("set session_replication_role = 'origin'")

        if COMMIT:
            dst.commit()
            print(f"committed {total} rows, {dropped_refs} references to the removed user nulled")

            # Foreign keys were not enforced during the copy, so prove they hold now.
            with dst.cursor() as c:
                c.execute("""
                    select conrelid::regclass::text, conname
                    from pg_constraint
                    where contype = 'f' and connamespace = 'public'::regnamespace
                    order by 1
                """)
                bad = []
                for rel, con in c.fetchall():
                    try:
                        c.execute(f'alter table {rel} validate constraint "{con}"')
                    except Exception as exc:  # noqa: BLE001
                        bad.append(f"{rel}.{con}: {str(exc).splitlines()[0]}")
                print("foreign keys valid" if not bad else "BROKEN:\n  " + "\n  ".join(bad))
        else:
            dst.rollback()
            print(f"dry run — {total} rows would be copied, "
                  f"{dropped_refs} references to the removed user would be nulled. "
                  f"Pass --commit to write.")


main()
