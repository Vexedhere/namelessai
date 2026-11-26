#!/usr/bin/env python3
"""
Nameless companion: lets your Nameless AI control THIS computer.

A web page is not allowed to change your volume, open apps or lock your screen. This small program (standard
library only, one file, no installs) runs on your computer and does those things when the Nameless web app asks.

Run it:
    python3 nameless_agent.py --origin https://YOUR-SITE.vercel.app
    python3 nameless_agent.py --origin http://localhost:3000 --allow-power --allow-input

Safety design (please read, it's short):
  * Listens on 127.0.0.1 only. Nothing outside this computer can reach it.
  * Every request needs the secret pairing code printed at start-up AND must come from an --origin you allowed.
  * It only does the fixed list of actions below. There is no "run this command" action; user text is never
    pasted into a shell, it is passed as data.
  * Lock / sleep / shutdown / restart need --allow-power. Typing and key presses need --allow-input.
    Without those flags they are refused no matter what the website says. The web app also asks you to
    approve shutdown, restart, sleep, typing and key presses every single time.
  * Every action is printed to this window. Press Ctrl+C to stop it; the AI loses control immediately.

Tested logic: the HTTP/security layer. The OS commands (volume, brightness, media, screenshots…) are written for
Windows, macOS and Linux but vary by machine; if one doesn't work on yours, the error is shown in the chat.
"""
import argparse
import base64
import hmac
import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

VERSION = "1.0.0"
SYSTEM = platform.system()  # 'Windows' | 'Darwin' | 'Linux'
CONFIG_PATH = Path.home() / ".nameless-agent.json"
MAX_BODY = 8 * 1024
MAX_ACTIONS_PER_MINUTE = 40


class ActionError(Exception):
    """A problem we want to show the user as-is."""


# ───────────────────────── helpers ─────────────────────────
def run(args, timeout=15, env_extra=None):
    """Run a program (never through a shell). Returns stdout; raises ActionError with a readable message."""
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env)
    except FileNotFoundError:
        raise ActionError(f"'{args[0]}' is not installed on this computer.")
    except subprocess.TimeoutExpired:
        raise ActionError("That took too long and was stopped.")
    if p.returncode != 0:
        msg = (p.stderr or p.stdout or "").strip().splitlines()
        raise ActionError(msg[-1][:200] if msg else f"'{args[0]}' failed (exit {p.returncode}).")
    return (p.stdout or "").strip()


def first_ok(*attempts):
    """Try several ways of doing the same thing; return the first that works."""
    errors = []
    for attempt in attempts:
        try:
            return attempt()
        except ActionError as e:
            errors.append(str(e))
    missing = [m.group(1) for m in (re.match(r"'(.+?)' is not installed", e) for e in errors) if m]
    if errors and len(missing) == len(errors):
        raise ActionError("None of the needed tools is installed (" + ", ".join(missing) + "). Install one of them to enable this.")
    raise ActionError(next((e for e in errors if "not installed" not in e), "Not supported on this computer."))


def ps(script, env_extra=None, timeout=20):
    """PowerShell with an encoded script, so no quoting can ever go wrong. User data goes in env vars."""
    enc = base64.b64encode(script.encode("utf-16-le")).decode()
    return run(["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", enc], timeout=timeout, env_extra=env_extra)


def osa(script, *argv):
    """AppleScript; user data is passed as arguments (item N of argv), never spliced into the script."""
    return run(["osascript", "-e", script, *[str(a) for a in argv]])


def number(params, key="value", lo=0, hi=100, default=None):
    v = params.get(key, default)
    try:
        v = float(v)
    except (TypeError, ValueError):
        if default is not None:
            return default
        raise ActionError(f"'{key}' must be a number between {lo} and {hi}.")
    if v != v or v < lo or v > hi:
        raise ActionError(f"'{key}' must be between {lo} and {hi}.")
    return v


def text_param(params, key, maxlen):
    v = params.get(key)
    if not isinstance(v, str) or not v.strip():
        raise ActionError(f"Missing '{key}'.")
    return v[:maxlen]


# ───────────────────────── volume ─────────────────────────
WIN_AUDIO = r"""
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-46C0-BB61-6B0E43B2F2A2")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static float Volume {
    get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, System.Guid.Empty)); }
  }
  public static bool Mute {
    get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, System.Guid.Empty)); }
  }
}
'@
"""


