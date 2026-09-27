import { db } from "@/lib/db";

// ─── Seed des 30 messages du Coach Virtuel (10 par créneau) ─────────────────
// Auto-seed au premier accès (pattern ensurePlatformsSeeded) : fonctionne en
// dev comme en production Coolify sans étape de seed manuelle.
// Task 57 : créneaux additionnels « visuels réseaux sociaux » (12h & 18h,
// catégorie SOCIAL) — seed incrémental, les 30 messages d'origine restent
// strictement inchangés.

type SeedMessage = {
  timeSlot: "11h" | "12h" | "14h" | "17h" | "18h";
  category: "BUSINESS" | "MINDSET" | "CLOSING" | "SOCIAL";
  content: string;
};

export const COACH_SEED_MESSAGES: SeedMessage[] = [
  // ── 11h — Focus Business & Action ──
  { timeSlot: "11h", category: "BUSINESS", content: "Bonjour Monsieur Diop ! J'espère que votre matinée se passe bien. Petit rappel : n'oubliez pas d'appeler les clients pour booster les ventes de QRBags aujourd'hui. Les ventes ne se font pas toutes seules ! 💪" },
  { timeSlot: "11h", category: "BUSINESS", content: "11h00 ! C'est le moment idéal pour faire vos relances. Avez-vous contacté l'hôtel Terrou-Bi pour les bracelets ? Allez chercher ce chiffre d'affaires ! 💰" },
  { timeSlot: "11h", category: "BUSINESS", content: "Monsieur Diop, le marché n'attend pas. Prenez 15 minutes maintenant pour envoyer 3 devis QRTags. L'action bat l'intention ! 🚀" },
  { timeSlot: "11h", category: "BUSINESS", content: "Bonjour ! Avez-vous pensé à relancer les écoles pour les packs de rentrée QRBags ? C'est maintenant qu'il faut agir, pas demain ! 🎯" },
  { timeSlot: "11h", category: "BUSINESS", content: "11h : Le meilleur moment pour prospecter. Ouvrez votre CRM, choisissez 5 clients inactifs et appelez-les. Un seul 'oui' peut changer votre journée ! 📞" },
  { timeSlot: "11h", category: "BUSINESS", content: "Monsieur Diop, vos concurrents dorment peut-être, mais pas vous. Envoyez ce message WhatsApp à vos prospects QRTags maintenant ! 🔥" },
  { timeSlot: "11h", category: "BUSINESS", content: "Bonjour ! Objectif du jour : au moins 2 nouvelles activations QRBags avant midi. Vous êtes capable de bien plus. Allez-y ! 🏆" },
  { timeSlot: "11h", category: "BUSINESS", content: "11h00 : Rappel — Les hôtels de Saly attendent votre proposition pour les bracelets NFC. Ne laissez pas passer cette opportunité ! 🏨" },
  { timeSlot: "11h", category: "BUSINESS", content: "Monsieur Diop, chaque appel compte. Chaque message compte. Chaque effort compte. Faites vos 3 relances QRTags maintenant ! 📈" },
  { timeSlot: "11h", category: "BUSINESS", content: "Bonjour ! Le succès de QRBags dépend de votre constance. Prenez 20 minutes pour contacter vos partenaires transport. Le jeu en vaut la chandelle ! 🚌" },
  // ── 14h — Focus Mindset & Motivation ──
  { timeSlot: "14h", category: "MINDSET", content: "Bonjour ! Le temps passe vite. N'oubliez pas : seul le travail paie. Restez concentré sur vos objectifs. Vous êtes à deux pas du succès ! 🔥" },
  { timeSlot: "14h", category: "MINDSET", content: "14h00. La discipline, c'est faire ce qu'il faut faire, même quand on n'a pas envie. Courage Monsieur Diop, votre empire QRTags se construit brique par brique ! 🧱" },
  { timeSlot: "14h", category: "MINDSET", content: "Les grands succès demandent de grands sacrifices. Ne lâchez rien cet après-midi. Votre futur vous remerciera ! 🙏" },
  { timeSlot: "14h", category: "MINDSET", content: "Bonjour Monsieur Diop ! Rappelle-toi pourquoi tu as commencé. QRTags et QRBags ne sont pas que des produits, c'est ta vision. Continue d'avancer ! 🌟" },
  { timeSlot: "14h", category: "MINDSET", content: "14h : Le découragement est temporaire, la fierté d'avoir persévéré est éternelle. Reprends ton souffle et repars de plus belle ! 💚" },
  { timeSlot: "14h", category: "MINDSET", content: "Monsieur Diop, chaque grand entrepreneur a connu des doutes. La différence ? Ils ont continué. Continue toi aussi ! 🚀" },
  { timeSlot: "14h", category: "MINDSET", content: "Bonjour ! Ton travail d'aujourd'hui est l'investissement de demain. Ne sous-estime jamais l'impact d'une journée bien utilisée. ⏳" },
  { timeSlot: "14h", category: "MINDSET", content: "14h00 : Le succès n'est pas un accident, c'est du travail acharné, de la persévérance, de l'apprentissage et du sacrifice. Tu es sur la bonne voie ! ✨" },
  { timeSlot: "14h", category: "MINDSET", content: "Monsieur Diop, même les plus grands arbres ont commencé par une petite graine. QRTags grandit grâce à toi. Continue à arroser ! 🌱" },
  { timeSlot: "14h", category: "MINDSET", content: "Bonjour ! N'oublie pas : la motivation te fait démarrer, l'habitude te fait continuer. Reste discipliné cet après-midi ! 🔥" },
  // ── 17h — Focus Bilan & Closing ──
  { timeSlot: "17h", category: "CLOSING", content: "Il est 17h. Dernière ligne droite ! Avez-vous fait vos appels de la journée ? Finissez fort, Monsieur Diop. On ne lâche rien avant 18h30 ! ⏱️" },
  { timeSlot: "17h", category: "CLOSING", content: "Bonjour. Le soleil se couche mais pas vos ambitions. Faites un dernier effort pour clôturer cette journée avec au moins une vente ou un RDV confirmé. 💪" },
  { timeSlot: "17h", category: "CLOSING", content: "17h00 : Le moment de transformer les prospects en clients. Un dernier appel, un dernier message WhatsApp. C'est souvent là que se joue la différence ! 🎯" },
  { timeSlot: "17h", category: "CLOSING", content: "Monsieur Diop, faites le bilan de votre journée. Qu'avez-vous accompli pour QRTags et QRBags aujourd'hui ? Si ce n'est pas assez, il reste 90 minutes ! ⏰" },
  { timeSlot: "17h", category: "CLOSING", content: "17h : Dernière chance de la journée pour envoyer ces devis en attente. Un client qui reçoit votre proposition ce soir est un client qui pense à vous demain ! 📩" },
  { timeSlot: "17h", category: "CLOSING", content: "Bonjour ! Objectif closing : terminez la journée avec au moins 1 nouvelle activation QRBags. C'est possible, vous l'avez déjà fait ! 🏆" },
  { timeSlot: "17h", category: "CLOSING", content: "Monsieur Diop, les champions ne baissent jamais les bras en fin de journée. Faites ces 2 derniers appels et dormez l'esprit tranquille ! 📞" },
  { timeSlot: "17h", category: "CLOSING", content: "17h00 : Préparez déjà votre liste de tâches pour demain. Un entrepreneur organisé est un entrepreneur qui gagne ! 📋" },
  { timeSlot: "17h", category: "CLOSING", content: "Bonjour ! Dernière poussée. Relancez ce client qui hésite sur le pack 500 bracelets. Votre persévérance sera récompensée ! 💼" },
  { timeSlot: "17h", category: "CLOSING", content: "Monsieur Diop, chaque journée bien terminée est une victoire. Finissez fort, reposez-vous bien, et demain on recommence plus fort ! 🌙" },
];

