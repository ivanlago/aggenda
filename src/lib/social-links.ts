export const socialPlatforms = [
  { id: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/suaempresa", hosts: ["instagram.com"] },
  { id: "facebook", label: "Facebook", placeholder: "https://www.facebook.com/suaempresa", hosts: ["facebook.com", "fb.com"] },
  { id: "tiktok", label: "TikTok", placeholder: "https://www.tiktok.com/@suaempresa", hosts: ["tiktok.com"] },
  { id: "x", label: "X (Twitter)", placeholder: "https://x.com/suaempresa", hosts: ["x.com", "twitter.com"] },
  { id: "youtube", label: "YouTube", placeholder: "https://www.youtube.com/@suaempresa", hosts: ["youtube.com", "youtu.be"] },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/suaempresa", hosts: ["linkedin.com"] },
  { id: "threads", label: "Threads", placeholder: "https://www.threads.com/@suaempresa", hosts: ["threads.com", "threads.net"] },
  { id: "pinterest", label: "Pinterest", placeholder: "https://www.pinterest.com/suaempresa", hosts: ["pinterest.com", "pinterest.com.br"] },
] as const;

export type SocialPlatformId = typeof socialPlatforms[number]["id"];
export type SocialLinks = Partial<Record<SocialPlatformId, string>>;

export function normalizeSocialUrl(platform: typeof socialPlatforms[number], value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) throw new Error(`O endereço do ${platform.label} é muito longo.`);
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`); }
  catch { throw new Error(`Informe um endereço válido para ${platform.label}.`); }
  const hosts: readonly string[] = platform.hosts;
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port ||
    !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error(`Informe um link oficial do ${platform.label}.`);
  }
  url.protocol = "https:";
  return url.href;
}

/** Read defensively too: malformed historical JSON never becomes a public href. */
export function publicSocialLinks(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const links = value as Record<string, unknown>;
  return socialPlatforms.flatMap(platform => {
    const raw = links[platform.id];
    if (typeof raw !== "string") return [];
    try {
      const href = normalizeSocialUrl(platform, raw);
      return href ? [{ id: platform.id, label: platform.label, href }] : [];
    } catch { return []; }
  });
}
