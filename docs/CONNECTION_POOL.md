# Connection Pool (Phase 8A)

Environment-driven (do not hardcode one size for all deployments).

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_POOL_SIZE` | 5 | Persistent connections per process |
| `DB_MAX_OVERFLOW` | 10 | Extra burst connections |
| `DB_POOL_RECYCLE` | 3600 | Recycle seconds (avoid stale NAT/firewall cuts) |

Prefer `pool_pre_ping=True` in engine setup so dead connections are detected.

## Starting recommendations

| Footprint | pool_size | max_overflow | Notes |
| --- | --- | --- | --- |
| Single-store / 1 API worker | 5 | 10 | Matches defaults |
| Multi-store / few workers | 10 | 20 | Watch PG `max_connections` |
| Many workers / K8s replicas | size carefully | — | `replicas × (pool + overflow) < max_connections` |

Long transactions and missing pagination increase pool pressure more than pool size alone. Keep POS transactions short; use inventory locks only where required.
