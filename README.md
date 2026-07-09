# NeoCloud Consoles — Customer · Operations · Business

Three independent single-page-application (SPA) portals for the NeoCloud (GPUaaS)
business, built from a high-fidelity design handoff. They share one design system
and a single data scenario, and integrate live with the
[NeoCloud OS emulator (VRCM)](https://github.com/cscw95/NICo-Emulator).

## Quick Start

```bash
bash run.sh        # serves http://127.0.0.1:8090
```

| Console | URL | Demo login | Screens / Modals |
|---------|-----|------------|------------------|
| Customer Portal | `/customer/` | fin-corp · Jihyun Kim (org admin) | 14 / 13 |
| Operations Portal (SRE/NOC) | `/ops/` | oncall-kim | 12 / 13 |
| Business Portal | `/biz/` | Seoyeon Park (Head of Business) | 11 / 7 |

Optionally start the VRCM backend (`./run.sh` in the NICo-Emulator repo, port 8000)
— the consoles auto-detect it and switch to live data (a "VRCM live" badge appears
in the top bar). Without it, every screen falls back to scenario mock data.

## Project Layout

```
shared/tokens.css    Design tokens (shared palette from the design handoff)
shared/shell.css     Common shell — sidebar (230px), topbar (50px), KPI band,
                     panels, modals, buttons, tables
shared/app.js        Hash router (#/<menu-id>), modal manager (data-open /
                     data-modal), event bus, toasts
shared/palette.js    ⌘K command palette (menus + live entities: tenants,
                     orders, tickets, hosts) and notification dropdown
shared/mock-api.js   Scenario dataset + action API (Promise-based)
shared/vrcm-api.js   Live adapter — same API surface as the mock, backed by
                     VRCM REST with per-getter mock fallback
<console>/index.html Screens (`section[data-screen]`) and dialogs
                     (`.modal-ov[data-modal]`) — tokenized markup
<console>/app.js     Screen renderers, live bindings, action handlers
```

- **Routing**: sidebar menu id = route (`#/clusters`) → screen switch, breadcrumb
  and active-menu sync.
- **Modals**: any `data-open="<id>"` button opens `.modal-ov[data-modal="<id>"]`;
  ESC / overlay / ✕ close is handled globally.
- **Cross-portal effects** propagate over the `NC.bus` event bus
  (e.g. `provision.approved`, `deal.converted`, `incident.resolved`).

## Live NICo Emulator(VRCM) Integration

`shared/vrcm-api.js` probes VRCM at `http://127.0.0.1:8000`. When reachable, all
getters return live data; on failure each getter falls back to the mock
individually, so the consoles always work.

End-to-end flow that runs for real:

1. **Business** — converting a pipeline deal creates a real tenant and an
   approval-mode provisioning order in VRCM.
2. **Operations** — the approval gate advances the order one lifecycle stage per
   click (7 gates: intake → policy/placement → reserve → provision → isolate →
   storage → acceptance) until delivery.
3. **Customer** — the delivered cluster appears with live telemetry
   (utilization, power, temperature), storage, billing, access package, and
   isolation verification.

Other live actions: self-service cluster create/expand/reclaim (real orders),
support tickets, incident resolve, equipment maintenance/restore, reconcile
audit, PAM sessions, IAM token issuance, CSV/iCal exports.

The Operations console also supports a **site scope** (All / Gasan / Ansan) that
re-aggregates the Overview KPIs, rack map, incidents and alerts per site —
deep-linkable via `#/overview?scope=ansan`.

Domains without a VRCM counterpart (sales pipeline, capacity expansion plan,
sanitization walkthrough) stay on scenario mock data by design.

To point at a different VRCM host:
`localStorage.setItem("nc-vrcm", "http://<host>:<port>")`.

## Data Scenario (consistent across all three consoles)

| Flow | Customer | Operations | Business |
|------|----------|------------|----------|
| gamma-labs onboarding (ord-9) | — | approval gate · P_Key 0x8014 | contract "provisioning" |
| delta-corp 24-rack deal | — | capacity soft-hold su-9/10, D-14 | pipeline 90% · convert modal |
| Expansion su-12/13 (32 racks) | — | onboarding · PO D-90 | supply plan · 12-week lead time |
| INC-0412 (tray-11 GPU) | ticket TCK-1204 | timeline · RMA · maint window | — |
| SAN-0691 sanitization | PDF download | 7-step run · certificate | CSAP evidence |
| acme-ai renewal D-83 | — | — | alert · playbook |
| Scale constants | 2 sites (36 + 104 racks) · 140 racks · 10,080 GPUs · MRR $36.7M | same | same |

## Production Adoption Notes

1. Replace the getters in `shared/vrcm-api.js` with your production REST calls
   (keep the signatures).
2. Keep optimistic updates for action APIs; re-emit bus events after server
   confirmation.
3. Wire the remaining `TODO` markers in modal confirm handlers.
4. Replace the user card / scope block with SSO (OIDC) token claims.
