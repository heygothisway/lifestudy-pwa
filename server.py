import os
import sys
import io
import urllib.request
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webbrowser

PORT = 8080

class LifeStudyProxyHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/proxy':
            qs = urllib.parse.parse_qs(parsed.query)
            target_url = qs.get('url', [None])[0]
            if not target_url:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Missing ?url= parameter')
                return

            try:
                req = urllib.request.Request(target_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    content = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(content)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f'Proxy Error: {e}'.encode('utf-8'))
            return

        # Serve static files
        return super().do_GET()

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ('', PORT)
    try:
        httpd = HTTPServer(server_address, LifeStudyProxyHandler)
    except OSError:
        # Port already in use, try 8081
        httpd = HTTPServer(('', 8081), LifeStudyProxyHandler)
        print(f"8080 埠已被佔用，改用 8081 埠")

    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    active_port = httpd.server_port
    url = f"http://localhost:{active_port}"
    print("=" * 60)
    print(f"[Life-study] 生命讀經追求排程器 (PWA) 已啟動！")
    print(f"[URL] 請在瀏覽器開啟：{url}")
    print("=" * 60)
    print("提示：按 Ctrl+C 可停止伺服器\n")

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已安全停止。")

if __name__ == '__main__':
    run_server()
