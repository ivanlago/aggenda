"use client";

import { inView, stagger } from "motion";
import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Enhance the server-rendered page; content stays visible without JavaScript. */
export function LandingMotion({ children }: { children: ReactNode }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion !== false || !scope.current) return;
    const root = scope.current;
    const stops: Array<() => void> = [];
    const animated = new Set<HTMLElement>();
    let disposed = false;
    const reveal = (elements: HTMLElement[], kind: "rise" | "slide" | "zoom" | "fade", delay = 0) => {
      if (!elements.length) return;
      elements.forEach(element => animated.add(element));
      const controls = animate(elements, {
        opacity: [0, 1],
        ...(kind === "rise" ? { y: [22, 0] } : kind === "slide" ? { x: [28, 0] } : kind === "zoom" ? { scale: [0.96, 1] } : {}),
      }, { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: stagger(0.065, { startDelay: delay }) });
      stops.push(() => controls.stop());
      void controls.then(() => {
        if (!disposed) elements.forEach(element => element.style.removeProperty("transform"));
      });
    };
    reveal(Array.from(root.querySelectorAll<HTMLElement>(".hero-copy > *")), "rise");
    reveal(Array.from(root.querySelectorAll<HTMLElement>(".hero-visual")), "slide", 0.15);
    const groups = [
      [".landing-section-heading", "rise"],
      [".features-grid, .segment-grid, .steps-grid, .pricing-grid, .whatsapp-modes, .pain-list", "fade"],
      [".solution-card, .migration-card, .security-grid", "zoom"],
      [".final-inner, .faq-list", "rise"],
    ] as const;
    for (const [selector, kind] of groups) {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) {
        stops.push(inView(element, () => {
          reveal(kind === "fade" ? Array.from(element.children) as HTMLElement[] : [element], kind);
        }, { amount: 0.12 }));
      }
    }
    return () => {
      disposed = true;
      stops.forEach(stop => stop());
      animated.forEach(element => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("transform");
      });
    };
  }, [animate, reducedMotion, scope]);

  return <div ref={scope} className="aggenda-landing">{children}</div>;
}
