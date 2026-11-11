"""Context building for "Ask Jarvis" questions, and token usage accounting.

Only data relevant to the question is sent: a question about bench gets bench sets,
a weight question gets weigh-ins. A question that matches no topic gets a compact
overview. No provider SDK is imported here; the API's LLMProvider sends the prompt.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal

from jarvis_core.analysis import (
    SetRow,
    WeightPoint,
    daily_rollup,
    daily_weights,
    epley,
    exercise_summaries,
    lift_forecast,
    weight_projection,
    window_summary,
)

Topic = Literal["workouts", "weight"]

MAX_CONTEXT_CHARS = 24_000
MAX_SET_ROWS = 300

TOPIC_WORDS: dict[Topic, set[str]] = {
    "workouts": {
        "workout", "workouts", "lift", "lifts", "lifting", "gym", "set", "sets", "rep",
        "reps", "1rm", "e1rm", "pr", "prs", "max", "strength", "stronger", "volume",
        "train", "training", "exercise", "exercises", "session", "sessions", "progress",
        "plateau", "failure", "failed", "deload",
    },
    "weight": {
        "weight", "weigh", "weighed", "weigh-in", "scale", "lb", "lbs", "kg", "pounds",
        "bodyweight", "fat", "gain", "gained", "lose", "lost", "cut", "bulk", "heavier",
        "lighter",
    },
}  # fmt: skip

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "is", "are", "was", "were", "be", "been",
    "my", "me", "i", "you", "your", "what", "how", "much", "many", "when", "did", "do",
    "does", "have", "has", "had", "for", "from", "with", "this", "that", "these", "those",
    "last", "past", "week", "weeks", "month", "months", "day", "days", "year", "compare",
    "compared", "vs", "versus", "than", "about", "over", "into", "can", "could", "would",
    "should", "will", "just", "most", "more", "less", "average", "avg", "going",
}  # fmt: skip

ASK_SYSTEM = """You are Jarvis, the assistant inside the user's workout and body-weight tracker.
You get the user's own data related to the question: summary stats, daily totals, sets
and weigh-ins.

Keep the answer concise and straight to the point, in plain text. Lead with the direct
answer and include the numbers (with a date when it matters) that support it; say only
what the question needs, and stop. No
preamble, no restating the question, no bullet lists, no headings, no markdown, and no
general training advice unless the user asks for it. Only the data relevant to the
question is included; if it can't answer the question, say so in one sentence. Never
invent data. Don't give medical advice.

