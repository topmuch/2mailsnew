// ─── Modèles de documents (éditeur type Word, export .docx / PDF) ────────────
// 2MAILS / ETS LAMP FALL — Dakar, Sénégal. Montants en FCFA.
// Chaque modèle est du HTML que l'éditeur TipTap sait parser et que
// l'export Word convertit (titres, listes, tableaux, signatures).
// Le papier en-tête (logo + coordonnées) est ajouté automatiquement
// à l'export — les modèles contiennent le corps du document.

export type TemplateKey = "BLANK" | "DEVIS" | "LETTRE" | "PV" | "CONTRAT";

export const TEMPLATE_KEYS: TemplateKey[] = ["BLANK", "DEVIS", "LETTRE", "PV", "CONTRAT"];

export const TEMPLATE_PREFIX: Record<TemplateKey, string> = {
  BLANK: "DOC",
  DEVIS: "DEV",
  LETTRE: "LET",
  PV: "PV",
  CONTRAT: "CT",
};

export interface TemplateContext {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  rc: string;
  ninea: string;
  numero: string; // ex. DEV-2025-001
  dateCourte: string; // 03/02/2025
  dateLongue: string; // Dakar, le 3 février 2025
  ville: string; // Dakar
  clientName?: string;
  clientCompany?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  montant?: string;
}

/** Remplace les jetons du modèle par les valeurs du contexte (client, dates…). */
export function fillPlaceholders(html: string, ctx: TemplateContext): string {
  const map: Record<string, string> = {
    "[N° DOCUMENT]": ctx.numero,
    "[DATE]": ctx.dateCourte,
    "[DATE LONGUE]": ctx.dateLongue,
    "[VILLE]": ctx.ville,
    "[SOCIÉTÉ ÉMETTRICE]": ctx.companyName,
    "[TAGLINE]": ctx.tagline,
    "[ADRESSE ÉMETTRICE]": ctx.address,
    "[TÉLÉPHONE ÉMETTRICE]": ctx.phone,
    "[EMAIL ÉMETTRICE]": ctx.email,
    "[RC]": ctx.rc || "—",
    "[NINEA]": ctx.ninea || "—",
    "[NOM DU CLIENT]": ctx.clientName || "[NOM DU CLIENT]",
    "[SOCIÉTÉ]": ctx.clientCompany || ctx.clientName || "[SOCIÉTÉ]",
    "[ADRESSE CLIENT]": ctx.clientAddress || "[ADRESSE CLIENT]",
    "[TÉLÉPHONE CLIENT]": ctx.clientPhone || "[TÉLÉPHONE CLIENT]",
    "[EMAIL CLIENT]": ctx.clientEmail || "[EMAIL CLIENT]",
    "[MONTANT]": ctx.montant || "[MONTANT]",
  };
  let out = html;
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
}

// Cellule de tableau vide (espace insécable pour garder la bordure visible)
const C = `<td style="height:26px;">&nbsp;</td>`;

// ─── Corps HTML des modèles ──────────────────────────────────────────────────

const DEVIS_HTML = `
<h1 style="text-align:center;">DEVIS N° [N° DOCUMENT]</h1>
<p style="text-align:center; color:#6B7280;">Établi le [DATE] — valable 30 jours</p>
<table>
  <tbody>
    <tr>
      <th>Émetteur</th>
      <th>Client</th>
    </tr>
    <tr>
      <td>
        <p><strong>[SOCIÉTÉ ÉMETTRICE]</strong></p>
        <p>[TAGLINE]</p>
        <p>[ADRESSE ÉMETTRICE]</p>
        <p>Tél : [TÉLÉPHONE ÉMETTRICE]</p>
        <p>Email : [EMAIL ÉMETTRICE]</p>
        <p>RC : [RC] — NINEA : [NINEA]</p>
      </td>
      <td>
        <p><strong>[NOM DU CLIENT]</strong></p>
        <p>[ADRESSE CLIENT]</p>
        <p>Tél : [TÉLÉPHONE CLIENT]</p>
        <p>Email : [EMAIL CLIENT]</p>
      </td>
    </tr>
  </tbody>
</table>
<h2>Détail des prestations / fournitures</h2>
<table>
  <thead>
    <tr><th style="width:46%;">Désignation</th><th>Qté</th><th>Prix unitaire (FCFA)</th><th>Total (FCFA)</th></tr>
  </thead>
  <tbody>
    <tr>${C}${C}${C}${C}</tr>
    <tr>${C}${C}${C}${C}</tr>
    <tr>${C}${C}${C}${C}</tr>
    <tr>${C}${C}${C}${C}</tr>
    <tr>${C}${C}${C}${C}</tr>
  </tbody>
</table>
<table>
  <tbody>
    <tr><th style="width:55%;">Total HT</th><td>&nbsp; FCFA</td></tr>
    <tr><th>TVA (18 %)</th><td>&nbsp; FCFA</td></tr>
    <tr><th><strong>Total TTC</strong></th><td><strong>&nbsp; FCFA</strong></td></tr>
  </tbody>
</table>
<p><strong>Arrêté le présent devis à la somme de : [MONTANT]</strong></p>
<h2>Conditions</h2>
<ul>
  <li>Validité du devis : 30 (trente) jours à compter de sa date d'émission.</li>
  <li>Acompte de 50 % à la commande, solde à la livraison.</li>
  <li>Modes de paiement : espèces, virement bancaire, Wave, Orange Money.</li>
  <li>Les délais d'exécution courent à réception de l'acompte.</li>
</ul>
<hr>
<table>
  <tbody>
    <tr>
      <td style="height:100px; width:50%; vertical-align:top;"><strong>Signature Émetteur</strong></td>
      <td style="vertical-align:top;"><strong>Signature Client</strong> <em>(précédée de la mention « Bon pour accord »)</em></td>
    </tr>
  </tbody>
</table>
`;

