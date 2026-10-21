import { useId } from "react";
import { publicSocialLinks, type SocialPlatformId } from "@/lib/social-links";

const socialColors: Record<SocialPlatformId, string> = {
  instagram: "#E4405F", facebook: "#0866FF", tiktok: "#000000", x: "#000000",
  youtube: "#FF0000", linkedin: "#0A66C2", threads: "#000000", pinterest: "#E60023",
};

const socialPaths: Record<SocialPlatformId, string> = {
  instagram: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm6-3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  facebook: "M22 12A10 10 0 1 0 10.44 21.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.26c-1.24 0-1.62.77-1.62 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z",
  tiktok: "M16.7 2c.3 2.5 1.7 4 4.3 4.2v3.2a9 9 0 0 1-4.3-1.2v7.1a6.7 6.7 0 1 1-5.8-6.6v3.4a3.3 3.3 0 1 0 2.4 3.2V2h3.4Z",
  x: "M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.5l5.6 7.4L18.9 2Zm-1.1 18h1.7L6.4 4H4.6l13.2 16Z",
  youtube: "M23 7s-.2-1.7-.9-2.4c-.9-.9-1.9-.9-2.4-1C16.4 3.3 12 3.3 12 3.3s-4.4 0-7.7.3c-.5.1-1.5.1-2.4 1C1.2 5.3 1 7 1 7S.7 9 .7 11v2c0 2 .3 4 .3 4s.2 1.7.9 2.4c.9.9 2.1.9 2.7 1 2 .2 7.4.3 7.4.3s4.4 0 7.7-.3c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.4.9-2.4s.3-2 .3-4v-2c0-2-.3-4-.3-4ZM9.7 15.5v-7l6.6 3.5-6.6 3.5Z",
  linkedin: "M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2ZM8 19H5V9h3v10ZM6.5 7.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4ZM19 19h-3v-5.3c0-1.3-.5-2-1.5-2s-1.8.7-1.8 2V19h-3V9h2.9v1.4c.6-1 1.6-1.6 2.9-1.6 2.1 0 3.5 1.3 3.5 4V19Z",
  threads: "M12 1C5.5 1 2 5 2 12s3.5 11 10 11c4.4 0 7.7-2.3 8.6-5.7.8-3.2-.5-5.6-3.3-6.8-.2-3.1-2-4.9-5-4.9-2 0-3.7.9-4.7 2.5l1.7 1c.7-1 1.7-1.5 3-1.5 1.7 0 2.7.8 3 2.4-4.5-.7-7.5.9-7.5 4 0 2.3 1.7 3.8 4.1 3.8 2.9 0 4.7-1.9 5.2-5.1 1.7 1 2.1 2.4 1.6 4.1-.7 2.6-3.2 4.2-6.7 4.2-5.2 0-8-3.1-8-9s2.8-9 8-9c3.7 0 6.1 1.6 7.4 4.7l1.8-.8C19.6 3 16.5 1 12 1Zm.1 14.8c-1.4 0-2.1-.6-2.1-1.8 0-1.6 1.9-2.4 5.2-1.9-.3 2.5-1.3 3.7-3.1 3.7Z",
  pinterest: "M12 2a10 10 0 0 0-3.6 19.3c0-.8 0-1.9.2-2.8l1.3-5.5s-.3-.7-.3-1.7c0-1.6.9-2.8 2.1-2.8 1 0 1.5.8 1.5 1.7 0 1-.7 2.5-1 4-.3 1.2.6 2.1 1.8 2.1 2.1 0 3.7-2.2 3.7-5.4 0-2.8-2-4.7-4.8-4.7-3.3 0-5.2 2.5-5.2 5 0 1 .4 2.1.9 2.7l.2.5-.3 1c0 .2-.2.3-.5.2-1.4-.7-2.3-2.8-2.3-4.5 0-3.7 2.7-7.1 7.7-7.1 4 0 7.1 2.9 7.1 6.7 0 4-2.5 7.3-5.9 7.3-1.2 0-2.3-.6-2.7-1.3l-.8 3.2c-.3 1.1-1 2.2-1.4 3A10 10 0 1 0 12 2Z",
};

export function PublicSocialLinks({ links }: { links: unknown }) {
  const gradientId = useId();
  const items = publicSocialLinks(links);
  if (!items.length) return null;
  return <nav aria-label="Redes sociais da empresa" className="relative flex flex-wrap gap-2 px-6 pb-6 sm:px-10 sm:pb-10">
    {items.map(item => <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer"
      className="secondary-button size-11 shrink-0 justify-center bg-white p-2.5" title={item.label} aria-label={`${item.label} (abre em nova aba)`}>
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false">
        {item.id === "instagram" && <defs><linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FEDA75" /><stop offset="25%" stopColor="#FA7E1E" /><stop offset="50%" stopColor="#D62976" /><stop offset="75%" stopColor="#962FBF" /><stop offset="100%" stopColor="#4F5BD5" /></linearGradient></defs>}
        {item.id === "tiktok" && <><path d={socialPaths.tiktok} fill="#25F4EE" transform="translate(-.6 -.4)" /><path d={socialPaths.tiktok} fill="#FE2C55" transform="translate(.6 .4)" /></>}
        <path d={socialPaths[item.id]} fill={item.id === "instagram" ? `url(#${gradientId})` : socialColors[item.id]} />
      </svg>
    </a>)}
  </nav>;
}
