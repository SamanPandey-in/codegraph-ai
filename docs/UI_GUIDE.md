# 🎨 Theme Skills Guide (Dark + Light) — Gold/Neutral System

This document defines the **design system, color tokens, and usage rules** for the application’s theme. It is intended for engineers, agents, and contributors working with **Tailwind CSS** and **shadcn/ui** components.

---

## 1. 🎯 Theme Philosophy

This theme is a **high-contrast neutral system with a gold accent**, designed to work seamlessly in both **dark** and **light modes**.

* **Primary tone:** Neutral grayscale
* **Accent:** Gold (for focus, actions, highlights)
* **Style:** Minimal, modern, high readability
* **Accessibility:** Strong contrast ratios (AA+)

---

## 2. 🎨 Core Color Palette

### Base Colors (from provided palette)

| Role        | Hex       | RGB                | Usage                   |
| ----------- | --------- | ------------------ | ----------------------- |
| Black       | `#0B0B0B` | `rgb(11,11,11)`    | Primary dark background |
| Dark Gray   | `#2E2E2E` | `rgb(46,46,46)`    | Secondary surfaces      |
| Medium Gray | `#666666` | `rgb(102,102,102)` | Muted text / borders    |
| Gold        | `#FFC107` | `rgb(255,193,7)`   | Accent / primary action |
| Light Gray  | `#E5E5E5` | `rgb(229,229,229)` | Light background        |

---

## 3. 🌗 Theme Tokens (shadcn/ui compatible)

Use CSS variables in `globals.css` or `theme.css`.

### Dark Theme (`:root.dark`)

```css
:root.dark {
  --background: 11 11 11;        /* #0B0B0B */
  --foreground: 229 229 229;     /* #E5E5E5 */

  --card: 46 46 46;              /* #2E2E2E */
  --card-foreground: 229 229 229;

  --popover: 46 46 46;
  --popover-foreground: 229 229 229;

  --primary: 255 193 7;          /* Gold */
  --primary-foreground: 11 11 11;

  --secondary: 102 102 102;      /* Medium Gray */
  --secondary-foreground: 255 255 255;

  --muted: 46 46 46;
  --muted-foreground: 102 102 102;

  --accent: 255 193 7;
  --accent-foreground: 11 11 11;

  --border: 102 102 102;
  --input: 46 46 46;
  --ring: 255 193 7;
}
```

---

### Light Theme (`:root`)

```css
:root {
  --background: 229 229 229;     /* #E5E5E5 */
  --foreground: 11 11 11;        /* #0B0B0B */

  --card: 255 255 255;
  --card-foreground: 11 11 11;

  --popover: 255 255 255;
  --popover-foreground: 11 11 11;

  --primary: 255 193 7;          /* Gold */
  --primary-foreground: 11 11 11;

  --secondary: 102 102 102;
  --secondary-foreground: 255 255 255;

  --muted: 229 229 229;
  --muted-foreground: 102 102 102;

  --accent: 255 193 7;
  --accent-foreground: 11 11 11;

  --border: 200 200 200;
  --input: 255 255 255;
  --ring: 255 193 7;
}
```

---

## 4. ⚡ Tailwind Configuration

Extend Tailwind in `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      gold: "#FFC107",
      black: "#0B0B0B",
      dark: "#2E2E2E",
      gray: "#666666",
      light: "#E5E5E5",
    },
  },
}
```

---

## 5. 🧩 Component Guidelines (shadcn/ui)

### Buttons

* **Primary:** Gold background
* **Secondary:** Dark/gray background
* **Ghost:** Transparent with hover highlight

```tsx
<Button className="bg-gold text-black hover:bg-yellow-500">
```

---

### Cards

* Dark: `bg-dark`
* Light: `bg-white`
* Border: subtle gray

---

### Inputs

* Dark mode: `bg-dark border-gray`
* Light mode: `bg-white border-gray-300`
* Focus ring: gold

---

### Text Hierarchy

| Type           | Color       |
| -------------- | ----------- |
| Primary text   | foreground  |
| Secondary text | gray        |
| Disabled       | opacity 50% |

---

## 6. 🧠 Usage Rules (CRITICAL)

### 1. Gold Usage

* ONLY for:

  * Primary actions (CTA buttons)
  * Active states
  * Focus rings
* NEVER overuse for backgrounds

---

### 2. Contrast Rules

* Dark mode: light text on dark surfaces
* Light mode: dark text on light surfaces
* Maintain minimum **4.5:1 contrast**

---

### 3. Surfaces

* Max 3 layers:

  * Background
  * Card
  * Elevated (popover/modal)

---

### 4. Borders

* Always subtle
* Never pure black/white
* Use gray tones

---

### 5. Hover & Interaction

* Gold → slightly darker (`#e0a800`)
* Gray → slightly lighter/darker depending on theme

---

## 7. 🚫 Anti-Patterns

❌ Do NOT:

* Use multiple accent colors
* Use gradients with gold
* Use pure white in dark mode
* Use gold for large backgrounds
* Mix unrelated color palettes

---

## 8. 🧪 Example Layout

```tsx
<div className="bg-background text-foreground">
  <Card className="bg-card border-border">
    <h1 className="text-xl font-bold">Title</h1>
    <p className="text-muted-foreground">Description</p>
    <Button className="bg-gold text-black">Action</Button>
  </Card>
</div>
```

---

## 9. 🧭 Design Intent Summary

* Neutral-first UI
* Gold = attention + action
* Clean hierarchy
* Consistent across light/dark
* Built for scalability with shadcn/ui

---

## 10. ✅ Implementation Checklist

Before shipping UI:

* [ ] Uses theme tokens (no hardcoded colors)
* [ ] Supports both light & dark
* [ ] Gold used sparingly
* [ ] Accessible contrast
* [ ] Tailwind classes follow system
* [ ] Matches component patterns

---

This file is the **single source of truth** for styling decisions. Any deviation must be justified and reviewed.
