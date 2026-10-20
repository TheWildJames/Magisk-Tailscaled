/* Tailscaled WebUI app logic.
   Layout patterns after bindhosts (WTFPL) — github.com/bindhosts/bindhosts.
   Performance rules (fix for "slow / doesn't react to touch"):
   - ONE shell exec per poll (all queries combined, @@M markers)
   - DOM touched only when a value actually changed
   - peers list rebuilt only when the peer signature changes
   - events delegated on stable parents — rows never hold listeners,
     so re-renders can't kill a tap in flight */

'use strict';

/* ===== helpers ===== */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function ip4(p) { return (p && p.TailscaleIPs && p.TailscaleIPs[0]) || ''; }

/* ===== environment ===== */
var ENV = 'export PATH=/data/adb/tailscale/bin:/data/adb/tailscale/scripts:/data/adb/magisk:/data/adb/ksu/bin:/system/bin:$PATH; export HOME=/data/adb/tailscale; ';
var SERVICE = '/data/adb/tailscale/scripts/tailscaled.service';
var MODPROP = '/data/adb/modules/magisk-tailscaled/module.prop';
var LOGFILE = '/data/adb/tailscale/run/tailscaled.log';
var GITHUB = 'https://github.com/TheWildJames/Magisk-Tailscaled';

/* ===== mock bridge (?mock=1 / ?mock=login) ===== */
var isMock = location.search.indexOf('mock') !== -1;
if (isMock) {
  var MOCK_STATUS = {
    BackendState: 'Running',
    Health: [],
    ExitNodeStatus: { TailscaleIPs: ['100.64.0.3'] },
    AuthURL: '',
    Self: { HostName: 'pixel8', OS: 'android', UserID: 12345, TailscaleIPs: ['100.64.0.1', 'fd7a:115c:a1e0::1'], Online: true },
    Peer: {
      k1: { HostName: 'desktop', TailscaleIPs: ['100.64.0.2'], Online: true, ExitNodeOption: true },
      k2: { HostName: 'vps-exit', TailscaleIPs: ['100.64.0.3'], Online: true, ExitNodeOption: true, ExitNode: true },
      k3: { HostName: 'laptop', TailscaleIPs: ['100.64.0.4'], Online: false, LastSeen: '2026-10-18T09:12:00Z' }
    }
  };
  var MOCK_PREFS = { CorpDNS: true, RouteAll: false, ExitNodeIP: '100.64.0.3', ExitNodeAllowLANAccess: true, AdvertiseRoutes: [] };
  if (location.search.indexOf('login') !== -1) {
    MOCK_STATUS = {
      BackendState: 'NeedsLogin',
      AuthURL: 'https://login.tailscale.com/a/13faf79d01c0b4',
      Health: ['You are logged out. The last login error was: register request: http 410: auth path not found'],
      Self: { HostName: 'pixel8', OS: 'android' }
    };
  }
  var MOCK_DOWN = location.search.indexOf('down') !== -1;
  window.ksu = {
    exec: function (cmd, opts, cb) {
      var out = '';
      if (cmd.indexOf('@@M2') !== -1) {
        out = MOCK_DOWN
          ? '@@M2\n1.104.1\n@@M3\n\n@@M4\n\n@@M5'
          : '@@M2\n1.104.1\n@@M3\n' + JSON.stringify(MOCK_STATUS) + '\n@@M4\n' +
            (MOCK_STATUS.BackendState === 'Running' ? JSON.stringify(MOCK_PREFS) : '') + '\n@@M5';
      } else if (/grep .version=/.test(cmd)) { out = 'version=9.9.9-mock\n'; }
      else if (/tailscale login/.test(cmd)) { out = 'To authenticate, visit:\n\n\thttps://login.tailscale.com/a/1234567890abcdef\n'; }
      else if (/tailscale ping/.test(cmd)) { out = 'pong from desktop (100.64.0.2) via DERP(home) in 23ms\n'; }
      else if (/tail /.test(cmd)) { out = 'mock daemon log line 1\nmock daemon log line 2\n'; }
      else { out = 'RC=0\n'; }
      setTimeout(function () { window[cb](0, out, ''); }, 100);
    },
    toast: function () {}
  };
}

