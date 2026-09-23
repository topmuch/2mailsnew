"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";

/** Détecte le montage côté client sans setState dans un effet. */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/**
 * Bouton sombre/clair version luxueuse : pilule à dégradé vert & or,
 * poignée dorée qui glisse, icônes animées.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    // Coquille neutre pendant le rendu serveur pour éviter tout décalage
    return <div className="h-8 w-[60px] rounded-full theme-toggle-luxe" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
      title={isDark ? "Mode clair" : "Mode sombre"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="theme-toggle-luxe relative h-8 w-[60px] shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* Icônes */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-white/85">
        <Sun className="h-3.5 w-3.5" aria-hidden />
        <Moon className="h-3.5 w-3.5" aria-hidden />
      </span>
      {/* Poignée dorée */}
      <motion.span
        className="theme-toggle-knob absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full"
        initial={false}
        animate={{ left: isDark ? 30 : 4 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            className="absolute inset-0 flex items-center justify-center text-[oklch(0.32_0.06_258)]"
            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {isDark ? (
              <Moon className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Sun className="h-3.5 w-3.5" aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </button>
  );
}
