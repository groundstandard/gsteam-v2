"""Bring a dump made by dump_clone.py back to life on an empty Supabase project.

A backup nobody has ever restored is a guess, so this is written and kept next to the dump
rather than left as an exercise. It applies the schema, streams every CSV back in with COPY,
restores the realtime publication and resets the sequences.

Triggers and foreign keys are off during the load (`session_replication_role = replica`) —
otherwise the audit triggers would write thousands of rows describing the restore itself — and
every foreign key is validated afterwards, so nothing lands silently broken.

Usage:  python scripts/restore_clone.py <target-db-url> <dump-dir> [--commit]
        (dry run by default: it loads everything, reports, then rolls back)
"""
import gzip
import json
import pathlib
import subprocess
import sys

import psycopg

TARGET = sys.argv[1]
DUMP = pathlib.Path(sys.argv[2])
COMMIT = "--commit" in sys.argv
HERE = pathlib.Path(__file__).parent

manifest = json.loads((DUMP / "manifest.json").read_text(encoding="utf-8"))
extras_path = DUMP / "extras.json"
extras = json.loads(extras_path.read_text(encoding="utf-8")) if extras_path.exists() else {}

# Parents before children. Anything not named here follows in alphabetical order, which is safe
# because foreign keys are not enforced during the load.
ORDER = ["auth.users", "auth.identities", "auth.mfa_factors", "auth.sessions",
         "public.profiles", "public.cas", "public.sales_team", "public.clients",
         "public.cancel_reasons", "public.config", "public.ghl_config"]


def sort_key(entry):
    name = f"{entry['schema']}.{entry['table']}"
    return (ORDER.index(name) if name in ORDER else len(ORDER), name)


def main():
    if COMMIT:
        print("applying schema...")
        r = subprocess.run([sys.executable, str(HERE / "apply_sql.py"), TARGET,
                            str(DUMP / "schema.sql")], text=True)
        if r.returncode != 0:
            sys.exit("schema failed — stopping before any data is loaded")

    loaded = 0
    with psycopg.connect(TARGET, connect_timeout=30) as conn:
        with conn.cursor() as c:
            c.execute("set session_replication_role = 'replica'")

        for entry in sorted(manifest["tables"], key=sort_key):
            schema, table, cols = entry["schema"], entry["table"], entry["columns"]
            path = DUMP / "data" / f"{schema}.{table}.csv.gz"
            if not path.exists() or not cols or entry["rows"] == 0:
                continue
            collist = ", ".join(f'"{c}"' for c in cols)
            with conn.cursor() as c, gzip.open(path, "rb") as fh:
                with c.copy(f'copy "{schema}"."{table}" ({collist}) '
                            f"from stdin with (format csv)") as cp:
                    while chunk := fh.read(1 << 16):
                        cp.write(chunk)
            print(f"  {schema}.{table}: {entry['rows']} rows", flush=True)
            loaded += entry["rows"]

        with conn.cursor() as c:
            c.execute("set session_replication_role = 'origin'")

            for seq in extras.get("sequences", []):
                c.execute("select setval(%s, %s, true)",
                          (f'{seq["schema"]}.{seq["name"]}', seq["last_value"]))

            # Realtime is silent when it is missing — the calls board simply stops updating
            # for everyone else — so it is restored here rather than left to be noticed later.
            for pub, tables in extras.get("publications", {}).items():
                if pub != "supabase_realtime":
                    continue
                c.execute("select 1 from pg_publication where pubname = %s", (pub,))
                if not c.fetchone():
                    c.execute(f"create publication {pub}")
                for qualified in tables:
                    sch, tbl = qualified.split(".", 1)
                    c.execute("""select 1 from pg_publication_tables
                                 where pubname=%s and schemaname=%s and tablename=%s""",
                              (pub, sch, tbl))
                    if not c.fetchone():
                        c.execute(f'alter publication {pub} add table "{sch}"."{tbl}"')
                print(f"  realtime: {len(tables)} tables")

        if not COMMIT:
            conn.rollback()
            print(f"\ndry run — {loaded} rows would be restored. Pass --commit to write.")
            return

        conn.commit()
        print(f"\ncommitted {loaded} rows")

        with conn.cursor() as c:
            c.execute("""select conrelid::regclass::text, conname from pg_constraint
                         where contype='f' and connamespace='public'::regnamespace order by 1""")
            bad = []
            for rel, con in c.fetchall():
                try:
                    c.execute(f'alter table {rel} validate constraint "{con}"')
                except psycopg.Error as exc:
                    bad.append(f"{rel}.{con}: {str(exc).splitlines()[0]}")
            print("foreign keys valid" if not bad else "BROKEN:\n  " + "\n  ".join(bad))

    print("\nStill to do by hand on the restored project: deploy the two edge functions in "
          "functions/ and set verify_jwt true on both, then set the auth redirect URLs.")


main()
