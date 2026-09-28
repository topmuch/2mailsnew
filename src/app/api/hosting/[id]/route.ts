import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import {
  activatePurchase,
  buildHostingClientReminder,
  buildHostingReminder,
  dakarDaysLeft,
  markRenewed,
} from "@/lib/hosting-notify";
import { getAutomationConfig, sendAutomationEmail } from "@/lib/crm-automation";
import { publicBaseUrl as requestPublicBaseUrl } from "@/lib/doc-share";
import { createHostingInvoiceSafe } from "@/lib/hosting-invoice";

// ─── Modification / suppression d'un domaine hébergé (Task 46-d, 49) ─────────
// PUT    → mise à jour des champs ; SI renewalDate change → notifiedStages
//          reset à "" (nouveau cycle de rappels J-30/15/2/J).
//          Champs additionnels (Task 49) : clientEmail (doit contenir @),
//          paymentUrl (http/https), paymentLabel, customReminder.
//          Champs achat (Task 56) : hasHosting, domainPrice, hostingPrice.
//          Actions optionnelles :
//            {action:"notify"}       → rappel e-mail immédiat manuel (admin +
//                                      client si clientEmail renseigné)
//            {action:"create-link"}  → génère le jeton de la page publique de
//                                      renouvellement, renvoie {domain, url}
//            {action:"revoke-link"}  → révoque le jeton public
//            {action:"confirm-paid"} → domain PENDING (achat, Task 56) :
//                                      ACTIVE l'achat — purchasedAt = maintenant,
//                                      renewalDate = +1 an (compte à rebours
//                                      démarré), historique « Achat <a>-<a+1> ».
//                                      Sinon : marque RENOUVELÉ (+1 an,
//                                      historique HostingRenewal), méthode
//                                      body.method optionnelle.
//                                      Dans les deux cas (Task 56-bis) : une
//                                      FACTURE DE VENTE PAYÉE est générée
//                                      automatiquement (FV-…, versement lié) —
//                                      en cas d'échec, invoiceError est renvoyé
//                                      sans invalider la confirmation.
//            {action:"dismiss-paid"} → efface le signalement « J'ai payé »
// DELETE → suppression du domaine.

export const dynamic = "force-dynamic";

const PAYMENT_METHODS = ["Manuel", "Wave", "Autre"] as const;

