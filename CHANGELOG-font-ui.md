# Google Font dialog update
- Replaced the browser prompt with a themed, accessible dialog.
- Uses existing workspace colors, light/dark themes, fonts and corner settings.
- Added popular font shortcuts, a debounced preview, inline validation and EN/ID text.
- Supports Cancel, Escape, keyboard focus containment and Enter to apply.
- Preserves the existing font storage and application flow; avoids case-insensitive duplicates.
- Google Fonts previews require internet access. If unavailable, the dialog displays a helpful status.
- Updated src/settings.js and src/refinements.css; rebuilt public/index.html and dist/creative-os-standalone.html.

Validation: existing settings and language tests passed (5 tests). Browser checks passed for focus, invalid input, selection, cancellation, Escape, application, Enter, duplicate prevention and mobile layout. No page script errors occurred. Light, dark and mobile screenshots were inspected. The live Google Fonts preview could not load in the test environment; its unavailable state was verified.

## Typography pill alignment
Custom font choices now sit alongside the built-in choices in the same segmented control. They share font, height, padding and active colors. Click the font name to apply; the separately labeled X removes it. Preview font styling remains in the add-font dialog. Verified matching computed font and height, selection, active-font removal with fallback to default, and light/dark/mobile rendering; no page errors.
Autocomplete is not included in this revision; implementation options were provided separately.

## Google Fonts catalog shortcut
Added a Google Fonts catalog link below the dialog introduction, opening https://fonts.google.com/ in a new tab. Replaced OS with workspace in English and Indonesian dialog copy. Expanded the popular shortcuts to eight: DM Sans, Inter, Poppins, Roboto, Open Sans, Montserrat, Manrope and Lora. Browser checks passed, including link target, eight choices and existing dialog interactions.
