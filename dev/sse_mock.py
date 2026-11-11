"""PULSE 1.9.0 local test server: static files + a tiny mock of the real-time price stream.

    python dev/sse_mock.py <app dir> [port]      (default port 8797)

GET /api/stream?keys=K1,K2  -> Server-Sent Events like the real server:
    "retry: 5000", then every second per key: data: {"k","p","t","src","delayed"}
    The price is read from <app dir>/data/quotes.json on every tick (+ a tiny jitter, ?still=1 switches it off),
    so a test can move a price by rewriting quotes.json. ": hb" comment every 15 s.
Everything else is served as static files from <app dir>. Local testing only.
"""
import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8797
JITTER = os.environ.get('PULSE_MOCK_STILL') != '1'


def quotes():
    try:
        with open(os.path.join(ROOT, 'data', 'quotes.json'), encoding='utf-8') as f:
            return json.load(f).get('q', {})
    except Exception:
        return {}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):  # quiet
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path != '/api/stream':
            return super().do_GET()
        q = parse_qs(u.query)
        keys = [k for k in (q.get('keys', [''])[0]).split(',') if k][:80]
        still = q.get('still', ['0'])[0] == '1' or not JITTER
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.end_headers()
        try:
            self.wfile.write(b'retry: 5000\n\n')
            last_hb = time.time()
            while True:
                qs = quotes()
                now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                for k in keys:
                    x = qs.get(k)
                    if not x:
                        continue
                    p = float(x['p'])
                    if not still:
                        p = round(p * (1 + random.uniform(-0.0002, 0.0002)), 6)
                    msg = {'k': k, 'p': p, 't': now, 'src': x.get('src', 'mock'), 'delayed': bool(x.get('delayed', False))}
                    self.wfile.write(f'data: {json.dumps(msg)}\n\n'.encode())
                if time.time() - last_hb > 15:
                    self.wfile.write(b': hb\n\n')
                    last_hb = time.time()
                self.wfile.flush()
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return


if __name__ == '__main__':
    print(f'PULSE mock on http://127.0.0.1:{PORT}/ serving {ROOT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
