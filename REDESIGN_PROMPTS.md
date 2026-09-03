# Redesign Prompts

> These are pre-written prompts for the visual overhaul described in `FRONTEND_IMPROVEMENTS.md`. **I will not act on any of this until you paste one of these prompts to me as an instruction.** Feed them one at a time, in order (each builds on the previous one's tokens/components). Edit any of them before pasting if you want to steer a specific prompt differently.
>
> Research basis (Sept 2026): current SaaS/landing-page trends favor "glassmorphism 2.0" (layered translucency used to signal hierarchy, not just decoration), lightweight 3D elements (floating UI mockups, isometric renders, tilt-on-hover cards) over full WebGL scenes, and micro-interactions (scroll-triggered reveals, magnetic buttons, animated counters) as the actual conversion-driving trend — not gimmicky background 3D scenes. The component ecosystem built for exactly this in the React/Tailwind/Next.js stack is **Framer Motion** (animation engine, now published as `motion`), plus reference patterns from **Aceternity UI**, **Magic UI**, and **Motion Primitives** (spotlight effects, 3D tilt cards, animated gradient backgrounds, mesh gradients) — these prompts borrow their patterns as plain Tailwind + Framer Motion code rather than pulling in their npm packages, to keep the dependency footprint small and avoid fighting existing Tailwind v4 setup.
>
> Every prompt below already embeds the guardrail language from `FRONTEND_IMPROVEMENTS.md` §4 — you don't need to repeat it.

---

## Prompt 0 — Design System Foundation

```
Read FRONTEND_IMPROVEMENTS.md section 2 and 3.1 first. This is a visual-only redesign — do not touch any file under src/lib, any API route, auth logic, or component state/props/data flow. Only styling, JSX wrapper markup, and new CSS/animation code.

Set up the foundation for a modern, dimensional "glassmorphism 2.0" aesthetic across ProfileExtract, replacing the current flat single-accent-color Tailwind default look:

1. Install `motion` (Framer Motion) as the animation engine.
2. In src/app/globals.css, replace the current minimal :root token block with a real design-token system:
   - An extended color palette: keep #0f4c81 as primary but add a secondary/complementary accent for gradients, plus tokenized versions of the emerald/amber/red semantic colors already used ad hoc across the app.
   - A layered elevation system (surface-1 through surface-4 shadow tokens: soft, multi-stop box-shadows — not just shadow-sm) that later prompts will apply to cards.
   - A `.glass` utility class (backdrop-filter: blur + translucent background + subtle border) for glass-panel surfaces.
   - A subtle animated gradient-mesh/aurora background utility for hero-style sections (CSS-only, e.g. layered radial-gradients with a slow keyframe drift), not a static image.
   - Full dark-mode token block under prefers-color-scheme: dark AND a data-theme toggle mechanism if one doesn't already exist — glass/3D effects read much better on dark backgrounds, so dark mode is a prerequisite for the rest of this redesign, not a nice-to-have.
   - A global `@media (prefers-reduced-motion: reduce)` block that disables/shortens all animations added from here on.
3. Do not apply any of these tokens to actual page components yet — that happens in later prompts. This prompt only builds the foundation and confirms `npm run build` and `npm run lint` still pass.
4. Replace the default Next.js starter favicon/OG assets in public/ with a simple brand mark consistent with the new palette (can be a styled SVG monogram, doesn't need to be fancy).

Show me a brief summary of the tokens/utilities you added before moving on.
```

---

## Prompt 1 — Navbar & Footer

```
Building on the design tokens from Prompt 0 (read FRONTEND_IMPROVEMENTS.md §3.2-3.3 for context). Visual-only change to src/components/Navbar.tsx and src/components/Footer.tsx — do not touch useSession/signOut logic or routing behavior.

- Navbar: extend the existing bg-white/95 backdrop-blur-sm into the new `.glass` utility. Add a scroll listener (simple useEffect + scroll event, or a small Framer Motion scroll hook) so the navbar gains a soft elevated shadow only after the page scrolls past ~10px, staying flush/borderless at the top of the page.
- Give the "Job Matcher · AI" badge a subtle animated glow/pulse (CSS keyframe or Framer Motion, respecting prefers-reduced-motion) to signal it's the AI-powered flagship feature.
- Add hover-lift micro-interactions (translateY + shadow growth, not just color change) to the Sign In / Get Started / Sign Out buttons.
- Restyle the logo mark (currently a flat blue square with a FileText icon) using the new gradient tokens — keep it small and simple, not a full logo redesign.
- Footer: replace the flat single-line bar with the same glass/gradient-border treatment established above; keep the content/copy identical, just restyle the container.

Keep both components' exported names, props, and all Better Auth calls exactly as they are.
```

---

## Prompt 2 — Landing Page Hero & Feature Cards

```
Read FRONTEND_IMPROVEMENTS.md §3.4. Visual-only redesign of src/app/page.tsx. Do not change any Link href, copy content meaning, or the metadata export — restyle only.

1. Hero section: this currently has no visual centerpiece (just centered text + 2 buttons on a flat background). Add a lightweight 3D/depth element as the focal point — prefer a CSS/Framer-Motion floating glass panel or layered isometric card stack that gently drifts/rotates on a scroll or mouse-parallax basis (tilt toward cursor position), over pulling in Three.js/react-three-fiber unless you judge the payload cost is worth it for this one section. Apply the gradient-mesh background utility from Prompt 0 behind the hero.
2. Make the "Get Started Free" / "Sign In" CTAs use a gradient fill with a glow-on-hover and a subtle press/scale animation on click.
3. The two feature cards (URL Extractor / Job Matcher) are currently identical flat white cards distinguished only by icon color. Differentiate them with distinct subtle gradient tints per card, add a hover tilt (perspective transform following cursor position, small effect, not distracting) and hover-lift shadow using the surface elevation tokens.
4. Add scroll-triggered entrance animations (fade + slight slide-up, staggered) for the feature cards and the "Zero Data Persistence" section as they enter the viewport — use Framer Motion's whileInView.
5. Add a small animated stats/social-proof row if it fits naturally (e.g., "Profiles structured", "Jobs matched") using placeholder or already-known real numbers if any exist — check with me first if no real numbers are available rather than inventing fake metrics; a static, non-animated omission is fine if there's no honest number to show.

Everything must still render correctly with prefers-reduced-motion: reduce (animations become no-ops, not broken layouts).
```

---

## Prompt 3 — Auth Pages (Login & Signup)

```
Read FRONTEND_IMPROVEMENTS.md §3.5. Visual-only redesign of src/app/(auth)/login/page.tsx and src/app/(auth)/signup/page.tsx. Do not touch signIn.email/signUp.email calls, validation logic, error state, or redirect behavior.

- Replace the current lonely centered white card on a flat background with a split layout on larger screens: the existing form on one side, and on the other side an animated glass/gradient visual panel (reuse the gradient-mesh/floating-panel treatment from Prompt 2's hero, scaled down and simplified) — stack to a single column on mobile exactly as today.
- Restyle form inputs: on focus, add a glow/scale micro-interaction in addition to the existing border-color + ring change.
- Give the error alert box a slide-in/shake entrance animation when it first appears (respecting prefers-reduced-motion).
- Apply the same gradient-fill + glow-on-hover treatment to the submit buttons as the landing page CTAs, keeping the existing spinner for the loading state.
- Keep both pages' form field names, ids, and autoComplete attributes unchanged (Better Auth / browser autofill depends on them).
```

---

## Prompt 4 — URL Extractor Page

```
Read FRONTEND_IMPROVEMENTS.md §3.6. Visual-only redesign of src/components/UrlExtractClient.tsx. Do not touch the fetch call to /api/extract-url, the progressStep state machine's timing/values, or ProfileResults' props.

- The 3-step live progress indicator (Connecting → Scraping → Structuring) currently just toggles opacity/background on 3 flat boxes. Turn this into an animated progress rail: a connecting line/track that visually fills as progressStep advances, with the active step's icon getting a pulse animation, using Framer Motion for the fill transition.
- Restyle the URL input and submit button with the same glass-input / gradient-CTA treatment established in earlier prompts.
- Restyle the "Powered by Bright Data" help banner as a subtle glass callout instead of a flat blue box.
- Do not alter the actual progress percentages/labels/timing logic — this is purely restyling the same 4 states (progressStep 0-4) that already exist.
```

---

## Prompt 5 — Profile Results (Tables & Cards View)

```
Read FRONTEND_IMPROVEMENTS.md §3.7. Visual-only redesign of src/components/ProfileResults.tsx. Do not change any prop, the viewMode state, downloadProfileCsv/copy-to-clipboard logic, or which data fields are displayed.

- Tabular View: keep real <table> elements (CSV-export parity matters), but give them depth — sticky glass-effect header, row hover elevation (subtle lift/shadow, not just background tint), and a subtle zebra-striping treatment.
- Cards View: give experience/education/project entries a hover-lift and a gradient left-accent bar instead of the current plain border-slate-100 box.
- Skill pills in both views: add a subtle hover gradient/glass-chip treatment.
- Convert the Table/Cards view-mode toggle into a sliding active-background control using Framer Motion's layoutId (shared element transition) instead of an instant class swap.
- Add a brief success micro-animation (small scale/checkmark bounce) to the "Copy JSON" and "Download CSV" buttons on click, on top of their existing icon-swap feedback.
```

---

## Prompt 6 — Job Matcher (Flagship Feature)

```
Read FRONTEND_IMPROVEMENTS.md §3.8 — this is the highest-value target since it's the most-used screen. Visual-only redesign of src/components/JobMatcherClient.tsx. Do not touch any state variable, the resume scan / job search fetch calls, scoreJobsWithResume usage, filter logic, or downloadJobsCsv.

1. City selector grid (INDIAN_IT_CITIES chips): add a satisfying select animation (scale-bounce + checkmark draw-in via Framer Motion) replacing the instant color/background swap, plus a subtle hover lift on unselected chips.
2. Resume upload dropzone: it currently has zero visual feedback on drag — add a drag-active glow/border-pulse state (the onDragOver/onDragLeave handlers themselves are new UI-only state, not a functional change, since there's currently no file-drop handler at all — check whether adding drag-and-drop file drop is in scope or purely a hover/focus visual; if genuinely no drop handler exists, only add the visual affordance for the existing click-to-select flow, don't silently add a new interaction).
3. Parsed-resume snapshot card (name, seniority badge, skills, target-role buttons): give it a distinct visual signature — gradient border or soft glow — plus an entrance animation when it first appears after a successful scan.
4. Match-score badge (currently a flat "%Match" box): convert to an animated circular/radial progress ring or an animated count-up number, since this is the core value metric of the feature.
5. Job result cards: add hover lift/tilt, and a staggered fade/slide-in animation as the jobs list populates after search. Visually strengthen "Apply on LinkedIn" as the clearly dominant CTA versus the secondary "Company Profile" link.
6. "Why You Fit This Role" match-reasons list: replace the plain <ul> bullets with small animated icon bullets.
7. The "Scanning Openings in..." loading state: give it a more branded loading sequence (still respecting prefers-reduced-motion) rather than a single generic spinner, since this wait is central to the product's core loop.

This is the biggest single file in the app — feel free to split the work into logical passes (cities → resume card → job cards → loading state) and check in after each if that's cleaner than one giant diff.
```

---

## Prompt 7 — Loading States & Micro-interaction Polish

```
Read FRONTEND_IMPROVEMENTS.md §3.9. Visual-only pass over src/components/LoadingSkeleton.tsx and any other remaining animate-pulse/animate-spin usages across the app found via grep.

- Upgrade the skeleton's flat animate-pulse opacity fade to a moving gradient shimmer sweep (a common, cheap, high-perceived-quality pattern).
- Sweep the codebase for any spinner/loading state not yet touched by prompts 0-6 and bring it to visual parity with the new design system (same shimmer/spinner styling, not a mix of old and new loaders).
- Do a consistency pass: confirm all buttons across the app now share one consistent hover/press micro-interaction language (established in Prompts 1-2), rather than some buttons having the new treatment and others still on the old flat hover:bg-* pattern.
```

---

## Prompt 8 — Final Consistency, Dark Mode & Accessibility Pass

```
Final pass across the whole redesign (Prompts 0-7). Visual-only — do not touch any business logic file.

1. Verify dark mode (the token block added in Prompt 0) actually renders correctly on every page/component touched so far — navbar, footer, landing, auth, url-extract, profile results, job matcher, loading states. Fix any hardcoded light-only colors (e.g. leftover `bg-white`/`text-slate-900` that should be using tokens) that slipped through earlier prompts.
2. Verify every animation added in Prompts 1-7 correctly no-ops or shortens under `prefers-reduced-motion: reduce` — test by toggling the OS/browser setting, not just reading the code.
3. Run npm run build and npm run lint and fix any type/lint errors introduced by the redesign.
4. Do a manual click-through of both core flows (URL Extractor end-to-end, Resume Scanner + Job Matcher end-to-end) to confirm nothing about the actual functionality changed — same data returned, same CSV exports, same auth gating — only appearance.
5. Report back a short summary of what's now consistent vs. anything you deliberately left as a follow-up.
```
