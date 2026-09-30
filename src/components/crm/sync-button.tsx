"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── SyncButton : « 🔄 Synchroniser maintenant » ─────────────────────────────
// Appelle POST /api/crm/sync pour rattraper un webhook manqué.
// Variante compacte utilisée dans les onglets QR Bags / QR Tags / VerifScan
// (?platform=QRBAGS|QRTAGS|VERIFSCAN pour ne synchroniser qu'une plateforme).

export default function SyncButton({
  onSync,
  syncing = false,
  platform,
  label,
}: {
  onSync: () => void | Promise<void>;
  syncing?: boolean;
  /** si renseigné : synchronise uniquement cette plateforme */
  platform?: "QRTAGS" | "QRBAGS" | "VERIFSCAN";
  label?: string;
}) {
  return (
    <Button onClick={() => void onSync()} disabled={syncing} className="gap-2">
      {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
      {label ?? (platform ? `Synchroniser ${platform}` : "Synchroniser maintenant")}
    </Button>
  );
}