Data notes: weights are in lb; answer in {unit}. A blank weight or sets value means
nothing was logged that day. In sets: good_reps are completed reps, failed_reps are
failed attempts on top of them ("12x1f" = 12 good + 1 failed; "2xf" = 1 good + 1
failed). estimated = the weight was a guess (midpoint of a range). bodyweight = only
body weight was lifted (weight_lb is their latest weigh-in). per_hand = the weight is
per dumbbell. Estimated 1RM (e1RM) uses Epley: weight x (1 + good_reps / 30)."""


def question_topics(question: str, exercises: Sequence[str] = ()) -> tuple[set[Topic], list[str]]:
    """Topics a question is about, and the exercises it names ('bench' -> 'bench press')."""
    q = question.lower()
    words = set(re.findall(r"[a-z0-9.\-]+", q))
    topics: set[Topic] = {t for t, vocab in TOPIC_WORDS.items() if words & vocab}
    keys = [w for w in re.findall(r"[a-z]{3,}", q) if w not in STOPWORDS]
    named = [n for n in exercises if any(w in n.split() or w == n for w in keys) or n in q]
    if named:
        topics.add("workouts")
    return topics, named


def _fmt(v: float | None, digits: int = 1) -> str:
    return "" if v is None else f"{v:.{digits}f}"


def _stats(sets: Sequence[SetRow], weighins: Sequence[WeightPoint], today: date, days: int) -> str:
    start = today - timedelta(days=days - 1)
    lines = []
    w = [p for p in daily_weights(weighins) if start <= p.day <= today]
    if w:
        k = min(3, max(1, len(w) // 2))
        change = sum(p.weight_lb for p in w[-k:]) / k - sum(p.weight_lb for p in w[:k]) / k
        avg = sum(p.weight_lb for p in w) / len(w)
        lines.append(
            f"Weight: latest {w[-1].weight_lb:.1f} lb on {w[-1].day}, avg {avg:.1f}, "
            f"change {change:+.1f} lb ({len(w)} weigh-ins)"
        )
    summary = window_summary(sets, today, days)
    if summary.sets:
        lines.append(
            f"Training: {summary.sessions} sessions ({summary.sessions / (days / 7):.1f}/week), "
            f"{summary.sets} sets, {summary.good_reps} good reps"
            + (f" (+{summary.failed_reps} failed)" if summary.failed_reps else "")
            + f", {summary.volume_lb:,.0f} lb volume"
        )
    return "\n".join(lines) or "Nothing logged."


def _csv(header: Sequence[str], rows: Sequence[Sequence[object]]) -> str:
    def cell(v: object) -> str:
        if v is None:
            return ""
        if isinstance(v, bool):
            return "1" if v else "0"
        if isinstance(v, float):
            return f"{v:.1f}"
        return str(v).replace(",", " ")

    return "\n".join([",".join(header), *(",".join(cell(v) for v in r) for r in rows)])


def build_context(
    question: str,
    sets: Sequence[SetRow],
    weighins: Sequence[WeightPoint],
    today: date,
    days: int = 120,
) -> tuple[str, set[Topic]]:
    """The data sent with a question. `sets` must already be prepared (canonical names,
    bodyweight loads). Returns the context text and the topics it covered."""
    exercises = [e.exercise for e in exercise_summaries(sets)]
    topics, named = question_topics(question, exercises)
    general = not topics
    if not sets and not weighins:
        return "No training data logged yet.", topics

    parts = [
        "## Stats (last 30 days)\n" + _stats(sets, weighins, today, 30),
        "## Stats (last 90 days)\n" + _stats(sets, weighins, today, 90),
    ]

    start = today - timedelta(days=days - 1)
    cols: list[str] = []
    if general or "weight" in topics:
        cols.append("weight_lb")
    if general or "workouts" in topics:
        cols += ["sets", "volume_lb"]
    rollup = [r for r in daily_rollup(sets, weighins, start, today) if r.sets or r.weight_lb]
    rows = []
    for r in rollup:
        vals = {"weight_lb": r.weight_lb, "sets": r.sets or None, "volume_lb": r.volume_lb or None}
        rows.append([r.day.isoformat(), *(vals[c] for c in cols)])
    parts.append(f"## Daily totals (last {days} days, CSV)\n" + _csv(["date", *cols], rows))

    if "weight" in topics:
        notes = [p for p in weighins if p.note][-30:]
        if notes:
            parts.append(
                "## Weigh-in notes\n"
                + _csv(["date", "weight_lb", "note"], [(p.day, p.weight_lb, p.note) for p in notes])
            )
        proj = weight_projection(weighins)
        if proj:
            parts.append(
                f"## Weight trend\n{proj.slope_per_week:+.2f} lb/week over {proj.span_days} days; "
                f"projected {proj.pred:.1f} lb on {proj.target_day} "
                f"(range {proj.low:.1f}-{proj.high:.1f})"
            )

    if general or "workouts" in topics:
        top = exercise_summaries(sets)[:40]
        parts.append(
            "## Exercises (total sets, best e1RM lb)\n"
            + ", ".join(f"{e.exercise} ({e.sets}, {_fmt(e.best_e1rm, 0) or '-'})" for e in top)
        )

    if "workouts" in topics and sets:
        if named:
            chosen = [s for s in sets if s.exercise in named][-MAX_SET_ROWS:]
            what = f"every logged set of {', '.join(named)}"
        else:
            days_logged = sorted({s.day for s in sets})[-12:]
            chosen = [s for s in sets if s.day >= days_logged[0]]
            what = "the last 12 sessions"
        parts.append(
            f"## Sets ({what}; weights in lb)\n"
            + _csv(
                ["date", "exercise", "good_reps", "failed_reps", "weight_lb", "e1rm",
                 "estimated", "bodyweight", "per_hand"],
                [
                    (s.day, s.exercise, s.good_reps, s.failed_reps, s.weight_lb,
                     epley(s.weight_lb, s.good_reps), s.estimated, s.bodyweight, s.per_hand)
                    for s in chosen
                ],
            )
        )  # fmt: skip
        for name in named[:3]:
            f = lift_forecast(sets, name)
            if f:
                p = f.projection
                parts.append(
                    f"## {name} e1RM trend\n{p.slope_per_week:+.1f} lb/week over "
                    f"{p.points} sessions; now ~{p.now:.0f} lb, best {f.best:.0f} lb; "
                    f"projected {p.pred:.0f} lb on {p.target_day} "
                    f"(range {p.low:.0f}-{p.high:.0f})"
                )

    sent: list[str] = [*sorted(topics)] or ["overview"]
    parts.insert(0, f"(Today is {today}. Only data relevant to the question: {', '.join(sent)}.)")
    text = "\n\n".join(parts)
    if len(text) > MAX_CONTEXT_CHARS:
        text = text[:MAX_CONTEXT_CHARS] + "\n(truncated)"
    return text, topics


def user_message(question: str, context: str) -> str:
    return f"<data>\n{context}\n</data>\n\nQuestion: {question}"


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens


def usage_from(raw: Any) -> Usage:
    """Token counts from a provider's usage object. Cached input counts as input.
    Missing fields count as 0; never raises."""
    if raw is None:
        return Usage(0, 0)

    def get(name: str) -> int:
        v = raw.get(name) if isinstance(raw, dict) else getattr(raw, name, None)
        return int(v) if isinstance(v, int | float) else 0

    tokens_in = sum(
        get(k) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
    )
    return Usage(tokens_in, get("output_tokens"))
