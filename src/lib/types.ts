// Types partagés entre le frontend et les API (versions sérialisées JSON)

export interface Client {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type: string;
  creditLimit?: number;
  notes?: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  reference?: string | null;
  category: string;
  image?: string | null;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  unit: string;
  minStock: number;
  createdAt: string;
}

export interface Category {
  id: string;
  code: string;
  label: string;
  createdAt: string;
}

export interface CategoryWithCount extends Category {
  productCount?: number;
}

export interface InvoiceItem {
  id?: string;
  productId?: string | null;
  productName: string;
  category?: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  purchasePrice?: number | null;
}

export interface Invoice {
  id: string;
  number: string;
  type: "VENTE" | "PROFORMA";
  clientId?: string | null;
  client?: Client | null;
  clientName: string;
  clientPhone?: string | null;
  clientAddress?: string | null;
  date: string;
  dueDate?: string | null;
  deliveryStatus: "LIVRE" | "NON_LIVRE";
  paymentStatus: "PAYE" | "PARTIEL" | "NON_PAYE";
  amountPaid: number;
  taxRate: number;
  totalHT: number;
  totalTTC: number;
  notes?: string | null;
  items: InvoiceItem[];
  payments?: Payment[];
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  paidAt: string;
  note?: string | null;
  createdAt: string;
}

// ─── Achats (factures d'achat) ─────────────────────────────────────────────