/** Setting société, créé avec ses valeurs par défaut si absent. */
async function ensureSetting() {
  const setting = await db.setting.findFirst();
  if (setting) return setting;
  return db.setting.create({ data: {} });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();

    const existing = await db.hostingDomain.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Domaine introuvable" }, { status: 404 });

    // 0) Actions de gestion du lien public / paiement (Task 49)
    if (body.action === "create-link") {
      const setting = await ensureSetting();
      let base = (setting.publicBaseUrl ?? "").trim().replace(/\/+$/, "");
      if (!base) {
        // La base publique est inconnue → on l'apprend depuis la requête
        base = requestPublicBaseUrl(request);
        await db.setting
          .update({ where: { id: setting.id }, data: { publicBaseUrl: base } })
          .catch(() => {
            // apprentissage best-effort — ne bloque pas la création du lien
          });
      }
      const renewalToken = randomBytes(12).toString("base64url"); // 16 caractères URL-safe (96 bits) — lien court
      const updated = await db.hostingDomain.update({ where: { id }, data: { renewalToken } });
      return NextResponse.json({
        domain: { ...updated, daysLeft: dakarDaysLeft(updated.renewalDate, new Date()) },
        url: `${base}/renouvellement/${renewalToken}`,
      });
    }

    if (body.action === "revoke-link") {
      const updated = await db.hostingDomain.update({
        where: { id },
        data: { renewalToken: null },
      });
      return NextResponse.json({
        domain: { ...updated, daysLeft: dakarDaysLeft(updated.renewalDate, new Date()) },
      });
    }

    if (body.action === "confirm-paid") {
      const methodRaw = (body.method ?? "Manuel").toString().trim();
      const method = (PAYMENT_METHODS as readonly string[]).includes(methodRaw)
        ? methodRaw
        : "Manuel";
      // Montant facultatif saisi dans le dialogue (défaut = prix du domaine)
      const amountRaw = Number(body.amount);
      const amount = body.amount !== undefined && Number.isFinite(amountRaw) && amountRaw >= 0 ? amountRaw : undefined;
      // Achat en attente (Task 56) → ACTIVER l'achat (compte à rebours
      // démarre : purchasedAt = maintenant, échéance = +1 an) ; sinon
      // comportement historique : renouveler (+1 an).
      const isPurchase = existing.status === "PENDING";
      const { domain: updated, renewal } = isPurchase
        ? await activatePurchase(id, method, amount)
        : await markRenewed(id, method, amount);
      // Task 56-bis : facture de vente PAYÉE générée automatiquement à la
      // validation du paiement (achat OU renouvellement) — best-effort.
      const { invoice, error: invoiceError } = await createHostingInvoiceSafe(request, {
        domain: updated,
        renewal,
        kind: isPurchase ? "ACHAT" : "RENOUVELLEMENT",
        method,
      });
      return NextResponse.json({
        domain: { ...updated, daysLeft: dakarDaysLeft(updated.renewalDate, new Date()) },
        renewal,
        invoice,
        invoiceError,
      });
    }

    if (body.action === "dismiss-paid") {
      const updated = await db.hostingDomain.update({
        where: { id },
        data: { paymentSignalAt: null },
      });
      return NextResponse.json({
        domain: { ...updated, daysLeft: dakarDaysLeft(updated.renewalDate, new Date()) },
      });
    }

    // 1) Mise à jour éventuelle des champs
    const data: Record<string, unknown> = {};
    if (body.domain !== undefined) {
      const domain = body.domain.toString().trim();
      if (!domain) return NextResponse.json({ error: "Le nom de domaine est obligatoire" }, { status: 400 });
      data.domain = domain;
    }
    let dateChanged = false;
    if (body.renewalDate !== undefined) {
      const raw = body.renewalDate.toString().trim();
      const date = new Date(raw);
      if (!raw || Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Date de renouvellement invalide" }, { status: 400 });
      }
      if (date.getTime() !== existing.renewalDate.getTime()) {
        dateChanged = true;
        data.renewalDate = date;
      }
    }
    if (body.registrar !== undefined) data.registrar = body.registrar.toString().trim().slice(0, 120);
    if (body.clientName !== undefined) data.clientName = body.clientName.toString().trim().slice(0, 160) || null;
    if (body.clientPhone !== undefined) data.clientPhone = body.clientPhone.toString().trim().slice(0, 40) || null;
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Le prix annuel doit être un nombre positif" }, { status: 400 });
      }
      data.price = price;
    }
    if (body.notes !== undefined) data.notes = body.notes.toString().trim().slice(0, 2000) || null;
    // ── Rappel client + paiement en ligne (Task 49) ─────────────────────────
    if (body.clientEmail !== undefined) {
      const email = body.clientEmail.toString().trim().slice(0, 160);
      if (email && !email.includes("@")) {
        return NextResponse.json({ error: "L'e-mail du client doit contenir un @" }, { status: 400 });
      }
      data.clientEmail = email || null;
    }
    if (body.paymentUrl !== undefined) {
      const url = body.paymentUrl.toString().trim().slice(0, 500);
      if (url && !/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { error: "Le lien de paiement doit commencer par http:// ou https://" },
          { status: 400 },
        );
      }
      data.paymentUrl = url || null;
    }
    if (body.paymentLabel !== undefined) {
      data.paymentLabel = body.paymentLabel.toString().trim().slice(0, 40) || null;
    }
    if (body.customReminder !== undefined) {
      data.customReminder = body.customReminder.toString().trim().slice(0, 5000) || null;
    }
    // ── Achat de domaine + hébergement (Task 56) ─────────────────────────
    if (body.hasHosting !== undefined) {
      data.hasHosting = body.hasHosting === true || body.hasHosting === "true";
    }
    if (body.domainPrice !== undefined) {
      const p = Number(body.domainPrice);
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json({ error: "Le prix du domaine doit être un nombre positif" }, { status: 400 });
      }
      data.domainPrice = p;
    }
    if (body.hostingPrice !== undefined) {
      const p = Number(body.hostingPrice);
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json({ error: "Le prix de l'hébergement doit être un nombre positif" }, { status: 400 });
      }
      data.hostingPrice = p;
    }
    if (dateChanged) data.notifiedStages = ""; // nouveau cycle → rappels réarmés

    const updated = await db.hostingDomain.update({ where: { id }, data });

    // 2) Rappel e-mail manuel immédiat (bypass des étapes automatiques)
    if (body.action === "notify") {
      const daysLeft = dakarDaysLeft(updated.renewalDate, new Date());
      const setting = await db.setting.findFirst();

      // ── Mail ADMIN (comportement existant, inchangé) ──────────────────────
      const reminder = buildHostingReminder({
        domain: updated.domain,
        registrar: updated.registrar,
        clientName: updated.clientName,
        renewalDate: updated.renewalDate,
        price: updated.price,
        daysLeft,
        manual: true,
      });
      const config = await getAutomationConfig();
      const to = (config.recipientEmail || setting?.email || "").trim();
      let sent = false;
      let error: string | undefined = undefined;
      if (!to.includes("@")) {
        error = "Aucun destinataire e-mail configuré (Automatisations ou Paramètres société)";
      } else {
        const result = await sendAutomationEmail(to, reminder.subject, reminder.html);
        sent = result.ok;
        error = result.error;
      }
      await db.crmSentMessage
        .create({
          data: {
            type: "HOSTING",
            subject: reminder.subject,
            content: reminder.text.slice(0, 4000),
            channel: "EMAIL",
            dedupeKey: `manual-${Date.now()}`,
            status: sent ? "SENT" : "FAILED",
            error: sent ? null : (error ?? "Erreur inconnue"),
          },
        })
        .catch(() => {
          // journalisation best-effort — ne bloque pas la réponse
        });

      // ── Mail CLIENT (Task 49 — en plus, sans bloquer l'admin) ─────────────
      let clientSent: boolean | null = null;
      let clientError: string | undefined = undefined;
      const clientEmail = (updated.clientEmail ?? "").trim();
      if (clientEmail.includes("@")) {
        try {
          const clientReminder = buildHostingClientReminder(
            {
              domain: updated.domain,
              clientName: updated.clientName,
              renewalDate: updated.renewalDate,
              price: updated.price,
              daysLeft,
              customReminder: updated.customReminder,
              paymentLabel: updated.paymentLabel,
              renewalToken: updated.renewalToken,
            },
            setting,
          );
          const clientResult = await sendAutomationEmail(
            clientEmail,
            clientReminder.subject,
            clientReminder.html,
          );
          clientSent = clientResult.ok;
          clientError = clientResult.error;
          await db.crmSentMessage
            .create({
              data: {
                type: "HOSTING",
                subject: clientReminder.subject,
                content: clientReminder.text.slice(0, 4000),
                channel: "EMAIL",
                dedupeKey: `manual-client-${Date.now()}`,
                status: clientResult.ok ? "SENT" : "FAILED",
                error: clientResult.ok ? null : (clientResult.error ?? "Erreur inconnue"),
              },
            })
            .catch(() => {
              // journalisation best-effort
            });
        } catch (e) {
          clientSent = false;
          clientError = e instanceof Error ? e.message : "Erreur inconnue";
        }
      }

      return NextResponse.json({
        domain: updated,
        sent,
        error,
        recipient: to,
        daysLeft,
        clientSent,
        clientError,
      });
    }

    return NextResponse.json({ domain: { ...updated, daysLeft: dakarDaysLeft(updated.renewalDate, new Date()) } });
  } catch {
    return NextResponse.json({ error: "Modification impossible" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const { id } = await ctx.params;
    await db.hostingDomain.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
