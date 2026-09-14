"""Copy the roster from the live scoreboard into v2. Metrics are deliberately left behind.

Bobby, September 14: "I want the roster to stay. You can delete the data... I want to keep the
client tier... client sign date. If they canceled, then we want to know if they canceled. But
all of the data on this stuff doesn't need to be there." And: "we could take Dimitri out and
add Kurt and Mike, mike@groundstandard.com."

What travels: the 90 clients, the 13 cancellation reasons, the client associates, the sales
team record, app config, the weekly calls board, and the GoHighLevel settings. What stays
behind: every metric, check-in, review, growth event, edit request and audit row.

Two wrinkles the brief does not mention but the schema forces:

1. Logins live in auth.users, and public.profiles points at them. Bobby's and Kurt's users are
   copied with their original ids so every foreign key still lines up and their magic links
   keep working. Mike is created fresh.

2. Dimitri is removed as a user, but 13 clients record him as their AE through
   sales_team AM-01. Dropping that row would blank their AE, so the row is kept with its
   profile_id nulled: the history survives, the login does not.

The source connection is read-only. Nothing is written to the live database.

Usage:  python scripts/copy_roster.py <old-db-url> <new-db-url> [--commit]
"""
import sys
import uuid
import psycopg
from psycopg.types.json import Jsonb

OLD, NEW = sys.argv[1], sys.argv[2]
COMMIT = "--commit" in sys.argv

DROP_USER_EMAILS = {"dimitri@groundstandard.com"}
NEW_USERS = [("mike@groundstandard.com", "Mike Spyrou", "admin")]

# Copied in dependency order.
TABLES = [
    "cancel_reasons",
    "cas",
    "sales_team",
    "config",
    "clients",
    "call_statuses",
    "ghl_config",
]

# Columns pointing at a profile we did not carry over. Nulled so the row itself survives.
NULL_OUT = {
    "sales_team": ["profile_id"],
    "clients": ["created_by"],
    "config": ["updated_by"],
    "ghl_config": ["updated_by"],
}


def columns(cur, schema, table):
    # Generated columns are excluded: auth.users.confirmed_at is computed from the two
    # confirmation timestamps, and Postgres rejects any value written to it.
    cur.execute("""
        select column_name, data_type from information_schema.columns
        where table_schema=%s and table_name=%s and is_generated <> 'ALWAYS'
        order by ordinal_position
    """, (schema, table))
    return cur.fetchall()


def copy_rows(src, dst, schema, table, where="", params=(), null_cols=()):
    with src.cursor() as sc:
        spec = columns(sc, schema, table)
        if not spec:
            print(f"  {schema}.{table}: not in source, skipped")
            return 0
        cols = [c for c, _ in spec]
        # json and jsonb come back as dicts and lists, which psycopg will not send back
        # without being told they are json — a plain list would otherwise be read as an array.
        json_idx = [i for i, (_, t) in enumerate(spec) if t in ("json", "jsonb")]
        collist = ", ".join(f'"{c}"' for c in cols)
        sc.execute(f'select {collist} from {schema}."{table}" {where}', params)
        rows = sc.fetchall()

    idx = [cols.index(c) for c in null_cols if c in cols]
    if idx or json_idx:
        rows = [tuple(None if i in idx else (Jsonb(v) if i in json_idx and v is not None else v)
                      for i, v in enumerate(r)) for r in rows]

    if rows:
        placeholders = ", ".join(["%s"] * len(cols))
        with dst.cursor() as dc:
            dc.executemany(
                f'insert into {schema}."{table}" ({collist}) values ({placeholders}) '
                f"on conflict do nothing", rows)
    note = f" ({', '.join(null_cols)} nulled)" if idx else ""
    print(f"  {schema}.{table}: {len(rows)} rows{note}")
    return len(rows)


def main():
    with psycopg.connect(OLD, connect_timeout=30) as src, \
         psycopg.connect(NEW, connect_timeout=30) as dst:
        src.read_only = True
        total = 0

        print("logins")
        drop = tuple(DROP_USER_EMAILS)
        total += copy_rows(src, dst, "auth", "users",
                           "where email <> all(%s)", (list(drop),))
        with src.cursor() as sc:
            sc.execute("select id from auth.users where email <> all(%s)", (list(drop),))
            keep_ids = tuple(r[0] for r in sc.fetchall())
        total += copy_rows(src, dst, "auth", "identities",
                           "where user_id = any(%s)", (list(keep_ids),))
        total += copy_rows(src, dst, "public", "profiles",
                           "where email <> all(%s)", (list(drop),))

        # Mike has no account on the old project, so he is created rather than copied. An
        # email identity with no password is exactly what the magic-link flow expects.
        with dst.cursor() as dc:
            for email, display, role in NEW_USERS:
                dc.execute("select id from auth.users where email=%s", (email,))
                if dc.fetchone():
                    print(f"  {email}: already present")
                    continue
                uid = uuid.uuid4()
                dc.execute("""
                    insert into auth.users
                      (instance_id, id, aud, role, email, email_confirmed_at,
                       created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                       is_sso_user, is_anonymous)
                    values ('00000000-0000-0000-0000-000000000000', %s, 'authenticated',
                            'authenticated', %s, now(), now(), now(),
                            '{"provider":"email","providers":["email"]}'::jsonb,
                            %s::jsonb, false, false)
                """, (uid, email, f'{{"email":"{email}","email_verified":true}}'))
                dc.execute("""
                    insert into auth.identities
                      (provider_id, user_id, identity_data, provider, last_sign_in_at,
                       created_at, updated_at)
                    values (%s, %s, %s::jsonb, 'email', null, now(), now())
                """, (str(uid), uid,
                      f'{{"sub":"{uid}","email":"{email}","email_verified":true}}'))
                dc.execute("""
                    insert into public.profiles (id, email, display_name, role, active, created_at)
                    values (%s, %s, %s, %s, true, now())
                """, (uid, email, display, role))
                print(f"  {email}: created as {role}")
                total += 1

        print("roster")
        for table in TABLES:
            total += copy_rows(src, dst, "public", table,
                               null_cols=NULL_OUT.get(table, ()))

        if COMMIT:
            dst.commit()
            print(f"committed, {total} rows")
        else:
            dst.rollback()
            print(f"dry run — {total} rows would be written. Pass --commit to write.")


main()