export interface PurchaseItem {
  id?: string;
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Purchase {
  id: string;
  number: string;
  supplier: string;
  supplierId?: string | null;
  date: string;
  total: number;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  notes?: string | null;
  items: PurchaseItem[];
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
  purchaseCount?: number;
  purchaseTotal?: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName?: string;
  type: "ENTREE" | "SORTIE" | "AJUSTEMENT";
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason?: string | null;
  refType?: string | null;
  refId?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface OrderItem {
  id?: string;
  productId?: string | null;
  productName: string;
  category?: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  number: string;
  clientId?: string | null;
  client?: Client | null;
  clientName: string;
  date: string;
  deliveryDate?: string | null;
  status: "EN_COURS" | "CONFIRMEE" | "LIVREE" | "ANNULEE";
  notes?: string | null;
  items: OrderItem[];
  createdAt: string;
}

export interface DashboardStats {
  year: number;
  month: string;
  invoiceCount: number;
  proformaCount: number;
  clientCount: number;
  productCount: number;
  revenueTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  purchaseTotal: number;
  pendingOrders: number;
  prevYearRevenue: number;
  lowStock: Product[];
  monthlyRevenue: { month: string; monthKey: string; total: number; paid: number }[];
  dailyRevenue: { day: number; total: number; count: number }[];
  tranches: { label: string; count: number; total: number }[];
  topClients: { name: string; total: number }[];
  recentInvoices: Invoice[];
  topCategories: { category: string; label: string; total: number }[];
  /** Statistiques du jour (ventes, encaissements) */
  today: DashboardToday;
  /** Répartition des factures de vente par statut de paiement */
  statusCounts: { PAYE: number; PARTIEL: number; NON_PAYE: number };
}

export interface DashboardToday {
  /** Total TTC des factures de vente du jour */
  sales: number;
  /** Somme des versements encaissés du jour (factures) */
  received: number;
  /** Nombre de factures de vente du jour */
  invoiceCount: number;
  /** Nombre de versements du jour */
  paymentCount: number;
  /** Nombre de proformas du jour */
  proformaCount: number;
}

// ─── Rapport du jour ────────────────────────────────────────────────────────

export interface DailyPaymentRow {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  note?: string | null;
  invoiceNumber: string;
  clientName: string;
}

export interface DailyReport {
  date: string;
  summary: {
    invoiceCount: number;
    proformaCount: number;
    totalHT: number;
    totalTTC: number;
    vatTotal: number;
    /** Somme des versements factures encaissés ce jour */
    receivedTotal: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
  };
  invoices: Invoice[];
  payments: DailyPaymentRow[];
  byMethod: { method: string; label: string; amount: number; count: number }[];
}

// ─── Paramètres société ─────────────────────────────────────────────────────

export interface Settings {
  id: string;
  nomSociete: string;
  tagline: string;
  adresse: string;
  telephone: string;
  email: string;
  rc: string;
  ninea: string;
  logo?: string | null;
  /** Objectif de CA mensuel (FCFA) — widget progression du dashboard */
  monthlyGoal?: number;
  updatedAt?: string;
}

// ─── Productivité : notifications & recherche globale ───────────────────────

export interface AppNotification {
  id: string;
  type: "INVOICE_OVERDUE" | "RDV_TODAY" | "TASK_OVERDUE" | "STOCK_LOW" | "FOLLOWUP_CREATED";
  title: string;
  description?: string;
  severity: "high" | "medium" | "low";
  /** Vue à ouvrir au clic (identifiant de navigation du shell) */
  view: string;
  date?: string;
}

export interface GlobalSearchItem {
  id: string;
  type: "CLIENT" | "INVOICE" | "PRODUCT" | "TASK" | "EVENT" | "LEAD" | "MAIL";
  title: string;
  sub?: string;
  view: string;
}

export interface GlobalSearchGroup {
  type: GlobalSearchItem["type"];
  label: string;
  items: GlobalSearchItem[];
}

// ─── Utilisateurs ───────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "EMPLOYE";
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "EMPLOYE";
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Rapports de vente ──────────────────────────────────────────────────────

export interface SalesReportSummary {
  count: number;
  totalHT: number;
  totalTTC: number;
  vatTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  avgTicket: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  deliveredCount: number;
  notDeliveredCount: number;
  itemsCount: number;
  margin: number;
  marginPct: number;
  prevTotalTTC: number;
  prevCount: number;
}

export interface SalesReport {
  from: string;
  to: string;
  summary: SalesReportSummary;
  monthly: { monthKey: string; label: string; total: number; paid: number; margin: number }[];
  topClients: { name: string; count: number; total: number }[];
  byCategory: { category: string; label: string; total: number; quantity: number; margin: number }[];
  topProducts: { name: string; quantity: number; total: number; margin: number }[];
  invoices: Invoice[];
}

// ─── Boîte mail ─────────────────────────────────────────────────────────────

export interface Mail {
  id: string;
  direction: "IN" | "OUT";
  folder: "INBOX" | "SENT" | "TRASH";
  fromName: string | null;
  from: string;
  to: string;
  subject: string;
  body: string;
  /** HTML assaini du message (présent uniquement sur le détail GET /api/mails/[id]). */
  bodyHtml?: string;
  messageId: string | null;
  read: boolean;
  starred: boolean;
  sentAt: string;
  createdAt: string;
}

export interface MailCounts {
  inbox: number;
  unread: number;
  sent: number;
  trash: number;
}

export interface MailConfig {
  mailFromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  /** Nombre maximal de mails importés du serveur IMAP par jour (anti-saturation). */
  mailDailyImportLimit: number;
  smtpConfigured: boolean;
  imapConfigured: boolean;
  lastMailSync: string | null;
}

// ─── Calendrier ─────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  date: string; // ISO
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  color: "green" | "gold" | "orange" | "red";
  type: "RDV" | "TACHE" | "RAPPEL";
  done: boolean;
  createdAt: string;
}

// ─── QR Tags (QRtag.net + QRBags) ───────────────────────────────────────────

export interface QrLookup {
  id: string;
  provider: "QRTAG" | "QRBAGS";
  query: string;
  options: string | null;
  result: string | null;
  status: "OK" | "ERREUR";
  createdAt: string;
}

export interface QrTagResult {
  provider: "QRTAG";
  url: string; // URL encodée dans le QR
  imageUrl: string; // URL de l'image QR (qrtag.net)
  format: "png" | "svg";
  size: number;
  transparent: boolean;
}

export interface QrBagsResult {
  provider: "QRBAGS";
  reference: string;
  validFormat: boolean;
  formatAttendu: string;
  reachable: boolean;
  info: string | null; // infos extraites de la page de suivi si disponibles
  sourceUrl: string; // page officielle de suivi
  message: string;
}

// ─── CRM Unifié (sync qrtags.pro / qrbags.com) ──────────────────────────────

export interface CrmItem {
  id: string;
  platformId: string;
  platform: { name: string; label: string };
  externalId: string;
  code: string;
  type: string; // TAG | BAGAGE
  status: string; // ACTIVE | LOST | FOUND | SUSPENDED | INACTIVE
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  clientId: string | null;
  client?: { id: string; name: string } | null;
  lastScanAt: string | null;
  lastScanPlace: string | null;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  platform: string; // QRTAGS | QRBAGS
  itemId: string | null;
  action: string; // SCAN | ACTIVATION | LOST | FOUND | SUSPENDED | SYNC | WEBHOOK_ERROR | UPDATED
  details: string;
  timestamp: string;
  item?: { id: string; code: string; externalId: string; status: string; type: string } | null;
}

export interface CrmClientDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  totalItems: number;
  status: string; // ACTIVE | INACTIVE
  notes: string | null;
  createdAt: string;
  items?: Array<{ id: string; status: string }>;
}

