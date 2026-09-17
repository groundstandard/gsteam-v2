"""Work out which analytics, search, listing and social account belongs to whom.

Five sources name their accounts five ways: a GA4 property title, a Search
Console site URL, a Google location name, a Facebook page name, an Instagram
handle. Nothing joins any of them to a client except the words, so this scores
the words and refuses to guess when they do not decide it.

Two rules, in order:

1. Containment. Every word of the client's name appears in the account's name,
   and no other client can say the same. "Royal Jiu-Jitsu" inside "Royal
   Jiu-Jitsu Queens" is that client and nobody else.
2. Similarity, but only when the runner-up is well behind.

Generic words are not stripped before comparing. An earlier version removed
"martial arts" and "chiropractic" as noise, which made "Champion Chiropractic"
and "Champion Martial Arts" the same business, and "Modern Man Barber Studio"
the same as "Jiu-Jitsu Modern". Two different gyms sharing one word is exactly
the case this has to get right, so the words stay.

    python scripts/match_channels.py                 print the split
    python scripts/match_channels.py --write         write the confident ones
"""
import difflib
import io
import json
import os
import re
import sys
import urllib.request

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')

# Words that carry no identity at all. Deliberately short: anything that could
# tell two businesses apart stays in.
NOISE = {'the', 'and', 'of', 'llc', 'inc', 'ga4', 'locations', 'jiu', 'jitsu',
         'jiujitsu', 'bjj', 'brazilian'}


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
    return env


def clean(s):
    s = (s or '').lower()
    s = re.sub(r'^https?://', '', s)
    s = re.sub(r'^www\.', '', s)
    s = re.sub(r'/$', '', s)
    s = re.sub(r'\.(com|net|org|academy|shop|co|us)\b', ' ', s)
    s = re.sub(r'^gs\s*[-|]\s*', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def words(s):
    return {w for w in clean(s).split() if len(w) > 2 and w not in NOISE}


def main():
    env = load_env()
    url = env['SUPABASE_URL'].rstrip('/')
    key = env['SUPABASE_SERVICE_ROLE_KEY']
    headers = {'apikey': key, 'Authorization': 'Bearer ' + key,
               'User-Agent': UA, 'Accept': 'application/json'}

    req = urllib.request.Request(url + '/rest/v1/clients?select=id,name,cancel_date&limit=200',
                                 headers=headers)
    clients = [c for c in json.loads(urllib.request.urlopen(req, timeout=60).read())
               if not c['cancel_date']]
    accounts = json.load(io.open('.temp/channel-accounts.json', encoding='utf-8'))

    confident, unsure, orphan = [], [], []

    for a in accounts:
        label = a['account_name'] or a['account_id']
        aw = words(label) | words(a['account_id'])
        an = clean(label)

        contained = [c for c in clients if words(c['name']) and words(c['name']) <= aw]
        if len(contained) == 1:
            confident.append((a, contained[0], 'every word matches'))
            continue

        ranked = sorted(((difflib.SequenceMatcher(None, an, clean(c['name'])).ratio(), c)
                         for c in clients), key=lambda x: -x[0])
        best, second = ranked[0], ranked[1]

        if len(contained) > 1:
            unsure.append((a, [(1.0, c) for c in contained][:4]))
        elif best[0] >= 0.72 and best[0] - second[0] >= 0.10:
            confident.append((a, best[1], '%.2f, next %.2f' % (best[0], second[0])))
        elif best[0] >= 0.55:
            unsure.append((a, ranked[:3]))
        else:
            orphan.append((a, best))

    print('%d accounts: %d confident, %d to check, %d with no client' %
          (len(accounts), len(confident), len(unsure), len(orphan)))

    print('\nTO CHECK — one of these, or none:')
    for a, options in unsure:
        print('  %-14s %s' % (a['source'], (a['account_name'] or a['account_id'])[:48]))
        for score, c in options:
            print('       %.2f  %s' % (score, c['name']))

    print('\nNO CLIENT ON THE BOARD:')
    for a, best in orphan[:20]:
        print('  %-14s %-44s (closest: %s %.2f)' % (
            a['source'], (a['account_name'] or a['account_id'])[:44], best[1]['name'][:22], best[0]))
    if len(orphan) > 20:
        print('  ...%d more' % (len(orphan) - 20))

    rows = [{'client_id': c['id'], 'source': a['source'],
             'account_id': str(a['account_id']), 'name': a['account_name']}
            for a, c, _ in confident]
    io.open('.temp/channel-map-confident.json', 'w', encoding='utf-8').write(
        json.dumps(rows, indent=1))

    if '--write' not in sys.argv:
        print('\nnothing written. Pass --write to save the confident ones.')
        return

    for i in range(0, len(rows), 200):
        req = urllib.request.Request(
            url + '/rest/v1/client_channels?on_conflict=source,account_id',
            data=json.dumps(rows[i:i + 200]).encode(),
            headers=dict(headers, **{'Content-Type': 'application/json',
                                     'Prefer': 'resolution=merge-duplicates,return=minimal'}),
            method='POST')
        urllib.request.urlopen(req, timeout=120)
    print('\nwritten: %d accounts mapped' % len(rows))


if __name__ == '__main__':
    main()
