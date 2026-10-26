"""Loopback-only UI fixture. No production login, credentials or writes.

Usage: python tools/preview_admin_app.py --role admin_curator --port 4194
The served responses (not source files) replace the Telegram SDK and API origin.
Never deploy this helper as an HTTP service or use it for production access.
"""
import argparse
import json
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT.parent / "tg-admin-bot-redzone"
sys.path.insert(0, str(BACKEND))
from admin_app import section_manifest, PREFERENCE_DEFAULTS  # noqa: E402
from access_control import ROLE_SPECS  # noqa: E402
from admin_stats_fixtures import statistics  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", default="admin_curator", choices=["master", "staff", *ROLE_SPECS])
    parser.add_argument("--port", type=int, default=4194)
    parser.add_argument("--stats-fixtures", action="store_true", help="Synthetic read-only statistics for UI QA, not an integration test")
    parser.add_argument("--fail-stats-once", action="store_true", help="Return one 503 before the synthetic statistics")
    args = parser.parse_args()
    user_id, master_id = (999, 999) if args.role == "master" else (101, 999)
    roles = {user_id: args.role} if args.role in ROLE_SPECS else {}
    preferences = dict(PREFERENCE_DEFAULTS)
    requests = []
    fail_stats_once = args.fail_stats_once
    sdk = """(()=>{const events=new Map();const button=()=>({show(){return this},hide(){return this},enable(){return this},disable(){return this},showProgress(){return this},hideProgress(){return this},setParams(){return this},setText(){return this},onClick(fn){events.set('mainButtonClicked',fn);return this},offClick(fn){if(events.get('mainButtonClicked')===fn)events.delete('mainButtonClicked');return this}});window.Telegram={WebApp:{initData:window.parent===window?'qa-signed-data':'',initDataUnsafe:{user:{id:USER_ID,first_name:'Demo',username:'demo_profile'}},version:'9.6',platform:'tdesktop',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},isVersionAtLeast(){return true},onEvent(key,fn){events.set(key,fn)},offEvent(key,fn){if(events.get(key)===fn)events.delete(key)},MainButton:button(),SecondaryButton:button(),BackButton:button(),HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}},close(){},openLink(){},openTelegramLink(){}}}})();""".replace("USER_ID", str(user_id))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, status, content, mime="application/json; charset=utf-8"):
            if not isinstance(content, bytes):
                content = content.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path.startswith("/api/"):
                self.api({})
                return
            if path == "/__qa/telegram.js":
                self.send(200, sdk, "text/javascript; charset=utf-8")
                return
            if path == "/__qa/requests":
                self.send(200, json.dumps(requests))
                return
            filename = (ROOT / path.lstrip("/")).resolve()
            if not filename.is_relative_to(ROOT) or not filename.is_file():
                self.send(404, "Not found", "text/plain")
                return
            content = filename.read_bytes()
            if filename.suffix in {".html", ".js"}:
                text = content.decode("utf-8")
                text = text.replace("https://telegram.org/js/telegram-web-app.js", "/__qa/telegram.js")
                text = text.replace("https://tg-admin-bot-1k1g.onrender.com", f"http://127.0.0.1:{args.port}")
                # Clear fixture data is visible in the actual UI.
                content = text.encode("utf-8")
            mime = mimetypes.guess_type(str(filename))[0] or "application/octet-stream"
            self.send(200, content, mime + ("; charset=utf-8" if filename.suffix in {".html", ".js", ".css"} else ""))

        def do_POST(self):
            size = min(int(self.headers.get("Content-Length", "0")), 8192)
            payload = json.loads(self.rfile.read(size) or b"{}")
            self.api(payload)

        def api(self, payload):
            nonlocal fail_stats_once
            valid = self.headers.get("X-Telegram-Init-Data") == "qa-signed-data"
            requests.append({"path": urlsplit(self.path).path, "authenticated": valid})
            del requests[:-100]
            if not valid:
                self.send(403, json.dumps({"status": "error", "message": "Fixture: signed parent context missing"}))
                return
            if urlsplit(self.path).path == "/api/app":
                if payload.get("action") == "save_preferences":
                    for key, value in payload.get("preferences", {}).items():
                        if key in preferences and type(value) is bool:
                            preferences[key] = value
                    data = {"preferences": preferences}
                else:
                    data = {
                        "release": "local-qa", "viewer": {
                            "telegram_id": user_id, "nickname": "Demo_Admin",
                            "first_name": "Demo", "username": "demo_profile",
                            "photo_url": "", "is_master": args.role == "master",
                            "role_title": "Главный администратор" if args.role == "master" else ROLE_SPECS.get(args.role, {}).get("title", "Администратор"),
                        },
                        "server": {"name": "ЛОКАЛЬНЫЙ СТЕНД", "number": "68"},
                        "preferences": preferences, "preferences_available": True,
                        "sections": section_manifest(
                            user_id=user_id, master_id=master_id, is_staff=True,
                            roles=roles, task_access=args.role == "master",
                            leadership_task_access=args.role == "master",
                        ),
                    }
                self.send(200, json.dumps({"status": "success", "data": data}, ensure_ascii=False))
            else:
                path = urlsplit(self.path).path
                fixture = statistics(path, user_id) if args.stats_fixtures else None
                if path == "/api/norms" and payload.get("action") != "bootstrap":
                    fixture = None  # No simulated successful writes.
                if fixture is not None:
                    section = "my-statistics" if path.startswith("/api/dashboard/") else "inactive-statistics" if path == "/api/inactive/overview" else "norm-check" if path == "/api/norms" else "administration"
                    sections = section_manifest(user_id=user_id, master_id=master_id, is_staff=True, roles=roles)
                    if not any(row["id"] == section and row["allowed"] for row in sections):
                        self.send(403, json.dumps({"status":"error","message":"Локальный стенд: доступ закрыт должности."}, ensure_ascii=False))
                        return
                    if fail_stats_once:
                        fail_stats_once = False
                        self.send(503, json.dumps({"status":"error","message":"Локальный стенд: тест временной ошибки."}, ensure_ascii=False))
                        return
                    self.send(200, json.dumps({"status":"success","data":fixture}, ensure_ascii=False))
                    return
                # Real feature data is intentionally not simulated as a passing
                # end-to-end integration test. The request log verifies auth.
                self.send(503, json.dumps({"status": "error", "message": "Локальный стенд: профиль и навигация работают, данные раздела здесь не подключены."}, ensure_ascii=False))

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"http://127.0.0.1:{args.port}/app.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
