import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";

export const metadata: Metadata = {
  title: "Utiligent",
  description: "Simple Utilities Management Platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Runs before hydration to set the `dark` class from the persisted preference,
// eliminating the flash-of-light-theme for dark-mode users. Kept tiny and
// dependency-free; matches the keys the ThemeProvider reads/writes.
const themeInitScript = `(function(){try{if(localStorage.getItem('utiligent-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
