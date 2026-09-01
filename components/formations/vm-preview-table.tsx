"use client";

interface VmPreviewProps {
  vmStartId: number;
  vmEndId: number;
  baseIp: string;
  ipStart: number;
}

export function VmPreviewTable({ vmStartId, vmEndId, baseIp, ipStart }: VmPreviewProps) {
  if (!vmStartId || !vmEndId || !baseIp || !ipStart || vmEndId < vmStartId) {
    return null;
  }

  const vms = Array.from(
    { length: vmEndId - vmStartId + 1 },
    (_, i) => ({
      iteration: i + 1,
      vmid: vmStartId + i,
      ip: `${baseIp}${ipStart + i}`,
    })
  );

  return (
    <div className="panel overflow-hidden bg-card">
      <div className="grid grid-cols-3 gap-4 border-b border-line bg-muted px-4 py-2">
        <span className="eyebrow">#</span>
        <span className="eyebrow">VMID</span>
        <span className="eyebrow">IP</span>
      </div>
      <div className="max-h-80 divide-y divide-line overflow-y-auto">
        {vms.map((vm) => (
          <div key={vm.vmid} className="grid grid-cols-3 gap-4 px-4 py-1.5 text-sm">
            <span className="font-mono tabular text-muted-foreground">{vm.iteration}</span>
            <span className="font-mono tabular">{vm.vmid}</span>
            <span className="font-mono tabular">{vm.ip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
