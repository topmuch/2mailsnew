"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Files,
  FileDown,
  FilePlus2,
  FileSignature,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Mail,
  Minus,
  Palette,
  Plus,
  Printer,
  Quote,
  Redo2,
  RefreshCw,
  Search,
  Share2,
  Stamp,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapTable from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { authFetch, getCachedUser } from "@/lib/auth-client";
import { formatRelativeFr } from "@/components/crm/crm-shared";
import { useSettingsStore } from "@/lib/settings-store";
import type { Settings } from "@/lib/types";
import {
  nextDocNumber,
  templateDefaultTitle,
  templateHtml,
  type TemplateContext,
  type TemplateKey,
} from "@/lib/doc-templates";
import { cn } from "@/lib/utils";

// ─── Documents : éditeur de texte riche type Word, export .docx / PDF ────────

interface DocClient {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  type?: string;
}

interface DocLead {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  value?: number;
}

interface DocItem {
  id: string;
  title: string;
  content: string;
  template: TemplateKey;
  status: string;
  author: string | null;
  clientId: string | null;
  leadId: string | null;
  client: { id: string; name: string } | null;
  lead: { id: string; name: string; company: string | null } | null;
  // Partage externe (résumé côté API : le jeton brut ne sort jamais)
  shared?: boolean;
  sharedPdfAt?: string | null;
  // Cachet officiel : apposer le cachet société sur ce document (Task 46-c)
  showCachet?: boolean;
  createdAt: string;
  updatedAt: string;
}