/* ===== exec wrapper (kernelsu-alt contract: ksu.exec(cmd, optsJson, cbName)) ===== */
var cbCounter = 0, bridgeOK = isMock;
function exec(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 20000;
  return new Promise(function (resolve) {
    if (typeof ksu === 'undefined' || !ksu.exec) {
      resolve({ errno: -1, stdout: '', stderr: 'no ksu bridge' });
      return;
    }
    var settled = false, timer = null;
    function done(r) { if (settled) return; settled = true; if (timer) clearTimeout(timer); resolve(r); }
    var cbName = '__tscb_' + (++cbCounter);
    window[cbName] = function (errno, stdout, stderr) {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (!bridgeOK) { bridgeOK = true; updateBanner(); }
      done({ errno: errno || 0, stdout: stdout || '', stderr: stderr || '' });
    };
    timer = setTimeout(function () {
      try { delete window[cbName]; } catch (e) {}
      done({ errno: -1, stdout: '', stderr: 'exec timeout' });
    }, timeoutMs);
    try {
      ksu.exec(cmd, '{}', cbName);
    } catch (e) {
      try { delete window[cbName]; } catch (e2) {}
      try {
        var out = String(ksu.exec(cmd) || '');
        if (!bridgeOK) { bridgeOK = true; updateBanner(); }
        done({ errno: 0, stdout: out, stderr: '' });
      } catch (e2) {
        done({ errno: -1, stdout: '', stderr: String(e2) });
      }
    }
  });
}

/* ===== prompt / snackbar (bindhosts showPrompt, 1:1) ===== */
var promptTimeout = null;
function showPrompt(message, isSuccess, duration, callbackName, callback) {
  var prompt = $('prompt');
  var promptBtn = prompt.querySelector('.prompt-btn');
  prompt.querySelector('.prompt-text').textContent = String(message || '').trim();
  prompt.classList.toggle('error', isSuccess === false);
  var hasCb = typeof callback === 'function';
  promptBtn.textContent = hasCb ? (callbackName || '') : '';
  promptBtn.onclick = hasCb ? callback : null;
  promptBtn.classList.toggle('show', hasCb);
  if (promptTimeout) clearTimeout(promptTimeout);
  promptTimeout = setTimeout(function () {
    prompt.classList.add('show');
    promptTimeout = setTimeout(function () { prompt.classList.remove('show'); }, duration || 2500);
  }, 10);
}

/* ===== guarded DOM updates ===== */
var txtCache = {};
function setText(id, s) { s = String(s); if (txtCache[id] === s) return; txtCache[id] = s; var el = $(id); if (el) el.textContent = s; }
function setHidden(id, hide) {
  var el = $(id); if (!el) return;
  var cur = el.hasAttribute('hidden');
  if (cur !== !!hide) { if (hide) el.setAttribute('hidden', ''); else el.removeAttribute('hidden'); }
}
function setSwitch(id, on) {
  var el = $(id); if (!el) return;
  if (!!el.selected !== !!on) el.selected = !!on;
}

/* ===== state ===== */
var latest = null, prefs = null, daemonUp = false, toggling = false;
var loginUrl = '', loginPending = false, versionStr = '', lastBackend = null;
var restartBusy = false, logoutBusy = false, exitBusy = false, prefBusy = false, bootBusy = false;
var bootOn = true, healthSig = '\u0000', lastDescKey = null;
var peersSig = '', urlHtml = '';
var logsOpen = false, logsTimer = null;
var dialogOpen = false;

/* any in-flight root action → progress bar, block double-taps */
function anyBusy() {
  return toggling || loginPending || restartBusy || logoutBusy || exitBusy || prefBusy || bootBusy;
}

var STATE_LABEL = {
  Running: 'Connected', Starting: 'Starting…', NeedsLogin: 'Login required',
  NeedsMachineAuth: 'Machine auth', Stopped: 'Disconnected', NoState: 'No state'
};

/* ===== combined poll: one exec, @@M markers =====
   Daemon liveness = `tailscale status --json` returning parseable JSON.
   (pgrep is useless here: the service script's own cmdline contains
   "tailscaled.service", so it matches when the daemon is DEAD — leaving
   the UI in a "Not logged in / everything —" limbo exactly like a real
   daemon crash showed.) */
function parsePoll(out) {
  var idx = {};
  ['M2', 'M3', 'M4', 'M5'].forEach(function (m) { idx[m] = out.indexOf('@@' + m); });
  function between(a, b) {
    if (idx[a] < 0) return '';
    var s = idx[a] + a.length + 3;   /* skip '@@M2\n' */
    var e = idx[b] >= 0 ? idx[b] : out.length;
    return out.slice(s, e).trim();
  }
  return { ver: between('M2', 'M3'), status: between('M3', 'M4'), prefs: between('M4', 'M5') };
}

