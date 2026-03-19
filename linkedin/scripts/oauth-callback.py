#!/usr/bin/env python3
"""
Tiny HTTP server to capture LinkedIn OAuth callback code.
Listens on localhost:8080, captures the ?code= parameter,
then exits.

Usage:
  python3 linkedin/scripts/oauth-callback.py
  # Then open the auth URL in your browser
  # After approving, this server captures the code and prints it
"""

import http.server
import urllib.parse
import sys

class OAuthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if 'code' in params:
            code = params['code'][0]
            state = params.get('state', [''])[0]

            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b"""
<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
<h1>LinkedIn OAuth Success!</h1>
<p>Authorization code captured. You can close this tab.</p>
<p style="color: #666;">Check your terminal for next steps.</p>
</body></html>
""")

            print(f"\n=== OAuth Code Captured ===")
            print(f"Code: {code}")
            print(f"State: {state}")
            print(f"\nNow run the token exchange (see terminal output).\n")

            # Write code to a temp file for the exchange script
            with open('/tmp/linkedin_oauth_code.txt', 'w') as f:
                f.write(code)

            # Signal shutdown
            import threading
            threading.Thread(target=self.server.shutdown).start()

        elif 'error' in params:
            error = params['error'][0]
            desc = params.get('error_description', [''])[0]
            self.send_response(400)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(f"""
<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
<h1>OAuth Error</h1>
<p>{error}: {desc}</p>
</body></html>
""".encode())
            print(f"\nOAuth Error: {error} — {desc}")
            import threading
            threading.Thread(target=self.server.shutdown).start()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress default logging

if __name__ == '__main__':
    port = 8080
    server = http.server.HTTPServer(('localhost', port), OAuthHandler)
    print(f"Listening on http://localhost:{port}/callback for OAuth redirect...")
    print("Waiting for LinkedIn to redirect back...\n")
    server.serve_forever()
    print("Server stopped.")
