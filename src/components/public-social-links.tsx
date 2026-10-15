import { ExternalLink } from "lucide-react";
import { publicSocialLinks } from "@/lib/social-links";

export function PublicSocialLinks({ links }: { links: unknown }) {
  const items = publicSocialLinks(links);
  if (!items.length) return null;
  return <nav aria-label="Redes sociais da empresa" className="relative flex flex-wrap gap-2 px-6 pb-6 sm:px-10 sm:pb-10">
    {items.map(item => <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer"
      className="secondary-button gap-2 bg-white" aria-label={`${item.label} (abre em nova aba)`}>
      {item.label}<ExternalLink className="size-3.5" aria-hidden="true" />
    </a>)}
  </nav>;
}
