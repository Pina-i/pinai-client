// Pīna'i — Refined redesign proposal
// Dark editorial aesthetic · Fraunces serif titles · Geist sans body
// shadcn-style OKLCH tokens; sage for chat, amber for voice.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "chatHue": 135,
  "voiceHue": 48,
  "accentChroma": 0.07,
  "radius": 10,
  "density": "cozy",
  "serif": "Fraunces"
}/*EDITMODE-END*/;

// ── Tokens: full shadcn architecture, OKLCH ─────────────────────────────────
// Canonical shadcn token list, mode-aware. Chat & voice are Pīna'i extensions
// that ride on the same architecture (semantic accent + foreground pair).
function tokens(t, mode = 'dark') {
  const c = t.accentChroma;
  const cH = t.chatHue, vH = t.voiceHue;

  if (mode === 'light') {
    return {
      // surfaces
      '--background':            'oklch(0.985 0.004 80)',
      '--foreground':            'oklch(0.18 0.010 60)',
      '--card':                  'oklch(1.000 0 0)',
      '--card-foreground':       'oklch(0.18 0.010 60)',
      '--popover':               'oklch(1.000 0 0)',
      '--popover-foreground':    'oklch(0.18 0.010 60)',
      // semantic pairs
      '--primary':               `oklch(0.52 ${c + 0.02} ${cH})`,
      '--primary-foreground':    'oklch(0.985 0.004 80)',
      '--secondary':             'oklch(0.95 0.006 80)',
      '--secondary-foreground':  'oklch(0.22 0.010 60)',
      '--muted':                 'oklch(0.955 0.006 80)',
      '--muted-foreground':      'oklch(0.48 0.010 70)',
      '--accent':                'oklch(0.94 0.012 80)',
      '--accent-foreground':     'oklch(0.20 0.012 60)',
      '--destructive':           'oklch(0.58 0.20 28)',
      '--destructive-foreground':'oklch(0.985 0.004 80)',
      '--success':               'oklch(0.58 0.13 150)',
      '--success-foreground':    'oklch(0.985 0.004 80)',
      '--warning':               'oklch(0.74 0.15 70)',
      '--warning-foreground':    'oklch(0.20 0.020 70)',
      // structure
      '--border':                'oklch(0.90 0.008 80)',
      '--border-strong':         'oklch(0.82 0.010 80)',
      '--input':                 'oklch(0.90 0.008 80)',
      '--ring':                  `oklch(0.62 ${c + 0.02} ${cH})`,
      // chat / voice (Pīna'i extension)
      '--chat':                  `oklch(0.52 ${c + 0.02} ${cH})`,
      '--chat-foreground':       'oklch(0.985 0.004 80)',
      '--chat-soft':             `oklch(0.94 ${c * 0.4} ${cH})`,
      '--chat-ink':              `oklch(0.30 ${c * 0.7} ${cH})`,
      '--voice':                 `oklch(0.62 ${c + 0.04} ${vH})`,
      '--voice-foreground':      'oklch(0.16 0.020 70)',
      '--voice-soft':            `oklch(0.95 ${c * 0.5} ${vH})`,
      '--voice-ink':             `oklch(0.32 ${c * 0.7} ${vH})`,
      // data viz (5-stop, harmonized)
      '--chart-1':               `oklch(0.58 ${c + 0.02} ${cH})`,
      '--chart-2':               `oklch(0.62 ${c + 0.04} ${vH})`,
      '--chart-3':               'oklch(0.62 0.10 260)',
      '--chart-4':               'oklch(0.66 0.12 330)',
      '--chart-5':               'oklch(0.62 0.14 28)',
      // sidebar (shadcn sidebar tokens)
      '--sidebar':               'oklch(0.97 0.005 80)',
      '--sidebar-foreground':    'oklch(0.20 0.010 60)',
      '--sidebar-primary':       `oklch(0.52 ${c + 0.02} ${cH})`,
      '--sidebar-primary-foreground': 'oklch(0.985 0.004 80)',
      '--sidebar-accent':        'oklch(0.94 0.010 80)',
      '--sidebar-accent-foreground': 'oklch(0.20 0.010 60)',
      '--sidebar-border':        'oklch(0.90 0.008 80)',
      '--sidebar-ring':          `oklch(0.62 ${c + 0.02} ${cH})`,
      // radii
      '--radius':                `${t.radius}px`,
      '--radius-sm':             `${Math.max(4, t.radius - 4)}px`,
      '--radius-md':             `${Math.max(6, t.radius - 2)}px`,
      '--radius-lg':             `${t.radius + 4}px`,
      '--radius-xl':             `${t.radius + 8}px`,
    };
  }

  // DARK (canonical)
  return {
    // surfaces
    '--background':              'oklch(0.152 0.008 60)',
    '--foreground':              'oklch(0.950 0.008 80)',
    '--card':                    'oklch(0.182 0.008 60)',
    '--card-foreground':         'oklch(0.950 0.008 80)',
    '--popover':                 'oklch(0.200 0.008 60)',
    '--popover-foreground':      'oklch(0.950 0.008 80)',
    // semantic pairs
    '--primary':                 `oklch(0.78 ${c} ${cH})`,
    '--primary-foreground':      'oklch(0.180 0.008 60)',
    '--secondary':               'oklch(0.260 0.008 60)',
    '--secondary-foreground':    'oklch(0.92 0.008 80)',
    '--muted':                   'oklch(0.240 0.008 60)',
    '--muted-foreground':        'oklch(0.660 0.010 70)',
    '--accent':                  'oklch(0.300 0.012 60)',
    '--accent-foreground':       'oklch(0.95 0.008 80)',
    '--destructive':             'oklch(0.640 0.160 28)',
    '--destructive-foreground':  'oklch(0.96 0.012 28)',
    '--success':                 'oklch(0.720 0.120 150)',
    '--success-foreground':      'oklch(0.16 0.030 150)',
    '--warning':                 'oklch(0.800 0.130 70)',
    '--warning-foreground':      'oklch(0.18 0.020 70)',
    // structure
    '--border':                  'oklch(0.280 0.008 60)',
    '--border-strong':           'oklch(0.360 0.010 60)',
    '--input':                   'oklch(0.220 0.008 60)',
    '--ring':                    `oklch(0.70 ${c} ${cH})`,
    // chat / voice (Pīna'i extension — same architecture as primary)
    '--chat':                    `oklch(0.78 ${c} ${cH})`,
    '--chat-foreground':         'oklch(0.18 0.008 60)',
    '--chat-soft':               `oklch(0.30 ${c * 0.8} ${cH})`,
    '--chat-ink':                `oklch(0.18 ${c * 0.6} ${cH})`,
    '--voice':                   `oklch(0.80 ${c + 0.02} ${vH})`,
    '--voice-foreground':        'oklch(0.18 0.020 70)',
    '--voice-soft':              `oklch(0.32 ${c * 0.9} ${vH})`,
    '--voice-ink':               `oklch(0.18 ${c * 0.6} ${vH})`,
    // data viz
    '--chart-1':                 `oklch(0.78 ${c} ${cH})`,
    '--chart-2':                 `oklch(0.80 ${c + 0.02} ${vH})`,
    '--chart-3':                 'oklch(0.74 0.10 260)',
    '--chart-4':                 'oklch(0.76 0.10 330)',
    '--chart-5':                 'oklch(0.72 0.14 28)',
    // sidebar
    '--sidebar':                 'oklch(0.165 0.008 60)',
    '--sidebar-foreground':      'oklch(0.92 0.008 80)',
    '--sidebar-primary':         `oklch(0.78 ${c} ${cH})`,
    '--sidebar-primary-foreground': 'oklch(0.18 0.008 60)',
    '--sidebar-accent':          'oklch(0.230 0.010 60)',
    '--sidebar-accent-foreground': 'oklch(0.95 0.008 80)',
    '--sidebar-border':          'oklch(0.260 0.008 60)',
    '--sidebar-ring':            `oklch(0.70 ${c} ${cH})`,
    // radii
    '--radius':                  `${t.radius}px`,
    '--radius-sm':               `${Math.max(4, t.radius - 4)}px`,
    '--radius-md':               `${Math.max(6, t.radius - 2)}px`,
    '--radius-lg':               `${t.radius + 4}px`,
    '--radius-xl':               `${t.radius + 8}px`,
  };
}

