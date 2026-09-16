"""Issue one person a token for the remote MCP server.

They paste a URL and a header into Claude and that is the whole setup — no
clone, no Node, no PowerShell. The token stands in for their session: every
request exchanges it for a short-lived access token, so Postgres applies the
same rules it applies when they use the app.

The token is printed once and never stored. Only its SHA-256 is kept, so a copy
of the table gets nobody in. Revoking is deleting the row.

What the token stands on is that person's refresh token, and there are two ways
to get one. With their password, by signing in as them. Or without it, by asking
the admin API for a one-time login link and consuming it here — which is how
Bobby and Kurt get one, since they have only ever used emailed links and have no
password to give.

Usage:
  python scripts/mint_mcp_token.py <email> [password] [--label "Bobby's laptop"]

  Leave the password out and it uses the admin path. The link is consumed
  immediately and never leaves this machine.

Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in the
environment.
"""
import hashlib
import json
import os
import secrets
import sys
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

args = [a for a in sys.argv[1:] if a != "--label"]
if "--label" in sys.argv:
    label = sys.argv[sys.argv.index("--label") + 1]
    args = [a for a in args if a != label]
else:
    label = None
email = args[0]
password = args[1] if len(args) > 1 else None


def post(path, payload, key, extra=None):
    req = urllib.request.Request(
        f"{URL}{path}",
        data=json.dumps(payload).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", **(extra or {})},
        method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "{}")


def get(path, key):
    req = urllib.request.Request(
        f"{URL}{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "[]")


def session_by_password():
    try:
        return post("/auth/v1/token?grant_type=password",
                    {"email": email, "password": password}, ANON)
    except urllib.error.HTTPError as exc:
        detail = json.loads(exc.read() or "{}")
        sys.exit(f"Could not sign in as {email}: "
                 f"{detail.get('error_description') or detail.get('msg') or exc}")


def session_by_admin_link():
    """A one-time login link, generated and spent here.

    No password is involved and the person's account is not changed — they keep
    using emailed links exactly as before.
    """
    link = post("/auth/v1/admin/generate_link",
                {"type": "magiclink", "email": email}, SERVICE)
    verify = f"{URL}/auth/v1/verify?token={link['hashed_token']}&type=magiclink&redirect_to={URL}"

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **kw):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(verify, headers={"apikey": ANON})
    try:
        opener.open(req)
        sys.exit("The login link did not redirect — cannot read a session from it.")
    except urllib.error.HTTPError as exc:
        location = exc.headers.get("Location", "")

    if "#" not in location:
        sys.exit(f"No session came back from the login link: {location[:200]}")
    fragment = dict(kv.split("=", 1) for kv in location.split("#", 1)[1].split("&") if "=" in kv)
    if "refresh_token" not in fragment:
        sys.exit(f"The link came back without a session: {location[:200]}")

    user = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{URL}/auth/v1/user",
        headers={"apikey": ANON, "Authorization": f"Bearer {fragment['access_token']}"})).read())
    return {"refresh_token": fragment["refresh_token"], "user": user}


session = session_by_password() if password else session_by_admin_link()

user_id = session["user"]["id"]

profiles = get(f"/rest/v1/profiles?id=eq.{user_id}&select=id,email,display_name,role", SERVICE)
if not profiles:
    sys.exit(f"{email} can sign in but has no profile on this scoreboard, so it could read nothing.")
profile = profiles[0]

token = "gst_" + secrets.token_urlsafe(32)
row = {
    "profile_id": profile["id"],
    "token_sha256": hashlib.sha256(token.encode()).hexdigest(),
    "refresh_token": session["refresh_token"],
    "label": label,
}
post("/rest/v1/mcp_tokens", row, SERVICE, {"Prefer": "return=minimal"})

project = URL.split("//")[1].split(".")[0]
print(f"\nToken for {profile['display_name'] or profile['email']} ({profile['role']}).")
print("Shown once. It is not stored anywhere in readable form.\n")
print(token)
print("\nPaste this into Claude's MCP config:\n")
print(json.dumps({
    "mcpServers": {
        "gsteam": {
            "url": f"{URL}/functions/v1/mcp",
            "headers": {"Authorization": f"Bearer {token}"},
        }
    }
}, indent=2))
print(f"\nTo revoke: delete their row from mcp_tokens ({project}).")
