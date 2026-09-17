"""Match each client to the ad accounts Windsor reports for it.

The Ads section needs to know whose spend is whose. Windsor hands back an
account per row and a name that a human typed into Facebook or Google years ago;
our roster has the name the client signs contracts under. Nothing joins them but
the words, so this scores the words and refuses to guess.

A match is only written when one candidate is clearly ahead. Everything else is
printed for a person to settle: a wrong pairing here quietly attributes one gym's
ad spend to another, and nobody would see it on the board.

Reads .temp/windsor-accounts.json and the client roster. Writes nothing.
"""
import io
import json
import re
import sys
from collections import defaultdict

# Words that appear in half the roster and carry no signal.
NOISE = {
    'jiu', 'jitsu', 'jiujitsu', 'bjj', 'brazilian', 'academy', 'academies',
    'martial', 'arts', 'art', 'gym', 'fitness', 'club', 'center', 'centre',
    'the', 'and', 'of', 'llc', 'inc', 'co', 'com', 'www', 'mma', 'team',
    'training', 'school', 'hq', 'studio', 'kickboxing', 'boxing', 'wrestling',
    'muay', 'thai', 'self', 'defense', 'defence', 'sports', 'combat',
}

def words(s):
    s = (s or '').lower()
    s = re.sub(r'https?://', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return [w for w in s.split() if w and w not in NOISE and len(w) > 1]

def score(client_name, account_name):
    a, b = set(words(client_name)), set(words(account_name))
    if not a or not b:
        return 0.0
    shared = a & b
    if not shared:
        return 0.0
    # Rare words are worth more: "poway" identifies a gym, "planet" does not.
    return len(shared) / min(len(a), len(b))

def main(clients_path, accounts_path):
    clients = json.load(io.open(clients_path, encoding='utf-8'))
    accounts = json.load(io.open(accounts_path, encoding='utf-8'))

    certain, unsure, unmatched = [], [], []

    for c in clients:
        ranked = sorted(
            ((score(c['name'], a['account_name']), a) for a in accounts),
            key=lambda x: (-x[0], -x[1]['spend']),
        )
        top = [r for r in ranked if r[0] > 0][:4]

        if not top:
            unmatched.append(c)
            continue

        # One gym usually has several accounts — Facebook, the Google listing,
        # Search Console — and they all score the same. What decides certainty is
        # whether anything else comes close behind them.
        best = top[0][0]
        tied = [t[1] for t in top if t[0] == best]
        next_score = next((t[0] for t in top if t[0] < best), 0.0)

        if best >= 0.75 and next_score < best:
            certain.append((c, tied))
        else:
            unsure.append((c, top))

    print('CERTAIN — one client, one gym, written without asking:')
    for c, accts in certain:
        print('  %-38s' % c['name'][:38], ', '.join(
            '%s:%s' % (a['datasource'], a['account_name'][:24]) for a in accts))

    print('\nUNSURE — needs a person:')
    for c, top in unsure:
        print('  %-38s' % c['name'][:38])
        for s, a in top:
            print('      %.2f  %-14s %-28s $%s' % (s, a['datasource'], a['account_name'][:28], round(a['spend'])))

    print('\nNO AD ACCOUNT FOUND:')
    for c in unmatched:
        print('  ', c['name'])

    print('\n%d certain, %d unsure, %d with nothing' % (len(certain), len(unsure), len(unmatched)))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