// ── tiny helpers ────────────────────────────────────────────────────────────
const Mountain = ({ size = 28, color = 'var(--foreground)' }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
    <circle cx="20" cy="20" r="19" stroke={color} strokeOpacity="0.35" strokeWidth="0.75"/>
    <path d="M7 28 L15 16 L20 22 L26 13 L33 28 Z" stroke={color} strokeWidth="1.25" strokeLinejoin="round" fill="none"/>
    <path d="M22 16 L26 13 L28 16" stroke={color} strokeWidth="1.25" strokeLinejoin="round" fill="none"/>
    <circle cx="15.5" cy="11" r="1.25" fill={color} fillOpacity="0.7"/>
  </svg>
);

const Icon = ({ d, size = 16, stroke = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const Icons = {
  search:   <Icon d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>} />,
  users:    <Icon d={<><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M21 20c0-2.2-1.8-4-4-4"/></>} />,
  message:  <Icon d={<path d="M4 6h16v10H9l-4 4V6z"/>} />,
  hash:     <Icon d={<><path d="M4 9h16M4 15h16M10 4 8 20M16 4l-2 16"/></>} />,
  mic:      <Icon d={<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>} />,
  micOff:   <Icon d={<><path d="m3 3 18 18"/><path d="M9 9v2a3 3 0 0 0 4.6 2.5"/><path d="M15 5v6M5 11a7 7 0 0 0 10.8 5.8M12 18v3"/></>} />,
  headset:  <Icon d={<><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="5" height="7" rx="2"/><rect x="16" y="13" width="5" height="7" rx="2"/></>} />,
  settings: <Icon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>} />,
  bell:     <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>} />,
  plus:     <Icon d={<><path d="M12 5v14M5 12h14"/></>} />,
  help:     <Icon d={<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1 1-1 1.7M12 17h.01"/></>} />,
  sun:      <Icon d={<><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></>} />,
  moon:     <Icon d={<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>} />,
  mail:     <Icon d={<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>} />,
  lock:     <Icon d={<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>} />,
  send:     <Icon d={<><path d="m22 2-7 20-4-9-9-4 20-7z"/></>} />,
  plusCircle: <Icon d={<><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>} />,
  screen:   <Icon d={<><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></>} />,
  waveform: <Icon d={<><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 12h2"/></>} />,
  chevR:    <Icon d={<path d="m9 6 6 6-6 6"/>} />,
  sparkle:  <Icon d={<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>} />,
  reply:    <Icon d={<><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/></>} />,
  at:       <Icon d={<><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/></>} />,
  pin:      <Icon d={<><path d="M12 17v5M7 10 5 12l7 1 1 7 2-2-1-4 4-4-7-1-1-7-2 2z"/></>} />,
  smile:    <Icon d={<><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>} />,
  more:     <Icon d={<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>} />,
  check:    <Icon d={<path d="m5 12 5 5 9-11"/>} />,
};

// ── Shared chrome pieces ────────────────────────────────────────────────────
function Artboard({ children, w, h, style }) {
  return (
    <div style={{
      width: w, height: h,
      background: 'var(--background)',
      color: 'var(--foreground)',
      fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
      fontSize: 13.5,
      letterSpacing: '-0.005em',
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}>
      {children}
    </div>
  );
}

const Serif = ({ children, style, as: As = 'span' }) => (
  <As style={{ fontFamily: 'var(--serif, Fraunces), ui-serif, Georgia, serif', fontOpticalSizing: 'auto', ...style }}>
    {children}
  </As>
);

const Mono = ({ children, style }) => (
  <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', ...style }}>{children}</span>
);

Object.assign(window, { tokens, Mountain, Icons, Artboard, Serif, Mono });
