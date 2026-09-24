// Numérotation SÉCURISÉE des documents (factures, commandes, achats…)
//
// Ancien comportement : `count() + 1` → dès qu'un document était supprimé, le
// compteur retombait sur un numéro déjà attribué → erreur P2002
// « Unique constraint failed on the fields: (number) » → « erreur serveur ».
//
// Nouveau comportement : on part du MAXIMUM existant pour le préfixe/année,
// puis la route réessaie automatiquement en cas de collision concurrente.
// Les numéros existants ne sont PAS renumérotés (les trous restent des trous).
import { db } from "@/lib/db";

type NumberedTable = "invoice" | "order" | "purchase";

async function maxSequenceFor(
  table: NumberedTable,
  like: string,
  extraWhere: Record<string, unknown> = {},
): Promise<number> {
  const where = { number: { startsWith: like }, ...extraWhere } as never;
  let rows: { number: string }[];
  if (table === "invoice") {
    rows = await db.invoice.findMany({ where, select: { number: true } });
  } else if (table === "order") {
    rows = await db.order.findMany({ where, select: { number: true } });
  } else {
    rows = await db.purchase.findMany({ where, select: { number: true } });
  }
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.number.slice(like.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Génère le prochain numéro disponible pour un type de document.
 * Exemple : max existant FV-2026-0011 → « FV-2026-0012 ».
 * Les suppressions antérieures ne provoquent plus de collision.
 * `extraWhere` permet d'ajouter un filtre (ex. { type: "VENTE" }).
 */
export async function generateDocumentNumber(
  table: NumberedTable,
  prefix: string,
  year: number = new Date().getFullYear(),
  extraWhere: Record<string, unknown> = {},
): Promise<string> {
  const like = `${prefix}-${year}-`;
  const max = await maxSequenceFor(table, like, extraWhere);
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Exécute `action` en régénérant le numéro si une contrainte d'unicité sur
 * `number` est violée (créations concurrentes). `action` reçoit le numéro
 * courant à chaque tentative.
 */
export async function withNumberRetry<T>(
  getNumber: () => Promise<string>,
  action: (number: string) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const number = await getNumber();
    try {
      return await action(number);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "P2002") throw error;
      lastError = error;
      console.warn(
        `[numbering] collision sur « ${number} », nouvel essai (${attempt}/${attempts})…`,
      );
    }
  }
  throw lastError;
}
