import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "Rollcall | Attendance, made accountable",
  description: "QR-based attendance tracking for campus sessions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
