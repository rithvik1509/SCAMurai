"""Single-process, bounded per-peer fixed-window rate limiter.

Uses the socket peer, never trusts unconfigured forwarded headers.
"""
import time
from collections import OrderedDict

from starlette.responses import JSONResponse


class RateLimitMiddleware:
    def __init__(self, app, per_minute: int):
        self.app, self.limit = app, per_minute
        self.peers = OrderedDict()

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] == 'OPTIONS' or not scope.get('path', '').startswith('/api/'):
            return await self.app(scope, receive, send)
        peer = (scope.get('client') or ('unknown',))[0]
        minute = int(time.monotonic() // 60)
        window, count = self.peers.pop(peer, (minute, 0))
        count = count + 1 if window == minute else 1
        self.peers[peer] = (minute, count)
        while len(self.peers) > 10000:
            self.peers.popitem(last=False)
        if count > self.limit:
            response = JSONResponse({'error': {'code': 'rate_limited', 'message': 'Request rate exceeded. Retry shortly.', 'details': []},
                                     'request_id': scope.get('state', {}).get('request_id', '')},
                                    status_code=429, headers={'Retry-After': '60'})
            return await response(scope, receive, send)
        return await self.app(scope, receive, send)
