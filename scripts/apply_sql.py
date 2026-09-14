"""Apply a .sql file statement by statement, retrying until the order sorts itself out.

The schema has a genuine cycle: the materialized view v_client_sub_scores selects from the
function fn_client_sub_scores, and another function selects from that matview. No single
ordering satisfies both, so instead of ordering perfectly we run the file repeatedly — each
pass creates whatever its dependencies now allow — and stop when a pass creates nothing new.
Anything still failing after that is a real error, not an ordering one, and is printed.

Statements are split on semicolons outside of string literals and dollar-quoted bodies, so a
function body containing semicolons stays in one piece.

Usage:  python scripts/apply_sql.py <target-db-url> <file.sql> [--dry-run]
"""
import re
import sys
import psycopg

DB, PATH = sys.argv[1], sys.argv[2]
DRY = "--dry-run" in sys.argv


def split_statements(sql: str):
    stmts, buf, i, n = [], [], 0, len(sql)
    in_single = in_double = in_line_comment = in_block_comment = False
    dollar_tag = None
    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""

        if in_line_comment:
            buf.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            buf.append(ch)
            if ch == "*" and nxt == "/":
                buf.append(nxt); i += 2; in_block_comment = False
                continue
            i += 1
            continue
        if dollar_tag:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag); i += len(dollar_tag); dollar_tag = None
                continue
            buf.append(ch); i += 1
            continue
        if in_single:
            buf.append(ch)
            if ch == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            buf.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == "-" and nxt == "-":
            in_line_comment = True; buf.append(ch); i += 1; continue
        if ch == "/" and nxt == "*":
            in_block_comment = True; buf.append(ch); i += 1; continue
        if ch == "'":
            in_single = True; buf.append(ch); i += 1; continue
        if ch == '"':
            in_double = True; buf.append(ch); i += 1; continue
        m = re.match(r"\$[A-Za-z_]*\$", sql[i:])
        if m:
            dollar_tag = m.group(0); buf.append(dollar_tag); i += len(dollar_tag); continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []; i += 1; continue

        buf.append(ch); i += 1

    tail = "".join(buf).strip()
    if tail:
        stmts.append(tail)

    # Drop comment-only chunks — the header block above the first statement, mostly. Checked
    # line by line on purpose: the obvious regex, (--[^\n]*\n?)+, backtracks exponentially on
    # a long comment block and hangs before it ever reaches the database.
    def comment_only(stmt: str) -> bool:
        return all(not line.strip() or line.lstrip().startswith("--")
                   for line in stmt.splitlines())

    return [s for s in stmts if not comment_only(s)]


sql_text = open(PATH, encoding="utf-8").read()
statements = split_statements(sql_text)
print(f"{len(statements)} statements in {PATH}")

if DRY:
    for s in statements[:10]:
        print("  •", s.replace("\n", " ")[:100])
    sys.exit(0)

pending = statements
with psycopg.connect(DB, connect_timeout=30, autocommit=True) as conn:
    for attempt in range(1, 7):
        failed, errors = [], {}
        for stmt in pending:
            try:
                with conn.cursor() as cur:
                    cur.execute(stmt)
            except Exception as exc:  # noqa: BLE001 — the error text is the useful part
                failed.append(stmt)
                errors[stmt] = f"{type(exc).__name__}: {str(exc).splitlines()[0]}"
        done = len(pending) - len(failed)
        print(f"pass {attempt}: {done} applied, {len(failed)} failed")
        if not failed:
            break
        if len(failed) == len(pending):       # no progress — the rest are real errors
            print("\nnot ordering, actual errors:")
            seen = set()
            for stmt in failed:
                msg = errors[stmt]
                if msg in seen:
                    continue
                seen.add(msg)
                print(f"  {msg}\n    {stmt.replace(chr(10), ' ')[:160]}")
            break
        pending = failed
