import tkinter as tk
from tkinter import font as tkfont
import subprocess
import threading
import webbrowser
import os
import sys
import socket
from datetime import datetime

PORT     = 8787
BASE_URL = f"http://127.0.0.1:{PORT}"
APP_DIR  = os.path.dirname(os.path.abspath(__file__))

server_proc = None


# ─── helpers ──────────────────────────────────────────────

def is_running():
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=0.4):
            return True
    except Exception:
        return False


def ts():
    return datetime.now().strftime("%H:%M:%S")


def log(msg):
    log_box.config(state="normal")
    log_box.insert("end", f"[{ts()}] {msg}\n")
    log_box.see("end")
    log_box.config(state="disabled")


def set_status(running):
    if running:
        dot.config(fg="#22c55e")
        status_lbl.config(text="伺服器運行中")
        btn_start.config(state="disabled", bg="#9ca3af")
        btn_stop.config(state="normal",    bg="#ef4444", fg="white")
    else:
        dot.config(fg="#ef4444")
        status_lbl.config(text="伺服器已停止")
        btn_start.config(state="normal",   bg="#1D9E75", fg="white")
        btn_stop.config(state="disabled",  bg="#e5e7eb", fg="#6b7280")


# ─── server control ───────────────────────────────────────

def start_server():
    global server_proc
    if is_running():
        log("Port 8787 已有伺服器在運行")
        set_status(True)
        return
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=APP_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=flags,
    )
    set_status(True)
    log(f"伺服器已啟動 → {BASE_URL}")

    def _read():
        for line in server_proc.stdout:
            line = line.strip()
            if line:
                root.after(0, log, line)
        root.after(0, set_status, False)
        root.after(0, log, "伺服器程序已結束")

    threading.Thread(target=_read, daemon=True).start()


def stop_server():
    global server_proc
    stopped = False
    if server_proc and server_proc.poll() is None:
        server_proc.terminate()
        server_proc = None
        stopped = True
    elif is_running():
        try:
            r = subprocess.run(["netstat", "-ano"], capture_output=True, text=True)
            for line in r.stdout.splitlines():
                if f":{PORT}" in line and "LISTENING" in line:
                    pid = line.strip().split()[-1]
                    subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
                    log(f"已強制終止 PID {pid}")
                    stopped = True
                    break
        except Exception as e:
            log(f"強制關閉失敗：{e}")
    if stopped:
        set_status(False)
        log("伺服器已關閉")
    else:
        log("伺服器本來就沒有在運行")
        set_status(False)


def open_page(path=""):
    if not is_running():
        log("⚠️  伺服器未啟動，請先按「啟動伺服器」")
        return
    url = f"{BASE_URL}/{path}"
    webbrowser.open(url)
    log(f"開啟：{url}")


def on_close():
    stop_server()
    root.destroy()


# ─── build GUI ────────────────────────────────────────────

root = tk.Tk()
root.title("TOEIC 學習程式 啟動器")
root.geometry("400x560")
root.resizable(False, False)
root.configure(bg="#f8faf9")
root.protocol("WM_DELETE_WINDOW", on_close)

# fonts
try:
    F_TITLE  = tkfont.Font(family="Microsoft JhengHei", size=13, weight="bold")
    F_BTN    = tkfont.Font(family="Microsoft JhengHei", size=11)
    F_SMALL  = tkfont.Font(family="Microsoft JhengHei", size=10)
except Exception:
    F_TITLE  = tkfont.Font(size=13, weight="bold")
    F_BTN    = tkfont.Font(size=11)
    F_SMALL  = tkfont.Font(size=10)
F_LOG = tkfont.Font(family="Consolas", size=9)

# header
hdr = tk.Frame(root, bg="#1D9E75", pady=14)
hdr.pack(fill="x")
tk.Label(hdr, text="TOEIC 570 → 750 學習程式",
         font=F_TITLE, bg="#1D9E75", fg="white").pack()

