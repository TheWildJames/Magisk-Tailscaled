#!/system/bin/sh
# Action button: toggle Tailscale ON/OFF.
#
# OFF  = `tailscale down` + stop the tailscaled daemon
# ON   = start the daemon + `tailscale up` (reuses stored prefs)
#        If the device is not logged in, grabs a login URL, prints it and
#        tries to open the browser.
#
# Works from KernelSU Action, MMRL and Magisk managers (root shell).

MODDIR="${0%/*}"
TS_DIR="/data/adb/tailscale"

export HOME="${TS_DIR}"
export PATH="${TS_DIR}/bin:${TS_DIR}/scripts:/data/adb/magisk:/data/adb/ksu/bin:${PATH}"

SERVICE="${TS_DIR}/scripts/tailscaled.service"

[ -f "$SERVICE" ] || {
	echo "! tailscaled.service not found at $SERVICE"
	echo "! Module data missing — reinstall the module."
	exit 1
}

daemon_running() {
	# match the daemon binary's own cmdline ("tailscaled --tun=..."), NOT the
	# tailscaled.service script — a bare "tailscaled" pattern matches the
	# script's cmdline too, so the action button can toggle the wrong way
	# when the daemon is dead but the script is alive.
	busybox pgrep -f "tailscaled --tun" >/dev/null 2>&1
}

backend_state() {
	# no jq on Android — parse with grep/sed only
	tailscale status --json 2>/dev/null | grep -o '"BackendState": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}

login_url_from_daemon() {
	# `tailscale login` prints the auth URL and blocks until the flow
	# completes; run it briefly with timeout — the login flow keeps going
	# inside the daemon after the CLI exits.
	timeout 12 tailscale login 2>&1 | grep -o 'https://login\.tailscale\.com/[a-zA-Z/0-9]*' | tail -1
}

open_url() {
	am start -a android.intent.action.VIEW -d "$1" >/dev/null 2>&1 || true
}

if daemon_running; then
	echo "- Tailscale is ON — turning OFF..."
	tailscale down >/dev/null 2>&1 || true
	if tailscaled.service stop; then
		echo "- Tailscale OFF (daemon stopped)."
	else
		echo "! Failed to stop the tailscaled daemon."
		exit 1
	fi
else
	echo "- Tailscale is OFF — turning ON..."
	if ! tailscaled.service start; then
		echo "! Failed to start the tailscaled daemon."
		exit 1
	fi
	sleep 2
	STATE="$(backend_state)"
	case "$STATE" in
	Running)
		echo "- Tailscale ON — connected."
		;;
	NeedsLogin | "")
		echo "- Daemon ON, but not logged in. Generating login URL..."
		URL="$(login_url_from_daemon)"
		if [ -n "$URL" ]; then
			echo "- Login URL (open in browser to log in):"
			echo "$URL"
			open_url "$URL"
			echo "- Login flow started. Check status after authorizing."
		else
			echo "! Could not get a login URL. Try: su -c 'tailscale login'"
		fi
		;;
	*)
		echo "- Daemon ON (backend state: $STATE)."
		;;
	esac
fi

exit 0
