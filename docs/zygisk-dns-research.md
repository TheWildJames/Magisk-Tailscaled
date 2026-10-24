# Zygisk-based DNS Hooking Research

## Question
Can a Zygisk module hook Android's DNS resolver (netd/DnsResolver) to inject 100.100.100.100 as a system-level resolver, achieving true OS-level MagicDNS integration?

## Findings

### 1. Android DNS Architecture (Android 14+)
- Android uses `netd` daemon which implements the `IDnsResolver` AIDL interface.
- Apps call `android.net.DnsResolver` which uses Binder IPC to netd.
- netd maintains per-network DNS servers and handles resolution.
- The `DnsResolver` API was introduced in Android 8 and is the sole DNS path in Android 14+.
- `ndc resolver setnetdns` was removed in Android 16; only the Binder API remains.

### 2. Zygisk Capabilities
- Zygisk runs inside app processes (zygote fork), not system daemons.
- It can hook functions in `libbinder.so`, `libc.so`, etc. within the app's address space.
- It CANNOT hook netd directly because netd is a separate process.
- Zygisk modules can hook `android.net.DnsResolver` Java methods via JNI, but only for apps that load the module.
- System apps (like Chrome) may not load Zygisk modules.

### 3. Existing Projects
- **bindhosts**: Uses Magisk's systemless hosts file overlay, not Zygisk. Works by replacing `/etc/hosts` via module overlay.
- **ZN DNS Changer**: Uses Zygisk to hook `libc` `getaddrinfo`/`res_query` in app processes. Only affects hooked apps, not system-wide.
- **AdAway**: Uses VPN service or hosts file, not Zygisk.

### 4. Feasibility Assessment
- **Full system-wide DNS hooking via Zygisk: NOT FEASIBLE.** Zygisk runs in app processes, not in netd. Hooking netd would require a separate daemon or kernel module.
- **Per-app DNS hooking via Zygisk: FEASIBLE but limited.** Can hook `getaddrinfo` in each app process, but doesn't cover system apps or apps that don't load Zygisk.
- **Alternative: Kernel module.** A kernel module could hook the `connect()` syscall for port 53 and redirect to 100.100.100.100. This is what our iptables DNAT approach does at the netfilter level, which is more reliable.

### 5. Recommendation
- Keep the iptables DNAT approach (already implemented in netenv.sh sync_magicdns).
- The iptables approach is kernel-level, covers all processes, and doesn't require per-app hooks.
- Zygisk is not the right tool for system-wide DNS redirection.
- Consider a kernel module only if iptables is unavailable (nftables-only devices).

## Sources
1. Android source: `system/netd/server/DnsResolverService.cpp` — netd's DNS implementation
2. Zygisk documentation: https://github.com/topjohnwu/Zygisk
3. bindhosts project: https://github.com/bindhosts/bindhosts
4. Android DnsResolver API: https://developer.android.com/reference/android/net/DnsResolver
5. Magisk module system: https://topjohnwu.github.io/Magisk/guides.html
