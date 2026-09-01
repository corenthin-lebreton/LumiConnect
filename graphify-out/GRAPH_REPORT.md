# Graph Report - .  (2026-08-24)

## Corpus Check
- Corpus is ~34,647 words - fits in a single context window. You may not need a graph.

## Summary
- 636 nodes · 1306 edges · 40 communities (31 shown, 9 thin omitted)
- Extraction: 95% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.85)
- Token cost: 192,037 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Guacamole, pfSense et progression|Guacamole, pfSense et progression]]
- [[_COMMUNITY_Bibliothèque de scripts|Bibliothèque de scripts]]
- [[_COMMUNITY_Écrans et mise en page|Écrans et mise en page]]
- [[_COMMUNITY_Guest agent et configuration in-guest|Guest agent et configuration in-guest]]
- [[_COMMUNITY_Dépendances du paquet|Dépendances du paquet]]
- [[_COMMUNITY_File de travaux et worker|File de travaux et worker]]
- [[_COMMUNITY_Suivi de déploiement en direct|Suivi de déploiement en direct]]
- [[_COMMUNITY_Configuration shadcn|Configuration shadcn]]
- [[_COMMUNITY_Configuration TypeScript|Configuration TypeScript]]
- [[_COMMUNITY_Proxmox et nomenclature des templates|Proxmox et nomenclature des templates]]
- [[_COMMUNITY_Primitives de formulaire|Primitives de formulaire]]
- [[_COMMUNITY_Menu déroulant|Menu déroulant]]
- [[_COMMUNITY_Boîte de dialogue de confirmation|Boîte de dialogue de confirmation]]
- [[_COMMUNITY_Script de base Debian|Script de base Debian]]
- [[_COMMUNITY_Boîte de dialogue|Boîte de dialogue]]
- [[_COMMUNITY_Racine applicative|Racine applicative]]
- [[_COMMUNITY_Primitives de tableau|Primitives de tableau]]
- [[_COMMUNITY_Primitives de carte|Primitives de carte]]
- [[_COMMUNITY_Primitives d onglets|Primitives d onglets]]
- [[_COMMUNITY_Chiffrement des secrets|Chiffrement des secrets]]
- [[_COMMUNITY_Registry Debian 13|Registry Debian 13]]
- [[_COMMUNITY_Registry Kali|Registry Kali]]
- [[_COMMUNITY_Registry Ubuntu 24.04|Registry Ubuntu 24.04]]
- [[_COMMUNITY_Registry Windows 11|Registry Windows 11]]
- [[_COMMUNITY_Composant 24|Composant 24]]
- [[_COMMUNITY_Composant 25|Composant 25]]
- [[_COMMUNITY_Composant 26|Composant 26]]
- [[_COMMUNITY_Composant 27|Composant 27]]
- [[_COMMUNITY_Composant 28|Composant 28]]
- [[_COMMUNITY_Composant 31|Composant 31]]
- [[_COMMUNITY_Composant 32|Composant 32]]
- [[_COMMUNITY_Composant 33|Composant 33]]
- [[_COMMUNITY_Composant 39|Composant 39]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 95 edges
2. `createServerSupabaseClient()` - 33 edges
3. `createAdminClient()` - 30 edges
4. `deployFormation()` - 23 edges
5. `configureVm()` - 21 edges
6. `runGuacamoleStep()` - 17 edges
7. `compilerOptions` - 16 edges
8. `Button()` - 15 edges
9. `deleteFormation()` - 15 edges
10. `guacFetch()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `mapWithConcurrency()` --semantically_similar_to--> `tick()`  [INFERRED] [semantically similar]
  lib/pool.ts → worker/index.ts
- `Aucun contenu de script stocké en base` --conceptually_related_to--> `resolveScriptPath()`  [INFERRED]
  scripts/README.md → lib/scripts/registry.ts
- `Fichier de contexte LC_* déposé dans l'invité` --conceptually_related_to--> `Règles d'écriture d'un script`  [INFERRED]
  lib/pipeline/configure-vm.ts → scripts/README.md
- `Sonde pnpm probe:agent` --conceptually_related_to--> `Frontière d'injection shell du produit`  [INFERRED]
  README.md → lib/scripts/escape.ts
- `generatePassword()` --conceptually_related_to--> `POST()`  [AMBIGUOUS]
  lib/crypto.ts → app/api/formations/route.ts

## Hyperedges (group relationships)
- **Web-to-worker deploy handoff via the jobs table** — formations_id_deploy_route_post, lib_queue_enqueue, db_jobs_table, worker_index_tick, worker_index_runjob, lib_orchestrator_deployformation [EXTRACTED 1.00]
- **Per-VM provisioning pipeline: clone, DHCP, in-guest config, Guacamole, PDF** — lib_orchestrator_deployformation, services_proxmox_clonevm, services_pfsense_createdhcplease, pipeline_configure_vm_configurevm, pipeline_guacamole_step_runguacamolestep, services_pdf_generatepdf, lib_progress_markstep [EXTRACTED 1.00]
- **Server-side script selection: browser sends ids, server resolves and freezes the order** — lib_schemas_formationschema, formations_route_post, scripts_registry_loadregistry, scripts_resolve_resolveselection, db_formation_scripts_table, lib_orchestrator_loadselection [EXTRACTED 1.00]
- **Chaîne de configuration in-guest (file-write → exec → exec-status)** — pipeline_configure_vm_configurevm, services_proxmox_agent_waitforagent, services_proxmox_agent_guestfilewrite, services_proxmox_agent_guestexec, services_proxmox_agent_guestexecstatus, pipeline_configure_vm_context_file, scripts_registry_loadscriptcontent [EXTRACTED 1.00]
- **Frontière d'injection : valeurs du formulaire exécutées en SYSTEM/root** — scripts_escape_injection_boundary, scripts_escape_escapepowershell, scripts_escape_escapebash, scripts_escape_assertsingleline, scripts_escape_rendercontextfile, scripts_escape_test_suite, pipeline_configure_vm_context_file [EXTRACTED 1.00]
- **Défense en profondeur contre la traversée de chemin depuis un nom de template Proxmox** — services_proxmox_gettemplates, scripts_registry_isvalidosid, scripts_registry_resolvescriptpath, scripts_registry_test_suite, lib_templates_test_suite [INFERRED 0.95]

## Communities (40 total, 9 thin omitted)

### Community 0 - "Guacamole, pfSense et progression"
Cohesion: 0.06
Nodes (67): formation_vms Table, vm_steps Table (progress grid), Apache Guacamole API, pfSense REST API, API pfSense v2 (DHCP static mapping), Credentials PDF Endpoint, GET(), logStep() (+59 more)

### Community 1 - "Bibliothèque de scripts"
Cohesion: 0.05
Nodes (54): formation_scripts Table, GET(), POST(), formatCeiling(), LoadState, Props, ScriptManifest(), ScriptPicker() (+46 more)

### Community 2 - "Écrans et mise en page"
Cohesion: 0.06
Nodes (37): Realtime Progress Channel, DeletePage(), CreationForm(), FormationFormData, DeleteConfirmation(), DeletingWatcher(), FormationRow(), FormationRowData (+29 more)

### Community 3 - "Guest agent et configuration in-guest"
Cohesion: 0.08
Nodes (55): pnpm-workspace (builds autorisés), README LumiConnect, Sonde pnpm probe:agent, Privilèges du jeton API Proxmox, Prérequis des templates Proxmox, QEMU guest agent (dans l'invité), configureVm(), ConfigureVmResult (+47 more)

### Community 4 - "Dépendances du paquet"
Cohesion: 0.04
Nodes (46): dependencies, @base-ui/react, class-variance-authority, clsx, @hookform/resolvers, lucide-react, next, next-themes (+38 more)

### Community 5 - "File de travaux et worker"
Cohesion: 0.11
Nodes (34): GET(), formations Table, jobs Table (work queue), POST(), POST(), Delete Formation Endpoint, Deploy Formation Endpoint, GET() (+26 more)

### Community 6 - "Suivi de déploiement en direct"
Cohesion: 0.08
Nodes (33): docker-compose web + worker, DeployPage(), Supabase Realtime (postgres_changes), barTone(), DeployProgress(), phaseLabel(), DeploymentTrace(), FleetGrid() (+25 more)

### Community 7 - "Configuration shadcn"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 8 - "Configuration TypeScript"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Proxmox et nomenclature des templates"
Cohesion: 0.20
Nodes (16): Proxmox VE API, API REST Proxmox VE (/api2/json), hasTag(), ParsedTemplateName, parseTemplateName(), TEMPLATE_TAG (lc-tpl), Tests de nomenclature des templates, cloneVm() (+8 more)

### Community 10 - "Primitives de formulaire"
Cohesion: 0.19
Nodes (16): cn(), Progress(), ProgressIndicator(), ProgressLabel(), ProgressTrack(), ProgressValue(), SelectContent(), SelectGroup() (+8 more)

### Community 11 - "Menu déroulant"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 12 - "Boîte de dialogue de confirmation"
Cohesion: 0.15
Nodes (9): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogMedia(), AlertDialogOverlay() (+1 more)

### Community 13 - "Script de base Debian"
Cohesion: 0.40
Nodes (11): debian-base.sh script, configure_dhcp(), configure_dhcp_ifupdown(), configure_dhcp_netplan(), configure_dhcp_networkmanager(), enable_ssh(), ensure_user(), log() (+3 more)

### Community 14 - "Boîte de dialogue"
Cohesion: 0.18
Nodes (6): DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogTitle()

### Community 15 - "Racine applicative"
Cohesion: 0.28
Nodes (5): metadata, outfit, spaceMono, Providers(), Toaster()

### Community 16 - "Primitives de tableau"
Cohesion: 0.22
Nodes (8): Table(), TableBody(), TableCaption(), TableCell(), TableFooter(), TableHead(), TableHeader(), TableRow()

### Community 17 - "Primitives de carte"
Cohesion: 0.25
Nodes (7): Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle()

### Community 18 - "Primitives d onglets"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 19 - "Chiffrement des secrets"
Cohesion: 0.40
Nodes (4): encrypted, parts, seen, tampered

### Community 20 - "Registry Debian 13"
Cohesion: 0.50
Nodes (3): os_id, scripts, shell

### Community 21 - "Registry Kali"
Cohesion: 0.50
Nodes (3): os_id, scripts, shell

### Community 22 - "Registry Ubuntu 24.04"
Cohesion: 0.50
Nodes (3): os_id, scripts, shell

### Community 23 - "Registry Windows 11"
Cohesion: 0.50
Nodes (3): os_id, scripts, shell

## Ambiguous Edges - Review These
- `POST()` → `generatePassword()`  [AMBIGUOUS]
  lib/crypto.ts · relation: conceptually_related_to
- `cn()` → `useDeploymentProgress()`  [AMBIGUOUS]
  lib/utils.ts · relation: conceptually_related_to
- `decryptSecret()` → `generatePdf()`  [AMBIGUOUS]
  lib/services/pdf.ts · relation: conceptually_related_to
- `README LumiConnect` → `pnpm-workspace (builds autorisés)`  [AMBIGUOUS]
  pnpm-workspace.yaml · relation: conceptually_related_to

## Knowledge Gaps
- **187 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+182 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `POST()` and `generatePassword()`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `cn()` and `useDeploymentProgress()`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `decryptSecret()` and `generatePdf()`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `README LumiConnect` and `pnpm-workspace (builds autorisés)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Primitives de formulaire` to `Bibliothèque de scripts`, `Écrans et mise en page`, `Suivi de déploiement en direct`, `Menu déroulant`, `Boîte de dialogue de confirmation`, `Boîte de dialogue`, `Primitives de tableau`, `Primitives de carte`, `Primitives d onglets`, `Composant 25`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Why does `createServerSupabaseClient()` connect `File de travaux et worker` to `Guacamole, pfSense et progression`, `Bibliothèque de scripts`, `Écrans et mise en page`, `Suivi de déploiement en direct`, `Proxmox et nomenclature des templates`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `configureVm()` connect `Guest agent et configuration in-guest` to `Guacamole, pfSense et progression`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._