# status row
sf = tk.Frame(root, bg="#f8faf9", pady=10)
sf.pack(fill="x", padx=20)
dot = tk.Label(sf, text="●", font=("Segoe UI", 18),
               bg="#f8faf9", fg="#ef4444")
dot.pack(side="left")
status_lbl = tk.Label(sf, text="伺服器已停止",
                      font=F_SMALL, bg="#f8faf9", fg="#6b7280")
status_lbl.pack(side="left", padx=8)

# server buttons
srv = tk.Frame(root, bg="#f8faf9")
srv.pack(fill="x", padx=20, pady=2)

btn_start = tk.Button(
    srv, text="▶  啟動伺服器", font=F_BTN,
    bg="#1D9E75", fg="white", activebackground="#15705a",
    relief="flat", bd=0, padx=10, pady=10, cursor="hand2",
    command=start_server,
)
btn_start.pack(side="left", expand=True, fill="x", padx=(0, 6))

btn_stop = tk.Button(
    srv, text="■  關閉伺服器", font=F_BTN,
    bg="#e5e7eb", fg="#6b7280", activebackground="#d1d5db",
    relief="flat", bd=0, padx=10, pady=10, cursor="hand2",
    state="disabled", command=stop_server,
)
btn_stop.pack(side="left", expand=True, fill="x")

# divider
tk.Frame(root, height=1, bg="#e5e7eb").pack(fill="x", padx=20, pady=12)

# page buttons
tk.Label(root, text="開啟頁面", font=F_SMALL,
         bg="#f8faf9", fg="#9ca3af").pack(anchor="w", padx=20)

PAGES = [
    ("🏠   首頁（今日課程）",    "index.html",        "#1D9E75", "white"),
    ("📊   進度總覽",            "progress.html",     "#2563eb", "white"),
    ("💉   注入學習記錄（首次）", "seed-progress.html","#7c3aed", "white"),
]

for label, path, bg, fg in PAGES:
    tk.Button(
        root, text=label, font=F_BTN,
        bg=bg, fg=fg, activebackground=bg,
        relief="flat", bd=0, padx=16, pady=10,
        cursor="hand2", anchor="w",
        command=lambda p=path: open_page(p),
    ).pack(fill="x", padx=20, pady=3)

# hard-refresh helper page
def open_hard_refresh():
    if not is_running():
        log("⚠️  伺服器未啟動，請先按「啟動伺服器」")
        return
    url = f"{BASE_URL}/clear-sw.html"
    webbrowser.open(url)
    log(f"開啟快取清除頁面，請按頁面上的按鈕後再開啟首頁")

tk.Button(
    root, text="🔄   清除快取（UI 沒更新時用）", font=F_BTN,
    bg="#dc2626", fg="white", activebackground="#b91c1c",
    relief="flat", bd=0, padx=16, pady=10,
    cursor="hand2", anchor="w",
    command=open_hard_refresh,
).pack(fill="x", padx=20, pady=3)

# divider
tk.Frame(root, height=1, bg="#e5e7eb").pack(fill="x", padx=20, pady=10)

# log area
tk.Label(root, text="記錄", font=F_SMALL,
         bg="#f8faf9", fg="#9ca3af").pack(anchor="w", padx=20)

lf = tk.Frame(root, bg="#f8faf9")
lf.pack(fill="both", expand=True, padx=20, pady=(4, 16))

log_scroll = tk.Scrollbar(lf)
log_scroll.pack(side="right", fill="y")

log_box = tk.Text(
    lf, font=F_LOG, height=7,
    bg="#1e293b", fg="#e2e8f0",
    relief="flat", bd=0, state="disabled",
    wrap="word", padx=8, pady=6,
    yscrollcommand=log_scroll.set,
)
log_box.pack(side="left", fill="both", expand=True)
log_scroll.config(command=log_box.yview)

# ─── init check ───────────────────────────────────────────
if is_running():
    set_status(True)
    log(f"偵測到伺服器已在運行 → {BASE_URL}")
else:
    log("伺服器未啟動，請按「▶ 啟動伺服器」")

root.mainloop()
