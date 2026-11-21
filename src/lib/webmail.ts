/**
 * Atajo a la bandeja de entrada para la pantalla "Revisá tu correo". Sólo es
 * un enlace que la persona decide abrir: ningún host se contacta sin su clic
 * (D76) y el correo no sale del navegador (D110).
 */
const WEBMAILS: ReadonlyArray<{
  name: string;
  href: string;
  domains: readonly string[];
}> = [
  {
    name: "Gmail",
    href: "https://mail.google.com/",
    domains: ["gmail.com", "googlemail.com"],
  },
  {
    name: "Outlook",
    href: "https://outlook.live.com/mail/",
    domains: [
      "outlook.com",
      "outlook.com.ar",
      "hotmail.com",
      "hotmail.com.ar",
      "live.com",
      "live.com.ar",
      "msn.com",
    ],
  },
  {
    name: "Yahoo Mail",
    href: "https://mail.yahoo.com/",
    domains: ["yahoo.com", "yahoo.com.ar", "ymail.com"],
  },
  {
    name: "iCloud Mail",
    href: "https://www.icloud.com/mail/",
    domains: ["icloud.com", "me.com", "mac.com"],
  },
  {
    name: "Proton Mail",
    href: "https://mail.proton.me/",
    domains: ["proton.me", "protonmail.com", "pm.me"],
  },
];

export function webmailFor(
  email: string,
): { name: string; href: string } | null {
  const domain = email.trim().toLowerCase().split("@").at(-1) ?? "";
  if (!email.includes("@") || !domain) return null;
  const match = WEBMAILS.find((webmail) => webmail.domains.includes(domain));
  return match ? { name: match.name, href: match.href } : null;
}
