#!/usr/bin/env python3
"""Isolated Nouls preview. Only serves public demo assets; no directory listing."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import json
import os
import subprocess
import threading
import shutil
import secrets
import math
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
LIVE_SLOTS = threading.BoundedSemaphore(4)
SESSIONS = {}
SESSION_BUDGET = 0.0
# A request ceiling remains even with a cost budget, including zero-cost responses.
MAX_SESSION_REQUESTS = 10000
AILANG = shutil.which('ailang')
ASSETS = {'brand/ailang-logo.svg', 'brand/Montserrat-Regular.ttf', 'brand/Montserrat-Bold.ttf', 'brand/OFL.txt', 'brand/sunholo-tokens.css', 'woodland.webp', 'wary.webp', 'bold.webp', 'paranoid.webp', 'curious.webp', 'wary-walk.webp', 'bold-walk.webp', 'paranoid-walk.webp', 'curious-walk.webp'}
MODULES = {'world.ail', 'souls.ail', 'render.ail', 'oracle.ail', 'bank.ail', 'host.ail'}
class Handler(SimpleHTTPRequestHandler):
    def json_response(self, value, status=200):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if urlsplit(self.path).path not in {'/decisions/api/decision', '/decisions/api/session', '/decisions/api/character'}:
            self.send_error(404); return
        # Only same-origin browser clients. No CORS or public proxy service.
        origin = self.headers.get('Origin', '')
        if not origin or urlsplit(origin).netloc != self.headers.get('Host'):
            self.json_response({'ok': False, 'error': 'Same-origin request required'}, 403); return
        if SESSION_BUDGET <= 0:
            self.json_response({'ok': False, 'error': 'Live relay awaits an approved session budget. Offline exploration is available.'}, 503); return
        if urlsplit(self.path).path == '/decisions/api/session':
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = {'spent': 0.0, 'requests': 0}
            self.json_response({'ok': True, 'session': token, 'budget': SESSION_BUDGET}); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 262144:
                self.json_response({'ok': False, 'error': 'Request size exceeds 256 KB'}, 413); return
            payload = json.loads(self.rfile.read(length))
            session = SESSIONS.get(payload.get('session', ''))
            if session is None:
                self.json_response({'ok': False, 'error': 'Start a new live session before making judgments.'}, 403); return
            if session['spent'] >= SESSION_BUDGET or session['requests'] >= MAX_SESSION_REQUESTS:
                self.json_response({'ok': False, 'error': f"Session budget reached (${session['spent']:.6f} recorded). Start a new session to continue."}, 402); return
            key = self.headers.get('X-Nouls-Key', '').strip()
            if not key:
                self.json_response({'ok': False, 'error': 'Missing OpenRouter key'}, 400); return
            creating = urlsplit(self.path).path == '/decisions/api/character'
            if creating:
                if not isinstance(payload.get('name'), str) or not 1 <= len(payload['name'].strip()) <= 32 or not isinstance(payload.get('description'), str) or not 10 <= len(payload['description'].strip()) <= 400:
                    self.json_response({'ok': False, 'error': 'Use a name of 1–32 characters and a description of 10–400 characters'}, 400); return
                rpc = {k: payload[k] for k in ('name', 'description')}
                rpc['operation'] = 'character'
            else:
                if not isinstance(payload.get('world'), str) or payload.get('id') not in {f'c{i}' for i in range(1, 9)}:
                    self.json_response({'ok': False, 'error': 'Invalid world or creature'}, 400); return
                completed = payload.get('completed')
                if type(completed) is not int or completed < 0:
                    self.json_response({'ok': False, 'error': 'Invalid completed-decision count'}, 400); return
                rpc = {k: payload[k] for k in ('world', 'id', 'completed')}
            if not AILANG:
                self.json_response({'ok': False, 'error': 'AILANG CLI is unavailable'}, 503); return
            session_lock = session.setdefault('lock', threading.Lock())
            if not session_lock.acquire(blocking=False):
                self.json_response({'ok': False, 'retryable': True, 'error': 'This session is finishing a judgment. Retrying shortly.'}, 429); return
            if not LIVE_SLOTS.acquire(blocking=False):
                session_lock.release()
                self.json_response({'ok': False, 'retryable': True, 'error': 'The Studio is busy. Waiting for a judgment slot.'}, 429); return
            try:
                # Recheck under the session lock so concurrent requests cannot race the cap.
                if session['spent'] >= SESSION_BUDGET or session['requests'] >= MAX_SESSION_REQUESTS:
                    self.json_response({'ok': False, 'error': 'Session budget reached. Reset to start a new session.'}, 402); return
                session['requests'] += 1
                env = os.environ.copy()
                env['OPENROUTER_API_KEY'] = key
                env['AILANG_TRACE'] = 'off'
                result = subprocess.run(
                    [AILANG, 'run', '--quiet', '--trace-tier', 'off', '--caps', 'IO,Net,Env,Rand',
                     '--allow-env', 'OPENROUTER_API_KEY', '--net-allow-domains', 'openrouter.ai',
                     '--net-timeout', '25s', '--entry', 'main', 'live_server.ail'],
                    input=json.dumps(rpc)+'\n',
                    text=True, capture_output=True, cwd=ROOT, env=env, timeout=40)
                env.pop('OPENROUTER_API_KEY', None)
                if result.returncode:
                    self.json_response({'ok': False, 'error': 'AILANG judgment failed to execute. The server needs a runtime check.'}, 502)
                else:
                    # The CLI prints one JSON object. Never return diagnostics/env data.
                    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
                    value = json.loads(lines[-1])
                    if 'decision' in value or (value.get('ok') and 'row' in value):
                        decision = value['decision'] if 'decision' in value else json.loads(value['row']['decision'])
                        cost = decision.get('cost_usd')
                        if isinstance(cost, (int, float)) and math.isfinite(cost) and cost >= 0:
                            session['spent'] += cost
                        else:
                            session['spent'] = SESSION_BUDGET
                        value['sessionCost'] = session['spent']
                        value['sessionBudget'] = SESSION_BUDGET
                    self.json_response(value)
            finally:
                LIVE_SLOTS.release()
                session_lock.release()
        except subprocess.TimeoutExpired:
            self.json_response({'ok': False, 'error': 'Judgment timed out after 40 seconds. Session paused.'}, 504)
        except (ValueError, KeyError, IndexError):
            self.json_response({'ok': False, 'error': 'Invalid judgment request or runtime response'}, 400)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/decisions/api/status':
            self.json_response({'liveTransport': 'ailang-cli', 'available': bool(AILANG) and SESSION_BUDGET > 0, 'sessionBudget': SESSION_BUDGET}); return
        if path in ('/', '/decisions'):
            self.send_response(302); self.send_header('Location', '/decisions/'); self.end_headers(); return
        if path == '/decisions/': target = ROOT / 'site/index.html'
        elif path.startswith('/decisions/'):
            name = path.removeprefix('/decisions/')
            if name in MODULES: target = ROOT / name
            elif name.startswith('assets/') and name.removeprefix('assets/') in ASSETS: target = ROOT / 'site' / name
            elif name in {'app.js', 'motion.js', 'worker.js', 'style.css'}: target = ROOT / 'site' / name
            elif name in {'bank/synthetic.jsonl', 'bank/recorded.jsonl'}: target = ROOT / name
            elif name == 'ailang/pkg/sunholo/decisions/decide.ail': target = REPO.parent / 'ailang-packages/packages/decisions/decide.ail'
            else: self.send_error(404); return
        elif path in {'/wasm/ailang.wasm', '/wasm/wasm_exec.js'}: target = REPO / path.lstrip('/')
        else: self.send_error(404); return
        if not target.is_file(): self.send_error(404); return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'application/wasm' if target.suffix == '.wasm' else self.guess_type(str(target)))
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=86400' if target.suffix == '.webp' else 'no-store')
        self.end_headers(); self.wfile.write(data)
if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=8942)
    parser.add_argument('--session-budget', type=float, default=0.0, help='Approved USD budget per live session; 0 disables live')
    args = parser.parse_args()
    if not math.isfinite(args.session_budget) or args.session_budget < 0:
        parser.error('session-budget must be a finite nonnegative amount')
    SESSION_BUDGET = args.session_budget
    print(f'Nouls preview: http://127.0.0.1:{args.port}/decisions/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
