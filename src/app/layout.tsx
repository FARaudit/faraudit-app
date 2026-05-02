import type { Metadata } from "next";
import "./globals.css";
import AuthShell from "./_components/auth-shell";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-text">
        <AuthShell />
        <div className="flex-1 md:pl-[var(--sidebar-w,0px)] transition-[padding] duration-150">
          {children}
        </div>
      </body>
    </html>
  );
}
