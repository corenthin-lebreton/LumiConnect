import { z } from "zod";

export const formationSchema = z
  .object({
    name: z.string().min(1, "Nom requis").max(100),
    template_vmid: z.number().int().positive("Template requis"),
    os_id: z
      .string()
      .regex(/^[a-z0-9]+$/, "Identifiant d'OS invalide")
      .nullable()
      .default(null),
    template_name: z.string().max(200).nullable().default(null),
    script_ids: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "Identifiant de script invalide"))
      .max(50)
      .default([]),
    vm_start_id: z.number().int().min(100, "Min 100"),
    vm_end_id: z.number().int().min(100, "Min 100"),
    base_ip: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.$/, "Format: X.X.X."),
    ip_start: z.number().int().min(1).max(254),
    vm_username: z.string().min(1, "Username requis"),
    vm_password: z.string().min(4, "Min 4 caractères"),
    rdp_port: z.number().int().min(1).max(65535).default(3389),
    cpu_cores: z.number().int().min(1).max(32).default(2),
    ram_mb: z.number().int().min(512).max(131072).default(4096),
  })
  .refine((data) => data.vm_end_id >= data.vm_start_id, {
    message: "VM end ID doit être >= start ID",
    path: ["vm_end_id"],
  })
  .refine((data) => data.ip_start + (data.vm_end_id - data.vm_start_id) <= 254, {
    message: "Plage IP dépasse 254",
    path: ["ip_start"],
  });

export type FormationFormData = z.infer<typeof formationSchema>;
