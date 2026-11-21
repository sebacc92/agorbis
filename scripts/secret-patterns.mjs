export const KNOWN_SECRET_RULES = Object.freeze([
  {
    label: "clave privada PEM",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    label: "Supabase secret key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "JWT",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  { label: "Resend API key", pattern: /\bre_[A-Za-z0-9_]{24,}\b/g },
  {
    label: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    label: "Google OAuth client secret",
    pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
  },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g },
  { label: "GitLab token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { label: "npm token", pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { label: "Vercel token", pattern: /\bvercel_[A-Za-z0-9]{24,}\b/g },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
]);

export function findKnownSecrets(source) {
  const findings = [];
  for (const rule of KNOWN_SECRET_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of source.matchAll(pattern)) {
      findings.push({ index: match.index, label: rule.label });
    }
  }
  return findings;
}