// ─── Task 57 : créneaux « visuels réseaux sociaux » (12h & 18h, SOCIAL) ──────
// Poster des visuels sur TikTok, LinkedIn et Facebook — notification
// programmée tous les jours à 12h00 et 18h00 (seed incrémental dédié).
export const SOCIAL_SEED_MESSAGES: SeedMessage[] = [
  { timeSlot: "12h", category: "SOCIAL", content: "Bonjour Monsieur Diop ! ☀️ Il est midi : c'est l'heure de publier le visuel du jour sur TikTok, LinkedIn et Facebook. Une belle photo de vos produits ou réalisations, une légende courte avec des emojis et les hashtags #2MAILS #Dakar #Sénégal — la visibilité travaille pour vous pendant que vous déjeunez ! 📱" },
  { timeSlot: "12h", category: "SOCIAL", content: "12h00 — Pause déjeuner = pause visibilité ! C'est le moment de poster le visuel du jour sur TikTok, LinkedIn et Facebook : les heures du midi sont celles où vos clients scrollent le plus. Un post aujourd'hui, un client demain ! 🚀" },
  { timeSlot: "12h", category: "SOCIAL", content: "Monsieur Diop, rappel réseaux sociaux : TikTok, LinkedIn et Facebook attendent le visuel du jour. Alternez les formats : vidéo produit sur TikTok, réussite d'équipe sur LinkedIn, promotion du moment sur Facebook. La constance bat l'intensité ! 🔥" },
  { timeSlot: "12h", category: "SOCIAL", content: "Bonjour ! Objectif midi : 1 visuel publié sur les 3 réseaux (TikTok, LinkedIn, Facebook). Prenez 10 minutes maintenant — photographiez un produit, ajoutez votre logo 2MAILS et publiez. Votre marque grandit à chaque post ! 📸" },
  { timeSlot: "12h", category: "SOCIAL", content: "Monsieur Diop, à 12h l'audience est à son pic : publiez votre visuel sur TikTok, LinkedIn et Facebook avant de déjeuner. TikTok pour la vidéo courte, LinkedIn pour l'expertise, Facebook pour la proximité. L'ordre du jour : visibilité d'abord ! 🎯" },
  { timeSlot: "12h", category: "SOCIAL", content: "Midi, heure sociale ! 💡 Prenez le visuel de la semaine (sanitaire, luminaire, plomberie ou QRTags) et publiez-le sur TikTok, LinkedIn et Facebook. Répondez ensuite aux commentaires : chaque interaction est un futur client ! 💬" },
  { timeSlot: "18h", category: "SOCIAL", content: "Bonjour Monsieur Diop ! 🌆 18h : dernière fenêtre de visibilité avant le soir. Postez un visuel sur TikTok, LinkedIn et Facebook — une réalisation du jour, un avant/après chantier ou un produit phare. Terminez la journée en beauté en ligne ! 📱" },
  { timeSlot: "18h", category: "SOCIAL", content: "18h00 — Les salariés rentrent et scrollent ! C'est le moment de poster le visuel du soir sur TikTok, LinkedIn et Facebook. Un post régulier = une marque qui reste gravée dans les esprits. 💪" },
  { timeSlot: "18h", category: "SOCIAL", content: "Monsieur Diop, le soleil se couche mais vos réseaux restent éveillés ! Publiez maintenant votre visuel du soir sur TikTok, LinkedIn et Facebook. Demain matin, il aura déjà travaillé pour vous pendant la nuit. 🌙" },
  { timeSlot: "18h", category: "SOCIAL", content: "Bonjour ! Petit bilan social du jour : avez-vous posté sur TikTok, LinkedIn et Facebook ? Si ce n'est pas fait, 18h est le moment idéal — l'audience du soir est la plus active. Une photo, une légende, publiez ! 📸" },
  { timeSlot: "18h", category: "SOCIAL", content: "18h : heure sociale du soir ! 🎯 Vidéo courte TikTok, carte visuelle LinkedIn, photo produit Facebook — choisissez un format et publiez maintenant. La visibilité d'aujourd'hui prépare les ventes de demain ! 🚀" },
  { timeSlot: "18h", category: "SOCIAL", content: "Monsieur Diop, dernière mission du jour : un visuel sur TikTok, LinkedIn et Facebook. Montrez une réussite de la journée (livraison, installation, nouveau produit) et remerciez vos clients. La gratitude engage ! 🙏" },
];

/** Crée les 30 messages si la table est vide (idempotent). */
export async function ensureCoachMessagesSeeded(): Promise<number> {
  const count = await db.crmCoachMessage.count();
  if (count === 0) {
    await db.crmCoachMessage.createMany({ data: COACH_SEED_MESSAGES });
  }
  // Task 57 : seed incrémental des créneaux « visuels réseaux sociaux »
  // (12h & 18h) — s'exécute aussi sur les bases qui ont déjà les 30 messages
  // d'origine, sans jamais les modifier.
  const socialCount = await db.crmCoachMessage.count({
    where: { timeSlot: { in: ["12h", "18h"] } },
  });
  if (socialCount === 0) {
    await db.crmCoachMessage.createMany({ data: SOCIAL_SEED_MESSAGES });
  }
  return db.crmCoachMessage.count();
}