const LETTRE_HTML = `
<p style="text-align:right;">[VILLE], le [DATE LONGUE]</p>
<p>
  <strong>[NOM DU CLIENT]</strong><br>
  [ADRESSE CLIENT]<br>
  Tél : [TÉLÉPHONE CLIENT]<br>
  Email : [EMAIL CLIENT]
</p>
<p><strong>Objet :</strong> [OBJET]</p>
<p>Monsieur / Madame,</p>
<p>[Exposez ici l'objet de votre courrier : demande, information, relance, remerciements… Restez concis et allez droit au but dès le premier paragraphe.]</p>
<p>[Deuxième paragraphe si nécessaire : précisions, conditions, délais souhaités, proposition d'un rendez-vous…]</p>
<p>Nous restons à votre entière disposition pour tout complément d'information et vous confirmons notre engagement à vous servir avec professionnalisme.</p>
<p>Dans l'attente de votre retour, nous vous prions d'agréer, Monsieur / Madame, l'expression de nos salutations distinguées.</p>
<hr>
<table>
  <tbody>
    <tr>
      <td style="height:100px; width:50%; vertical-align:top;"><strong>Le Responsable</strong></td>
      <td style="vertical-align:top;"><strong>Nom et signature</strong></td>
    </tr>
  </tbody>
</table>
`;

const PV_HTML = `
<h1 style="text-align:center;">PROCÈS-VERBAL DE RÉUNION</h1>
<p style="text-align:center; color:#6B7280;">N° [N° DOCUMENT] — [DATE LONGUE]</p>
<table>
  <tbody>
    <tr><th style="width:28%;">Lieu</th><td>[LIEU]</td></tr>
    <tr><th>Heure</th><td>[HEURE DE DÉBUT] — [HEURE DE FIN]</td></tr>
    <tr><th>Présents</th><td>[NOMS DES PARTICIPANTS]</td></tr>
    <tr><th>Excusés</th><td>[ABSENTS EXCUSÉS]</td></tr>
    <tr><th>Animation</th><td>[NOM DU RESPONSABLE DE RÉUNION]</td></tr>
  </tbody>
</table>
<h2>Ordre du jour</h2>
<ol>
  <li>[Premier point]</li>
  <li>[Deuxième point]</li>
  <li>[Troisième point]</li>
</ol>
<h2>Déroulement et discussions</h2>
<h3>1. [Premier point]</h3>
<p>[Résumé des échanges, propositions et arbitrages…]</p>
<h3>2. [Deuxième point]</h3>
<p>[Résumé des échanges, propositions et arbitrages…]</p>
<h2>Décisions prises</h2>
<ul>
  <li>[Décision 1]</li>
  <li>[Décision 2]</li>
</ul>
<h2>Actions à mener</h2>
<table>
  <thead>
    <tr><th style="width:55%;">Action</th><th>Responsable</th><th>Échéance</th></tr>
  </thead>
  <tbody>
    <tr>${C}${C}${C}</tr>
    <tr>${C}${C}${C}</tr>
    <tr>${C}${C}${C}</tr>
  </tbody>
</table>
<p><strong>Prochaine réunion :</strong> [DATE DE LA PROCHAINE RÉUNION]</p>
<hr>
<table>
  <tbody>
    <tr>
      <td style="height:100px; width:50%; vertical-align:top;"><strong>Le Rapporteur</strong></td>
      <td style="vertical-align:top;"><strong>Le Responsable</strong></td>
    </tr>
  </tbody>
</table>
`;

