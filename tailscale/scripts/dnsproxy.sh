#!/system/bin/sh
# dnsproxy.sh — local DNS proxy on 127.0.0.1:53 (UDP+TCP)
# Forwards *.ts.net queries to tailscaled's MagicDNS (100.100.100.100:53)
# and everything else to the physical resolver recorded by netenv.sh.

DIR=$(dirname "$(realpath "$0")")
S="$DIR/../settings.sh"
[ -f "$S" ] || S="/data/adb/tailscale/settings.sh"
. "$S"

LISTEN="127.0.0.1"
PORT="53"
PIDFILE="${TS_RUN_DIR}/dnsproxy.pid"
PHYSICAL_FILE="${TS_RUN_DIR}/physical.dns"
MAGIC="100.100.100.100"

physical_dns() {
    [ -f "$PHYSICAL_FILE" ] && head -1 "$PHYSICAL_FILE" 2>/dev/null || echo "1.1.1.1"
}

choose_upstream() {
    # $1 = query file; print upstream IP
    if grep -qa "ts" "$1" 2>/dev/null && grep -qa "net" "$1" 2>/dev/null; then
        echo "$MAGIC"
    else
        physical_dns
    fi
}

forward_one() {
    # stdin: query bytes; stdout: response bytes
    tmpq="${TS_RUN_DIR}/dnsproxy.q.$$"
    tmpr="${TS_RUN_DIR}/dnsproxy.r.$$"
    cat >"$tmpq"
    up=$(choose_upstream "$tmpq")
    if command -v socat >/dev/null 2>&1; then
        socat - UDP:"$up":53 <"$tmpq" >"$tmpr" 2>/dev/null
    else
        nc -u -w2 "$up" 53 <"$tmpq" >"$tmpr" 2>/dev/null
    fi
    [ -s "$tmpr" ] && cat "$tmpr"
    rm -f "$tmpq" "$tmpr"
}

start() {
    stop 2>/dev/null
    if command -v socat >/dev/null 2>&1; then
        socat UDP-LISTEN:${PORT},bind=${LISTEN},fork EXEC:"$0 handle-udp" >/dev/null 2>&1 &
        socat TCP-LISTEN:${PORT},bind=${LISTEN},fork EXEC:"$0 handle-tcp" >/dev/null 2>&1 &
    else
        # UDP loop
        (
            while :; do
                nc -u -l -p ${PORT} -s ${LISTEN} < /dev/null >/dev/null 2>&1
            done
        ) &
        # TCP loop
        (
            while :; do
                nc -l -p ${PORT} -s ${LISTEN} >/dev/null 2>&1
            done
        ) &
    fi
    echo $! >"$PIDFILE"
    log_msg "DNS proxy started on ${LISTEN}:${PORT}"
}

handle-udp() { forward_one; }
handle-tcp() { forward_one; }

stop() {
    if [ -f "$PIDFILE" ]; then
        kill "$(cat "$PIDFILE")" 2>/dev/null
        rm -f "$PIDFILE"
    fi
    pkill -f "dnsproxy.sh" 2>/dev/null || true
}

case "${1:-start}" in
    start) start ;;
    stop) stop ;;
    handle-udp) handle-udp ;;
    handle-tcp) handle-tcp ;;
    *) echo "usage: $0 {start|stop}" ;;
esac