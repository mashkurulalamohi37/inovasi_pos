"""Client IP resolution that only honours proxy headers from trusted peers.

``X-Forwarded-For`` is attacker-controlled unless the immediate peer is a
reverse proxy we operate. Trusting it unconditionally lets any client pick its
own rate-limit bucket (defeating the login throttle entirely) and write an
arbitrary address into the audit trail.

Resolution rules:
  * peer is NOT a trusted proxy -> use the socket address, ignore all headers.
  * peer IS a trusted proxy     -> walk ``X-Forwarded-For`` from the right and
    return the first entry that is not itself one of our proxies. The rightmost
    entry is the one our own proxy observed; entries further left were supplied
    by upstream hops and may be forged by the client.
"""

from __future__ import annotations

import ipaddress
import logging
from functools import lru_cache

from starlette.requests import Request

logger = logging.getLogger("pulse.net")

_Network = ipaddress.IPv4Network | ipaddress.IPv6Network

# Reverse proxies almost always sit on loopback or a private/container network.
# A client dialling in from the public internet can never present one of these
# as its socket address, so this default blocks header spoofing from the
# internet while keeping nginx / Docker Compose / Kubernetes deployments
# working without extra configuration.
_PRIVATE_NETS: tuple[_Network, ...] = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)

# Bound the header walk so a hostile client cannot make us parse a huge list.
_MAX_FORWARDED_ENTRIES = 16


@lru_cache(maxsize=8)
def _parse_trusted(raw: str) -> tuple[_Network, ...]:
    """Parse the TRUSTED_PROXIES setting into networks. Cached per raw value."""
    token = (raw or "").strip().lower()
    if token in ("", "none", "false"):
        return ()
    if token in ("private", "default"):
        return _PRIVATE_NETS
    nets: list[_Network] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part.lower() == "private":
            nets.extend(_PRIVATE_NETS)
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            logger.warning("TRUSTED_PROXIES: ignoring invalid entry %r", part)
    return tuple(nets)


def _trusted_networks() -> tuple[_Network, ...]:
    from app.config import settings

    return _parse_trusted(settings.trusted_proxies)


def is_trusted_proxy(address: str | None) -> bool:
    """True when ``address`` belongs to a configured reverse-proxy network."""
    if not address:
        return False
    nets = _trusted_networks()
    if not nets:
        return False
    try:
        addr = ipaddress.ip_address(address)
    except ValueError:
        return False
    return any(addr in net for net in nets)


def client_ip(request: Request) -> str | None:
    """Best-effort real client address, ignoring spoofable headers."""
    peer = request.client.host if request.client else None
    if not is_trusted_proxy(peer):
        return peer

    forwarded = request.headers.get("X-Forwarded-For")
    if not forwarded:
        return peer

    entries = [p.strip() for p in forwarded.split(",") if p.strip()]
    for candidate in reversed(entries[-_MAX_FORWARDED_ENTRIES:]):
        if is_trusted_proxy(candidate):
            continue  # another hop of our own infrastructure
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            continue  # obfuscated or malformed entry
        return candidate
    return peer
