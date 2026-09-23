// Démarrage automatique du scheduler CRM (rapports quotidiens, coach virtuel,
// rappels de RDV) au boot du serveur Next.js — dev comme production Coolify.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCrmScheduler } = await import("@/lib/crm-scheduler");
    startCrmScheduler();
  }
}
