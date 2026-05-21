import type { Metadata } from "next";
import "./globals.css";
import AuthShell from "./_components/auth-shell";
import MobileAdvisory from "./_components/mobile-advisory";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "FARaudit — Federal Contract Intelligence",
  description:
    "Defense subcontractors win more bids when they know what's hiding in the solicitation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('faraudit-ds-theme');if(t&&t!=='system'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();` }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <ThemeProvider>
          <AuthShell />
          <MobileAdvisory />
          <div className="flex-1 md:pl-[var(--sidebar-w,0px)] transition-[padding] duration-150">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
