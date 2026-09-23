import { schedule } from "node-cron";
import { runDueJobs, isBusinessHours } from "@/lib/crm-automation";

// ─── Scheduler des automatisations CRM (node-cron) ───────────────────────────
// Un seul tick par minute : à chaque minute, runDueJobs compare l'heure locale
// aux horaires configurés (08h30, 19h, 11h, 14h, 17h) + vérifie les fenêtres
// de rappels RDV. L'idempotence est assurée par CrmSentMessage (dedupeKey).
// isBusinessHours bloque samedi ≥ 13h et dimanche (repos total).

const globalForScheduler = globalThis as unknown as { __crmSchedulerStarted?: boolean };

let running = false;

export function startCrmScheduler() {
  if (globalForScheduler.__crmSchedulerStarted) return;
  globalForScheduler.__crmSchedulerStarted = true;

  schedule("* * * * *", async () => {
    if (running) return; // anti-chevauchement
    running = true;
    try {
      const now = new Date();
      const result = await runDueJobs(now);
      if (result.ran.length || result.errors.length) {
        console.log(
          `[crm-scheduler] ${now.toISOString()} — exécuté : ${result.ran.join(", ") || "rien"}` +
            (result.errors.length ? ` | erreurs : ${result.errors.join(" | ")}` : ""),
        );
      }
    } catch (error) {
      console.error("[crm-scheduler] erreur du tick :", error);
    } finally {
      running = false;
    }
  });

  console.log(
    `[crm-scheduler] démarré — rapports 08h30/19h, coach 11h/14h/17h, rappels RDV. ` +
      `Heures ouvrées maintenant : ${isBusinessHours(new Date()) ? "oui" : "non (repos)"}`,
  );
}