function poll() {
  var cmd = ENV +
    'echo @@M2; tailscale version 2>/dev/null | head -n 1; ' +
    'echo @@M3; tailscale status --json 2>/dev/null; ' +
    'echo @@M4; tailscale debug prefs --json 2>/dev/null; ' +
    'echo @@M5';
  return exec(cmd, 20000).then(function (r) {
    var p = parsePoll(r.stdout);
    try { latest = p.status ? JSON.parse(p.status) : null; } catch (e) { latest = null; }
    daemonUp = !!latest;
    if (p.ver && p.ver !== versionStr) { versionStr = p.ver; renderVersion(); }
    try { prefs = (latest && p.prefs) ? JSON.parse(p.prefs) : null; } catch (e) { prefs = null; }

    var backend = latest ? latest.BackendState : null;
    if (anyBusy() || (backend && lastBackend && backend !== lastBackend)) {
      /* action in flight or state transition — poll fast for a while */
      lastActivity = Date.now();
    }
    if (daemonUp && backend === 'Running' && lastBackend && lastBackend !== 'Running') {
      showPrompt('Logged in');
    }
    lastBackend = backend;
    render();
    maybeUpdateDesc(backend);
  }).catch(function () { render(); });
}

/* ===== adaptive polling =====
   Surveyed WebUIs (Tricky-Addon, zygisk-detach) don't poll at all — they
   refresh on action. A VPN's state CAN change outside the UI (browser
   login finishing, exit node coming online), so we poll, but adaptively:
   4s while an action is in flight or within 30s of a state change,
   15s when idle, never while hidden or a dialog is open. */
var lastActivity = 0, pollTimer = null;
function schedulePoll(delay) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(function () {
    pollTimer = null;
    if (document.visibilityState === 'visible' && !dialogOpen) {
      poll().then(function () {
        var idleMs = Date.now() - lastActivity;
        schedulePoll(idleMs < 30000 ? 4000 : 15000);
      });
    } else {
      schedulePoll(2000);
    }
  }, delay);
}

/* ===== dialog-open lockout (Tricky-Addon pattern) =====
   While a dialog is up, block stray touches/scroll behind it. */
function setDialogOpen(v) {
  dialogOpen = v;
  document.body.classList.toggle('dlg', v);
}

/* ===== module.prop description writer =====
   Mirrors the state the WebUI shows into the manager's module list
   ("[ ⏲ HH:MM | ⚡ VPN connected ] <original description>"). Writes
   only when the state actually changes — never on every poll. */
var DESC_MSG = {
  stopped: '⛔ tailscaled stopped ] ',
  connected: '⚡ VPN connected ] ',
  login: '⚠ login required ] ',
  starting: '⏳ starting ] ',
  disconnected: '⛔ VPN disconnected ] ',
  machineauth: '⏳ machine auth ] '
};
function maybeUpdateDesc(backend) {
  if (isMock) return;
  var key;
  if (!daemonUp) key = 'stopped';
  else if (backend === 'Running') key = 'connected';
  else if (backend === 'NeedsLogin' || backend === 'NoState') key = 'login';
  else if (backend === 'Starting') key = 'starting';
  else if (backend === 'Stopped') key = 'disconnected';
  else if (backend === 'NeedsMachineAuth') key = 'machineauth';
  else return;
  if (key === lastDescKey) return;
  lastDescKey = key;
  var msg = DESC_MSG[key];
  /* keep the same sed shape as the old v2 writer so both stay
     compatible: replaces any leading "[ ... ]" prefix, keeps the
     original description text after it */
  exec(ENV + "T=$(date +%H:%M); sed -Ei \"s/^description=(\\[.*][[:space:]]*)?/description=[ ⏲ $T | " + msg + "/\" " + MODPROP + " 2>/dev/null; echo DESC_OK", 8000);
}

/* ===== boot autostart flag (NOBOOT marker file) ===== */
function paintBoot() {
  setSwitch('sw-boot', bootOn);
  setText('boot-sub', bootOn ? 'Daemon auto-starts after reboot' : 'Disabled — daemon won\u2019t start at boot');
}
function readBootFlag() {
  exec(ENV + '[ -e /data/adb/tailscale/NOBOOT ] && echo NB || echo OK', 8000).then(function (r) {
    bootOn = String(r.stdout).trim() !== 'NB';
    paintBoot();
  });
}
function toggleBoot() {
  if (bootBusy) return;
  bootBusy = true; render();
  var cmd = bootOn
    ? ENV + 'touch /data/adb/tailscale/NOBOOT; echo NBON'
    : ENV + 'rm -f /data/adb/tailscale/NOBOOT; echo NBOFF';
  exec(cmd, 8000).then(function (r) {
    bootBusy = false;
    bootOn = !bootOn;
    paintBoot();
    showPrompt(bootOn ? 'tailscaled will start on boot' : 'tailscaled won\u2019t start on boot');
    render();
  });
}

