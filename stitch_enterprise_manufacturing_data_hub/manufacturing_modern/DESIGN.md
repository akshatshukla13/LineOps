---
name: Manufacturing Modern
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#43474f'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#737780'
  outline-variant: '#c3c6d1'
  surface-tint: '#3a5f94'
  primary: '#001e40'
  on-primary: '#ffffff'
  primary-container: '#003366'
  on-primary-container: '#799dd6'
  inverse-primary: '#a7c8ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#381300'
  on-tertiary: '#ffffff'
  tertiary-container: '#592300'
  on-tertiary-container: '#d8885c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a7c8ff'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#1f477b'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb690'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#723610'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is engineered for high-stakes industrial environments where precision, reliability, and rapid data interpretation are critical. It bridges the gap between the rugged factory floor and the executive boardroom through a "Manufacturing Modern" aesthetic—a philosophy that prioritizes utility and clarity above all else.

The style is rooted in **Minimalism** and **Corporate Modernism**. It utilizes a strict grid-based structure to organize complex telemetry data, ensuring that operators can identify anomalies in seconds. The interface evokes a sense of "digital machinery"—robust, dependable, and efficient. High-contrast surfaces ensure legibility under varied lighting conditions, while subtle elevation provides the necessary depth for complex information architecture.

## Colors
The palette is anchored by **Enterprise Blue**, a color that communicates authority and stability. This is complemented by a range of technical grays that define the interface's structure without competing for the user's attention.

Functional colors are applied with extreme intent. **Success Green** denotes peak efficiency and "all systems go" states. **Warning Amber** is reserved for preventative maintenance and downtime risks, while **Error Red** highlights rejected quantities or critical stoppages. To maintain high readability, text and icons always adhere to a minimum 4.5:1 contrast ratio against their respective backgrounds. Use white surfaces for primary content containers and light gray (#F1F5F9) for the canvas background to reduce screen glare.

## Typography
This design system utilizes **Inter** for its exceptional legibility and neutral, systematic character. The typographic scale is optimized for two distinct environments: the data-heavy desktop dashboard and the mobile "floor" view.

For monitoring views, use `data-tabular` settings to ensure that numerical values align vertically, allowing operators to scan columns of production figures quickly. For mobile interfaces used on the shop floor, typography is scaled up to prioritize legibility at a distance or while in motion. Labels use uppercase styling with increased letter spacing to distinguish metadata from primary data points.

## Layout & Spacing
The layout follows a strict **8px grid system**, ensuring proportional consistency across all screen sizes. 

- **Desktop (Control Room):** Employs a 12-column fluid grid. Content density is high, utilizing condensed margins (32px) and gutters (24px) to maximize the "at-a-glance" data visibility required for production monitoring.
- **Mobile (Shop Floor):** Switches to a single-column layout with a 16px safe area. Spacing between touch targets is increased to 12px or 16px to prevent accidental taps in active environments.

Cards should span the full width of their grid containers, with internal padding of 24px (md) to give data visualizations sufficient breathing room.

## Elevation & Depth
Elevation in the design system is used functionally to indicate hierarchy and interactable surfaces. It avoids decorative shadows in favor of **Tonal Layers** and **Ambient Shadows**.

1.  **Level 0 (Canvas):** The neutral background (#F1F5F9).
2.  **Level 1 (Cards/Sections):** White surfaces with a very soft, diffused shadow (0px 2px 4px rgba(0, 0, 0, 0.05)) and a subtle 1px border (#E2E8F0).
3.  **Level 2 (Active/Hover States):** A more pronounced shadow (0px 8px 16px rgba(0, 51, 102, 0.08)) to indicate interactivity.
4.  **Level 3 (Overlays/Modals):** High-contrast depth (0px 20px 25px rgba(0, 0, 0, 0.1)) to focus attention on critical alerts or configuration tasks.

This approach ensures that even on low-quality industrial monitors, the physical separation of content is clear.

## Shapes
The shape language is **Soft** (Level 1). A corner radius of 4px (0.25rem) is the standard for most UI components including buttons, input fields, and status chips. 

Large containers like data cards may use a radius of 8px (0.5rem) to provide a slightly more modern feel, but the overall geometry remains disciplined and rectangular to reflect the industrial context. Circular shapes are strictly reserved for status indicators (LED style) and user avatars.

## Components
- **Buttons:** Primary buttons use the Enterprise Blue background with white text. For shop-floor use, buttons must have a minimum height of 48px to ensure they are "thumb-friendly."
- **Input Fields:** Large, 48px tall fields with clear borders and persistent labels. Focus states use a 2px Enterprise Blue outline.
- **Status Indicators:** Use a "pill" shape (rounded-full) with a light tinted background and dark foreground text (e.g., Light Green background with Dark Green text) for high visibility.
- **Density-Optimized Tables:** Desktop tables should use a 40px row height, "zebra-striping" with light gray, and sticky headers for long production logs.
- **Data Cards:** Group related metrics (e.g., "OEE", "Downtime") into elevated Level 1 cards with a clear header and a primary metric displayed in `display-lg` typography.
- **Checkboxes/Radios:** Oversized targets (24x24px) to accommodate use in tactile environments.