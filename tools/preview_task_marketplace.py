"""Loopback-only task UI QA with disposable SQLite; no real accounts or rewards.

python tools/preview_task_marketplace.py --port 4196 --state free
Open /__fixture/mobile for a 390px-wide viewport using the actual page assets.
Never deploy this development server. No remote database/B2/Sheets is opened.
"""
import argparse
import json
import mimetypes
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "tg-admin-bot-redzone"))
from admin_task_marketplace import AdminTaskMarketplaceConfig, AdminTaskMarketplaceService  # noqa: E402
from admin_app import section_manifest, PREFERENCE_DEFAULTS  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4196)
    parser.add_argument("--state", choices=("free", "active", "pending"), default="free")
    parser.add_argument("--unified", action="store_true", help="Preview the real app shell and active-document bridge")
    args = parser.parse_args()
    temporary = tempfile.TemporaryDirectory()
    service = AdminTaskMarketplaceService(AdminTaskMarketplaceConfig(
        enabled=True, allowed_admin_ids=frozenset({101}), leader_ids=frozenset({900}),
        db_path=str(Path(temporary.name) / "fixture.sqlite3"), master_admin_id=900,
    ))
    service.store.ensure_schema()
    service.store.seed_templates()
    with service.store._connection() as connection:
        connection.execute("UPDATE admin_task_templates SET reward_reports = 350, reward_index = 2.5 WHERE template_id = 'crowd-control'")
        connection.execute("UPDATE admin_task_templates SET reward_reports = 0, reward_index = 4, reward_xp = 30 WHERE template_id = 'events-5'")
    roster = {101:"Demo_Admin",202:"Demo_North",203:"Demo_West",204:"Demo_River"}
    for admin_id, count in ((101,1),(202,3),(203,2),(204,1)):
        for _ in range(count):
            sample = service.store.take_task(admin_id,roster[admin_id],"events-5")
            service.store.submit_assignment(admin_id,sample["assignment_id"])
            service.review(900,sample["assignment_id"],"approve")
    if args.state != "free":
        assignment = service.take_task(101, "Demo_Admin", "events-5" if args.state == "pending" else "zov-5")
        if args.state == "pending":
            service.submit(101, assignment["assignment_id"])
        else:
            for step in range(3):
                service.mark_progress(900, "Demo_Reviewer", assignment["assignment_id"], f"fixture:entry:{step}")

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
            if path == "/__fixture/mobile":
                page = "/app.html?section=additional-tasks" if args.unified else "/admin-task-marketplace.html"
                self.send(200, '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Мобильный макет · 390 px</title><body style="margin:0;background:#030b17;display:grid;place-items:center;min-height:100vh"><iframe title="Тестовый мобильный экран" src="' + page + '" style="display:block;width:390px;height:860px;max-width:100vw;border:1px solid #29405f;border-radius:20px"></iframe></body></html>', "text/html; charset=utf-8")
                return
            if path == "/__fixture/telegram.js":
                init_data = "location.pathname.endsWith('/app.html')?'local-fixture':''" if args.unified else "'local-fixture'"
                self.send(200, "window.Telegram={WebApp:{initData:" + init_data + ",ready(){},expand(){},HapticFeedback:{notificationOccurred(){}}}};", "text/javascript")
                return
            if path == "/__fixture/bridge.js":
                self.send(200, "/* No production bridge on the local fixture. */", "text/javascript")
                return
            filename = (ROOT / path.lstrip("/")).resolve()
            if not filename.is_relative_to(ROOT) or not filename.is_file() or filename.suffix not in {".html", ".css", ".js"}:
                self.send(404, "Not found", "text/plain")
                return
            content = filename.read_text(encoding="utf-8")
            if filename.suffix == ".html":
                content = content.replace("https://telegram.org/js/telegram-web-app.js", "/__fixture/telegram.js").replace("Закрытый тест", "ТЕСТОВЫЕ ДАННЫЕ")
                if not args.unified:
                    content = content.replace('src="admin-app-bridge.js?v=20261026-1"', 'src="/__fixture/bridge.js"')
            content = content.replace("https://tg-admin-bot-1k1g.onrender.com", f"http://127.0.0.1:{args.port}")
            self.send(200, content, (mimetypes.guess_type(str(filename))[0] or "text/plain") + "; charset=utf-8")

        def do_POST(self):
            api_path = urlsplit(self.path).path
            if api_path not in {"/api/admin/tasks", "/api/app"} or self.headers.get("X-Telegram-Init-Data") != "local-fixture":
                self.send(403, '{}')
                return
            try:
                body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", "0")), 8192)))
                action = body.get("action", "bootstrap")
                if api_path == "/api/app":
                    if not args.unified or action != "bootstrap":
                        raise ValueError("Локальный стенд: действие не подключено.")
                    data = {
                        "release": "local-qa", "viewer": {"telegram_id": 101, "nickname": "Demo_Admin", "is_master": False, "role_title": "Куратор агентов поддержки"},
                        "server": {"name": "ЛОКАЛЬНЫЙ СТЕНД", "number": "68"},
                        "preferences": dict(PREFERENCE_DEFAULTS), "preferences_available": True,
                        "sections": section_manifest(user_id=101, master_id=900, is_staff=True, roles={101: "support_curator"}, task_access=True),
                    }
                    self.send(200, json.dumps({"status": "success", "data": data}, ensure_ascii=False))
                    return
                if action == "bootstrap":
                    data = service.bootstrap(101)
                    data["viewer"].update(is_master=False)
                    data["wallet"].update(report_balance=550, index_bonus_total=8.5, index_bonus_active=2.5)
                elif action == "take_task":
                    data = service.take_task(101, "Demo_Admin", body.get("template_id", ""))
                elif action == "cancel":
                    data = service.cancel(101, body.get("assignment_id", ""))
                elif action == "submit":
                    data = service.submit(101, body.get("assignment_id", ""))
                elif action == "leaderboard":
                    data = service.leaderboard(101,roster,period=body.get("period","current"),offset=body.get("offset",0))
                else:
                    raise ValueError("Локальный стенд: это действие не подключено.")
                self.send(200, json.dumps({"status": "success", "data": data}, ensure_ascii=False))
            except (ValueError, TypeError, KeyError) as error:
                self.send(400, json.dumps({"status": "error", "message": str(error)}, ensure_ascii=False))

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"LOCAL FIXTURE ONLY: http://127.0.0.1:{args.port}/admin-task-marketplace.html", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        service.store.close_pool()
        temporary.cleanup()


if __name__ == "__main__":
    main()
