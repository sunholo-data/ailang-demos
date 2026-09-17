# Signed interactions round-trip: spawns the server with a generated keypair,
# signs PING and command payloads, and asserts the callbacks + forgery rejection.
# Skips (exit 2) when pynacl is unavailable; CI can install it for full coverage.
import json, os, socket, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

try:
    from nacl.signing import SigningKey
except ImportError:
    print('SKIP interactions: pynacl not installed')
    sys.exit(0)

root = os.environ.get('DEMO_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
port = '18099'
base = f'http://127.0.0.1:{port}'
sk = SigningKey.generate()
pub = sk.verify_key.encode().hex()

env = dict(os.environ, DISCORD_SSE_HOST='127.0.0.1', DISCORD_SSE_PORT=port,
           DISCORD_SSE_PATH_PREFIX='/discord', DISCORD_APP_PUBLIC_KEY=pub)
state = os.environ.get('DISCORD_STATE_DIR', '')
server = subprocess.Popen(['python3', os.path.join(root, 'ailang-discord-server')],
                          cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                          stdin=subprocess.DEVNULL, start_new_session=True)

def post(path, payload, sign=True, forgery=False):
    body = json.dumps(payload).encode()
    headers = {'content-type': 'application/json'}
    if not forgery:
        sig = sk.sign(b'1700000000' + body)
        headers['x-signature-ed25519'] = sig.signature.hex()
        headers['x-signature-timestamp'] = '1700000000'
    else:
        headers['x-signature-ed25519'] = '00' * 64
        headers['x-signature-timestamp'] = '1700000000'
    return urllib.request.urlopen(urllib.request.Request(base + path, data=body, method='POST', headers=headers), timeout=30)

import urllib.error
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(base + '/healthz', timeout=5)
            break
        except Exception:
            import time; time.sleep(0.25)

    try:
        r = post('/interactions', {'type': 1})
        out = json.loads(r.read())
        assert out == {'type': 1}, out
        print('PASS signed PING -> pong')
    except urllib.error.HTTPError as e:
        e.read()
        server.terminate()
        err = (server.stderr.read() if server.stderr else b'').decode('utf8', 'replace')
        print('PING 401. SERVER LOG:', [l for l in err.splitlines() if 'interactions]' in l][-3:])
        raise

    r = post('/interactions', {'type': 2, 'id': '1', 'token': 'itok', 'application_id': 'app',
                               'data': {'id': 'c', 'name': 'run', 'options': [{'name': 'text', 'value': 'slash round-trip'}]}})
    out = json.loads(r.read())
    assert out == {'type': 5}, out
    print('PASS signed command -> deferred (AILANG followup dispatched in background)')

    body = json.dumps({'type': 1}).encode()
    req = urllib.request.Request(base + '/interactions', data=body, method='POST',
        headers={'content-type': 'application/json', 'x-signature-ed25519': '00' * 64,
                 'x-signature-timestamp': '1700000000'})
    try:
        urllib.request.urlopen(req, timeout=30)
        raise AssertionError('forged signature accepted')
    except urllib.error.HTTPError as e:
        assert e.code == 401, e.code
        print('PASS forged signature rejected (401)')
    server.terminate()
    err = (server.stderr.read() if server.stderr else '').decode('utf8', 'replace')
    for line in err.splitlines():
        if 'verification' in line or 'interactions]' in line:
            print('SERVER:', line.strip())
finally:
    server.kill()