/* ===== render ===== */
/* Single source of truth for the status phrasing — used by the
   big switch card, the Connection row, and the module description
   written back into module.prop, so nothing can show a mismatched state. */
function statusLine() {
  if (toggling) return { text: (latest && latest.BackendState === 'Running') ? 'Stopping…' : 'Starting…', hint: '…' };
  if (loginPending) return { text: 'Generating login URL…', hint: '' };
  if (restartBusy) return { text: 'Restarting tailscaled…', hint: '' };
  if (logoutBusy) return { text: 'Logging out…', hint: '' };
  if (exitBusy) return { text: 'Setting exit node…', hint: '' };
  if (prefBusy) return { text: 'Applying settings…', hint: '' };
  if (bootBusy) return { text: 'Saving boot setting…', hint: '' };
  if (anyBusy()) return { text: 'Working…', hint: '' };
  if (!daemonUp) return { text: 'Service stopped — tap to start', hint: 'tailscaled is not running' };
  var backend = latest ? latest.BackendState : null;
  if (backend === 'Running') return { text: 'Connected — tap to disconnect', hint: bootOn ? 'Reconnects automatically on boot' : 'tailscaled won\u2019t start at boot until this is turned back on' };
  if (backend === 'NeedsLogin' || backend === 'NoState') return { text: 'Login required — tap Log in below', hint: 'tailscaled is running' };
  if (backend === 'Starting') return { text: 'Starting…', hint: 'Connecting to your tailnet' };
  if (backend === 'NeedsMachineAuth') return { text: 'Waiting for machine authorization…', hint: 'Approve this device in the Tailscale admin console' };
  if (backend === 'Stopped') return { text: 'Disconnected — tap to connect', hint: 'tailscaled is running' };
  return { text: STATE_LABEL[backend] || backend, hint: '' };
}

function render() {
  var st = latest;
  var backend = st ? (st.BackendState || 'NoState') : null;
  var on = backend === 'Running';
  var needsLogin = daemonUp && (backend === 'NeedsLogin' || backend === 'NoState');
  var busy = anyBusy();

  if (needsLogin && st && st.AuthURL) loginUrl = String(st.AuthURL);
  if (!needsLogin) loginUrl = '';

  setSwitch('main-switch', on);

  /* In-flight action feedback: spinner + linear progress + disable competing
     controls so double-taps can't stack root execs. */
  setHidden('busy-spinner', !busy);
  setHidden('action-progress', !busy);
  setHidden('busy-overlay', !busy);
  setText('busy-text', statusLine().text);
  $('status-box').classList.toggle('busy-press', busy);
  $('login-btn').disabled = busy;
  $('open-url-btn').disabled = busy || !loginUrl;
  $('copy-url-btn').disabled = busy || !loginUrl;
  $('restart-row').classList.toggle('disabled', busy);
  $('logout-row').classList.toggle('disabled', busy || !daemonUp || needsLogin);
  $('exitnode-row').classList.toggle('disabled', busy || !on);

  var sl = statusLine();
  setText('status-text', sl.text);
  setText('status-hint', sl.hint);

  /* login box */
  setHidden('login-box', !needsLogin);
  setHidden('login-url-row', !loginUrl);
  if (loginUrl) {
    var html = '<a href="' + esc(loginUrl) + '" target="_blank" rel="noopener">' + esc(loginUrl) + '</a>';
    if (html !== urlHtml) { urlHtml = html; $('login-url').innerHTML = html; }
  }

  /* info rows */
  var s = (st && st.Self) || null;
  setText('kv-ip4', (on && s && s.TailscaleIPs && s.TailscaleIPs[0]) || '—');
  setText('kv-ip6', (on && s && s.TailscaleIPs && s.TailscaleIPs[1]) || '—');
  setText('kv-exit', on && st && st.ExitNodeStatus ? ((st.ExitNodeStatus.TailscaleIPs && st.ExitNodeStatus.TailscaleIPs[0]) || 'in use') : 'none');
  setText('kv-state', daemonUp ? (STATE_LABEL[backend] || backend || '—') : 'daemon stopped');

  /* health warnings straight from the daemon (login errors etc.) —
     the one place they're visible outside the raw log */
  var health = (st && st.Health && st.Health.length) ? st.Health : null;
  var hsig = health ? health.join('|') : '';
  if (hsig !== healthSig) {
    healthSig = hsig;
    $('health-list').innerHTML = health
      ? health.map(function (h) { return '<div class="health-item">' + esc(h) + '</div>'; }).join('')
      : '';
  }
  setHidden('health-box', !health);

  /* devices page */
  setText('kv-host', (s && s.HostName) || '—');
  setText('kv-self-ip4', (s && s.TailscaleIPs && s.TailscaleIPs[0]) || '—');
  setText('kv-self-os', (s && s.OS) || '—');
  renderPeers(st, on);

  /* settings */
  var canSet = daemonUp && (backend === 'Running' || backend === 'Starting');
  setSwitch('sw-accept-dns', prefs ? !!prefs.CorpDNS : false);
  setSwitch('sw-accept-routes', prefs ? !!prefs.RouteAll : false);
  setSwitch('sw-adv-exit', prefs ? (String(prefs.AdvertiseRoutes || '').indexOf('0.0.0.0/0') !== -1) : false);
  setSwitch('sw-lan-access', prefs ? !!prefs.ExitNodeAllowLANAccess : false);
  var exName = 'None';
  if (prefs && (prefs.ExitNodeIP || prefs.ExitNodeID)) {
    exName = prefs.ExitNodeIP || prefs.ExitNodeID || 'in use';
    if (st && st.Peer) {
      Object.keys(st.Peer).forEach(function (k) {
        var p = st.Peer[k];
        if (ip4(p) === exName && p.HostName) exName = p.HostName;
      });
    }
  }
  setText('exitnode-current', exName);

  var rows = ['row-accept-dns', 'row-accept-routes', 'row-adv-exit', 'row-lan-access'];
  rows.forEach(function (id) { $(id).classList.toggle('disabled', !canSet); });
}

