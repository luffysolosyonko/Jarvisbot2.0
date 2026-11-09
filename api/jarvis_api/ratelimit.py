"""In-memory sliding-window rate limits.

Good for one process (local Docker, or Cloud Run with max instances = 1). With more
instances, move the counters to a shared store such as Redis or Postgres.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from jarvis_api.errors import ApiError


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, bucket: str, key: str, limit: int, window_s: float) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until it would be."""
        now = self._clock()
        with self._lock:
            q = self._hits.setdefault((bucket, key), deque())
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                return max(q[0] + window_s - now, 0.0)
            q.append(now)
            return None

    def enforce(self, bucket: str, key: str, limit: int, window_s: float) -> None:
        retry = self.hit(bucket, key, limit, window_s)
        if retry is not None:
            raise ApiError(
                429,
                "rate_limited",
                "Too many requests. Try again shortly.",
                headers={"Retry-After": str(max(1, math.ceil(retry)))},
            )

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
