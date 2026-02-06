#!/usr/bin/env python3
"""
Development server for AILANG Invoice Processor Demo
Includes cache-busting headers to ensure fresh files on every request
"""

import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8888

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add cache-busting headers
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # CORS for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Color-coded logging
        path = args[0].split()[1] if args else ''
        if '.js' in path:
            print(f"\033[33m[JS]\033[0m {args[0]}")
        elif '.ail' in path:
            print(f"\033[36m[AIL]\033[0m {args[0]}")
        elif '.wasm' in path:
            print(f"\033[35m[WASM]\033[0m {args[0]}")
        else:
            print(f"[REQ] {args[0]}")

os.chdir(os.path.dirname(os.path.abspath(__file__)))

print(f"""
╔══════════════════════════════════════════════════════════════╗
║  AILANG Invoice Processor - Development Server               ║
╠══════════════════════════════════════════════════════════════╣
║  URL: http://localhost:{PORT:<5}                               ║
║  Cache: DISABLED (no-cache headers)                          ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
""")

with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
