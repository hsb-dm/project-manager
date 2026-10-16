/* The look every AI Hub generation shares, as the workspace's Brand default prompt starts out (Oct 2026).
   Written from the team's own posters: a dark studio, one premium hero, electric lime as the only accent.
   It is only a starting text. The server puts it into a workspace whose Brand default prompt is still
   empty, once (server.js); from then on it is the admin's, edited or cleared in Settings → AI →
   Providers → AI image generation, and the server appends whatever is saved there to every generation.
   16 Oct 2026: HSB is a forex and commodities broker, so nothing that reads as crypto (money is banknotes or gold
   bars), and the picture is tack-sharp and clean. Said as what to show, never as what not to: Magnific Mystic has no
   negative prompt, and naming a thing — "no Bitcoin", "no grain" — draws it in. A workspace still on the text before
   is moved to this one once (server.js); one an admin wrote is left as it is. */
const RECOMMENDED_BRAND_PROMPT = [
  "Visual identity for HSB Investasi, a regulated forex and commodities broker (currencies, gold, indices). Every image looks like part of one campaign:",
  "- Background: near-black (#030603) melting smoothly into deep olive green, lit by a soft electric-lime glow (#D4FA00) from one corner or from behind the subject; clean, perfectly smooth gradients.",
  "- One clear hero: a premium photoreal 3D object (polished gold bars, brushed silver or chrome, clear glass, glossy lime satin, ribbon or enamel), or real Indonesian people photographed in a studio, dressed in lime green or white. Money appears only as paper banknotes (rupiah, US dollar) or polished gold bars. A large frosted-glass disc with a pale green tint often sits behind the hero.",
  "- Light: dramatic studio lighting, a crisp lime rim light, clean reflections on a dark glossy floor, cinematic contrast.",
  "- Image quality: tack-sharp focus across the whole subject, crisp edges, high resolution, clean, flawless surfaces, perfectly smooth gradients and clear, clean air.",
  "- Colour: black, dark green, silver, gold and electric lime only; lime is the single accent. No blue, purple, red or pastel casts.",
  "- Composition: generous dark empty space for the headline; nothing busy behind where text will go; premium, clean and confident, never cluttered or cartoonish.",
  "- Never draw text, numbers, logos or watermarks: the headline, the logo and the legal line are added afterwards."
].join("\n");

/* the texts this one replaces, word for word: a workspace still on one of them gets the current one */
const PREVIOUS_BRAND_PROMPTS = [[
  "Visual identity for HSB Investasi (fintech and trading). Every image looks like part of one campaign:",
  "- Background: near-black (#030603) melting into deep olive green, lit by a soft electric-lime glow (#D4FA00) from one corner or from behind the subject; a subtle fine curved-line texture or light film grain; a gentle vignette.",
  "- One clear hero: a premium photoreal 3D object (polished gold, brushed silver or chrome, clear glass, glossy lime satin, ribbon or enamel), or real Indonesian people photographed in a studio, dressed in lime green or white. A large frosted-glass disc with a pale green tint often sits behind the hero.",
  "- Light: dramatic studio lighting, a crisp lime rim light, soft reflections on a dark glossy floor, cinematic contrast, sharp focus.",
  "- Colour: black, dark green, silver, gold and electric lime only; lime is the single accent. No blue, purple, red or pastel casts.",
  "- Composition: generous dark empty space for the headline; nothing busy behind where text will go; premium, clean and confident, never cluttered or cartoonish.",
  "- Never draw text, numbers, logos or watermarks: the headline, the logo and the legal line are added afterwards."
].join("\n")];

module.exports = { RECOMMENDED_BRAND_PROMPT, PREVIOUS_BRAND_PROMPTS };
