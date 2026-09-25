import { schedule } from "node-cron";
import { runDueJobs, isBusinessHours } from "@/lib/crm-automation";
import { runAutomaticFollowups } from "@/lib/crm-followups";
import { runMailSync } from "@/lib/mail-sync";
import { processScheduledMails } from "@/lib/mail-schedule";
import { checkHostingRenewals } from "@/lib/hosting-notify";

// ─── Scheduler des automatisations CRM (node-cron) ───────────────────────────
// Un seul tick par minute : à chaque minute, runDueJobs compare l'heure locale
// aux horaires configurés (08h30, 19h, 11h, 14h, 17h) + vérifie les fenêtres
// de rappels RDV. L'idempotence est assurée par CrmSentMessage (dedupeKey).
// isBusinessHours bloque samedi ≥ 13h et dimanche (repos total).
//
// En plus : synchronisation IMAP automatique toutes les 2 minutes (temps réel)
// — la réception de mails est passive, elle tourne aussi le week-end.

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
      // Relances automatiques : une fois par jour à partir de 09h00
      const followups = await runAutomaticFollowups(now);
      if (followups.created.length) {
        console.log(`[crm-scheduler] relances automatiques : ${followups.created.length} tâche(s) créée(s) — ${followups.created.join(", ")}`);
      }

      // Synchronisation IMAP automatique : toutes les 2 minutes (minutes paires)
      if (now.getMinutes() % 2 === 0) {
        try {
          const mails = await runMailSync();
          if (!mails.skipped && mails.imported > 0) {
            console.log(`[crm-scheduler] mails reçus : ${mails.imported} nouveau(x) importé(s)`);
          }
        } catch (mailError) {
          console.log(
            `[crm-scheduler] synchronisation IMAP échouée : ${mailError instanceof Error ? mailError.message : "erreur inconnue"}`,
          );
        }
      }

      // Mails programmés : envoi dès que la date/heure planifiée est atteinte
      // (chaque minute, indépendant des heures ouvrées — volonté de l'utilisateur)
      try {
        const sched = await processScheduledMails(now);
        if (sched.sent || sched.failed) {
          console.log(`[crm-scheduler] mails programmés : ${sched.sent} envoyé(s), ${sched.failed} échec(s)`);
        }
      } catch (schedError) {
        console.log(
          `[crm-scheduler] mails programmés échoués : ${schedError instanceof Error ? schedError.message : "erreur inconnue"}`,
        );
      }

      // Hosting : rappels de renouvellement J-30 / J-15 / J-2 / jour J
      // (vérification toutes les 30 min ; idempotence dans hosting-notify via notifiedStages)
      if (now.getMinutes() % 30 === 0) {
        try {
          const hosting = await checkHostingRenewals(now);
          if (hosting.notified || hosting.errors) {
            console.log(`[crm-scheduler] hosting : ${hosting.notified} rappel(s) envoyé(s), ${hosting.errors} erreur(s)`);
          }
        } catch (hostingError) {
          console.log(
            `[crm-scheduler] hosting échoué : ${hostingError instanceof Error ? hostingError.message : "erreur inconnue"}`,
          );
        }
      }
    } catch (error) {
      console.error("[crm-scheduler] erreur du tick :", error);
    } finally {
      running = false;
    }
  });

  console.log(
    `[crm-scheduler] démarré — rapports 08h30/19h, coach 11h/14h/17h, rappels RDV, mails auto/2min, mails programmés, hosting J-30/15/2/J. ` +
      `Heures ouvrées maintenant : ${isBusinessHours(new Date()) ? "oui" : "non (repos)"}`,
  );
}