function renderPeers(st, on) {
  if (!daemonUp || !st || !st.Peer) {
    if (peersSig !== 'off') {
      peersSig = 'off';
      $('peers-count').textContent = '';
      $('peers-list').innerHTML = '<div class="peer-row"><span class="peer-sub">Start Tailscale to see your devices.</span></div>';
    }
    return;
  }
  var peers = Object.keys(st.Peer).map(function (k) { return st.Peer[k]; });
  peers.sort(function (a, b) {
    return (b.Online === true) - (a.Online === true) ||
      String(a.HostName).localeCompare(String(b.HostName));
  });
  var sig = peers.map(function (p) {
    return [p.ID || '', p.HostName || '', p.Online ? 1 : 0, ip4(p), p.ExitNode ? 1 : 0, p.ExitNodeOption ? 1 : 0, p.LastSeen || ''].join('|');
  }).join(';');
  if (sig === peersSig) return;
  peersSig = sig;
  $('peers-count').textContent = '(' + peers.length + ')';
  if (!peers.length) {
    $('peers-list').innerHTML = '<div class="peer-row"><span class="peer-sub">No other devices in your tailnet.</span></div>';
    return;
  }
  $('peers-list').innerHTML = peers.map(function (p) {
    var meta = [];
    if (p.ExitNode) meta.push('current exit node');
    if (!p.Online && p.LastSeen) meta.push('last seen ' + String(p.LastSeen).replace('T', ' ').slice(0, 16));
    return '<div class="peer-row" data-node="' + esc(ip4(p)) + '" data-name="' + esc(p.HostName || '') + '">' +
      '<span class="peer-dot' + (p.Online ? ' on' : '') + '"></span>' +
      '<span class="peer-main"><span class="peer-name">' + esc(p.HostName || p.ID || '?') +
      (p.ExitNode ? '<span class="tag">EXIT</span>' : '') +
      (p.ExitNodeOption && !p.ExitNode ? '<span class="tag">can exit</span>' : '') + '</span>' +
      (meta.length ? '<span class="peer-sub">' + esc(meta.join(' · ')) + '</span>' : '') + '</span>' +
      '<span class="peer-ip">' + esc(ip4(p)) + '</span></div>';
  }).join('');
}

function renderVersion() {
  setText('version-text', 'tailscale ' + (versionStr || '?'));
}