const CONTRAT_HTML = `
<h1 style="text-align:center;">CONTRAT DE CRÉATION ET DE VENTE DE SITE INTERNET</h1>
<p style="text-align:center; color:#6B7280;">N° [N° DOCUMENT] — Fait à [VILLE], le [DATE LONGUE]</p>
<h2>Entre les soussignés</h2>
<p>
  <strong>Le Vendeur / Prestataire :</strong> [SOCIÉTÉ ÉMETTRICE] ([TAGLINE]),
  dont le siège est situé à [ADRESSE ÉMETTRICE], RC : [RC], NINEA : [NINEA],
  téléphone : [TÉLÉPHONE ÉMETTRICE], courriel : [EMAIL ÉMETTRICE],
</p>
<p><strong>ci-après désigné « le Vendeur »</strong>, d'une part,</p>
<p>Et</p>
<p>
  <strong>Le Client :</strong> [NOM DU CLIENT] ([SOCIÉTÉ]), demeurant à [ADRESSE CLIENT],
  téléphone : [TÉLÉPHONE CLIENT], courriel : [EMAIL CLIENT],
</p>
<p><strong>ci-après désigné « le Client »</strong>, d'autre part,</p>
<h2>Article 1 — Objet du contrat</h2>
<p>
  Le présent contrat a pour objet la création, la mise en ligne et la vente d'un site internet
  conformément au cahier des charges arrêté entre les parties :
  [DESCRIPTION DU SITE — ex. site vitrine de 5 pages, catalogue de produits, formulaire de contact].
</p>
<h2>Article 2 — Prix et modalités de paiement</h2>
<p>Le prix total de la prestation est fixé à <strong>[MONTANT] TTC</strong>, payable comme suit :</p>
<ul>
  <li>50 % (cinquante pour cent) à la signature du présent contrat ;</li>
  <li>50 % (cinquante pour cent) à la mise en ligne du site.</li>
</ul>
<p>Tout acompte versé en cours d'exécution reste acquis au Vendeur au prorata des travaux réalisés.</p>
<h2>Article 3 — Délais de réalisation</h2>
<p>
  Le Vendeur s'engage à livrer le site dans un délai de [DÉLAI — ex. 30] jours ouvrables à compter
  du versement de l'acompte et de la réception de l'ensemble des contenus (textes, images, logos)
  fournis par le Client.
</p>
<h2>Article 4 — Obligations du Vendeur</h2>
<ul>
  <li>Réaliser un site moderne, responsive (ordinateur, tablette, mobile) et conforme au cahier des charges ;</li>
  <li>Mettre en ligne le site sur l'hébergement et le nom de domaine convenus ;</li>
  <li>Former le Client à l'administration du site (une session) ;</li>
  <li>Corriger gratuitement, pendant 3 (trois) mois, tout défaut technique résultant du développement.</li>
</ul>
<h2>Article 5 — Obligations du Client</h2>
<ul>
  <li>Fournir dans les délais les contenus, documents et accès nécessaires ;</li>
  <li>Régler les montants convenus aux échéances prévues ;</li>
  <li>Garantir la licéité des contenus qu'il fournit (textes, images, marques).</li>
</ul>
<h2>Article 6 — Propriété intellectuelle</h2>
<p>
  La propriété du site (design, contenus, code) est transférée au Client après paiement intégral du
  prix. Le Vendeur conserve le droit de citer la réalisation dans ses références commerciales.
</p>
<h2>Article 7 — Hébergement et maintenance</h2>
<p>
  Le renouvellement annuel de l'hébergement et du nom de domaine, ainsi que la maintenance
  évolutive, font l'objet d'un accord séparé entre les parties.
</p>
<h2>Article 8 — Résiliation</h2>
<p>
  En cas de manquement grave de l'une des parties, le présent contrat peut être résilié de plein
  droit, après mise en demeure restée sans effet pendant 15 (quinze) jours.
</p>
<h2>Article 9 — Litiges</h2>
<p>
  Tout litige relatif à l'interprétation ou à l'exécution du présent contrat sera réglé à l'amiable ;
  à défaut, il sera soumis aux tribunaux compétents de Dakar, le droit sénégalais étant seul applicable.
</p>
<p>Fait à [VILLE], le [DATE LONGUE], en deux (2) exemplaires originaux.</p>
<table>
  <tbody>
    <tr>
      <td style="height:110px; width:50%; vertical-align:top;"><strong>Le Vendeur</strong></td>
      <td style="vertical-align:top;"><strong>Le Client</strong></td>
    </tr>
  </tbody>
</table>
`;

const BLANK_HTML = `
<h1>[TITRE DU DOCUMENT]</h1>
<p>Commencez à rédiger votre document ici…</p>
`;

/** Construit le HTML initial d'un modèle, jetons remplacés par le contexte. */
export function templateHtml(key: TemplateKey, ctx: TemplateContext): string {
  const raw =
    key === "DEVIS"
      ? DEVIS_HTML
      : key === "LETTRE"
        ? LETTRE_HTML
        : key === "PV"
          ? PV_HTML
          : key === "CONTRAT"
            ? CONTRAT_HTML
            : BLANK_HTML;
  return fillPlaceholders(raw.trim(), ctx);
}

/** Titre par défaut d'un document créé depuis un modèle. */
export function templateDefaultTitle(key: TemplateKey, numero: string, clientName?: string): string {
  const base =
    key === "DEVIS"
      ? "Devis"
      : key === "LETTRE"
        ? "Lettre"
        : key === "PV"
          ? "PV de réunion"
          : key === "CONTRAT"
            ? "Contrat site internet"
            : "Document";
  if (!clientName) return `${base} ${numero}`;
  return `${base} — ${clientName}`;
}

/** Génère un numéro de document séquentiel simple à partir des documents existants. */
export function nextDocNumber(key: TemplateKey, year: number, sameTemplateCount: number): string {
  const n = String(sameTemplateCount + 1).padStart(3, "0");
  return `${TEMPLATE_PREFIX[key]}-${year}-${n}`;
}