def get_volume():
    if SYSTEM == "Darwin":
        return int(osa("output volume of (get volume settings)"))
    if SYSTEM == "Windows":
        return round(float(ps(WIN_AUDIO + "[Audio]::Volume")) * 100)
    def wp():
        out = run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])  # "Volume: 0.45"
        return round(float(out.split()[1]) * 100)
    def pa():
        out = run(["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
        m = re.search(r"(\d+)%", out)
        if not m:
            raise ActionError("Could not read the volume.")
        return int(m.group(1))
    def am():
        out = run(["amixer", "sget", "Master"])
        m = re.search(r"\[(\d+)%\]", out)
        if not m:
            raise ActionError("Could not read the volume.")
        return int(m.group(1))
    return first_ok(wp, pa, am)


def set_volume(pct):
    pct = max(0, min(100, int(round(pct))))
    if SYSTEM == "Darwin":
        osa("on run argv\nset volume output volume (item 1 of argv as integer)\nend run", pct)
    elif SYSTEM == "Windows":
        ps(WIN_AUDIO + "[Audio]::Volume = [single]($env:NL_V / 100)", {"NL_V": str(pct)})
    else:
        first_ok(
            lambda: run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{pct}%"]),
            lambda: run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{pct}%"]),
            lambda: run(["amixer", "sset", "Master", f"{pct}%"]),
        )
    return pct


def act_volume_set(p):
    return f"Volume set to {set_volume(number(p, 'value', 0, 100))}%."


def act_volume_step(sign):
    def f(p):
        step = number(p, "value", 1, 100, 10)
        new = set_volume(get_volume() + sign * step)
        return f"Volume {'up' if sign > 0 else 'down'} to {new}%."
    return f


def act_mute(on):
    def f(_p):
        if SYSTEM == "Darwin":
            osa("set volume " + ("with" if on else "without") + " output muted")
        elif SYSTEM == "Windows":
            ps(WIN_AUDIO + "[Audio]::Mute = $" + ("true" if on else "false"))
        else:
            v = "1" if on else "0"
            first_ok(
                lambda: run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", v]),
                lambda: run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", v]),
                lambda: run(["amixer", "sset", "Master", "mute" if on else "unmute"]),
            )
        return "Muted." if on else "Unmuted."
    return f


# ───────────────────────── brightness ─────────────────────────
def get_brightness():
    if SYSTEM == "Windows":
        return int(ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness"))
    if SYSTEM == "Darwin":
        out = run(["brightness", "-l"])
        m = re.search(r"brightness\s+([0-9.]+)", out)
        if not m:
            raise ActionError("Could not read the brightness.")
        return round(float(m.group(1)) * 100)
    def bc():
        return int(run(["brightnessctl", "-m"]).split(",")[3].rstrip("%"))
    return first_ok(bc)


def set_brightness(pct):
    pct = max(1, min(100, int(round(pct))))
    if SYSTEM == "Windows":
        ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods).WmiSetBrightness(1, [int]$env:NL_V)", {"NL_V": str(pct)})
    elif SYSTEM == "Darwin":
        try:
            run(["brightness", f"{pct / 100:.2f}"])
        except ActionError as e:
            raise ActionError(f"{e} On macOS install it with: brew install brightness")
    else:
        first_ok(
            lambda: run(["brightnessctl", "set", f"{pct}%"]),
            lambda: run(["xbacklight", "-set", str(pct)]),
        )
    return pct


def act_brightness_set(p):
    return f"Brightness set to {set_brightness(number(p, 'value', 1, 100))}%."


def act_brightness_step(sign):
    def f(p):
        step = number(p, "value", 1, 100, 10)
        if SYSTEM == "Linux":
            first_ok(
                lambda: run(["brightnessctl", "set", f"{int(step)}%{'+' if sign > 0 else '-'}"]),
                lambda: run(["xbacklight", "-inc" if sign > 0 else "-dec", str(int(step))]),
            )
            return f"Brightness {'up' if sign > 0 else 'down'} by {int(step)}%."
        return f"Brightness {'up' if sign > 0 else 'down'} to {set_brightness(get_brightness() + sign * step)}%."
    return f


# ───────────────────────── media keys ─────────────────────────
def act_media(kind):
    win_key = {"play_pause": 179, "next": 176, "prev": 177}[kind]
    mac_cmd = {"play_pause": "playpause", "next": "next track", "prev": "previous track"}[kind]
    lin_cmd = {"play_pause": "play-pause", "next": "next", "prev": "previous"}[kind]
    lin_key = {"play_pause": "XF86AudioPlay", "next": "XF86AudioNext", "prev": "XF86AudioPrev"}[kind]
    label = {"play_pause": "Play/pause", "next": "Next track", "prev": "Previous track"}[kind]

    def f(_p):
        if SYSTEM == "Windows":
            ps("(New-Object -ComObject WScript.Shell).SendKeys([char]" + str(win_key) + ")")
        elif SYSTEM == "Darwin":
            script = (
                'if application "Spotify" is running then\n tell application "Spotify" to ' + mac_cmd + '\n return "ok"\nend if\n'
                'if application "Music" is running then\n tell application "Music" to ' + mac_cmd + '\n return "ok"\nend if\n'
                'return "none"'
            )
            if osa(script) == "none":
                raise ActionError("Neither Spotify nor Music is running.")
        else:
            first_ok(lambda: run(["playerctl", lin_cmd]), lambda: run(["xdotool", "key", lin_key]))
        return f"{label} sent."
    return f


# ───────────────────────── apps, links, screenshots ─────────────────────────
APP_NAME = re.compile(r"^[A-Za-z0-9 ._+-]{1,60}$")


def act_open_app(p):
    name = text_param(p, "app", 60).strip()
    if not APP_NAME.match(name):
        raise ActionError("That doesn't look like a plain application name.")
    if SYSTEM == "Windows":
        run(["cmd", "/c", "start", "", name])
    elif SYSTEM == "Darwin":
        run(["open", "-a", name])
    else:
        exe = shutil.which(name.lower().replace(" ", "-")) or shutil.which(name.lower().replace(" ", ""))
        if exe:
            subprocess.Popen([exe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        else:
            run(["gtk-launch", name.lower().replace(" ", "-")])
    return f"Opened {name}."


def act_open_url(p):
    url = text_param(p, "url", 2000).strip()
    u = urlparse(url)
    if u.scheme != "https" or not u.netloc:
        raise ActionError("Only https:// links can be opened.")
    if not webbrowser.open(url):
        raise ActionError("Could not open a browser.")
    return f"Opened {u.netloc} in the browser."


def act_screenshot(_p):
    folder = Path.home() / "Pictures" / "Nameless"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"screenshot-{time.strftime('%Y%m%d-%H%M%S')}.png"
    if SYSTEM == "Darwin":
        run(["screencapture", "-x", str(path)])
    elif SYSTEM == "Windows":
        ps(
            "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;"
            "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;"
            "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;"
            "$g=[System.Drawing.Graphics]::FromImage($bmp);"
            "$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size);"
            "$bmp.Save($env:NL_PATH,[System.Drawing.Imaging.ImageFormat]::Png)",
            {"NL_PATH": str(path)},
        )
    else:
        first_ok(
            lambda: run(["grim", str(path)]),
            lambda: run(["gnome-screenshot", "-f", str(path)]),
            lambda: run(["spectacle", "-b", "-n", "-f", "-o", str(path)]),
            lambda: run(["scrot", str(path)]),
            lambda: run(["import", "-window", "root", str(path)]),
        )
    if not path.exists():
        raise ActionError("The screenshot tool ran but no file was created (the OS may need screen-recording permission).")
    return f"Screenshot saved to {path}"


def act_notify(p):
    title = str(p.get("title") or "Nameless")[:80]
    body = text_param(p, "text", 200)
    if SYSTEM == "Darwin":
        osa("on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run", title, body)
    elif SYSTEM == "Windows":
        ps(
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;"
            "$n.ShowBalloonTip(5000,$env:NL_T,$env:NL_B,[System.Windows.Forms.ToolTipIcon]::None);Start-Sleep -Seconds 6;$n.Dispose()",
            {"NL_T": title, "NL_B": body},
        )
    else:
        run(["notify-send", "--", title, body])
    return "Notification shown."


def act_battery(_p):
    if SYSTEM == "Darwin":
        return run(["pmset", "-g", "batt"]).splitlines()[-1].strip()
    if SYSTEM == "Windows":
        out = ps("$b=Get-CimInstance Win32_Battery; if($b){\"$($b.EstimatedChargeRemaining)% (status $($b.BatteryStatus))\"} else {'No battery (desktop PC)'}")
        return out or "No battery found."
    bats = sorted(Path("/sys/class/power_supply").glob("BAT*"))
    if not bats:
        return "No battery found (desktop computer)."
    b = bats[0]
    return f"{(b / 'capacity').read_text().strip()}% ({(b / 'status').read_text().strip().lower()})"


# ───────────────────────── power (needs --allow-power) ─────────────────────────
def act_lock(_p):
    if SYSTEM == "Windows":
        run(["rundll32.exe", "user32.dll,LockWorkStation"])
    elif SYSTEM == "Darwin":
        run(["pmset", "displaysleepnow"])
    else:
        first_ok(lambda: run(["loginctl", "lock-session"]), lambda: run(["xdg-screensaver", "lock"]))
    return "Screen locked."


def act_sleep(_p):
    if SYSTEM == "Windows":
        run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
    elif SYSTEM == "Darwin":
        run(["pmset", "sleepnow"])
    else:
        run(["systemctl", "suspend"])
    return "Going to sleep."


def act_shutdown(_p):
    if SYSTEM == "Windows":
        run(["shutdown", "/s", "/t", "10"])
    elif SYSTEM == "Darwin":
        osa('tell application "System Events" to shut down')
    else:
        run(["systemctl", "poweroff"])
    return "Shutting down."


def act_restart(_p):
    if SYSTEM == "Windows":
        run(["shutdown", "/r", "/t", "10"])
    elif SYSTEM == "Darwin":
        osa('tell application "System Events" to restart')
    else:
        run(["systemctl", "reboot"])
    return "Restarting."


# ───────────────────────── typing (needs --allow-input) ─────────────────────────
WIN_KEYS = {"enter": "{ENTER}", "escape": "{ESC}", "tab": "{TAB}", "space": " ", "backspace": "{BACKSPACE}", "delete": "{DELETE}",
            "up": "{UP}", "down": "{DOWN}", "left": "{LEFT}", "right": "{RIGHT}", "home": "{HOME}", "end": "{END}",
            "pageup": "{PGUP}", "pagedown": "{PGDN}"}
MAC_KEYS = {"enter": 36, "escape": 53, "tab": 48, "space": 49, "backspace": 51, "delete": 117, "up": 126, "down": 125, "left": 123,
            "right": 124, "home": 115, "end": 119, "pageup": 116, "pagedown": 121}
MAC_F = [122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111]
LIN_KEYS = {"enter": "Return", "escape": "Escape", "tab": "Tab", "space": "space", "backspace": "BackSpace", "delete": "Delete",
            "up": "Up", "down": "Down", "left": "Left", "right": "Right", "home": "Home", "end": "End", "pageup": "Prior", "pagedown": "Next"}


def act_type_text(p):
    t = text_param(p, "text", 500)
    if SYSTEM == "Windows":
        ps(
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$t=[regex]::Replace($env:NL_TEXT,'[+^%~(){}\\[\\]]','{$0}');$t=$t -replace \"`r?`n\",'{ENTER}';"
            "[System.Windows.Forms.SendKeys]::SendWait($t)",
            {"NL_TEXT": t},
        )
    elif SYSTEM == "Darwin":
        osa('on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run', t)
    else:
        run(["xdotool", "type", "--delay", "20", "--", t])
    return f"Typed {len(t)} characters into the focused window."


def act_press_key(p):
    key = text_param(p, "key", 12).strip().lower()
    fn = re.fullmatch(r"f(\d{1,2})", key)
    fnum = int(fn.group(1)) if fn else 0
    if fn and not 1 <= fnum <= 12:
        raise ActionError("Function keys go from f1 to f12.")
    if not (key in WIN_KEYS or fn or (len(key) == 1 and key.isprintable())):
        raise ActionError("Unsupported key. Use enter, escape, tab, space, backspace, delete, arrows, home, end, pageup, pagedown, f1–f12 or one character.")
    if SYSTEM == "Windows":
        code = f"{{F{fnum}}}" if fn else WIN_KEYS.get(key, re.sub(r"[+^%~(){}\[\]]", lambda m: "{" + m.group(0) + "}", key))
        ps("Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait($env:NL_KEY)", {"NL_KEY": code})
    elif SYSTEM == "Darwin":
        if fn:
            osa('on run argv\ntell application "System Events" to key code (item 1 of argv as integer)\nend run', MAC_F[fnum - 1])
        elif key in MAC_KEYS:
            osa('on run argv\ntell application "System Events" to key code (item 1 of argv as integer)\nend run', MAC_KEYS[key])
        else:
            osa('on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run', key)
    else:
        run(["xdotool", "key", f"F{fnum}" if fn else LIN_KEYS.get(key, key)])
    return f"Pressed {key}."


# ───────────────────────── registry ─────────────────────────
POWER = {"lock", "sleep", "shutdown", "restart"}
INPUT = {"type_text", "press_key"}
ACTIONS = {
    "volume_set": act_volume_set,
    "volume_up": act_volume_step(+1),
    "volume_down": act_volume_step(-1),
    "mute": act_mute(True),
    "unmute": act_mute(False),
    "brightness_set": act_brightness_set,
    "brightness_up": act_brightness_step(+1),
    "brightness_down": act_brightness_step(-1),
    "media_play_pause": act_media("play_pause"),
    "media_next": act_media("next"),
    "media_prev": act_media("prev"),
    "open_app": act_open_app,
    "open_url": act_open_url,
    "screenshot": act_screenshot,
    "notify": act_notify,
    "battery": act_battery,
    "lock": act_lock,
    "sleep": act_sleep,
    "shutdown": act_shutdown,
    "restart": act_restart,
    "type_text": act_type_text,
    "press_key": act_press_key,
}


# ───────────────────────── server ─────────────────────────
class Agent:
    def __init__(self, token, port, origins, allow_power, allow_input):
        self.token = token
        self.port = port
        self.origins = origins
        self.allow_power = allow_power
        self.allow_input = allow_input
        self.hosts = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}
        self._times = []
        self._lock = threading.Lock()

    def available(self):
        return [a for a in ACTIONS if not (a in POWER and not self.allow_power) and not (a in INPUT and not self.allow_input)]

    def rate_ok(self):
        now = time.time()
        with self._lock:
            self._times = [t for t in self._times if now - t < 60]
            if len(self._times) >= MAX_ACTIONS_PER_MINUTE:
                return False
            self._times.append(now)
            return True

    def perform(self, action, params):
        if action not in ACTIONS:
            raise ActionError("Unknown action.")
        if action in POWER and not self.allow_power:
            raise ActionError("Power actions are disabled. Restart the companion with --allow-power to enable lock, sleep, shutdown and restart.")
        if action in INPUT and not self.allow_input:
            raise ActionError("Typing and key presses are disabled. Restart the companion with --allow-input to enable them.")
        return ACTIONS[action](params if isinstance(params, dict) else {})


def make_handler(agent):
    class Handler(BaseHTTPRequestHandler):
        server_version = "NamelessAgent"
        sys_version = ""

        def log_message(self, *_a):  # we print our own, shorter log
            pass

        # -- plumbing --
        def _origin(self):
            return self.headers.get("Origin", "")

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", self._origin())
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Max-Age", "600")

        def _send(self, code, obj, cors=True):
            body = json.dumps(obj).encode()
            self.send_response(code)
            if cors and self._origin() in agent.origins:
                self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _gate(self):
            """Host + Origin checks (defence against other websites and DNS rebinding). Returns an error string or None."""
            if self.headers.get("Host", "") not in agent.hosts:
                return "Bad Host header."
            if self._origin() not in agent.origins:
                o = self._origin()
                if not o:
                    return "Requests must come from a web page that is on the allowed list."
                print(f"  ! blocked a request from origin {o}. To allow this site, restart with:  --origin {o}", flush=True)
                return f"This site ({o}) is not allowed. Restart the companion with --origin {o}"
            return None

        def _authed(self):
            auth = self.headers.get("Authorization", "")
            given = auth[7:] if auth.lower().startswith("bearer ") else ""
            return hmac.compare_digest(given.encode(), agent.token.encode())

        # -- verbs --
        def do_OPTIONS(self):
            err = self._gate()
            if err:
                return self._send(403, {"error": err}, cors=False)
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            err = self._gate()
            if err:
                return self._send(403, {"error": err}, cors=False)
            if not self._authed():
                return self._send(401, {"error": "Wrong pairing code."})
            if self.path.split("?")[0] != "/status":
                return self._send(404, {"error": "Not found."})
            self._send(200, {"ok": True, "os": f"{SYSTEM} {platform.release()}", "host": platform.node(), "version": VERSION,
                             "actions": agent.available(), "allowPower": agent.allow_power, "allowInput": agent.allow_input})

        def do_POST(self):
            err = self._gate()
            if err:
                return self._send(403, {"error": err}, cors=False)
            if not self._authed():
                return self._send(401, {"error": "Wrong pairing code."})
            if self.path.split("?")[0] != "/do":
                return self._send(404, {"error": "Not found."})
            try:
                n = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                n = -1
            if n < 0 or n > MAX_BODY:
                return self._send(413, {"error": "Request too large."})
            try:
                req = json.loads(self.rfile.read(n) or b"{}")
                action, params = req.get("action"), req.get("params", {})
                if not isinstance(action, str):
                    raise ValueError
            except (ValueError, AttributeError):
                return self._send(400, {"error": "Bad request."})
            if not agent.rate_ok():
                return self._send(429, {"error": "Slow down: too many actions in the last minute."})
            shown = {k: (str(v)[:40] + "…" if len(str(v)) > 40 else v) for k, v in (params.items() if isinstance(params, dict) else [])}
            print(f"  {time.strftime('%H:%M:%S')}  {action} {shown if shown else ''}")
            try:
                result = agent.perform(action, params)
                self._send(200, {"ok": True, "result": result})
            except ActionError as e:
                print(f"           ↳ refused/failed: {e}")
                self._send(200, {"error": str(e)})
            except Exception as e:  # never crash the server
                print(f"           ↳ unexpected error: {e!r}")
                self._send(200, {"error": "Something unexpected went wrong on the computer."})

    return Handler


def normalise_origin(o):
    u = urlparse(o.strip())
    if u.scheme not in ("http", "https") or not u.netloc:
        sys.exit(f"--origin must look like https://your-site.vercel.app (got {o!r})")
    return f"{u.scheme}://{u.netloc}"


def load_token(fresh):
    if not fresh and CONFIG_PATH.exists():
        try:
            t = json.loads(CONFIG_PATH.read_text()).get("token")
            if isinstance(t, str) and len(t) >= 20:
                return t
        except (OSError, ValueError):
            pass
    t = secrets.token_urlsafe(24)
    try:
        CONFIG_PATH.write_text(json.dumps({"token": t}))
        os.chmod(CONFIG_PATH, 0o600)
    except OSError:
        pass
    return t


def main():
    try:
        sys.stdout.reconfigure(line_buffering=True)  # so the activity log appears immediately
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Nameless companion: lets your Nameless AI control this computer.")
    ap.add_argument("--origin", action="append", default=[], help="a website allowed to control this computer, e.g. https://my-site.vercel.app (repeatable)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--allow-power", action="store_true", help="allow lock, sleep, shutdown and restart")
    ap.add_argument("--allow-input", action="store_true", help="allow typing text and pressing keys")
    ap.add_argument("--new-code", action="store_true", help="generate a new pairing code")
    a = ap.parse_args()

    origins = {normalise_origin(o) for o in a.origin} | {"http://localhost:3000", "http://127.0.0.1:3000"}
    token = load_token(a.new_code)
    agent = Agent(token, a.port, origins, a.allow_power, a.allow_input)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(agent))
    except OSError as e:
        sys.exit(f"Could not start on port {a.port}: {e}. Is the companion already running? Try --port 8766")

    print("\n  Nameless companion", VERSION, f"({SYSTEM})")
    print(f"  Listening on http://127.0.0.1:{a.port}  (this computer only)")
    print("  Allowed websites:", ", ".join(sorted(origins)))
    print(f"  Power actions (lock/sleep/shutdown/restart): {'ON' if a.allow_power else 'off'}")
    print(f"  Typing & key presses:                        {'ON' if a.allow_input else 'off'}")
    print("\n  Pairing code (paste it into Nameless → Devices):\n")
    print(f"      {token}\n")
    if not a.origin:
        print("  Tip: you didn't pass --origin, so only localhost:3000 is allowed. For your deployed site run:")
        print("       python3 nameless_agent.py --origin https://YOUR-SITE\n")
    print("  Activity log (Ctrl+C to stop):")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped. Nameless can no longer control this computer.")


if __name__ == "__main__":
    main()