/* ===== actions ===== */
function toggleVPN() {
  if (toggling) return;
  var on = latest && latest.BackendState === 'Running';
  toggling = true; render();
  var cmd = on
    ? ENV + 'tailscale down >/dev/null 2>&1; echo RC=$?'
    : ENV + SERVICE + ' start >/dev/null 2>&1; R=$?; sleep 2; timeout 8 tailscale up >/dev/null 2>&1 || true; echo RC=$R';
  exec(cmd, 45000).then(function (r) {
    toggling = false;
    var rc = (String(r.stdout).match(/RC=(\d+)/) || [])[1];
    showPrompt(on ? (rc === '0' ? 'Disconnected' : 'Disconnect failed — check logs')
      : (rc === '0' ? 'Starting…' : 'Start failed — check logs'), rc === '0');
    poll();
  });
}

function startLogin() {
  if (loginPending) return;
  if (latest && latest.AuthURL) {
    loginUrl = String(latest.AuthURL);
    showLoginUrlReady();
    return;
  }
  loginPending = true;
  /* show progress + "Generating…" text right away so the UI never looks frozen */
  $('login-progress').removeAttribute('hidden');
  $('login-url-row').removeAttribute('hidden');
  setText('login-url', 'Generating login URL…');
  render();
  exec(ENV + "timeout 15 tailscale login 2>&1 | grep -oE 'https://[^ ]+' | head -1", 25000)
    .then(function (r) {
      loginPending = false;
      $('login-progress').setAttribute('hidden', '');
      loginUrl = r.stdout.trim();
      if (loginUrl) {
        showLoginUrlReady();
      } else {
        setText('login-url', 'Could not get a login URL');
        showPrompt('Could not get a login URL — try: su -c tailscale login', false, 5000);
      }
    });
}
function showLoginUrlReady() {
  $('login-url-row').removeAttribute('hidden');
  setText('login-url', loginUrl);
  urlHtml = '';
  render();
  showPrompt('Login URL ready — tap Open in browser');
}
function openLoginUrl() {
  if (!loginUrl) return;
  exec(ENV + 'am start -a android.intent.action.VIEW -d "' + loginUrl + '" >/dev/null 2>&1; echo OPEN');
  showPrompt('Opening browser…');
}
function copyLoginUrl() {
  if (!loginUrl) return;
  try {
    navigator.clipboard.writeText(loginUrl).then(function () { showPrompt('URL copied'); },
      function () { showPrompt(loginUrl, true, 5000); });
  } catch (e) { showPrompt(loginUrl, true, 5000); }
}

function pingPeer(node, name) {
  if (!node) return;
  showPrompt('Pinging ' + (name || node) + '…', true, 15000);
  exec(ENV + 'tailscale ping --timeout 3s -c 4 ' + node + ' 2>&1 | head -n 4', 25000)
    .then(function (r) {
      var m = String(r.stdout).match(/via (\S+)[^\n]* in ([\d.]+ms)/);
      showPrompt(m ? ((name || node) + ': ' + m[2] + ' via ' + m[1]) : (r.stdout.trim() || 'no response'), true, 5000);
    });
}

var PREF_MAP = {
  'row-accept-dns': '--accept-dns',
  'row-accept-routes': '--accept-routes',
  'row-adv-exit': '--advertise-exit-node',
  'row-lan-access': '--exit-node-allow-lan-access'
};
function setPref(flag, on) {
  if (prefBusy) return;
  prefBusy = true; render();
  var val = (flag === '--advertise-exit-node')
    ? (on ? '--advertise-exit-node' : '--advertise-exit-node=false')
    : (flag + '=' + (on ? 'true' : 'false'));
  return exec(ENV + 'tailscale set ' + val + ' 2>&1; echo RC=$?', 20000).then(function (r) {
    prefBusy = false;
    if (!/RC=0/.test(r.stdout)) showPrompt('Setting failed — check logs', false);
    else showPrompt(on ? 'Setting on' : 'Setting off');
    poll();
  });
}

