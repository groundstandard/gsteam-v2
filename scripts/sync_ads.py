"""Pull ad spend from Windsor into the scoreboard.

The Ads section has been empty since it was built, because nothing filled it.
This is what fills it: Windsor already holds every client's Facebook and Google
Ads data, so one request per day range brings back every account at once and we
write it per client, per day.

Two decisions worth knowing about:

Only paid sources. Windsor also carries the Google Business listing, Search
Console, and organic Facebook and Instagram. They belong in Leads, not in a
section about ad spend, and the table only accepts meta and google anyway.

Daily rows, and a re-run replaces a day rather than adding to it. Any date range
Mike asks for is a sum over days, and a sync that runs twice cannot double a
month.

    python scripts/sync_ads.py --map .temp/ad-map-confident.json --days 90
    python scripts/sync_ads.py --map ... --days 7 --dry-run

Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and WINDSOR_API_KEY in .env /
.env.local.
"""
import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, timedelta

WINDSOR = 'https://connectors.windsor.ai/all'

# Windsor's name for a source, and ours. Anything not here is not an ad.
PLATFORM = {'facebook': 'meta', 'google_ads': 'google'}

# Cloudflare sits in front of both APIs and refuses a bare urllib signature.
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')


def load_env():
    env = {}
    for name in ('.env', '.env.local'):
        if not os.path.exists(name):
            continue
        for line in io.open(name, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"')
    for key in ('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WINDSOR_API_KEY'):
        if key not in env:
            sys.exit('missing %s' % key)
    return env


def request(url, key=None, method='GET', body=None, prefer=None):
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if key:
        headers.update({'apikey': key, 'Authorization': 'Bearer ' + key})
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(
        url, data=json.dumps(body).encode() if body is not None else None,
        headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            raw = r.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        sys.exit('%s %s -> %s %s' % (method, url.split('?')[0], e.code,
                                     e.read()[:400].decode(errors='replace')))


def windsor_rows(api_key, days):
    """Every paid row Windsor has for the window, one request."""
    fields = ['date', 'datasource', 'account_id', 'account_name', 'campaign',
              'campaign_id', 'spend', 'impressions', 'clicks']
    url = '%s?%s' % (WINDSOR, urllib.parse.urlencode({
        'api_key': api_key,
        'date_from': (date.today() - timedelta(days=days)).isoformat(),
        'date_to': date.today().isoformat(),
        'fields': ','.join(fields),
    }))
    body = request(url)
    rows = body.get('data') if isinstance(body, dict) else body
    return [r for r in rows if r.get('datasource') in PLATFORM]


def number(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--map', required=True, help='account -> client pairs, as JSON')
    ap.add_argument('--days', type=int, default=90)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    env = load_env()
    url = env['SUPABASE_URL'].rstrip('/')
    key = env['SUPABASE_SERVICE_ROLE_KEY']
    rest = lambda path: '%s/rest/v1/%s' % (url, path)

    pairs = json.load(io.open(args.map, encoding='utf-8'))
    owner = {str(p['account_id']): p for p in pairs}
    print('mapped accounts: %d' % len(owner))

    rows = windsor_rows(env['WINDSOR_API_KEY'], args.days)
    print('rows from Windsor: %d over %d days' % (len(rows), args.days))

    mine = [r for r in rows if str(r.get('account_id')) in owner]
    skipped = {str(r.get('account_name')) for r in rows if str(r.get('account_id')) not in owner}
    print('rows belonging to a mapped client: %d' % len(mine))
    if skipped:
        print('ignored, no client mapped: %s' % ', '.join(sorted(skipped)[:6]) +
              (' and %d more' % (len(skipped) - 6) if len(skipped) > 6 else ''))

    if args.dry_run:
        per_client = defaultdict(float)
        for r in mine:
            per_client[owner[str(r['account_id'])]['client']] += number(r.get('spend'))
        print('\nwould write, biggest first:')
        for name, spend in sorted(per_client.items(), key=lambda x: -x[1])[:15]:
            print('  %-40s $%s' % (name[:40], round(spend)))
        print('\n%d clients, $%s total. Nothing written.' %
              (len(per_client), round(sum(per_client.values()))))
        return

    # 1. The accounts themselves. Unique on (platform, account_id), so a re-run
    #    updates the name rather than creating a second row for the same account.
    accounts = [{
        'client_id': p['client_id'],
        'platform': PLATFORM[p['datasource']],
        'account_id': str(p['account_id']),
        'name': p['account_name'],
        'active': True,
    } for p in pairs]
    saved = request(rest('ad_accounts?on_conflict=platform,account_id'), key, 'POST',
                    accounts, 'resolution=merge-duplicates,return=representation')
    print('ad_accounts written: %d' % len(saved))

    ref = {(a['platform'], a['account_id']): a['id'] for a in saved}

    # 2. One row per account per day. Campaign level comes next; the section
    #    reads account level first and this is what makes it stop being empty.
    daily = defaultdict(lambda: {'spend': 0.0, 'impressions': 0, 'clicks': 0})
    for r in mine:
        p = owner[str(r['account_id'])]
        platform = PLATFORM[p['datasource']]
        ref_id = ref.get((platform, str(r['account_id'])))
        if not ref_id or not r.get('date'):
            continue
        d = daily[(r['date'][:10], ref_id, p['client_id'])]
        d['spend'] += number(r.get('spend'))
        d['impressions'] += int(number(r.get('impressions')))
        d['clicks'] += int(number(r.get('clicks')))

    metrics = [{
        'day': day, 'level': 'account', 'ref_id': ref_id, 'client_id': client_id,
        'spend': round(v['spend'], 2), 'impressions': v['impressions'], 'clicks': v['clicks'],
    } for (day, ref_id, client_id), v in daily.items()]

    # 2b. The same again per campaign. This is the level the board and the tools
    #     actually read — "which campaign is working" is the question being asked,
    #     and an account total cannot answer it.
    campaigns = {}
    for r in mine:
        p = owner[str(r['account_id'])]
        account_ref = ref.get((PLATFORM[p['datasource']], str(r['account_id'])))
        platform_id = str(r.get('campaign_id') or r.get('campaign') or '').strip()
        if not account_ref or not platform_id:
            continue
        campaigns[(account_ref, platform_id)] = r.get('campaign') or platform_id

    rows_c = [{'ad_account_id': a, 'platform_id': pid, 'name': name}
              for (a, pid), name in campaigns.items()]
    saved_c = []
    for i in range(0, len(rows_c), 500):
        saved_c += request(rest('ad_campaigns?on_conflict=ad_account_id,platform_id'), key, 'POST',
                           rows_c[i:i + 500], 'resolution=merge-duplicates,return=representation')
    print('ad_campaigns written: %d' % len(saved_c))

    camp_ref = {(c['ad_account_id'], c['platform_id']): c['id'] for c in saved_c}

    per_campaign = defaultdict(lambda: {'spend': 0.0, 'impressions': 0, 'clicks': 0})
    for r in mine:
        p = owner[str(r['account_id'])]
        account_ref = ref.get((PLATFORM[p['datasource']], str(r['account_id'])))
        platform_id = str(r.get('campaign_id') or r.get('campaign') or '').strip()
        cid = camp_ref.get((account_ref, platform_id))
        if not cid or not r.get('date'):
            continue
        d = per_campaign[(r['date'][:10], cid, p['client_id'])]
        d['spend'] += number(r.get('spend'))
        d['impressions'] += int(number(r.get('impressions')))
        d['clicks'] += int(number(r.get('clicks')))

    metrics += [{
        'day': day, 'level': 'campaign', 'ref_id': cid, 'client_id': client_id,
        'spend': round(v['spend'], 2), 'impressions': v['impressions'], 'clicks': v['clicks'],
    } for (day, cid, client_id), v in per_campaign.items()]

    print('daily rows to write: %d' % len(metrics))
    for i in range(0, len(metrics), 500):
        chunk = metrics[i:i + 500]
        request(rest('ad_metrics_daily?on_conflict=day,level,ref_id'), key, 'POST',
                chunk, 'resolution=merge-duplicates,return=minimal')
        print('  written %d/%d' % (min(i + 500, len(metrics)), len(metrics)))

    # 3. Say what happened, so an empty section can be told from a failed sync.
    #    The log records the platform, not Windsor: Windsor is how we fetch it,
    #    but what was synced is Meta and Google Ads.
    now = date.today().isoformat()
    window_from = (date.today() - timedelta(days=args.days)).isoformat()
    runs = []
    for source, platform in (('meta', 'meta'), ('google_ads', 'google')):
        written = sum(1 for m in metrics
                      if m['ref_id'] in {a['id'] for a in saved if a['platform'] == platform})
        runs.append({
            'source': source, 'status': 'ok', 'rows_written': written,
            'window_from': window_from, 'window_to': now,
            'finished_at': 'now()',
        })
    request(rest('sync_runs'), key, 'POST', runs, 'return=minimal')
    print('logged: %s' % ', '.join('%s %d rows' % (r['source'], r['rows_written']) for r in runs))
    print('done')


if __name__ == '__main__':
    main()
