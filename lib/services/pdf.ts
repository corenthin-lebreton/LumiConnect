import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { FormationVm, Formation } from "@/types";
import { decryptSecret } from "@/lib/crypto";

// Charte de la console (tokens OKLCH du thème clair convertis en hex : react-pdf ne lit pas oklch).
const COLORS = {
  primary: "#a25f12",
  primaryForeground: "#fefbf6",
  foreground: "#261b14",
  mutedForeground: "#6d6157",
  accentForeground: "#713f11",
  line: "#e7e2db",
  lineStrong: "#d3cbc1",
  surface: "#f5f0e9",
};

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 40, fontSize: 11, fontFamily: "Helvetica", color: COLORS.foreground },
  band: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: COLORS.primary },
  eyebrow: { fontSize: 8, letterSpacing: 1.2, color: COLORS.accentForeground, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  title: { fontSize: 20, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, marginBottom: 22, color: COLORS.mutedForeground },
  table: { width: "100%", borderWidth: 1, borderColor: COLORS.lineStrong, borderRadius: 4 },
  headerRow: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    color: COLORS.primaryForeground,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    fontFamily: "Courier",
    fontSize: 10,
  },
  rowAlt: { backgroundColor: COLORS.surface },
  colUser: { width: "33%" },
  colPass: { width: "33%" },
  colIp: { width: "34%" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    fontSize: 8,
    letterSpacing: 0.8,
    color: COLORS.mutedForeground,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function CredentialsPdf({
  formation,
  vms,
  guacamoleUrl,
}: {
  formation: Formation;
  vms: FormationVm[];
  guacamoleUrl: string;
}) {
  const readyVms = vms.filter((vm) => vm.status === "ready" && vm.guac_username);

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(View, { style: styles.band, fixed: true }),
      React.createElement(Text, { style: styles.eyebrow }, "IDENTIFIANTS STAGIAIRES"),
      React.createElement(Text, { style: styles.title }, formation.name),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `Guacamole : ${guacamoleUrl} · ${readyVms.length} machine${readyVms.length > 1 ? "s" : ""} · ` +
          new Date().toLocaleDateString("fr-FR")
      ),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.headerRow },
          React.createElement(Text, { style: styles.colUser }, "UTILISATEUR"),
          React.createElement(Text, { style: styles.colPass }, "MOT DE PASSE"),
          React.createElement(Text, { style: styles.colIp }, "IP VM")
        ),
        ...readyVms.map((vm, i) =>
          React.createElement(
            View,
            { key: vm.id, style: [styles.row, i % 2 === 1 ? styles.rowAlt : {}], wrap: false },
            React.createElement(Text, { style: styles.colUser }, vm.guac_username ?? ""),
            React.createElement(
              Text,
              { style: styles.colPass },
              vm.guac_password ? decryptSecret(vm.guac_password) : ""
            ),
            React.createElement(Text, { style: styles.colIp }, vm.ip)
          )
        )
      ),
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, null, "DOCUMENT CONFIDENTIEL"),
        React.createElement(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${pageNumber} / ${totalPages}`,
        })
      )
    )
  );
}

export async function generatePdf(
  formation: Formation,
  vms: FormationVm[],
  guacamoleUrl: string
): Promise<Buffer> {
  const element = CredentialsPdf({ formation, vms, guacamoleUrl });
  return renderToBuffer(element);
}
