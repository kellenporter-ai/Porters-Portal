#!/usr/bin/env python3
"""Codemod: add light-mode dual-class variants to bare text-*-400 Tailwind utilities.

Transforms:  text-COLOR-400  →  text-COLOR-{LIGHT} dark:text-COLOR-400

Guards:
- Skips matches that already have a dark: prefix
- Skips matches where dark:text-COLOR-400 (same color) exists on the same line
- Skips dynamic template literals like text-${...}-400
- Only processes .ts/.tsx files outside node_modules/dist/functions/.next/
"""

import argparse
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

LIGHT_SHADE = {
    'red': '600', 'purple': '600', 'amber': '600', 'green': '600',
    'yellow': '600', 'blue': '600', 'cyan': '600', 'orange': '600',
    'emerald': '700', 'teal': '600', 'pink': '600', 'indigo': '600',
    'gray': '600', 'zinc': '600', 'rose': '600', 'violet': '600',
}

COLORS = '|'.join(LIGHT_SHADE.keys())

# Match bare text-COLOR-400 not preceded by dark: or other prefix chars
BARE_PATTERN = re.compile(
    rf'(?<![:\w-])text-({COLORS})-400(?!\w)'
)

# Match dynamic template patterns like text-${...}-400
DYNAMIC_PATTERN = re.compile(r'text-\$\{[^}]*\}-400')

EXCLUDE_DIRS = {'node_modules', 'dist', 'functions', '.next'}


def should_skip_file(path: Path, project_root: Path) -> bool:
    rel = path.relative_to(project_root)
    parts = rel.parts
    return any(p in EXCLUDE_DIRS for p in parts)


def process_line(line: str) -> tuple[str, list[str]]:
    """Process a single line, returning (new_line, list_of_colors_replaced)."""
    # Skip lines with dynamic template patterns for the color slot
    if DYNAMIC_PATTERN.search(line):
        # Still process static matches on the same line, but be careful
        pass

    replacements = []

    def replacer(match: re.Match) -> str:
        color = match.group(1)
        full_match = match.group(0)
        start = match.start()

        # Check if this is inside a dynamic template literal like text-${color}-400
        # Look backwards from match for ${ pattern
        before = line[:start]
        if before.endswith('text-${') or '${' in before[max(0, start - 30):start]:
            # More precise check: is there an unclosed ${ before this?
            # Actually the regex already won't match text-${...}-400 because
            # the color group won't match ${...}. But check for partial dynamic usage.
            pass

        # Check if dark:text-COLOR-400 already exists on this line (same color)
        dark_variant = f'dark:text-{color}-400'
        if dark_variant in line:
            # This bare text-COLOR-400 is the light-mode counterpart of an existing
            # dark: variant, OR this IS the dark variant's target. Skip it.
            return full_match

        light = LIGHT_SHADE[color]
        replacements.append(color)
        return f'text-{color}-{light} dark:text-{color}-400'

    new_line = BARE_PATTERN.sub(replacer, line)
    return new_line, replacements


def process_file(filepath: Path, apply: bool) -> tuple[int, dict[str, int]]:
    """Process a file. Returns (replacement_count, color_breakdown)."""
    try:
        content = filepath.read_text(encoding='utf-8')
    except (UnicodeDecodeError, PermissionError):
        return 0, {}

    lines = content.split('\n')
    new_lines = []
    total_replacements = 0
    color_counts = defaultdict(int)
    file_diffs = []

    for i, line in enumerate(lines, 1):
        new_line, colors = process_line(line)
        new_lines.append(new_line)
        if colors:
            total_replacements += len(colors)
            for c in colors:
                color_counts[c] += 1
            file_diffs.append((i, line.rstrip(), new_line.rstrip()))

    if total_replacements == 0:
        return 0, {}

    if apply:
        new_content = '\n'.join(new_lines)
        filepath.write_text(new_content, encoding='utf-8')

    if file_diffs:
        print(f"\n{'='*60}")
        print(f"  {filepath}")
        print(f"{'='*60}")
        for lineno, old, new in file_diffs:
            print(f"  L{lineno}:")
            print(f"  - {old}")
            print(f"  + {new}")

    return total_replacements, dict(color_counts)


def main():
    parser = argparse.ArgumentParser(description='Fix bare text-*-400 for light mode')
    parser.add_argument('--apply', action='store_true',
                        help='Apply changes (default is dry-run)')
    parser.add_argument('--dry-run', action='store_true', default=True,
                        help='Show changes without applying (default)')
    args = parser.parse_args()

    apply = args.apply
    project_root = Path(__file__).resolve().parent.parent

    print(f"{'APPLYING' if apply else 'DRY RUN'}: scanning {project_root}")
    print(f"Light shade mapping: {LIGHT_SHADE}\n")

    files_changed = 0
    total_replacements = 0
    global_color_counts = defaultdict(int)
    script_path = Path(__file__).resolve()

    for ext in ('*.tsx', '*.ts'):
        for filepath in sorted(project_root.rglob(ext)):
            if filepath.resolve() == script_path:
                continue
            if should_skip_file(filepath, project_root):
                continue

            count, colors = process_file(filepath, apply)
            if count > 0:
                files_changed += 1
                total_replacements += count
                for c, n in colors.items():
                    global_color_counts[c] += n

    print(f"\n{'='*60}")
    print(f"  SUMMARY ({'APPLIED' if apply else 'DRY RUN'})")
    print(f"{'='*60}")
    print(f"  Files changed:      {files_changed}")
    print(f"  Total replacements: {total_replacements}")
    print(f"\n  Per-color breakdown:")
    for color in sorted(global_color_counts.keys()):
        shade = LIGHT_SHADE[color]
        print(f"    text-{color}-400 → text-{color}-{shade} dark:text-{color}-400  ({global_color_counts[color]}x)")


if __name__ == '__main__':
    main()
