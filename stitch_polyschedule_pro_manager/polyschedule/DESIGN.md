---
name: PolySchedule
colors:
  surface: '#fff8f7'
  surface-dim: '#e3d7d7'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fdf1f0'
  surface-container: '#f7ebeb'
  surface-container-high: '#f1e6e5'
  surface-container-highest: '#ebe0df'
  on-surface: '#201a1a'
  on-surface-variant: '#574240'
  inverse-surface: '#352f2f'
  inverse-on-surface: '#faeeee'
  outline: '#8a7170'
  outline-variant: '#dec0be'
  surface-tint: '#a6393a'
  primary: '#a6393a'
  on-primary: '#ffffff'
  primary-container: '#e96b69'
  on-primary-container: '#5e010d'
  inverse-primary: '#ffb3af'
  secondary: '#006a62'
  on-secondary: '#ffffff'
  secondary-container: '#81f3e5'
  on-secondary-container: '#006f66'
  tertiary: '#7e5700'
  on-tertiary: '#ffffff'
  tertiary-container: '#c28700'
  on-tertiary-container: '#3c2700'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad8'
  primary-fixed-dim: '#ffb3af'
  on-primary-fixed: '#410006'
  on-primary-fixed-variant: '#852125'
  secondary-fixed: '#84f5e8'
  secondary-fixed-dim: '#66d9cc'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdeac'
  tertiary-fixed-dim: '#ffba38'
  on-tertiary-fixed: '#281900'
  on-tertiary-fixed-variant: '#604100'
  background: '#fff8f7'
  on-background: '#201a1a'
  surface-variant: '#ebe0df'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 57px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.5px
  body-md:
    fontFamily: Work Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.25px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.5px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
---

## Brand & Style
The design system is built on a foundation of **Modern Corporate Humanism**, utilizing the Material 3 (M3) framework to create an environment that feels organized, emotionally intelligent, and radically inclusive. The target audience requires a tool that balances the logistical complexity of multi-partner scheduling with the warmth of interpersonal connection.

The aesthetic is **Bright, Friendly, and Modern**. It leverages M3's signature tonal surfaces and containment strategies to reduce cognitive load. The UI should evoke a sense of "calm clarity"—transforming potentially stressful scheduling conflicts into manageable, collaborative opportunities. 

Key stylistic pillars include:
- **Intentional Whitespace:** Generous breathing room to emphasize the "living" nature of the schedule.
- **Soft Materiality:** Utilizing subtle elevation and tonal shifts rather than harsh dividers.
- **Empathetic Rigor:** A strict underlying grid that provides the "trustworthy" structure, softened by rounded corners and a warm palette.

## Colors
The palette is designed to be vibrant yet professional, using color not just for decoration but as a critical information layer.

- **Primary (Soft Coral):** Used for main actions and the "Heart" of the app—personal events and primary navigation. It conveys warmth and affection.
- **Secondary (Friendly Teal):** Used for collaborative events and shared calendars. It represents balance and growth.
- **Tertiary (Warm Amber):** Specifically reserved for "Sleeping Arrangements" and domestic logistics, evoking the warmth of a home light.
- **Neutral (Warm Grey):** A soft, high-legibility grey used for text and iconography to avoid the harshness of pure black.

The design system utilizes **Tonal Palettes**. Each key color generates a range of tones (0-100) to be used for "Container" vs. "On-Container" states, ensuring accessible contrast ratios for all scheduling data.

## Typography
Typography is optimized for rapid scanning of temporal data. 

- **Plus Jakarta Sans** is used for headlines and titles. Its soft, rounded terminals feel approachable and modern, softening the logistical nature of the app.
- **Work Sans** serves as the workhorse for body text. Its optimized legibility at small sizes is perfect for event descriptions and notes.
- **JetBrains Mono** is strategically used for labels, timestamps, and "Sleeping Arrangement" slots. This monospaced choice introduces a "data-clear" technical feel to the most complex parts of the schedule, ensuring numbers and times align perfectly in grid views.

**Usage Note:** Use `label-md` for all time-stamps to ensure they stand out as distinct data points from the event titles.

## Layout & Spacing
This design system follows the **Material 3 Responsive Column Grid**. 

- **Mobile (0-599dp):** 4-column fluid grid. 16px margins. 
- **Tablet (600-839dp):** 8-column fluid grid. 24px margins.
- **Desktop (840dp+):** 12-column fixed grid (max width 1200px). 24px margins.

The spacing rhythm is strictly **8px-based**. This ensures a mathematical harmony across all components. Vertical rhythm is key: use `spacing.md` (16px) for most component grouping, and `spacing.lg` (24px) to separate distinct "Time Blocks" in the daily view.

## Elevation & Depth
In alignment with Material 3, this design system uses **Tonal Elevation** rather than heavy shadows to indicate depth.

- **Level 0 (Surface):** The lowest level, typically the app background in a soft off-white or light cream.
- **Level 1 (Elevated):** Subtle tint overlay. Used for cards and main schedule items.
- **Level 2 (Active):** Used for "Sleeping Arrangement" blocks to give them a distinctive "sunken" or "nested" feel, distinguishing them from standard floating events.
- **Level 3 (Modal):** Reserved for FABs (Floating Action Buttons) and Dialogs, featuring a soft, highly-diffused ambient shadow (`blur: 12px, alpha: 0.08`).

Surface-tint mapping ensures that as elements "rise," they become slightly lighter or take on a hint of the primary color, guiding the user's eye to the most relevant interaction.

## Shapes
The shape language is **fully rounded**, following the M3 "Extra Large" corner radius for containers. 

- **Standard Containers:** 16px (1rem) corner radius.
- **Small Components (Chips/Inputs):** 8px (0.5rem) corner radius.
- **Special Items:** "Sleeping Arrangement" blocks should use a specific "scooped" shape—a standard rounded rectangle but with a subtle inner-radius on the left edge to visually "hook" into the timeline.
- **Buttons:** Fully pill-shaped (3rem) to encourage touch interaction in the PWA environment.

## Components
Consistent component behavior is vital for a scheduling tool:

- **Buttons:** Use the "Filled" style for primary actions (Add Event) and "Tonal" for secondary actions (Add Note). All buttons must be pill-shaped.
- **Chips:** Used for "Partner Tags." Each partner should have a persistent assigned color. Chips are de-emphasized with a 1px border when not selected.
- **Cards (The Event Block):**
    - *Standard Events:* Primary-colored left-accent bar, white fill, subtle Level 1 elevation.
    - *Sleeping Arrangements:* Tertiary-colored background (Warm Amber) with a 20% opacity fill and a dashed border to indicate "location-based" status rather than "activity-based" status.
- **Input Fields:** Filled style with a 2px bottom stroke. Labels should never disappear, moving to the "Headline" position on focus to maintain context during complex data entry.
- **Lists:** Use a "Divided" layout for the Agenda view, but replace lines with 8px whitespace gaps to maintain the "Modern" feel.
- **FAB (Floating Action Button):** A large, rounded-square (28px radius) button in the Primary color for "Quick Add," anchored to the bottom right.