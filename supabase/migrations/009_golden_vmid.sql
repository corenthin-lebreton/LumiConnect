-- VMID de l'image dorée : clone complet du template, configuré une fois, converti en template,
-- dont les VMs de la formation sont des clones liés.
ALTER TABLE formations ADD COLUMN golden_vmid INTEGER;
