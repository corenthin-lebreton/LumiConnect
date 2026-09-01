import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { FormationVm, Formation } from "@/types";
import { decryptSecret } from "@/lib/crypto";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 20, marginBottom: 5, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 12, marginBottom: 20, color: "#666" },
  table: { width: "100%" },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#1a1a2e",
    color: "#fff",
    padding: 8,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowAlt: { backgroundColor: "#f9f9f9" },
  colUser: { width: "33%" },
  colPass: { width: "33%" },
  colIp: { width: "34%" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 9, color: "#999", textAlign: "center" },
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
      React.createElement(Text, { style: styles.title }, formation.name),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `Guacamole: ${guacamoleUrl} - ${new Date().toLocaleDateString("fr-FR")}`
      ),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.headerRow },
          React.createElement(Text, { style: styles.colUser }, "Utilisateur"),
          React.createElement(Text, { style: styles.colPass }, "Mot de passe"),
          React.createElement(Text, { style: styles.colIp }, "IP VM")
        ),
        ...readyVms.map((vm, i) =>
          React.createElement(
            View,
            { key: vm.id, style: [styles.row, i % 2 === 1 ? styles.rowAlt : {}] },
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
      React.createElement(Text, { style: styles.footer }, "Lumixen - Document confidentiel")
    )
  );
}

export async function generatePdf(
  formation: Formation,
  vms: FormationVm[]
): Promise<Buffer> {
  const guacamoleUrl = process.env.GUACAMOLE_URL ?? "https://guacamole.example.com";
  const element = CredentialsPdf({ formation, vms, guacamoleUrl });
  return renderToBuffer(element);
}
