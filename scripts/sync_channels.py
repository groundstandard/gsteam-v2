"""Pull the non-ad channels from Windsor: analytics, search, the listing, social.

The ad sections were filled first because Bobby asked about spend. These are the
other sections he asked for in the same breath, and the one that answers his
actual question — "did the lead come in from Facebook? From Google? From the
website?" — because Analytics reports a source and a medium for every session,
not only the ones that ended in a form.

Four connectors, each naming its accounts differently, all landing in tables
keyed by client and day:

    googleanalytics4    -> web_metrics_daily, web_sources_daily
    searchconsole       -> web_metrics_daily
    google_my_business  -> web_metrics_daily
    facebook_organic    -> social_metrics_daily
    instagram           -> social_metrics_daily

A website day is one row no matter which of the three sources contributed to it,
because Bobby did not want the same information twice. Social stays per platform,
because a follower on Instagram is not a follower on Facebook.

    python scripts/sync_channels.py --days 30
    python scripts/sync_channels.py --days 7 --dry-run

Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and WINDSOR_API_KEY.
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

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')

# Windsor's connector name, the source we file it under, and the fields to ask
# for. The field names are Windsor's, verified against the live API rather than
# taken from the docs — several of the obvious guesses are rejected.
CONNECTORS = {
    'googleanalytics4': {
        'source': 'ga4',
        'fields': ['date', 'account_id', 'account_name', 'sessions', 'totalusers',
                   'newusers', 'screen_page_views', 'conversions', 'source', 'medium'],
    },
    'searchconsole': {
        'source': 'search_console',
        'fields': ['date', 'account_id', 'account_name', 'clicks', 'impressions', 'position'],
    },
    'google_my_business': {
        'source': 'gbp',
        'fields': ['date', 'account_id', 'account_name', 'impressions_desktop_maps',
                   'impressions_mobile_maps', 'website_clicks', 'call_clicks',
                   'direction_requests'],
    },
    'facebook_organic': {
        'source': 'facebook_page',
        'fields': ['date', 'account_id', 'account_name', 'page_fans', 'page_impressions',
                   'page_engaged_users'],
    },
    'instagram': {
        'source': 'instagram',
        'fields': ['date', 'account_id', 'account_name', 'follower_count', 'reach'],
    },
}

# Search Console returns a row per query per page per day. Asked for a long
# window it is hundreds of thousands of rows, so every connector is asked in
# slices and the totals come out the same.
CHUNK_DAYS = 14


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


def pull(api_key, connector, spec, days):
    rows, end = [], date.today()
    cursor = end - timedelta(days=days)
    while cursor <= end:
        stop = min(cursor + timedelta(days=CHUNK_DAYS - 1), end)
        url = 'https://connectors.windsor.ai/%s?%s' % (connector, urllib.parse.urlencode({
            'api_key': api_key,
            'date_from': cursor.isoformat(),
            'date_to': stop.isoformat(),
            'fields': ','.join(spec['fields']),
        }))
        body = request(url)
        got = body.get('data') if isinstance(body, dict) else body
        rows += got or []
        cursor = stop + timedelta(days=1)
    print('  %-20s %6d rows' % (connector, len(rows)))
    return rows


def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def whole(v):
    return int(num(v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=30)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    env = load_env()
    url = env['SUPABASE_URL'].rstrip('/')
    key = env['SUPABASE_SERVICE_ROLE_KEY']
    rest = lambda p: '%s/rest/v1/%s' % (url, p)

    # Who owns which account. Written by hand or by the matcher; never guessed here.
    channels = request(rest('client_channels?select=source,account_id,client_id&limit=1000'), key)
    owner = {(c['source'], str(c['account_id'])): c['client_id'] for c in channels}
    print('mapped accounts: %d' % len(owner))
    if not owner:
        sys.exit('nothing mapped yet — run the matcher and fill client_channels first')

    print('pulling %d days:' % args.days)
    pulled = {c: pull(env['WINDSOR_API_KEY'], c, spec, args.days)
              for c, spec in CONNECTORS.items()}

    web = defaultdict(lambda: defaultdict(int))
    web_pos = defaultdict(list)
    sources = defaultdict(lambda: defaultdict(int))
    social = defaultdict(lambda: defaultdict(int))
    ignored = defaultdict(set)

    for connector, spec in CONNECTORS.items():
        src = spec['source']
        for r in pulled[connector]:
            client = owner.get((src, str(r.get('account_id'))))
            day = (r.get('date') or '')[:10]
            if not client or not day:
                if not client:
                    ignored[src].add(str(r.get('account_name'))[:40])
                continue

            if src == 'ga4':
                w = web[(day, client)]
                w['sessions'] += whole(r.get('sessions'))
                w['users'] += whole(r.get('totalusers'))
                w['new_users'] += whole(r.get('newusers'))
                w['pageviews'] += whole(r.get('screen_page_views'))
                w['conversions'] += whole(r.get('conversions'))

                s = sources[(day, client, r.get('source') or '(unknown)', r.get('medium') or '(none)')]
                s['sessions'] += whole(r.get('sessions'))
                s['users'] += whole(r.get('totalusers'))
                s['conversions'] += whole(r.get('conversions'))

            elif src == 'search_console':
                w = web[(day, client)]
                w['search_clicks'] += whole(r.get('clicks'))
                w['search_impressions'] += whole(r.get('impressions'))
                # Average position is per query; weight it by impressions or a
                # page ranking 90th for one impression drags the whole day down.
                if num(r.get('impressions')):
                    web_pos[(day, client)].append((num(r.get('position')), num(r.get('impressions'))))

            elif src == 'gbp':
                w = web[(day, client)]
                w['map_views'] += whole(r.get('impressions_desktop_maps')) + whole(r.get('impressions_mobile_maps'))
                w['listing_website'] += whole(r.get('website_clicks'))
                w['listing_calls'] += whole(r.get('call_clicks'))
                w['listing_directions'] += whole(r.get('direction_requests'))

            elif src in ('facebook_page', 'instagram'):
                platform = 'facebook' if src == 'facebook_page' else 'instagram'
                s = social[(day, client, platform)]
                if platform == 'facebook':
                    s['followers'] = max(s['followers'], whole(r.get('page_fans')))
                    s['impressions'] += whole(r.get('page_impressions'))
                    s['engaged'] += whole(r.get('page_engaged_users'))
                else:
                    s['followers'] = max(s['followers'], whole(r.get('follower_count')))
                    s['reach'] += whole(r.get('reach'))

    web_rows = []
    for (day, client), v in web.items():
        pos = web_pos.get((day, client))
        row = {'day': day, 'client_id': client}
        row.update({k: v.get(k, 0) for k in (
            'sessions', 'users', 'new_users', 'pageviews', 'conversions',
            'search_clicks', 'search_impressions', 'map_views',
            'listing_website', 'listing_calls', 'listing_directions')})
        # Every row carries the same keys, present or not: PostgREST rejects a
        # batch whose objects disagree, and a day with no search data still has
        # to be written.
        total = sum(w for _, w in pos) if pos else 0
        row['search_position'] = round(sum(p * w for p, w in pos) / total, 2) if total else None
        web_rows.append(row)

    source_rows = [{'day': d, 'client_id': c, 'source': s, 'medium': m,
                    'sessions': v['sessions'], 'users': v['users'], 'conversions': v['conversions']}
                   for (d, c, s, m), v in sources.items()]

    social_rows = [{'day': d, 'client_id': c, 'platform': p,
                    'followers': v.get('followers', 0), 'reach': v.get('reach', 0),
                    'impressions': v.get('impressions', 0), 'engaged': v.get('engaged', 0)}
                   for (d, c, p), v in social.items()]

    print('\nwould write:' if args.dry_run else '\nwriting:')
    print('  web_metrics_daily    %6d rows' % len(web_rows))
    print('  web_sources_daily    %6d rows' % len(source_rows))
    print('  social_metrics_daily %6d rows' % len(social_rows))
    for src, names in ignored.items():
        if names:
            print('  %-18s ignored, no client mapped: %s%s' % (
                src, ', '.join(sorted(names)[:4]),
                ' and %d more' % (len(names) - 4) if len(names) > 4 else ''))

    if args.dry_run:
        top = sorted(((v['sessions'], s) for (d, c, s, m), v in sources.items()), reverse=True)[:8]
        print('\n  busiest traffic sources in the window:')
        for n, s in top:
            print('    %-22s %s sessions' % (s[:22], n))
        return

    for table, rows, conflict in (
        ('web_metrics_daily', web_rows, 'day,client_id'),
        ('web_sources_daily', source_rows, 'day,client_id,source,medium'),
        ('social_metrics_daily', social_rows, 'day,client_id,platform'),
    ):
        for i in range(0, len(rows), 500):
            request(rest('%s?on_conflict=%s' % (table, conflict)), key, 'POST',
                    rows[i:i + 500], 'resolution=merge-duplicates,return=minimal')
        print('  %-20s written' % table)

    print('done')


if __name__ == '__main__':
    main()
