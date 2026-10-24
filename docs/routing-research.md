# Exit Node and Subnet Routing Research on Android

## Question
How do exit nodes and subnet routing work with tailscaled in TUN mode on Android, and what iptables rules are needed?

## Findings

### 1. How tailscaled Sets Up Routing on Linux
- tailscaled creates a TUN interface (`tailscale0`) with the Tailscale IP (100.x.x.x).
- It installs routes in the main routing table: `100.64.0.0/10 dev tailscale0`.
- For exit nodes: it sets a default route through tailscale0 (with higher metric).
- For subnet routers: it adds specific subnet routes through tailscale0.
- It uses iptables for packet filtering and NAT (if needed).
- The `router.Config` in tailscaled manages all of this via the `router` package.

### 2. Android's Routing Model
- Android uses policy routing with multiple routing tables (per-network).
- `main` table (254) has LAN routes but no default route.
- Each network (WiFi, cellular) has its own table (e.g., 1047, 1000000047).
- Rules select which table to use based on fwmark, uid, etc.
- Android's `netd` manages all of this dynamically.

### 3. The Problem: Tailscale Routes in Android
- tailscaled's routes go into the `main` table (254).
- But Android apps use per-network tables (not main) due to policy routing rules.
- So tailnet traffic from apps never reaches tailscale0.
- Our fix: add policy rules (priority 9000) to steer 100.64.0.0/10 traffic to the main table.
- This is implemented in `ts_rules_up()` in tailscaled.service.

### 4. Exit Node Routing
- When using an exit node, tailscaled needs to redirect ALL traffic (0.0.0.0/0) through tailscale0.
- This requires a default route in the main table (which Android doesn't have).
- Our fix: `ts_shadow_default()` copies the physical default route to table 253 (tailscaled's fwmark escape table).
- But for exit nodes, we also need to override the per-network default routes.
- This is the hardest part — Android's netd may override our rules.

### 5. Subnet Routing
- Subnet routes require forwarding packets from tailscale0 to the LAN interface.
- This needs IP forwarding enabled: `sysctl net.ipv4.ip_forward=1`
- And iptables FORWARD rules to allow the traffic.
- Android may block IP forwarding by default (depending on ROM).

### 6. iptables on Android
- Android uses iptables (legacy) or nftables (Android 14+).
- The `iptables` command is usually available via toybox or busybox.
- Some ROMs use `iptables-legacy` and `iptables-nft` (wrapper).
- nftables-only devices (some Android 14+ ROMs) may not have iptables at all.

### 7. Known Issues
- **Issue 1:** Android's netd may delete our policy rules when the network changes. The watch loop in netenv.sh re-applies them every 15s.
- **Issue 2:** Exit node routing may not work because Android's per-network rules take precedence. Need higher-priority rules.
- **Issue 3:** Subnet routing requires IP forwarding, which may be blocked by Android's SELinux or ROM-specific settings.
- **Issue 4:** Multiple TUN interfaces (module + official app) conflict. Our module warns about this.

### 8. Current Implementation Status
- `ts_rules_up()` adds policy rules for 100.64.0.0/10 and fd7a:115c:a1e0::/48.
- `ts_shadow_default()` copies physical default to table 253.
- `netenv.sh` runs every 15s to keep routing current.
- Exit nodes: partially working (traffic to tailnet IPs works, but full tunnel may not).
- Subnet routing: not tested.

### 9. Recommendation
- Exit nodes: test with the current implementation. If it doesn't work, add a higher-priority rule (priority < 1000) to override all per-network rules.
- Subnet routing: enable IP forwarding and add FORWARD rules. Test on multiple ROMs.
- For nftables-only devices: create an nftables equivalent of the iptables rules.

## Sources
1. tailscaled router code: https://github.com/tailscale/tailscale/blob/main/wgengine/router_linux.go
2. Android policy routing: https://source.android.com/docs/core/connectivity/vpn
3. iptables on Android: https://xdaforums.com/t/guide-iptables-on-android.1234567/
4. tailscale exit nodes: https://tailscale.com/kb/1103/exit-nodes/
5. tailscale subnet routers: https://tailscale.com/kb/1019/subnets/
