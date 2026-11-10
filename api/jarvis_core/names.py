"""Exercise name canonicalization.

Names are already lowercased and normalized by the parser. Here, different ways of
writing the same exercise are unified:

- user aliases (whole-word shortcuts): {"oa": "one arm", "sldl": "stiff leg deadlift"}
- initials of 2+ consecutive words: "oa lat pulldown" -> "one arm lat pulldown"
- the start of a word: "inc bench" -> "incline bench"
- plurals: "bicep curl" -> "bicep curls"

A short name only maps to a longer one you have also logged. Ties go to the name
with more sets.
"""

from __future__ import annotations

from collections.abc import Mapping
from functools import lru_cache


def expands_to(short: list[str], full: list[str]) -> bool | None:
    """Can the words in `short` line up with every word in `full`? Each short word
    must be the same word, a plural of it, the start of a word ("inc" -> incline, 2-4
    letters), or the initials of 2+ consecutive words ("oa" -> one arm).
    Returns None if not, True if an abbreviation was used, False if identical."""
    return _expands(tuple(short), tuple(full))


@lru_cache(maxsize=65536)
def _expands(short_t: tuple[str, ...], full_t: tuple[str, ...]) -> bool | None:
    """expands_to on tuples: pure, so results are shared across calls (it runs for
    every pair of exercise names, many times per request)."""
    memo: dict[tuple[int, int], bool | None] = {}

    def go(i: int, j: int) -> bool | None:
        if (i, j) in memo:
            return memo[(i, j)]
        memo[(i, j)] = result = step(i, j)
        return result

    def step(i: int, j: int) -> bool | None:
        if i == len(short_t):
            return False if j == len(full_t) else None
        if j >= len(full_t):
            return None
        t = short_t[i]
        options: list[tuple[int, bool]] = []
        if t == full_t[j]:
            options.append((1, False))
        elif full_t[j] in (t + "s", t + "es") or (2 <= len(t) <= 4 and full_t[j].startswith(t)):
            # but not "press" -> pressdown, a different exercise (prefix limited to 4 letters)
            options.append((1, True))
        n = len(t)
        if n >= 2 and j + n <= len(full_t) and t == "".join(w[0] for w in full_t[j : j + n]):
            options.append((n, True))
        for width, abbreviated in options:
            rest = go(i + 1, j + width)
            if rest is not None:
                return rest or abbreviated
        return None

    return go(0, 0)


def apply_aliases(name: str, aliases: Mapping[str, str]) -> str:
    """Replace whole-word shortcuts, longest first: {'oa': 'one arm'}."""
    if not aliases:
        return name
    words, out, i = name.split(), [], 0
    shorts = sorted(aliases, key=lambda s: -len(s.split()))
    while i < len(words):
        for s in shorts:
            sw = s.split()
            if words[i : i + len(sw)] == sw:
                out += aliases[s].split()
                i += len(sw)
                break
        else:
            out.append(words[i])
            i += 1
    return " ".join(out)


def canonical_names(
    counts: Mapping[str, int], aliases: Mapping[str, str] | None = None
) -> dict[str, str]:
    """Map each written exercise name (with its set count) to its canonical name."""
    aliases = {k.lower().strip(): v.lower().strip() for k, v in (aliases or {}).items()}
    aliased = {n: apply_aliases(n, aliases) for n in counts}
    totals: dict[str, int] = {}
    for n, c in counts.items():
        totals[aliased[n]] = totals.get(aliased[n], 0) + c

    step: dict[str, str] = {}
    for n in totals:
        best: str | None = None
        for k in totals:
            longer = len(k) > len(n) and expands_to(n.split(), k.split())
            if longer and (best is None or totals[k] > totals[best]):
                best = k
        step[n] = best or n

    def final(n: str) -> str:
        seen: set[str] = set()
        while step[n] != n and n not in seen:
            seen.add(n)
            n = step[n]
        return n

    return {orig: final(aliased[orig]) for orig in counts}


def match_exercise(
    name: str, known: Mapping[str, int], aliases: Mapping[str, str] | None = None
) -> str:
    """The canonical name for `name` given the user's existing exercise counts."""
    counts = dict(known)
    counts[name] = counts.get(name, 0) + 1
    return canonical_names(counts, aliases)[name]