const TEMPLATE_META: Record<TemplateKey, { label: string; desc: string; badge: string }> = {
  BLANK: {
    label: "Document vierge",
    desc: "Page blanche, liberté totale",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  DEVIS: {
    label: "Devis (FCFA)",
    desc: "Tableau prestations + totaux HT / TVA / TTC",
    badge: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  LETTRE: {
    label: "Lettre type",
    desc: "Courrier formel avec objet et signature",
    badge: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  PV: {
    label: "PV de réunion",
    desc: "Ordre du jour, décisions, actions à mener",
    badge: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  CONTRAT: {
    label: "Contrat site internet",
    desc: "Contrat de vente complet en 9 articles",
    badge: "bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  },
};

const TEMPLATE_ICON: Record<TemplateKey, React.ComponentType<{ className?: string }>> = {
  BLANK: FilePlus2,
  DEVIS: Calculator,
  LETTRE: Mail,
  PV: ClipboardList,
  CONTRAT: FileSignature,
};

const COLOR_SWATCHES = ["111827", "6B7280", "DC2626", "EA580C", "16A34A", "1F3FBF", "7C3AED"];
const HIGHLIGHT_SWATCHES = [
  { color: "#FBF3BF", label: "Jaune" },
  { color: "#DCFCE7", label: "Vert" },
  { color: "#BFDBFE", label: "Bleu" },
  { color: "#FBCFE8", label: "Rose" },
];

const fcfa = (v: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(v))} FCFA`;

// Le champ cachet (data-URL du tampon officiel) est renvoyé par GET /api/settings
// (ligne Setting complète) — extension locale du type partagé (Task 46-c).
type SettingsWithCachet = Settings & { cachet?: string | null };

// Bouton compact de la barre d'outils (forward refs/props Radix pour asChild)
function TBtn({
  onClick,
  active,
  disabled,
  label,
  children,
  ...rest
}: {
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      onClick={rest.onClick ?? onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white",
        active && "bg-[#1F3FBF]/10 text-[#1F3FBF] dark:bg-[#1F3FBF]/30 dark:text-blue-300",
      )}
    >
      {children}
    </button>
  );
}

// ─── Éditeur TipTap (toolbar + papier) ───────────────────────────────────────

function DocEditor({
  doc,
  onHtmlChange,
}: {
  doc: DocItem;
  onHtmlChange: (html: string) => void;
}) {
  const { toast } = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TiptapUnderline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: "Commencez à rédiger votre document…" }),
      TiptapTable.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: doc.content,
    onUpdate: ({ editor: ed }) => onHtmlChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class: "doc-content min-h-[520px] px-5 py-6 sm:px-10 sm:py-8",
      },
    },
  });

  const chain = () => editor?.chain().focus();

  const insertImage = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image trop lourde", description: "Choisissez une image de moins de 2 Mo.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (src) chain()?.setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  const openLinkDialog = () => {
    const current = (editor?.getAttributes("link").href as string | undefined) ?? "";
    setLinkUrl(current);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = linkUrl.trim();
    if (!href) {
      chain()?.unsetLink().run();
    } else {
      const withProto = /^https?:\/\//i.test(href) || href.startsWith("mailto:") ? href : `https://${href}`;
      chain()?.extendMarkRange("link").setLink({ href: withProto }).run();
    }
    setLinkOpen(false);
  };

  return (
    <div>
      {/* Barre d'outils type Word */}
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-slate-50 px-2 py-1.5 dark:bg-slate-900/60">
        <TBtn label="Annuler" onClick={() => chain()?.undo().run()} disabled={!editor?.can().undo()}>
          <Undo2 className="h-4 w-4" />
        </TBtn>
        <TBtn label="Rétablir" onClick={() => chain()?.redo().run()} disabled={!editor?.can().redo()}>
          <Redo2 className="h-4 w-4" />
        </TBtn>
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />

        {/* Style de paragraphe */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Style de titre"
              aria-label="Style de titre"
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Type className="h-4 w-4" />
              {editor?.isActive("heading", { level: 1 })
                ? "Titre 1"
                : editor?.isActive("heading", { level: 2 })
                  ? "Titre 2"
                  : editor?.isActive("heading", { level: 3 })
                    ? "Titre 3"
                    : "Corps"}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => chain()?.setParagraph().run()}>
              Corps de texte {editor?.isActive("paragraph") && <CheckCircle2 className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
            {[1, 2, 3].map((lvl) => (
              <DropdownMenuItem key={lvl} onClick={() => chain()?.toggleHeading({ level: lvl as 1 | 2 | 3 }).run()}>
                Titre {lvl} {editor?.isActive("heading", { level: lvl }) && <CheckCircle2 className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />

        <TBtn label="Gras (Ctrl+B)" onClick={() => chain()?.toggleBold().run()} active={editor?.isActive("bold")}>
          <Bold className="h-4 w-4" />
        </TBtn>
        <TBtn label="Italique (Ctrl+I)" onClick={() => chain()?.toggleItalic().run()} active={editor?.isActive("italic")}>
          <Italic className="h-4 w-4" />
        </TBtn>
        <TBtn label="Souligné (Ctrl+U)" onClick={() => chain()?.toggleUnderline().run()} active={editor?.isActive("underline")}>
          <Underline className="h-4 w-4" />
        </TBtn>
        <TBtn label="Barré" onClick={() => chain()?.toggleStrike().run()} active={editor?.isActive("strike")}>
          <Strikethrough className="h-4 w-4" />
        </TBtn>

        {/* Couleur du texte */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TBtn label="Couleur du texte" onClick={() => {}} active={false}>
              <Palette className="h-4 w-4" />
            </TBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <div className="grid grid-cols-7 gap-1 p-1.5" role="group" aria-label="Couleurs du texte">
              {COLOR_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={`#${hex}`}
                  onClick={() => chain()?.setColor(`#${hex}`).run()}
                  className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                  style={{ backgroundColor: `#${hex}` }}
                />
              ))}
            </div>
            <DropdownMenuItem onClick={() => chain()?.unsetColor().run()}>Couleur par défaut</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Surlignage */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TBtn label="Surligner" onClick={() => {}} active={editor?.isActive("highlight")}>
              <Highlighter className="h-4 w-4" />
            </TBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {HIGHLIGHT_SWATCHES.map((sw) => (
              <DropdownMenuItem key={sw.color} onClick={() => chain()?.toggleHighlight({ color: sw.color }).run()}>
                <span className="h-4 w-4 rounded border border-black/10" style={{ backgroundColor: sw.color }} aria-hidden />
                {sw.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => chain()?.unsetHighlight().run()}>Aucun surlignage</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />

        <TBtn label="Liste à puces" onClick={() => chain()?.toggleBulletList().run()} active={editor?.isActive("bulletList")}>
          <List className="h-4 w-4" />
        </TBtn>
        <TBtn label="Liste numérotée" onClick={() => chain()?.toggleOrderedList().run()} active={editor?.isActive("orderedList")}>
          <ListOrdered className="h-4 w-4" />
        </TBtn>

        {/* Alignement */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TBtn label="Alignement" onClick={() => {}} active={false}>
              {editor?.isActive({ textAlign: "center" }) ? (
                <AlignCenter className="h-4 w-4" />
              ) : editor?.isActive({ textAlign: "right" }) ? (
                <AlignRight className="h-4 w-4" />
              ) : editor?.isActive({ textAlign: "justify" }) ? (
                <AlignJustify className="h-4 w-4" />
              ) : (
                <AlignLeft className="h-4 w-4" />
              )}
            </TBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => chain()?.setTextAlign("left").run()}>
              <AlignLeft className="h-4 w-4" /> À gauche
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.setTextAlign("center").run()}>
              <AlignCenter className="h-4 w-4" /> Centré
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.setTextAlign("right").run()}>
              <AlignRight className="h-4 w-4" /> À droite
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.setTextAlign("justify").run()}>
              <AlignJustify className="h-4 w-4" /> Justifié
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />

        <TBtn label="Citation" onClick={() => chain()?.toggleBlockquote().run()} active={editor?.isActive("blockquote")}>
          <Quote className="h-4 w-4" />
        </TBtn>
        <TBtn label="Ligne de séparation" onClick={() => chain()?.setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </TBtn>
        <TBtn label="Lien internet" onClick={openLinkDialog} active={editor?.isActive("link")}>
          <Link2 className="h-4 w-4" />
        </TBtn>
        <TBtn label="Insérer une image" onClick={() => imageInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </TBtn>

        {/* Tableau */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TBtn label="Tableau" onClick={() => {}} active={editor?.isActive("table")}>
              <TableIcon className="h-4 w-4" />
            </TBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => chain()?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              Insérer un tableau 3×3
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.addRowAfter().run()} disabled={!editor?.can().addRowAfter()}>
              Ajouter une ligne
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.addColumnAfter().run()} disabled={!editor?.can().addColumnAfter()}>
              Ajouter une colonne
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.toggleHeaderRow().run()} disabled={!editor?.isFocused}>
              Ligne d&apos;en-tête on/off
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.deleteRow().run()} disabled={!editor?.can().deleteRow()}>
              Supprimer la ligne
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chain()?.deleteColumn().run()} disabled={!editor?.can().deleteColumn()}>
              Supprimer la colonne
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => chain()?.deleteTable().run()}
              disabled={!editor?.can().deleteTable()}
              className="text-destructive focus:text-destructive"
            >
              Supprimer le tableau
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) insertImage(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Papier blanc type Word */}
      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>

      {/* Lien internet */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Insérer un lien</DialogTitle>
            <DialogDescription>
              Sélectionnez d&apos;abord le texte à lier, puis saisissez l&apos;adresse.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://www.exemple.sn"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && applyLink()}
          />
          <DialogFooter>
            {editor?.isActive("link") && (
              <Button
                variant="outline"
                onClick={() => {
                  chain()?.unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                Retirer le lien
              </Button>
            )}
            <Button onClick={applyLink} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Vue principale ──────────────────────────────────────────────────────────

type SaveState = "idle" | "dirty" | "saving" | "saved";
type LinkValue = string; // "none" | "c:<id>" | "l:<id>"

export default function DocumentsView() {
  const { toast } = useToast();
  const settings = useSettingsStore((s) => s.settings);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [clients, setClients] = useState<DocClient[]>([]);
  const [leads, setLeads] = useState<DocLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Création
  const [createOpen, setCreateOpen] = useState(false);
  const [createTemplate, setCreateTemplate] = useState<TemplateKey>("DEVIS");
  const [createTitle, setCreateTitle] = useState("");
  const [createTitleTouched, setCreateTitleTouched] = useState(false);
  const [createLink, setCreateLink] = useState<LinkValue>("none");
  const [creating, setCreating] = useState(false);

  // Exports
  const [wordBusy, setWordBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [deleting, setDeleting] = useState<DocItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Partage externe (URL publique téléchargeable)
  const [shareDoc, setShareDoc] = useState<DocItem | null>(null);
  const [shareInfo, setShareInfo] = useState<{ url: string; pdfReady: boolean; sharedPdfAt: string | null } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  // Cachet officiel (téléversement admin + apposition par document) — Task 46-c
  const [user] = useState(() => getCachedUser());
  const isAdmin = user?.role === "ADMIN";
  const [cachetOpen, setCachetOpen] = useState(false);
  const [cachetDraft, setCachetDraft] = useState<string | null>(null); // image choisie, non encore enregistrée
  const [cachetBusy, setCachetBusy] = useState(false);
  const cachetInputRef = useRef<HTMLInputElement | null>(null);

  const printRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef({ title: "", content: "" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  // Cachet officiel : partagé via le magasin settings (chargé une fois par le shell)
  const settingsAll = settings as SettingsWithCachet | null;
  const cachet = settingsAll?.cachet ?? null;
  const cachetPreview = cachetDraft ?? cachet; // aperçu dialog : brouillon sinon cachet enregistré

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/documents");
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { documents: DocItem[] };
      setDocs(json.documents);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les documents", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadLinks = useCallback(async () => {
    try {
      const [cRes, lRes] = await Promise.all([authFetch("/api/clients"), authFetch("/api/crm/leads")]);
      if (cRes.ok) {
        const arr = (await cRes.json()) as DocClient[];
        if (Array.isArray(arr)) setClients(arr);
      }
      if (lRes.ok) {
        const json = (await lRes.json()) as { leads: DocLead[] };
        setLeads(json.leads ?? []);
      }
    } catch {
      /* rattachements indisponibles : la création reste possible */
    }
  }, []);

  useEffect(() => {
    load();
    loadLinks();
  }, [load, loadLinks]);

  // ─── Sauvegarde (auto + manuelle) ──────────────────────────────────────────
  const persist = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!activeId) return;
      setSaveState("saving");
      try {
        const res = await authFetch(`/api/documents/${activeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { doc: DocItem };
        setDocs((prev) => prev.map((d) => (d.id === activeId ? json.doc : d)));
        setSaveState("saved");
      } catch {
        setSaveState("dirty");
        toast({ title: "Enregistrement impossible", description: "Vérifiez votre connexion puis réessayez.", variant: "destructive" });
      }
    },
    [activeId, toast],
  );

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ title: liveRef.current.title, content: liveRef.current.content });
    }, 1200);
  }, [persist]);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!activeId || saveState === "idle" || saveState === "saved") return;
    await persist({ title: liveRef.current.title, content: liveRef.current.content });
  }, [activeId, persist, saveState]);

  const handleHtmlChange = useCallback(
    (html: string) => {
      liveRef.current.content = html;
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleTitleChange = (v: string) => {
    liveRef.current.title = v;
    setTitle(v);
    scheduleSave();
  };

  const openDoc = (doc: DocItem) => {
    setActiveId(doc.id);
    setTitle(doc.title);
    liveRef.current = { title: doc.title, content: doc.content };
    setSaveState("idle");
  };

  const changeLink = async (value: LinkValue) => {
    if (!activeDoc) return;
    const clientId = value.startsWith("c:") ? value.slice(2) : null;
    const leadId = value.startsWith("l:") ? value.slice(2) : null;
    // détacher l'autre lien si besoin (un seul rattachement actif)
    const payload: Record<string, unknown> = { clientId, leadId };
    try {
      const res = await authFetch(`/api/documents/${activeDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { doc: DocItem };
      setDocs((prev) => prev.map((d) => (d.id === activeDoc.id ? json.doc : d)));
      toast({ title: clientId ? "Document rattaché au client" : leadId ? "Document rattaché au lead" : "Rattachement retiré" });
    } catch {
      toast({ title: "Erreur", description: "Rattachement impossible", variant: "destructive" });
    }
  };

  const changeStatus = async (status: string) => {
    if (!activeDoc) return;
    try {
      const res = await authFetch(`/api/documents/${activeDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { doc: DocItem };
      setDocs((prev) => prev.map((d) => (d.id === activeDoc.id ? json.doc : d)));
    } catch {
      toast({ title: "Erreur", description: "Changement de statut impossible", variant: "destructive" });
    }
  };

  // ─── Cachet officiel (Task 46-c) ─────────────────────────────────────────
  const onCachetFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Format invalide", description: "Choisissez une image (PNG, JPEG…).", variant: "destructive" });
      return;
    }
    // ~3,5 Mo de data-URL côté serveur ≈ 2,5 Mo de fichier (le base64 gonfle d'un tiers)
    if (file.size > 2.5 * 1024 * 1024) {
      toast({ title: "Image trop lourde", description: "Le cachet doit peser moins de 2,5 Mo.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (src) setCachetDraft(src);
    };
    reader.onerror = () =>
      toast({ title: "Erreur", description: "Lecture du fichier impossible", variant: "destructive" });
    reader.readAsDataURL(file);
  };

  const saveCachet = async (value: string | null) => {
    setCachetBusy(true);
    try {
      // Le PUT /api/settings met à jour tous les champs texte fournis : on
      // renvoie les paramètres actuels pour ne rien écraser.
      let current = settingsAll;
      if (!current) {
        await useSettingsStore.getState().load();
        current = useSettingsStore.getState().settings as SettingsWithCachet | null;
      }
      const res = await authFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(current ?? {}), cachet: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      useSettingsStore.getState().setSettings(json as Settings);
      setCachetDraft(null);
      toast({
        title: value ? "Cachet enregistré" : "Cachet supprimé",
        description: value ? "Activez « Cachet » sur un document pour l'apposer." : undefined,
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Enregistrement du cachet impossible",
        variant: "destructive",
      });
    } finally {
      setCachetBusy(false);
    }
  };

  const changeShowCachet = async (show: boolean) => {
    if (!activeDoc) return;
    try {
      const res = await authFetch(`/api/documents/${activeDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showCachet: show }),
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { doc: DocItem };
      setDocs((prev) => prev.map((d) => (d.id === activeDoc.id ? json.doc : d)));
      toast({ title: show ? "Cachet apposé" : "Cachet retiré", description: activeDoc.title });
    } catch {
      toast({ title: "Erreur", description: "Modification du cachet impossible", variant: "destructive" });
    }
  };

  // ─── Création ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setCreateTemplate("DEVIS");
    setCreateTitle("");
    setCreateTitleTouched(false);
    setCreateLink("none");
    setCreateOpen(true);
  };

  const year = new Date().getFullYear();
  const sameCount = docs.filter((d) => d.template === createTemplate).length;
  const previewNumero = nextDocNumber(createTemplate, year, sameCount);

  const buildContext = (template: TemplateKey, link: LinkValue, numero: string): TemplateContext => {
    const now = new Date();
    const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
    const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(now);
    const client = link.startsWith("c:") ? clients.find((c) => c.id === link.slice(2)) : undefined;
    const lead = link.startsWith("l:") ? leads.find((l) => l.id === link.slice(2)) : undefined;
    return {
      companyName: settings?.nomSociete ?? "2MAILS",
      tagline: settings?.tagline ?? "",
      address: settings?.adresse ?? "",
      phone: settings?.telephone ?? "",
      email: settings?.email ?? "",
      rc: settings?.rc ?? "",
      ninea: settings?.ninea ?? "",
      numero,
      dateCourte,
      dateLongue: longDate, // les modèles composent « [VILLE], le [DATE LONGUE] »
      ville: "Dakar",
      clientName: client?.name ?? lead?.name,
      clientCompany: lead?.company ?? (client?.type === "ENTREPRISE" ? client.name : undefined),
      clientPhone: client?.phone ?? lead?.phone,
      clientEmail: client?.email ?? lead?.email,
      clientAddress: client?.address,
      montant: lead?.value && lead.value > 0 ? fcfa(lead.value) : undefined,
    };
  };

  const create = async () => {
    setCreating(true);
    try {
      const ctx = buildContext(createTemplate, createLink, previewNumero);
      const linkedName = ctx.clientName;
      const defaultTitle = templateDefaultTitle(createTemplate, previewNumero, linkedName);
      const res = await authFetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (createTitleTouched && createTitle.trim() ? createTitle : defaultTitle).trim(),
          content: templateHtml(createTemplate, ctx),
          template: createTemplate,
          clientId: createLink.startsWith("c:") ? createLink.slice(2) : null,
          leadId: createLink.startsWith("l:") ? createLink.slice(2) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      const doc = json.doc as DocItem;
      setDocs((prev) => [doc, ...prev]);
      setCreateOpen(false);
      openDoc(doc);
      toast({ title: "Document créé", description: `${TEMPLATE_META[doc.template].label} — prêt à personnaliser.` });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Création impossible",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ─── Exports ───────────────────────────────────────────────────────────────
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportWord = async () => {
    if (!activeDoc) return;
    await flushSave();
    setWordBusy(true);
    try {
      const res = await authFetch(`/api/documents/${activeDoc.id}/export-docx`);
      if (!res.ok) throw new Error("Export Word impossible");
      const blob = await res.blob();
      downloadBlob(blob, `${activeDoc.title || "document"}.docx`);
      toast({ title: "Word téléchargé", description: `${activeDoc.title}.docx` });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Export Word impossible",
        variant: "destructive",
      });
    } finally {
      setWordBusy(false);
    }
  };

  // Construit le PDF A4 (papier en-tête logo) du document ouvert → Blob.
  // Utilisé par l'export local ET par l'instantané PDF du lien de partage.
  const buildPdfBlob = async (): Promise<Blob | null> => {
    if (!printRef.current) return null;
    // html2canvas clone le document : revenir en haut évite un scroll négatif
    // dans l'iframe de clonage (cause de blocage connu).
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    await new Promise((r) => setTimeout(r, 120));
    // html2canvas-pro (fork maintenu, gère les couleurs modernes) + jsPDF :
    // rendu canvas haute densité puis découpe A4 multi-pages.
    const { default: html2canvas } = await import("html2canvas-pro");
    const { jsPDF } = await import("jspdf");
    const canvas = await html2canvas(printRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      imageTimeout: 8000,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = 210;
    const pageH = 297;
    const margin = 12;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    const contentH = pageH - margin * 2;
    pdf.addImage(canvas, "JPEG", margin, margin, imgW, imgH, undefined, "FAST");
    let offset = 0;
    let remaining = imgH - contentH;
    while (remaining > 0.5) {
      offset += contentH;
      pdf.addPage();
      pdf.addImage(canvas, "JPEG", margin, margin - offset, imgW, imgH, undefined, "FAST");
      remaining -= contentH;
    }
    return pdf.output("blob");
  };

  const exportPdf = async () => {
    if (!activeDoc) return;
    await flushSave();
    setPdfBusy(true);
    try {
      const blob = await buildPdfBlob();
      if (!blob) throw new Error("PDF indisponible");
      downloadBlob(blob, `${activeDoc.title || "document"}.pdf`);
      toast({ title: "PDF téléchargé", description: `${activeDoc.title}.pdf` });
    } catch {
      toast({ title: "Erreur", description: "Export PDF impossible", variant: "destructive" });
    } finally {
      setPdfBusy(false);
    }
  };

  const printDoc = async () => {
    if (!activeDoc) return;
    await flushSave();
    window.print();
  };

  // ─── Partage externe (URL publique téléchargeable, sans compte) ────────
  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result ?? "");
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("Lecture du PDF impossible"));
      reader.readAsDataURL(blob);
    });

  const openShare = (doc: DocItem) => {
    setShareDoc(doc);
    setShareInfo(null);
    setShareBusy(true);
    void (async () => {
      try {
        const res = await authFetch(`/api/documents/${doc.id}/share`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur");
        if (json.shared) {
          setShareInfo({ url: json.url, pdfReady: !!json.pdfReady, sharedPdfAt: json.sharedPdfAt ?? null });
        }
      } catch {
        toast({ title: "Erreur", description: "Vérification du partage impossible", variant: "destructive" });
      } finally {
        setShareBusy(false);
      }
    })();
  };

  // Crée (ou met à jour) le lien public : le PDF instantané est capturé depuis
  // le papier en-tête logo pour que le destinataire voie exactement le document.
  const saveShare = async (rotate: boolean, successTitle: string) => {
    if (!shareDoc) return;
    setShareBusy(true);
    try {
      await flushSave();
      const blob = await buildPdfBlob();
      const body: Record<string, unknown> = { rotate };
      if (blob) body.pdfBase64 = await blobToBase64(blob);
      const res = await authFetch(`/api/documents/${shareDoc.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setShareInfo({ url: json.url, pdfReady: !!json.pdfReady, sharedPdfAt: json.sharedPdfAt ?? null });
      setDocs((prev) =>
        prev.map((d) =>
          d.id === shareDoc.id ? { ...d, shared: true, sharedPdfAt: json.sharedPdfAt ?? null } : d,
        ),
      );
      toast({ title: successTitle, description: "Copiez l'URL et envoyez-la à votre destinataire." });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Partage impossible",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!shareDoc) return;
    setShareBusy(true);
    try {
      const res = await authFetch(`/api/documents/${shareDoc.id}/share`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setShareInfo(null);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === shareDoc.id ? { ...d, shared: false, sharedPdfAt: null } : d,
        ),
      );
      toast({ title: "Lien désactivé", description: "L'URL publique ne fonctionne plus." });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Désactivation impossible",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareInfo) return;
    try {
      await navigator.clipboard.writeText(shareInfo.url);
      toast({ title: "Lien copié", description: "Collez-le dans WhatsApp, l'e-mail…" });
    } catch {
      const input = document.createElement("textarea");
      input.value = shareInfo.url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      toast({ title: "Lien copié" });
    }
  };

  // ─── Suppression ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await authFetch(`/api/documents/${deleting.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Document supprimé" });
      if (activeId === deleting.id) setActiveId(null);
      setDocs((prev) => prev.filter((d) => d.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Suppression impossible",
        variant: "destructive",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  // ─── Liste filtrée ─────────────────────────────────────────────────────────
  const filtered = docs.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const linked = [d.client?.name, d.lead?.name, d.lead?.company].filter(Boolean).join(" ").toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      (d.author ?? "").toLowerCase().includes(q) ||
      TEMPLATE_META[d.template]?.label.toLowerCase().includes(q) ||
      linked.includes(q)
    );
  });

  const linkValueOf = (d: DocItem): LinkValue => (d.clientId ? `c:${d.clientId}` : d.leadId ? `l:${d.leadId}` : "none");

  const saveLabel =
    saveState === "saving"
      ? "Enregistrement…"
      : saveState === "dirty"
        ? "Modifications non enregistrées"
        : saveState === "saved"
          ? "Enregistré"
          : "";

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1F3FBF] text-white shadow-md" aria-hidden>
              <Files className="h-5 w-5" />
            </span>
            Documents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Éditeur type Word — devis, lettres, PV, contrats… exportables en <strong>.docx</strong> et <strong>PDF</strong> avec votre logo.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0] shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Nouveau document
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ─── Colonne liste ─── */}
        <div className={cn("space-y-3", activeDoc && "hidden lg:block")}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un document…"
              className="pl-9"
              aria-label="Rechercher un document"
            />
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
              <Files className="h-10 w-10 text-muted-foreground/50" aria-hidden />
              <p className="font-semibold">Aucun document</p>
              <p className="text-sm text-muted-foreground">
                Créez un devis, une lettre, un PV ou un contrat à partir d&apos;un modèle.
              </p>
              <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
                <Plus className="h-4 w-4" aria-hidden /> Créer un document
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Aucun document ne correspond à « {search} ».
            </div>
          ) : (
            <div className="max-h-[calc(100vh-290px)] space-y-2.5 overflow-y-auto pr-1 pb-2">
              {filtered.map((doc) => {
                const meta = TEMPLATE_META[doc.template] ?? TEMPLATE_META.BLANK;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => openDoc(doc)}
                    className={cn(
                      "block w-full rounded-xl border bg-card p-3.5 text-left transition-all hover:shadow-md",
                      activeId === doc.id && "border-[#1F3FBF] ring-2 ring-[#1F3FBF]/20",
                    )}
                    aria-current={activeId === doc.id ? "true" : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 font-semibold leading-snug">{doc.title}</p>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.badge)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {(doc.client || doc.lead) && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#1F3FBF] dark:text-blue-300">
                          <Link2 className="h-3 w-3" aria-hidden />
                          {doc.client?.name ?? `${doc.lead?.name}${doc.lead?.company ? ` (${doc.lead.company})` : ""}`}
                        </span>
                      )}
                      {doc.status === "FINAL" && (
                        <Badge variant="outline" className="h-4 border-emerald-400/60 px-1 text-[9px] text-emerald-700 dark:text-emerald-400">
                          Final
                        </Badge>
                      )}
                      {doc.shared && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                          <Share2 className="h-3 w-3" aria-hidden />
                          Lien actif
                        </span>
                      )}
                      <span className="truncate">
                        {doc.author ?? "—"} • {formatRelativeFr(doc.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Colonne éditeur ─── */}
        <div className={cn("min-w-0", activeDoc ? "block" : "hidden lg:block")}>
          {activeDoc ? (
            <Card className="overflow-hidden p-0">
              {/* Barre méta */}
              <div className="space-y-2.5 border-b p-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 lg:hidden"
                    onClick={() => setActiveId(null)}
                    aria-label="Retour à la liste"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="border-0 px-1 text-lg font-bold shadow-none focus-visible:ring-0"
                    placeholder="Titre du document"
                    aria-label="Titre du document"
                  />
                  <Select value={activeDoc.status} onValueChange={changeStatus}>
                    <SelectTrigger
                      className={cn(
                        "h-8 w-[120px] shrink-0 text-xs",
                        activeDoc.status === "FINAL" && "border-emerald-400/60 text-emerald-700 dark:text-emerald-400",
                      )}
                      aria-label="Statut du document"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BROUILLON">Brouillon</SelectItem>
                      <SelectItem value="FINAL">Final</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", (TEMPLATE_META[activeDoc.template] ?? TEMPLATE_META.BLANK).badge)}>
                    {(TEMPLATE_META[activeDoc.template] ?? TEMPLATE_META.BLANK).label}
                  </span>
                  <span className="hidden sm:inline">par {activeDoc.author ?? "—"} • modifié {formatRelativeFr(activeDoc.updatedAt)}</span>
                  {saveLabel && (
                    <span className={cn("inline-flex items-center gap-1", saveState === "saved" && "text-emerald-600 dark:text-emerald-400", saveState === "dirty" && "text-amber-600 dark:text-amber-400")}>
                      {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                      {saveLabel}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="hidden text-[11px] sm:inline">Rattaché à :</span>
                    <Select value={linkValueOf(activeDoc)} onValueChange={changeLink}>
                      <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Rattacher le document">
                        <SelectValue placeholder="Aucun" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Aucun —</SelectItem>
                        {clients.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Clients</SelectLabel>
                            {clients.map((c) => (
                              <SelectItem key={c.id} value={`c:${c.id}`}>{c.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {leads.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Leads</SelectLabel>
                            {leads.map((l) => (
                              <SelectItem key={l.id} value={`l:${l.id}`}>
                                {l.name}
                                {l.company ? ` (${l.company})` : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Éditeur */}
              <div className="relative">
                <DocEditor key={activeDoc.id} doc={activeDoc} onHtmlChange={handleHtmlChange} />
                {/* Aperçu du cachet en bas à droite du papier (Task 46-c) */}
                {(activeDoc.showCachet ?? true) && cachet && (
                  <img
                    src={cachet}
                    alt="Cachet société"
                    className="pointer-events-none absolute bottom-3 right-5 w-[130px] max-w-[30%] -rotate-6 opacity-90 drop-shadow-md"
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 p-3">
                <Button onClick={exportWord} disabled={wordBusy} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]" size="sm">
                  {wordBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
                  Word (.docx)
                </Button>
                <Button onClick={exportPdf} disabled={pdfBusy} variant="outline" size="sm">
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
                  PDF
                </Button>
                <Button
                  onClick={() => openShare(activeDoc)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    activeDoc.shared &&
                      "border-emerald-400/60 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400",
                  )}
                  aria-label="Partager par lien externe"
                >
                  <Share2 className="h-4 w-4" aria-hidden /> Partager
                </Button>
                <Button onClick={printDoc} variant="ghost" size="sm">
                  <Printer className="h-4 w-4" aria-hidden /> Imprimer
                </Button>
                {isAdmin && (
                  <Button
                    onClick={() => {
                      setCachetDraft(null);
                      setCachetOpen(true);
                    }}
                    variant="outline"
                    size="sm"
                    aria-label="Gérer le cachet officiel"
                  >
                    <Stamp className="h-4 w-4" aria-hidden /> Cachet
                  </Button>
                )}
                <div className="mx-1 h-6 w-px bg-border" aria-hidden />
                {/* Apposition du cachet sur CE document (persisté via l'API) */}
                <span
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  title={cachet ? "Apposer le cachet société sur ce document" : "Aucun cachet téléversé — bouton « Cachet » (admin)"}
                >
                  <Switch
                    checked={activeDoc.showCachet ?? true}
                    onCheckedChange={(v) => void changeShowCachet(v)}
                    disabled={!cachet}
                    aria-label="Apposer le cachet"
                  />
                  Cachet
                </span>
                <div className="flex-1" />
                <Button
                  onClick={() => void persist({ title: liveRef.current.title, content: liveRef.current.content })}
                  disabled={saveState === "saving" || saveState === "saved"}
                  variant="secondary"
                  size="sm"
                >
                  {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                  Enregistrer
                </Button>
                <Button
                  onClick={() => setDeleting(activeDoc)}
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer le document"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
              <Files className="h-12 w-12 text-muted-foreground/40" aria-hidden />
              <p className="font-semibold">Aucun document ouvert</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Sélectionnez un document dans la liste, ou créez-en un nouveau depuis un modèle (devis, lettre, PV, contrat).
              </p>
              <Button onClick={openCreate} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
                <Plus className="h-4 w-4" aria-hidden /> Nouveau document
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Dialog de création ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau document</DialogTitle>
            <DialogDescription>
              Choisissez un modèle — le contenu de départ est généré automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modèle de document">
              {(Object.keys(TEMPLATE_META) as TemplateKey[]).map((key) => {
                const meta = TEMPLATE_META[key];
                const Icon = TEMPLATE_ICON[key];
                const selected = createTemplate === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCreateTemplate(key)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                      selected ? "border-[#1F3FBF] bg-[#1F3FBF]/5 ring-2 ring-[#1F3FBF]/20" : "hover:border-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        selected ? "bg-[#1F3FBF] text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{meta.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{meta.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="doc-title" className="text-sm font-medium">Titre</label>
              <Input
                id="doc-title"
                value={createTitleTouched ? createTitle : templateDefaultTitle(createTemplate, previewNumero, buildContext(createTemplate, createLink, previewNumero).clientName)}
                onChange={(e) => {
                  setCreateTitle(e.target.value);
                  setCreateTitleTouched(true);
                }}
                placeholder="Titre du document"
              />
              <p className="text-[11px] text-muted-foreground">Numéro attribué : {previewNumero}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rattacher à un client ou un lead</label>
              <Select value={createLink} onValueChange={setCreateLink}>
                <SelectTrigger aria-label="Rattachement du nouveau document">
                  <SelectValue placeholder="— Aucun —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun —</SelectItem>
                  {clients.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Clients</SelectLabel>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={`c:${c.id}`}>{c.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {leads.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Leads</SelectLabel>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={`l:${l.id}`}>
                          {l.name}
                          {l.company ? ` (${l.company})` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Les coordonnées du tiers remplacent automatiquement les champs [NOM DU CLIENT], [TÉLÉPHONE CLIENT]… dans le modèle.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Annuler
            </Button>
            <Button onClick={create} disabled={creating} className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Files className="h-4 w-4" aria-hidden />}
              Créer le document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Partage externe (URL publique téléchargeable) ─── */}
      <Dialog open={!!shareDoc} onOpenChange={(o) => !o && setShareDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1F3FBF] text-white" aria-hidden>
                <Share2 className="h-4 w-4" />
              </span>
              Partager par lien externe
            </DialogTitle>
            <DialogDescription className="line-clamp-1">{shareDoc?.title}</DialogDescription>
          </DialogHeader>
          {shareBusy && !shareInfo ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Vérification du partage…
            </div>
          ) : shareInfo ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareInfo.url}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="URL publique du document"
                />
                <Button size="icon" variant="secondary" onClick={copyShareUrl} aria-label="Copier le lien" className="shrink-0">
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {shareInfo.pdfReady ? (
                  <Badge variant="outline" className="border-emerald-400/60 text-emerald-700 dark:text-emerald-400">
                    PDF prêt
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-400/60 text-amber-700 dark:text-amber-400">
                    PDF non généré
                  </Badge>
                )}
                {shareInfo.sharedPdfAt && <span>instantané du {formatRelativeFr(shareInfo.sharedPdfAt)}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                Toute personne ayant ce lien consulte le document (papier en-tête logo) et télécharge le PDF ou le Word — sans compte.
                Après une modification, cliquez sur «&nbsp;Mettre à jour le PDF&nbsp;» pour que le lien serve la nouvelle version.
              </p>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void revokeShare()}
                  disabled={shareBusy}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Désactiver
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void saveShare(false, "PDF du lien mis à jour")} disabled={shareBusy}>
                    {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                    Mettre à jour le PDF
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]"
                    onClick={() => window.open(shareInfo.url, "_blank", "noopener")}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden /> Ouvrir
                  </Button>
                </div>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Créez une URL externe pour ce document : le destinataire la verra avec votre logo et pourra télécharger le PDF ou le
                Word, sans compte ni installation. Idéal pour WhatsApp ou l'e-mail.
              </p>
              <DialogFooter>
                <Button
                  onClick={() => void saveShare(false, "Lien de partage créé")}
                  disabled={shareBusy}
                  className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]"
                >
                  {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                  Créer le lien
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Cachet officiel (téléversement admin) ─── */}
      <Dialog open={cachetOpen} onOpenChange={setCachetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1F3FBF] text-white" aria-hidden>
                <Stamp className="h-4 w-4" />
              </span>
              Cachet officiel
            </DialogTitle>
            <DialogDescription>
              Tampon de la société apposé en bas à droite des documents (PDF, Word, page publique) quand «&nbsp;Cachet&nbsp;» est activé.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 p-4">
              {cachetPreview ? (
                <img
                  src={cachetPreview}
                  alt="Aperçu du cachet"
                  className="max-h-[130px] w-auto max-w-full -rotate-6 object-contain drop-shadow-md"
                />
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  Aucun cachet pour l&apos;instant — téléversez une image (PNG avec fond transparent recommandé).
                </p>
              )}
            </div>
            <input
              ref={cachetInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onCachetFile(f);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => cachetInputRef.current?.click()} disabled={cachetBusy}>
                <ImagePlus className="h-4 w-4" aria-hidden /> Choisir une image
              </Button>
              {cachetDraft && (
                <Badge variant="outline" className="border-amber-400/60 text-amber-700 dark:text-amber-400">
                  Nouvelle image — non enregistrée
                </Badge>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {cachet ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void saveCachet(null)}
                disabled={cachetBusy}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Supprimer
              </Button>
            ) : (
              <span aria-hidden />
            )}
            <Button
              onClick={() => void saveCachet(cachetDraft)}
              disabled={cachetBusy || !cachetDraft}
              className="bg-[#1F3FBF] text-white hover:bg-[#1a35a0]"
            >
              {cachetBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmation suppression ─── */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleting?.title} » sera définitivement supprimé. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteBusy}
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Zone d'impression / export PDF (papier en-tête logo) ─── */}
      {activeDoc && (
        <div
          ref={printRef}
          className="doc-print-root"
          style={{ position: "fixed", top: 0, left: 0, zIndex: -9999, pointerEvents: "none", width: "780px" }}
          aria-hidden
        >
          <div className="doc-letterhead">
            <div className="doc-lh-left">
              <img src={settings?.logo ?? "/logo-2mails.png"} alt="" />
            </div>
            <div className="doc-lh-right">
              <p className="doc-lh-name">{settings?.nomSociete ?? "2MAILS"}</p>
              {settings?.tagline ? <p className="doc-lh-tagline">{settings.tagline}</p> : null}
              <p className="doc-lh-line">
                {[settings?.adresse, settings?.telephone].filter(Boolean).join(" · ")}
              </p>
              <p className="doc-lh-line">
                {[
                  settings?.email,
                  settings?.rc ? `RC : ${settings.rc}` : null,
                  settings?.ninea ? `NINEA : ${settings.ninea}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="doc-content" dangerouslySetInnerHTML={{ __html: liveRef.current.content || activeDoc.content }} />
          {/* Cachet officiel en bas à droite — DANS le DOM capturé par html2canvas
              pour figurer dans le PDF exporté et l'instantané du partage (Task 46-c) */}
          {(activeDoc.showCachet ?? true) && cachet && (
            <img
              src={cachet}
              alt=""
              style={{
                position: "absolute",
                right: "16px",
                bottom: "6px",
                width: "145px",
                maxWidth: "38%",
                height: "auto",
                transform: "rotate(-6deg)",
                opacity: 0.92,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
