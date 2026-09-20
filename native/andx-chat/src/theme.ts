/**
 * Nexus theme — cyberpunk cyan-on-near-black to match the web widget.
 * Override per-instance via <XoreSupportBot theme={{...}} />.
 */

export interface Theme {
  bg: { panel: string; elevated: string; deep: string };
  accent: { primary: string; alert: string; online: string };
  text: { primary: string; secondary: string; muted: string; inverse: string };
  border: { default: string; strong: string; subtle: string };
  radius: { sm: number; md: number; lg: number };
  font: { body: string; heading: string; mono: string };
  space: (n: number) => number;
}

export const defaultTheme: Theme = {
  bg: {
    panel: '#050508',
    elevated: '#08080d',
    deep: '#000000',
  },
  accent: {
    primary: '#00e0ff',
    alert: '#ff2ec8',
    online: '#00ff9e',
  },
  text: {
    primary: '#d8e0ec',
    secondary: 'rgba(216,224,236,0.55)',
    muted: 'rgba(216,224,236,0.35)',
    inverse: '#000000',
  },
  border: {
    default: 'rgba(0,224,255,0.18)',
    strong: 'rgba(0,224,255,0.4)',
    subtle: 'rgba(0,224,255,0.08)',
  },
  radius: {
    sm: 3,
    md: 4,
    lg: 6,
  },
  font: {
    body: 'Inter',
    heading: 'Space Grotesk',
    mono: 'JetBrains Mono',
  },
  space: (n: number) => n * 4,
};

export function mergeTheme(base: Theme, override?: Partial<Theme>): Theme {
  if (!override) return base;
  return {
    bg: { ...base.bg, ...(override.bg || {}) },
    accent: { ...base.accent, ...(override.accent || {}) },
    text: { ...base.text, ...(override.text || {}) },
    border: { ...base.border, ...(override.border || {}) },
    radius: { ...base.radius, ...(override.radius || {}) },
    font: { ...base.font, ...(override.font || {}) },
    space: override.space || base.space,
  };
}
