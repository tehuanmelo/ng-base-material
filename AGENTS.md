# Base Material — Project Instructions

## Project purpose

Build a simple, single-page staff form for reporting the materials currently available at a National Guard camp/base.

Staff members will identify themselves by selecting their PS number and base location, then record the available quantity or status of camp materials such as knives, pistols, mouth guards, gloves, and other inventory items.

## Users and language

- Primary users: National Guard camp staff.
- All user-facing content must be written in Portuguese.
- Use clear, concise language suitable for quick data entry.

## Form requirements

- Keep the form on one page.
- Include a dropdown for the staff member's PS number.
- Include a dropdown for the base location.
- Include fields for reporting available materials.
- The complete material list and the exact input type for each item are still to be confirmed.
- Validate required fields and show validation feedback in Portuguese.
- Include clear loading, submission-success, and submission-error states.
- Prevent accidental duplicate submissions while a request is in progress.

## Data submission

- Send completed submissions to Google Sheets.
- The integration method, spreadsheet schema, and credentials/configuration are still to be defined.
- Never place Google credentials or private secrets in client-side React code.
- Keep submission logic separated from presentational components so the Google Sheets endpoint can be configured safely.

## Design and branding

- A National Guard logo is available at `public/logo_national_guard.png`.
- The layout reference is `design/Screenshot 2026-07-16 at 4.23.40 PM.png`.
- Follow the reference's restrained administrative-tool appearance:
  - A thin dark strip along the top of the page.
  - A white header with the National Guard logo, a bold title, and a muted subtitle.
  - A light-gray page background below the header.
  - A centered, medium-width content column with generous vertical spacing.
  - White form cards with subtle gray borders, small corner radii, and a very light shadow.
  - Bold near-black headings, muted gray supporting text, and neutral gray controls.
  - Large, full-width dropdown controls for PS number and base selection.
  - Compact minus/value/plus stepper controls for material quantities where appropriate.
- Adapt the repeated schedule cards in the reference into repeated material inventory rows or cards; do not reproduce schedule-specific content.
- Preserve the reference's visual hierarchy while making the inventory form efficient on mobile screens.
- Do not invent official branding rules that have not been provided.

## Technical context

- React 19
- TypeScript
- Vite
- Current source entrypoint: `src/main.tsx`
- Main application component: `src/App.tsx`
- Global styles: `src/index.css`
- Component/application styles: `src/App.css`

## Engineering expectations

- Preserve strict TypeScript typing; avoid `any`.
- Prefer small, readable components and data-driven rendering for the material fields.
- Use semantic HTML and accessible labels for every control.
- Ensure the form works well on mobile and desktop.
- Keep PS numbers, base locations, and material definitions in maintainable configuration structures rather than duplicating markup.
- Do not expose sensitive staff data in logs or committed files.
- Run `npm run lint` and `npm run build` after implementation changes.

## Information still needed

- Full list of materials and the value collected for each item (quantity, availability, condition, or another value).
- PS number dropdown options and whether they come from a fixed list or Google Sheets.
- Base location dropdown options and whether they come from a fixed list or Google Sheets.
- Google Sheet destination and preferred secure integration method.
- Whether submissions require a timestamp, notes, or confirmation/reference number.
