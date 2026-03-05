#!/usr/bin/env python3
"""
Shuffle answer positions in question bank JSON files.
LLMs heavily bias correct answers toward position A/B (index 0/1).
This script applies Fisher-Yates shuffle to randomize answer positions
and verifies ~25% distribution per position.

Usage: python shuffle_options.py <input.json> <output.json>
"""

import json
import random
import sys
from collections import Counter


def shuffle_question(q):
    """Shuffle options and update correctAnswer index."""
    options = list(q["options"])
    correct_text = options[q["correctAnswer"]]

    # Fisher-Yates shuffle
    random.shuffle(options)

    new_index = options.index(correct_text)
    q["options"] = options
    q["correctAnswer"] = new_index
    return q


def check_distribution(questions):
    """Check if answer distribution is roughly uniform (~25% per position)."""
    counts = Counter(q["correctAnswer"] for q in questions)
    total = len(questions)
    if total == 0:
        return True
    for pos in range(4):
        pct = counts.get(pos, 0) / total * 100
        if pct > 35:
            return False
    return True


def shuffle_all(questions, max_attempts=5):
    """Shuffle all questions, re-shuffle if distribution is skewed."""
    for attempt in range(max_attempts):
        for q in questions:
            shuffle_question(q)
        if check_distribution(questions):
            return True
    return False


def process_file(input_path, output_path):
    with open(input_path, "r") as f:
        data = json.load(f)

    # Handle both array of questions and dungeon config with embedded questions
    if isinstance(data, list):
        balanced = shuffle_all(data)
        if not balanced:
            print(f"WARNING: Could not achieve balanced distribution after max attempts")
        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Shuffled {len(data)} questions -> {output_path}")
        report_distribution(data)

    elif isinstance(data, dict):
        # Dungeon config — shuffle questions in each room
        total = 0
        all_questions = []
        if "rooms" in data:
            for room in data["rooms"]:
                if room.get("questions"):
                    for q in room["questions"]:
                        shuffle_question(q)
                    all_questions.extend(room["questions"])
                    total += len(room["questions"])
        if "questions" in data:
            for q in data["questions"]:
                shuffle_question(q)
            all_questions.extend(data["questions"])
            total += len(data["questions"])

        with open(output_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Shuffled {total} embedded questions -> {output_path}")
        if all_questions:
            report_distribution(all_questions)


def report_distribution(questions):
    counts = Counter(q["correctAnswer"] for q in questions)
    total = len(questions)
    for pos in range(4):
        count = counts.get(pos, 0)
        pct = count / total * 100 if total else 0
        label = chr(65 + pos)
        print(f"  Position {label}: {count} ({pct:.1f}%)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.json> <output.json>")
        sys.exit(1)
    process_file(sys.argv[1], sys.argv[2])
