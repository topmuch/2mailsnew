// Seed Task 15 : mails de démonstration + événements calendrier
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.mail.count();
  if (existing === 0) {
    const now = Date.now();
    const days = (n: number) => new Date(now - n * 86400000);
    await db.mail.createMany({
      data: [
        { direction: "IN", folder: "INBOX", fromName: "Awa Ndiaye", from: "awa.ndiaye@gmail.com", to: "contact@2mails.sn", subject: "Demande de devis — installation sanitaire", body: "Bonjour,\n\nJe souhaite un devis pour l'installation complète d'une salle de bain (3 pièces) à Sacré-Cœur 3.\n\nCordialement,\nAwa Ndiaye", read: false, sentAt: days(0) },
        { direction: "IN", folder: "INBOX", fromName: "Fournisseur SONED", from: "ventes@soned.sn", to: "contact@2mails.sn", subject: "Nouveau catalogue pompes 2026", body: "Bonjour,\n\nVeuillez trouver notre nouveau catalogue de pompes et surpresseurs pour 2026. Tarifs grossiste applicables.\n\nSoned Distribution", read: false, sentAt: days(1) },
        { direction: "IN", folder: "INBOX", fromName: "Moussa Diop", from: "m.diop@boutique.sn", to: "contact@2mails.sn", subject: "Confirmation livraison carrelage", body: "Bonjour,\n\nJe confirme la réception de la commande de carrelage. Merci pour la rapidité.\n\nMoussa Diop", read: true, sentAt: days(2) },
        { direction: "IN", folder: "INBOX", fromName: "Fatou Sow", from: "fatou.sow@immo.sn", to: "contact@2mails.sn", subject: "Rappel échéance loyer — Immeuble F", body: "Bonjour,\n\nLe loyer du mois en cours reste à régler. Merci de passer à l'agence.\n\nFatou Sow", read: true, sentAt: days(4) },
        { direction: "OUT", folder: "SENT", fromName: "2MAILS", from: "contact@2mails.sn", to: "awa.ndiaye@gmail.com", subject: "Re: Demande de devis — installation sanitaire", body: "Bonjour Madame Ndiaye,\n\nNous vous remercions pour votre demande. Le devis vous parviendra sous 48h après visite technique.\n\n2MAILS", read: true, sentAt: days(0) },
        { direction: "OUT", folder: "SENT", fromName: "2MAILS", from: "contact@2mails.sn", to: "m.diop@boutique.sn", subject: "Facture FV-2026-0001 — Ciment 50kg", body: "Bonjour Monsieur Diop,\n\nVeuillez trouver en pièce jointe votre facture. Reste à payer : 5 900 FCFA.\n\n2MAILS", read: true, sentAt: days(2) },
      ],
    });
    console.log("Mails démo créés");
  }

  const ev = await db.calendarEvent.count();
  if (ev === 0) {
    const today = new Date();
    const day = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    await db.calendarEvent.createMany({
      data: [
        { title: "Visite technique — Sacré-Cœur 3", description: "Devis salle de bain Awa Ndiaye", date: day(1), startTime: "10:00", endTime: "11:30", color: "green", type: "RDV" },
        { title: "Livraison carrelage — Immeuble F", date: day(2), startTime: "09:00", color: "gold", type: "TACHE" },
        { title: "Relancer clients impayés", description: "Relances WhatsApp / email du mois", date: day(3), color: "orange", type: "RAPPEL" },
        { title: "Échéance facture FV-2026-0001", description: "Moussa Diop — 5 900 FCFA", date: day(5), color: "red", type: "RAPPEL" },
        { title: "Réappro stock pompes", description: "Commande fournisseur SONED", date: day(6), startTime: "15:00", color: "green", type: "TACHE" },
      ],
    });
    console.log("Événements démo créés");
  }

  await db.$disconnect();
}

main();
