"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface BrandingColors {
  primary?: string;
  primaryLight?: string;
  primaryDark?: string;
  accent?: string;
  accentLight?: string;
  sidebarBg?: string;
  logoUrl?: string;
  appName?: string;
}

interface ThemeContextValue {
  isDark: boolean;
  toggleDark: () => void;
  setDark: (dark: boolean) => void;
  branding: BrandingColors;
  setBranding: (b: BrandingColors) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggleDark: () => {},
  setDark: () => {},
  branding: {},
  setBranding: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Generate lighter/darker variants of a hex color.
 */
function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateColorVariants(hex: string): { light: string; dark: string } {
  const [h, s, l] = hexToHSL(hex);
  return {
    light: hslToHex(h, Math.max(s - 20, 10), Math.min(l + 35, 95)),
    dark: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 15, 15)),
  };
}

function applyBrandingToDOM(branding: BrandingColors, isDark: boolean) {
  const root = document.documentElement;

  if (branding.primary) {
    root.style.setProperty("--brand-primary", branding.primary);
    const variants = generateColorVariants(branding.primary);
    root.style.setProperty("--brand-primary-light", branding.primaryLight ?? (isDark ? variants.dark : variants.light));
    root.style.setProperty("--brand-primary-dark", branding.primaryDark ?? variants.dark);
  }

  if (branding.accent) {
    root.style.setProperty("--brand-accent", branding.accent);
    const variants = generateColorVariants(branding.accent);
    root.style.setProperty("--brand-accent-light", branding.accentLight ?? (isDark ? variants.dark : variants.light));
  }

  if (branding.sidebarBg) {
    root.style.setProperty("--bg-sidebar", branding.sidebarBg);
  }
}

function clearBrandingFromDOM() {
  const root = document.documentElement;
  const props = [
    "--brand-primary", "--brand-primary-light", "--brand-primary-dark",
    "--brand-accent", "--brand-accent-light", "--bg-sidebar",
  ];
  props.forEach((p) => root.style.removeProperty(p));
}

export function ThemeProvider({ children, initialBranding }: { children: React.ReactNode; initialBranding?: BrandingColors }) {
  const [isDark, setIsDark] = useState(false);
  const [branding, setBrandingState] = useState<BrandingColors>(initialBranding ?? {});
  const [mounted, setMounted] = useState(false);

  // Initialize on mount (read from localStorage)
  useEffect(() => {
    const stored = window.localStorage.getItem("utiligent-theme");
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Load stored branding overrides
    try {
      const storedBranding = window.localStorage.getItem("utiligent-branding");
      if (storedBranding) {
        const parsed = JSON.parse(storedBranding);
        setBrandingState((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }

    setMounted(true);
  }, []);

  // Apply dark mode class when state changes
  useEffect(() => {
    if (!mounted) return;
    if (isDark) {
      document.documentElement.classList.add("dark");
      window.localStorage.setItem("utiligent-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      window.localStorage.setItem("utiligent-theme", "light");
    }
  }, [isDark, mounted]);

  // Apply branding CSS variables whenever branding or theme changes
  useEffect(() => {
    if (!mounted) return;
    if (Object.keys(branding).length > 0) {
      applyBrandingToDOM(branding, isDark);
    } else {
      clearBrandingFromDOM();
    }
  }, [branding, isDark, mounted]);

  const toggleDark = useCallback(() => setIsDark((d) => !d), []);
  const setDark = useCallback((d: boolean) => setIsDark(d), []);
  const setBranding = useCallback((b: BrandingColors) => {
    setBrandingState(b);
    try {
      window.localStorage.setItem("utiligent-branding", JSON.stringify(b));
    } catch { /* ignore */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, setDark, branding, setBranding }}>
      {children}
    </ThemeContext.Provider>
  );
}
