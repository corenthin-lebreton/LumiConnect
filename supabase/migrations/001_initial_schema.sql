CREATE TABLE formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_vmid INTEGER NOT NULL,
  vm_start_id INTEGER NOT NULL,
  vm_end_id INTEGER NOT NULL,
  base_ip TEXT NOT NULL,
  ip_start INTEGER NOT NULL,
  vm_username TEXT NOT NULL,
  vm_password TEXT NOT NULL,
  rdp_port INTEGER NOT NULL DEFAULT 3389,
  cpu_cores INTEGER NOT NULL DEFAULT 2,
  ram_mb INTEGER NOT NULL DEFAULT 4096,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE formation_vms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formation_id UUID REFERENCES formations(id) ON DELETE CASCADE,
  vmid INTEGER NOT NULL,
  ip TEXT NOT NULL,
  mac_address TEXT,
  guac_username TEXT,
  guac_password TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deployment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formation_id UUID REFERENCES formations(id) ON DELETE CASCADE,
  vm_id UUID REFERENCES formation_vms(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE formations DISABLE ROW LEVEL SECURITY;
ALTER TABLE formation_vms DISABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_logs DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_formation_vms_formation_id ON formation_vms(formation_id);
CREATE INDEX idx_deployment_logs_formation_id ON deployment_logs(formation_id);
CREATE INDEX idx_deployment_logs_vm_id ON deployment_logs(vm_id);
