"""Minimal Prometheus-style metrics (Phase 8B). No fake static values."""

from __future__ import annotations

import threading
import time
from collections import defaultdict

_lock = threading.Lock()
_counters: dict[str, float] = defaultdict(float)
_hist_sum: dict[str, float] = defaultdict(float)
_hist_count: dict[str, float] = defaultdict(float)
_start = time.time()


def incr(name: str, value: float = 1.0, **labels: str) -> None:
    key = _key(name, labels)
    with _lock:
        _counters[key] += value


def observe(name: str, value_ms: float, **labels: str) -> None:
    key = _key(name, labels)
    with _lock:
        _hist_sum[key] += value_ms
        _hist_count[key] += 1


def _key(name: str, labels: dict[str, str]) -> str:
    if not labels:
        return name
    parts = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
    return f"{name}{{{parts}}}"


def render_prometheus() -> str:
    lines = [
        "# HELP pulse_up 1 if process is up",
        "# TYPE pulse_up gauge",
        "pulse_up 1",
        f"# HELP pulse_process_uptime_seconds Process uptime",
        f"# TYPE pulse_process_uptime_seconds gauge",
        f"pulse_process_uptime_seconds {time.time() - _start:.3f}",
    ]
    with _lock:
        for k, v in sorted(_counters.items()):
            lines.append(f"# TYPE {k.split('{')[0]} counter")
            lines.append(f"{k} {v}")
        for k, total in sorted(_hist_sum.items()):
            count = _hist_count[k]
            base = k.split("{")[0]
            labels = ""
            if "{" in k:
                labels = "{" + k.split("{", 1)[1]
            lines.append(f"# TYPE {base}_sum counter")
            lines.append(f"{base}_sum{labels} {total}")
            lines.append(f"# TYPE {base}_count counter")
            lines.append(f"{base}_count{labels} {count}")
    return "\n".join(lines) + "\n"


def snapshot() -> dict:
    with _lock:
        return {
            "counters": dict(_counters),
            "latency_sum_ms": dict(_hist_sum),
            "latency_count": dict(_hist_count),
            "uptime_seconds": time.time() - _start,
        }