export interface CrmPlatformDto {
  id: string;
  name: string; // QRTAGS | QRBAGS
  label: string;
  apiUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
  webhookSecret?: string;
  hasWebhookSecret?: boolean;
  estimatedPackPrice?: number;
  isActive: boolean;
  lastSyncAt: string | null;
  itemCount?: number;
}

export interface CrmPlatformStat {
  id: string;
  name: string; // QRTAGS | QRBAGS
  label: string;
  isActive: boolean;
  lastSyncAt: string | null;
  items: number;
  activationsToday: number;
  scansToday: number;
  newItemsToday: number; // ≈ packs vendus aujourd'hui
  found: number;
  lost: number;
  successRate: number | null; // % retrouvés
  estimatedPackPrice: number; // FCFA par pack
  estimatedRevenue: number; // FCFA (newItemsToday × prix pack)
  activitiesToday: number;
}

export interface CrmPieSlice {
  name: string; // QRTAGS | QRBAGS
  label: string;
  value: number; // événements aujourd'hui
}

export interface CrmStats {
  platforms: CrmPlatformDto[];
  byStatus: Record<string, number>;
  totals: {
    items: number;
    scansToday: number;
    activitiesToday: number;
    activationsToday?: number;
    found?: number;
    lost?: number;
    successRate?: number | null;
    estimatedRevenue?: number;
    newItemsToday?: number;
  };
  platformStats?: CrmPlatformStat[];
  pieData?: CrmPieSlice[];
  recentActivity: CrmActivity[];
  lastEvents: CrmActivity[];
}

export interface CrmSyncResult {
  results: Array<{ platform: string; total: number; created: number; updated: number }>;
  errors: Array<{ platform: string; error: string }>;
}

// ─── CRM Automatisations (rapports, coach, rappels, tâches) ─────────────────

export interface CrmTask {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
  updatedAt: string;
}

export interface CrmCoachMessage {
  id: string;
  timeSlot: "11h" | "14h" | "17h";
  category: "BUSINESS" | "MINDSET" | "CLOSING";
  content: string;
  isActive: boolean;
  createdAt: string;
}

export interface CrmSentMessage {
  id: string;
  type: "REPORT_MORNING" | "REPORT_EVENING" | "COACH" | "REMINDER" | "TEST";
  subject: string;
  content: string;
  channel: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  error: string | null;
  sentAt: string;
}

export interface CrmAutomationConfig {
  ownerName: string;
  recipientEmail: string;
  reportMorningEnabled: boolean;
  reportMorningTime: string;
  reportEveningEnabled: boolean;
  reportEveningTime: string;
  coachEnabled: boolean;
  coach11Enabled: boolean;
  coach14Enabled: boolean;
  coach17Enabled: boolean;
  remindersEnabled: boolean;
  reminderSlots: string;
  dailyGoal: string;
}

export interface CrmAutomationStatus {
  schedulerRunning: boolean;
  businessHoursNow: boolean;
  now: string;
  smtpConfigured: boolean;
  recipientConfigured: boolean;
  sentToday: number;
  failedToday: number;
  lastSentAt: string | null;
  seededCoachMessages: number;
}

// ─── CRM Commercial : leads & projets ────────────────────────────────────────

export interface CrmLead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: "QRTAGS" | "QRBAGS" | "RECOMMANDATION" | "SITE_WEB" | "AUTRE";
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";
  value: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmProjectClient {
  id: string;
  name: string;
}

export interface CrmProject {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  client: CrmProjectClient | null;
  status: "PLANNING" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELLED";
  budget: number;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Blog note (notes riches) & Favoris (liens internet) ────────────────────

export interface BlogPost {
  id: string;
  title: string;
  content: string;
  tags: string; // tags séparés par des virgules
  color: "blue" | "green" | "amber" | "red" | "purple";
  pinned: boolean;
  author: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Favorite {
  id: string;
  title: string;
  url: string;
  description: string | null;
  category: "GENERAL" | "FOURNISSEUR" | "CLIENT" | "OUTIL" | "CONCURRENT" | "ADMINISTRATION" | "AUTRE";
  pinned: boolean;
  author: string | null;
  createdAt: string;
  updatedAt: string;
}
