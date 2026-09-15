"""Ask Postgres, as each person, what it will actually let them do.

Policies are easy to read and easy to be wrong about. This does not read them —
it runs statements as the `authenticated` role carrying each person's uid in the
JWT claims, exactly as their session would, and reports what came back.

Nothing survives: the whole thing runs in one transaction that is rolled back,
staged rows and audit entries included.

It found two real holes the first time it ran. The calls board asked only whether
the caller was logged in, not whether they were on the scoreboard — and signups
were open, so anyone could get a login. Both are fixed; this is here so the next
change to a policy has to answer to it.

Usage:  python scripts/check_access.py <db-url>
"""
import json
import sys

import psycopg

DB = sys.argv[1]

# Reading these from profiles rather than hard-coding them, so the check follows
# the roster instead of going stale the day someone is added or removed.
ROLES_WANTED = ("owner", "admin", "ca")
NOBODY = "00000000-0000-0000-0000-000000000000"


def as_user(cur, uid):
    cur.execute("select set_config('request.jwt.claims', %s, true)",
                (json.dumps({"sub": str(uid), "role": "authenticated"}),))
    cur.execute("set local role authenticated")


def main():
    failures = []

    with psycopg.connect(DB, connect_timeout=30) as cn:
        cn.autocommit = False
        c = cn.cursor()

        c.execute("select id, email, role, ca_id from profiles order by role")
        people = {r[2]: r for r in c.fetchall()}
        missing = [r for r in ROLES_WANTED if r not in people]
        if missing:
            print(f"no {', '.join(missing)} on this scoreboard — that part of the check cannot run")

        ca = people.get("ca")
        admin = people.get("admin") or people.get("owner")

        def run(label, uid, sql, args, expect):
            c.execute("reset role")
            as_user(c, uid)
            c.execute(sql, args)
            got = c.rowcount if sql.strip().lower().startswith("update") else c.fetchone()[0]
            ok = got == expect
            if not ok:
                failures.append(label)
            print(f"  {'ok  ' if ok else 'FAIL'} {label:48} {got}")

        if ca and admin:
            # There is one CA, so a second book has to be staged to test against.
            # The row is cloned from the real one rather than invented, so every
            # not-null column is satisfied without guessing.
            c.execute("select string_agg(quote_ident(column_name), ',' order by ordinal_position) "
                      "from information_schema.columns where table_schema='public' and table_name='cas'")
            cols = c.fetchone()[0].split(",")
            rest = ",".join(x for x in cols if x not in ("id", "profile_id", "email"))
            c.execute(f"""insert into cas (id, profile_id, email, {rest})
                          select 'CA-CHECK', null, 'check@example.invalid', {rest}
                          from cas where id = %s""", (ca[3],))
            c.execute("select id from monthly_metrics where ca_id = %s limit 2", (ca[3],))
            rows = c.fetchall()
            if len(rows) < 2:
                print("not enough metrics rows to stage a second book")
            else:
                theirs, staged = rows[0][0], rows[1][0]
                c.execute("update monthly_metrics set ca_id = 'CA-CHECK' where id = %s", (staged,))

                print(f"\n{ca[1]} is a {ca[2]}, book {ca[3]}:")
                run("edits a row in their own book", ca[0],
                    "update monthly_metrics set leads_generated = leads_generated where id = %s",
                    (theirs,), 1)
                run("edits a row in another CA's book", ca[0],
                    "update monthly_metrics set leads_generated = leads_generated where id = %s",
                    (staged,), 0)
                run("can even see that other row", ca[0],
                    "select count(*) from monthly_metrics where id = %s", (staged,), 0)

                print(f"\n{admin[1]} is {admin[2]}:")
                run("edits that same other-CA row", admin[0],
                    "update monthly_metrics set leads_generated = leads_generated where id = %s",
                    (staged,), 1)

        print("\nSomeone with a login but no profile on the scoreboard:")
        run("reads the roster", NOBODY, "select count(*) from clients", (), 0)
        run("reads any metrics", NOBODY, "select count(*) from monthly_metrics", (), 0)
        run("reads the calls board", NOBODY, "select count(*) from call_statuses", (), 0)
        run("edits a note on the calls board", NOBODY,
            "update call_statuses set note = 'x' where id = (select id from call_statuses limit 1)", (), 0)
        run("reads the leads", NOBODY, "select count(*) from leads", (), 0)

        if ca:
            print(f"\n{ca[1]} on the shared surfaces:")
            c.execute("reset role")
            c.execute("select count(*) from call_statuses")
            total = c.fetchone()[0]
            run("reads the calls board", ca[0], "select count(*) from call_statuses", (), total)
            run("sets a note on it", ca[0],
                "update call_statuses set note = note where id = (select id from call_statuses limit 1)",
                (), 1)

        c.execute("reset role")
        cn.rollback()

    print("\nrolled back — nothing staged survives")
    print("all checks passed" if not failures
          else f"{len(failures)} FAILED: {', '.join(failures)}")
    sys.exit(1 if failures else 0)


main()
