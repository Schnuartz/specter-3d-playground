import http.server, socketserver, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.wasm': 'application/wasm',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.glb': 'model/gltf-binary',
        '.data': 'application/octet-stream',
    }
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
with socketserver.ThreadingTCPServer(('127.0.0.1', port), Handler) as httpd:
    print(f'Serving at http://127.0.0.1:{port}/')
    httpd.serve_forever()
