/* The look every AI Hub generation shares, as the workspace's Brand default prompt starts out (Oct 2026).
   Written from the team's own posters: a dark studio, one premium hero, electric lime as the only accent.
   It is only a starting text. The server puts it into a workspace whose Brand default prompt is still
   empty, once (server.js); from then on it is the admin's, edited or cleared in Settings → AI →
   Providers → AI image generation, and the server appends whatever is saved there to every generation. */
const RECOMMENDED_BRAND_PROMPT = [
  "Visual identity for HSB Investasi (fintech and trading). Every image looks like part of one campaign:",
  "- Background: near-black (#030603) melting into deep olive green, lit by a soft electric-lime glow (#D4FA00) from one corner or from behind the subject; a subtle fine curved-line texture or light film grain; a gentle vignette.",
  "- One clear hero: a premium photoreal 3D object (polished gold, brushed silver or chrome, clear glass, glossy lime satin, ribbon or enamel), or real Indonesian people photographed in a studio, dressed in lime green or white. A large frosted-glass disc with a pale green tint often sits behind the hero.",
  "- Light: dramatic studio lighting, a crisp lime rim light, soft reflections on a dark glossy floor, cinematic contrast, sharp focus.",
  "- Colour: black, dark green, silver, gold and electric lime only; lime is the single accent. No blue, purple, red or pastel casts.",
  "- Composition: generous dark empty space for the headline; nothing busy behind where text will go; premium, clean and confident, never cluttered or cartoonish.",
  "- Never draw text, numbers, logos or watermarks: the headline, the logo and the legal line are added afterwards."
].join("\n");

module.exports = { RECOMMENDED_BRAND_PROMPT };
