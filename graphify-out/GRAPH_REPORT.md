# Graph Report - LumiConnect  (2026-09-02)

## Corpus Check
- 2 files · ~33,621 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 602 nodes · 1184 edges · 36 communities (15 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- VM Provisioning Pipeline
- Formations Pages (Frontend)
- Auth/Health/Deploy API Routes
- Orchestrator + Crypto
- Formations API + Script Picker
- App Layout & Providers
- CLAUDE.md Plugin Rules
- Deploy Progress UI
- Runtime Dependencies
- Dev Dependencies & Tooling
- shadcn Component Registry
- Guacamole Service
- Debian Base Provisioning Script
- Users Admin Page
- Docker Compose Stack
- Healthz Endpoint
- Auth Layout
- Next.js Proxy/Middleware
- Ansible Bootstrap Script
- Docker Install Script
- Git Install Script
- ESLint Config
- PostCSS Config
- Next.js Static Assets
- Script Writing Plan Notes
- Public File Icon
- Public Globe Icon
- Public Vercel Icon
- Public Window Icon

## God Nodes (most connected - your core abstractions)
1. `cn()` - 31 edges
2. `createServerSupabaseClient()` - 29 edges
3. `createAdminClient()` - 27 edges
4. `configureVm()` - 18 edges
5. `pveFetch()` - 16 edges
6. `compilerOptions` - 16 edges
7. `deployFormation()` - 15 edges
8. `guacFetch()` - 14 edges
9. `Button()` - 13 edges
10. `markStep()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Contraintes Windows : guest agent en LocalSystem` --conceptually_related_to--> `interpreterCommand()`  [INFERRED]
  scripts/README.md → lib/services/proxmox-agent.ts
- `Aucun contenu de script stocké en base` --conceptually_related_to--> `resolveScriptPath()`  [INFERRED]
  scripts/README.md → lib/scripts/registry.ts
- `README LumiConnect` --references--> `configureVm()`  [EXTRACTED]
  README.md → lib/pipeline/configure-vm.ts
- `Contraintes Windows : guest agent en LocalSystem` --conceptually_related_to--> `prepareDirectoryCommand()`  [INFERRED]
  scripts/README.md → lib/pipeline/configure-vm.ts
- `Privilèges du jeton API Proxmox` --conceptually_related_to--> `guestFileWrite()`  [EXTRACTED]
  README.md → lib/services/proxmox-agent.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Phases d'implémentation LumiConnect v2 (0-6)** — plan_phase0, plan_phase1, plan_phase2, plan_phase3, plan_phase4, plan_phase5, plan_phase6 [EXTRACTED 1.00]
- **Workflow séquentiel des plugins obligatoires** — claude_plugin_superpowers, claude_plugin_feature_dev, claude_plugin_code_review, claude_plugin_code_simplifier [INFERRED 0.85]
- **Garde-fous sécurité LumiConnect v2** — plan_securite_section, plan_rls_migration, plan_encryption_crypto, lib_scripts_escape [INFERRED 0.85]

## Communities (36 total, 14 thin omitted)

### Community 0 - "VM Provisioning Pipeline"
Cohesion: 0.06
Nodes (38): DeletePage(), DeployPage(), FormationDetailPage(), vmTone, FormationRow(), FormationRowData, FormationsPage(), railTone (+30 more)

### Community 1 - "Formations Pages (Frontend)"
Cohesion: 0.08
Nodes (50): register(), deleteFormation(), logStep(), settleAll(), generatePassword(), HEARTBEAT_INTERVAL_MS, loadFormation(), log() (+42 more)

### Community 2 - "Auth/Health/Deploy API Routes"
Cohesion: 0.06
Nodes (46): formatCeiling(), LoadState, Props, ScriptManifest(), toggle(), ScriptPicker(), Tag(), Selection (+38 more)

### Community 3 - "Orchestrator + Crypto"
Cohesion: 0.09
Nodes (44): GET(), pnpm-workspace (builds autorisés), README LumiConnect, Sonde pnpm probe:agent, Privilèges du jeton API Proxmox, Prérequis des templates Proxmox, Shell, decodeOutput() (+36 more)

### Community 4 - "Formations API + Script Picker"
Cohesion: 0.08
Nodes (30): GET(), POST(), POST(), GET(), GET(), GET(), POST(), GET() (+22 more)

### Community 5 - "App Layout & Providers"
Cohesion: 0.08
Nodes (35): LoginPage(), barTone(), DeployProgress(), phaseLabel(), DeploymentTrace(), FleetGrid(), FleetSummary(), Props (+27 more)

### Community 6 - "CLAUDE.md Plugin Rules"
Cohesion: 0.05
Nodes (38): geist, geistMono, metadata, Providers(), Toaster(), nextConfig, build, dist (+30 more)

### Community 7 - "Deploy Progress UI"
Cohesion: 0.06
Nodes (43): Règles d'architecture (contrats API, migrations versionnées, env vars), Checklist mise en production, caveman, claude-security + security-guidance, code-review, code-simplifier, context7, feature-dev (+35 more)

### Community 8 - "Runtime Dependencies"
Cohesion: 0.05
Nodes (37): @base-ui/react, class-variance-authority, clsx, @hookform/resolvers, lucide-react, next, next-themes, dependencies (+29 more)

### Community 9 - "Dev Dependencies & Tooling"
Cohesion: 0.06
Nodes (34): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, shadcn, tailwindcss, @tailwindcss/postcss (+26 more)

### Community 10 - "shadcn Component Registry"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 11 - "Guacamole Service"
Cohesion: 0.24
Nodes (15): addUserToGroup(), assignConnectionPermission(), createConnectionGroup(), createRdpConnection(), createUser(), createUserGroup(), deleteConnection(), deleteConnectionGroup() (+7 more)

### Community 12 - "Debian Base Provisioning Script"
Cohesion: 0.41
Nodes (12): configure_dhcp(), configure_dhcp_ifupdown(), configure_dhcp_netplan(), configure_dhcp_networkmanager(), enable_ssh(), ensure_user(), log(), primary_interface() (+4 more)

### Community 13 - "Users Admin Page"
Cohesion: 0.80
Nodes (5): readError(), UsersPage(), fetchUsers(), handleAdd(), handleDelete()

### Community 14 - "Docker Compose Stack"
Cohesion: 0.50
Nodes (4): Dockerfile runner target, .env.local, NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, web service

## Ambiguous Edges - Review These
- `pnpm-workspace (builds autorisés)` → `README LumiConnect`  [AMBIGUOUS]
  pnpm-workspace.yaml · relation: conceptually_related_to

## Knowledge Gaps
- **176 isolated node(s):** `ConfigureVmResult`, `GuestPaths`, `GuestExecResult`, `RunScriptOutcome`, `ProxmoxVmSummary` (+171 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 225 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `pnpm-workspace (builds autorisés)` and `README LumiConnect`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `VM Provisioning Pipeline` to `Auth/Health/Deploy API Routes`, `App Layout & Providers`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `createServerSupabaseClient()` connect `Formations API + Script Picker` to `VM Provisioning Pipeline`, `Orchestrator + Crypto`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `createAdminClient()` connect `Formations Pages (Frontend)` to `Formations API + Script Picker`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `ConfigureVmResult`, `GuestPaths`, `GuestExecResult` to the rest of the system?**
  _176 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `VM Provisioning Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.05960755275823769 - nodes in this community are weakly interconnected._
- **Should `Formations Pages (Frontend)` be split into smaller, more focused modules?**
  _Cohesion score 0.08141321044546851 - nodes in this community are weakly interconnected._