function openExitDialog() {
  var box = $('exitnode-list');
  var current = prefs ? (prefs.ExitNodeIP || prefs.ExitNodeID || '') : '';
  var opts = [];
  if (latest && latest.Peer) {
    Object.keys(latest.Peer).forEach(function (k) {
      var p = latest.Peer[k];
      if (p.ExitNodeOption) opts.push(p);
    });
  }
  opts.sort(function (a, b) { return String(a.HostName).localeCompare(String(b.HostName)); });
  var html = '<div class="radio-row" data-node="">' +
    '<span class="peer-name">None</span><span class="peer-sub" style="flex-grow:1"></span>' +
    '<md-radio name="exitopt" ' + (current ? '' : 'checked') + '></md-radio></div>';
  html += opts.map(function (p) {
    var sel = current && current === ip4(p);
    return '<div class="radio-row" data-node="' + esc(ip4(p)) + '">' +
      '<span class="peer-name">' + esc(p.HostName || '?') + '</span>' +
      '<span class="peer-sub">' + esc(ip4(p)) + ' · ' + (p.Online ? 'online' : 'offline') + '</span>' +
      '<md-radio name="exitopt" ' + (sel ? 'checked' : '') + '></md-radio></div>';
  }).join('');
  box.innerHTML = html;
  setDialogOpen(true);
  $('exitnode-dialog').show();
}
function setExitNode(node) {
  if (exitBusy) return;
  exitBusy = true;
  exec(ENV + 'tailscale set --exit-node=' + (node || '') + ' 2>&1; echo RC=$?', 20000).then(function (r) {
    exitBusy = false;
    if (!/RC=0/.test(r.stdout)) showPrompt('Failed to set exit node — check logs', false);
    else showPrompt(node ? 'Exit node set' : 'Exit node cleared');
    poll();
  });
}

function restartService() {
  if (restartBusy) return;
  restartBusy = true; render();
  showPrompt('Restarting tailscaled…', true, 8000);
  exec(ENV + SERVICE + ' restart >/dev/null 2>&1; echo RC=$?', 30000).then(function (r) {
    restartBusy = false;
    showPrompt(/RC=0/.test(r.stdout) ? 'Service restarted' : 'Restart issue — check logs', /RC=0/.test(r.stdout));
    poll();
  });
}

function doLogout() {
  setDialogOpen(true);
  $('logout-dialog').show();
}
function confirmLogout() {
  if (logoutBusy) return;
  logoutBusy = true; render();
  showPrompt('Logging out…', true, 8000);
  exec(ENV + 'tailscale logout >/dev/null 2>&1; echo RC=$?', 30000).then(function (r) {
    logoutBusy = false;
    lastDescKey = null;
    showPrompt(/RC=0/.test(r.stdout) ? 'Logged out' : 'Logout issue — check logs', /RC=0/.test(r.stdout));
    loginUrl = '';
    poll();
  });
}

/* ===== logs terminal ===== */
function loadLogs() {
  exec(ENV + 'tail -n 200 ' + LOGFILE + " 2>/dev/null || echo '(no daemon log)'", 12000)
    .then(function (r) { $('logs-content').textContent = r.stdout.trim() || '(empty)'; });
}
function openLogs() {
  if (logsOpen) return;
  logsOpen = true;
  $('logs-terminal').classList.add('open');
  $('logs-terminal').removeAttribute('unresolved');
  $('back-button').classList.add('show');
  $('back-button').removeAttribute('hidden');
  loadLogs();
  logsTimer = setInterval(loadLogs, 5000);
}
function closeLogs() {
  if (!logsOpen) return;
  logsOpen = false;
  $('logs-terminal').classList.remove('open');
  $('back-button').classList.remove('show');
  $('back-button').setAttribute('hidden', '');
  if (logsTimer) { clearInterval(logsTimer); logsTimer = null; }
}

/* ===== banner / bridge probe ===== */
var probeTries = 0, probeTimer = null;
function updateBanner() {
  setHidden('bridge-banner', bridgeOK);
  document.body.classList.toggle('has-banner', !bridgeOK);
  if (bridgeOK && probeTimer) { clearInterval(probeTimer); probeTimer = null; }
}
function probeBridge() {
  probeTries = 0;
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = setInterval(function () {
    probeTries++;
    if (bridgeOK) { updateBanner(); return; }
    if (typeof ksu !== 'undefined' && ksu.exec) {
      exec(ENV + 'echo BRIDGE_OK', 4000).then(function (r) {
        if (String(r.stdout).indexOf('BRIDGE_OK') !== -1) { bridgeOK = true; updateBanner(); poll(); }
      });
    }
    if (probeTries > 30 && probeTimer) { clearInterval(probeTimer); probeTimer = null; }
  }, 1000);
}

/* ===== nav ===== */
function navTo(page) {
  document.querySelectorAll('.page-view').forEach(function (v) {
    if (v.id === 'page-' + page) v.setAttribute('data-active', 'true');
    else v.removeAttribute('data-active');
  });
  document.querySelectorAll('.bottom-bar-item').forEach(function (b) {
    if (b.getAttribute('page') === page) b.setAttribute('selected', '');
    else b.removeAttribute('selected');
  });
}

