#!/usr/bin/env python3
"""
Shuffle answer positions in generated question banks to fix LLM answer-position bias.

Usage:
    python shuffle_options.py input.json output.json
    python shuffle_options.py input.json  # overwrites in place

Verifies ~25% distribution per position after shuffling.
Re-shuffles with a different seed if any position exceeds 35%.
"""

import json
import random
import sys
from collections import Counter


def shuffle_options(q):
    opts = q.get('options', [])
    ca = q.get('correctAnswer')
    if not opts or ca is None:
        return q

    # Index-based correctAnswer (boss/dungeon/pvp: int 0-3)
    if isinstance(ca, int) and 0 <= ca < len(opts):
        correct = opts[ca]
        random.shuffle(opts)
        q['options'] = opts
        q['correctAnswer'] = opts.index(correct)

    # Object options {id, text} with letter correctAnswer
    elif isinstance(opts[0], dict) and isinstance(ca, str) and len(ca) == 1:
        old_map = {o['id']: o['text'] for o in opts}
        correct_text = old_map.get(ca)
        random.shuffle(opts)
        ids = ['a', 'b', 'c', 'd', 'e', 'f'][:len(opts)]
        new_map = {}
        for i, o in enumerate(opts):
            new_map[o['text']] = ids[i]
            o['id'] = ids[i]
        q['correctAnswer'] = new_map.get(correct_text, ca)

    # Array correctAnswer (multiple_select)
    elif isinstance(ca, list) and isinstance(opts[0], dict):
        old_map = {o['id']: o['text'] for o in opts}
        correct_texts = {old_map[l] for l in ca if l in old_map}
        random.shuffle(opts)
        ids = ['a', 'b', 'c', 'd', 'e', 'f'][:len(opts)]
        new_ca = []
        for i, o in enumerate(opts):
            if o['text'] in correct_texts:
                new_ca.append(ids[i])
            o['id'] = ids[i]
        q['correctAnswer'] = sorted(new_ca)

    # Ranking: shuffle display order, correctAnswer tracks ids (unchanged)
    elif q.get('type') == 'ranking':
        random.shuffle(opts)

    # Shuffle linkedFollowUp too
    if q.get('linkedFollowUp'):
        shuffle_options(q['linkedFollowUp'])

    return q


def check_distribution(questions, max_skew=0.35):
    """Returns True if answer distribution is within acceptable range."""
    counts = Counter()
    total = 0
    for q in questions:
        ca = q.get('correctAnswer')
        if isinstance(ca, int):
            counts[ca] += 1
            total += 1
    if total == 0:
        return True
    for pos in counts:
        if counts[pos] / total > max_skew:
            return False
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: shuffle_options.py input.json [output.json]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path

    with open(input_path, 'r') as f:
        questions = json.load(f)

    # Shuffle with retries for even distribution
    max_attempts = 5
    for attempt in range(max_attempts):
        random.seed(random.randint(0, 2**32))
        for q in questions:
            shuffle_options(q)
        if check_distribution(questions):
            break

    with open(output_path, 'w') as f:
        json.dump(questions, f, indent=2)

    # Report distribution
    counts = Counter()
    total = 0
    for q in questions:
        ca = q.get('correctAnswer')
        if isinstance(ca, int):
            counts[ca] += 1
            total += 1
    if total > 0:
        print(f"Shuffled {total} questions. Distribution:")
        for pos in sorted(counts):
            pct = counts[pos] / total * 100
            print(f"  Position {pos}: {counts[pos]} ({pct:.1f}%)")


if __name__ == '__main__':
    main()
