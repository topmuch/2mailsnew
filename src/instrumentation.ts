// Démarrage automatique du scheduler CRM (rapports quotidiens, coach virtuel,
// rappels de RDV) au boot du serveur Next.js — dev comme production Coolify.
// Task 77 : préchauffage du cache Actus au démarrage + toutes les 25 s pour
// garder les articles toujours prêts (réponse instantanée à chaque clic).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCrmScheduler } = await import("@/lib/crm-scheduler");
    startCrmScheduler();

    // Préchauffage du cache Actus : au démarrage (après 8 s pour laisser le
    // serveur compilé), puis toutes les 25 s (juste avant l'expiration du
    // cache 30 s) — le cache reste chaud en permanence.
    const { warmNewsCache } = await import("@/app/api/news/route");
    setTimeout(() => {
      warmNewsCache().catch(() => {});
      setInterval(() => warmNewsCache().catch(() => {}), 25_000);
    }, 8_000);
  }
}