/* ===== events (all delegated, registered once) ===== */
function wireEvents() {
  document.querySelectorAll('.bottom-bar-item').forEach(function (b) {
    b.addEventListener('click', function () { navTo(b.getAttribute('page')); });
  });

  $('status-box').addEventListener('click', toggleVPN);
  $('main-switch').addEventListener('click', function (e) { e.stopPropagation(); toggleVPN(); });
  $('login-btn').addEventListener('click', startLogin);
  $('open-url-btn').addEventListener('click', openLoginUrl);
  $('copy-url-btn').addEventListener('click', copyLoginUrl);
  $('retry-btn').addEventListener('click', probeBridge);
  $('back-button').addEventListener('click', closeLogs);
  $('logs-btn').addEventListener('click', function () { logsOpen ? closeLogs() : openLogs(); });
  $('logs-row').addEventListener('click', openLogs);
  $('clear-log-btn').addEventListener('click', function () { $('logs-content').textContent = '(cleared)'; });
  $('github-row').addEventListener('click', function () {
    exec(ENV + 'am start -a android.intent.action.VIEW -d ' + GITHUB + ' >/dev/null 2>&1; echo OPEN');
    showPrompt('Opening GitHub…');
  });
  $('restart-row').addEventListener('click', restartService);
  $('logout-row').addEventListener('click', doLogout);
  $('logout-cancel').addEventListener('click', function () { setDialogOpen(false); $('logout-dialog').close(); });
  $('logout-confirm').addEventListener('click', function () {
    $('logout-dialog').close(); setDialogOpen(false); confirmLogout();
  });
  $('exitnode-row').addEventListener('click', openExitDialog);
  $('row-boot').addEventListener('click', toggleBoot);
  $('exitnode-close').addEventListener('click', function () { setDialogOpen(false); $('exitnode-dialog').close(); });
  $('exitnode-list').addEventListener('click', function (e) {
    var row = e.target.closest ? e.target.closest('.radio-row') : null;
    if (!row) return;
    setDialogOpen(false);
    $('exitnode-dialog').close();
    setExitNode(row.getAttribute('data-node') || '');
  });

  $('peers-list').addEventListener('click', function (e) {
    var row = e.target.closest ? e.target.closest('.peer-row') : null;
    if (row && row.getAttribute('data-node')) {
      pingPeer(row.getAttribute('data-node'), row.getAttribute('data-name'));
    }
  });

  ['row-accept-dns', 'row-accept-routes', 'row-adv-exit', 'row-lan-access'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      if ($(id).classList.contains('disabled')) { showPrompt('Log in first to change settings', false); return; }
      var current;
      if (id === 'row-accept-dns') current = prefs && !!prefs.CorpDNS;
      else if (id === 'row-accept-routes') current = prefs && !!prefs.RouteAll;
      else if (id === 'row-adv-exit') current = prefs && String(prefs.AdvertiseRoutes || '').indexOf('0.0.0.0/0') !== -1;
      else current = prefs && !!prefs.ExitNodeAllowLANAccess;
      setPref(PREF_MAP[id], !current);
    });
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLogs(); });
}

/* ===== boot ===== */
function boot() {
  document.querySelectorAll('[unresolved]').forEach(function (el) { el.removeAttribute('unresolved'); });
  wireEvents();
  renderVersion();
  var pg = location.search.match(/page=(home|devices|more)/);
  if (pg) navTo(pg[1]);

  exec(ENV + 'grep "^version=" ' + MODPROP + ' 2>/dev/null | head -1 | cut -d= -f2', 8000).then(function (r) {
    var v = r.stdout.trim();
    if (v) setText('module-version', 'Magisk-Tailscaled ' + v + ' · ' + GITHUB.replace('https://', ''));
  });

  if (typeof ksu === 'undefined' && !isMock) {
    updateBanner();
    probeBridge();
  } else {
    bridgeOK = true;
    updateBanner();
  }
  readBootFlag();
  schedulePoll(0);

  /* Re-sync immediately when the manager brings the page back to front. */
  window.addEventListener('pageshow', function () { schedulePoll(200); });
  window.addEventListener('focus', function () { schedulePoll(200); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') schedulePoll(200);
  });

  /* MMRL WebUI X back interception (backInterceptor: "javascript"):
     close the log terminal first, then return to Home, then exit. */
  window.addEventListener('back', function () {
    if (logsOpen) { closeLogs(); return; }
    var active = document.querySelector('.page-view[data-active="true"]');
    var onHome = !active || active.id === 'page-home';
    if (!onHome) { navTo('home'); return; }
    if (typeof webui !== 'undefined' && webui && typeof webui.exit === 'function') webui.exit();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
