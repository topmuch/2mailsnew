import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

const VALID_FOLDERS = ["INBOX", "SENT", "TRASH"] as const;

// POST /api/mails/bulk-delete
// Suppression en masse du dossier courant :
//  - dossier INBOX/SENT → déplace TOUS les messages du dossier vers la corbeille ;
//  - dossier TRASH → vide la corbeille (suppression définitive).
// Renvoie { affected, permanent } pour le toast de confirmation.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const folderParam = String(body.folder ?? "INBOX").toUpperCase();
    if (!VALID_FOLDERS.includes(folderParam as (typeof VALID_FOLDERS)[number])) {
      return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
    }

    if (folderParam === "TRASH") {
      // Vider définitivement la corbeille
      const result = await db.mail.deleteMany({ where: { folder: "TRASH" } });
      return NextResponse.json({ affected: result.count, permanent: true });
    }

    // Déplacer tout le dossier vers la corbeille
    const result = await db.mail.updateMany({
      where: { folder: folderParam },
      data: { folder: "TRASH" },
    });
    return NextResponse.json({ affected: result.count, permanent: false });
  } catch (error) {
    console.error("POST /api/mails/bulk-delete", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
