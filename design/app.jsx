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
// Pīna'i logo · "K"-shaped mountain glyph with sage range behind.
// Mountains use currentColor (white on dark / black on light).
// Sage parts (#afbea5) stay constant — they're the brand.
const Mountain = ({ size = 28 }) => (
  <svg
    height={size}
    width={size * (1025 / 755)}
    viewBox="510 400 1025 755"
    fill="none"
    aria-hidden
    style={{display:'block', flexShrink:0}}
  >
    <path fill="currentColor" d="M 867.732 737.6 C 874.2 742.647 897.639 771.811 904.658 779.965 C 939.386 819.929 973.672 860.274 1007.51 900.994 L 1145.38 1064.38 C 1162.81 1085.26 1188.51 1113.97 1204.11 1135.13 C 1170.5 1136.33 1128.43 1134.99 1094.16 1134.96 L 872.5 1135.08 L 534.201 1135.26 C 546.068 1119.09 562.028 1101.57 575.102 1085.85 C 606.77 1047.73 638.669 1009.8 670.795 972.062 C 715.856 917.277 761.462 862.943 807.607 809.069 C 827.243 785.797 847.643 760.047 867.732 737.6 z M 737.696 958.584 C 751.89 952.35 769.123 943.139 783.071 935.936 C 803.596 925.338 825.232 914.501 845.491 903.483 C 847.195 918.28 854.676 952.992 859.517 966.597 C 869.226 954.171 895.851 922.367 907.222 911.248 C 930.319 921.913 977.043 944.718 998.303 957.359 C 981.129 934.118 953.588 904.074 934.381 881.132 C 920.081 863.964 905.676 846.884 891.166 829.894 C 885.288 823 874.558 809.827 868.428 803.904 L 782.355 905.543 C 770.591 919.447 747.455 945.089 737.696 958.584 z"/>
    <path fill="#afbea5" d="M 1003.27 423.543 C 1120.76 417.136 1243.29 458.307 1332.59 534.56 C 1483.77 663.66 1546.43 863.39 1490.28 1054.3 C 1482.53 1045.9 1461.99 1020.54 1455.82 1011.42 C 1456.69 1006.7 1457.61 1001.98 1458.59 997.282 C 1504.56 767.691 1346.97 524.215 1116.52 478.032 C 1133.89 494.817 1152.45 518.425 1162 540.526 C 1196.51 620.352 1166.99 715.465 1085.53 751.975 C 1068.27 760.106 1043.99 764.349 1024.99 766.083 C 1032.3 758.135 1038.98 749.634 1044.98 740.656 C 1066.91 707.577 1073.27 671.264 1064.83 632.921 C 1043.99 538.244 938.823 506.834 853.761 527.13 C 766.488 547.954 697.099 605.954 649.887 680.131 C 587.049 778.85 566.011 898.492 591.401 1012.73 C 584.567 1023.95 566.312 1044.47 557.046 1055.35 C 548.19 1022.53 539.746 973.893 538.323 939.904 C 531.668 807.555 578.491 678.085 668.263 580.609 C 754.232 485.288 875.008 428.663 1003.27 423.543 z M 920.484 480.055 C 994.038 485.505 1058.91 516.482 1093.13 585.503 C 1104 607.424 1107.09 625.922 1110.68 649.747 C 1111.64 658.487 1112.75 667.629 1112.18 676.428 C 1144.52 619.074 1136.33 558.919 1088.4 512.828 C 1059.49 485.028 1014.92 468.461 974.81 472.378 C 953.899 473.738 941.14 476.144 920.484 480.055 z"/>
    <path fill="currentColor" d="M 1188.96 736.429 C 1192.13 737.499 1194.86 741.219 1197.01 743.852 L 1438.51 1044.15 C 1462.92 1074.67 1489.32 1104.8 1513.18 1135.22 C 1468.47 1135.95 1421.35 1135.18 1376.5 1135.04 L 1248.83 1135.83 C 1241.28 1128.18 1231.18 1114.72 1223.78 1105.89 L 1165.83 1036.56 C 1139.66 1005.96 1113.66 975.222 1087.84 944.334 C 1076.57 930.916 1062.38 914.855 1051.95 901.077 C 1096.78 845.587 1143.61 791.461 1188.96 736.429 z M 1097.8 911.612 C 1119.61 902.872 1146.7 887.662 1166.78 880.378 C 1171.87 888.071 1194.69 929.979 1199.58 931.927 C 1199.65 931.955 1199.73 931.937 1199.8 931.941 C 1205.83 922.409 1215.68 905.201 1221.79 896.934 C 1239.29 902.804 1273.53 920.027 1291.13 928.588 C 1282.56 915.414 1269.76 900.194 1259.77 887.809 C 1244.89 869.047 1229.77 850.478 1214.41 832.107 C 1210.1 826.916 1191.56 803.391 1188.6 800.614 C 1168.51 827.409 1144.45 854.072 1123.39 880.355 C 1115.05 890.772 1105.7 900.855 1097.8 911.612 z"/>
    <path fill="#afbea5" d="M 887.745 557.404 C 892.988 556.509 904.797 556.805 910.432 556.793 C 964.879 556.673 1010.98 583.414 1032.26 634.493 C 965.629 594.868 907.644 618.177 864.857 679.367 C 858.096 689.037 850.485 705.431 843.866 713.57 C 828.713 732.203 812.09 753.175 794.598 769.463 C 798.236 694.745 828.643 637.978 891.406 596.39 C 834.879 604.726 787.37 633.901 749.338 675.693 C 679.322 752.467 653.396 835.06 656.075 937.696 C 645.279 950.57 633.338 963.625 622.277 976.672 C 619.949 948.549 617.222 919.178 618.981 891.057 C 624.414 804.19 654.951 723.016 710.703 655.957 C 758.613 598.329 812.557 565.536 887.745 557.404 z"/>
    <path fill="#afbea5" d="M 1198.26 542.459 C 1246.12 560.763 1298.67 609.126 1331.57 647.799 C 1391.4 718.338 1425.76 806.956 1429.12 899.391 C 1430.03 923.97 1428.48 946.402 1426.48 970.857 L 1425.77 972.124 C 1419.27 970.332 1397.44 940.65 1393.05 933.59 C 1392.48 921.672 1392.84 909.224 1392.29 897.079 C 1390.89 870.245 1386.59 843.641 1379.46 817.732 C 1354.17 724.515 1291.37 636.377 1207.18 587.91 C 1207.1 569.305 1203.74 560.137 1198.26 542.459 z"/>
    <path fill="#afbea5" d="M 1208.73 629.146 C 1219.07 632.257 1235.65 646.677 1244.02 654.198 C 1300.57 705.317 1340.27 776.767 1354.24 851.67 C 1355.59 858.888 1361.71 887.969 1357.97 892.227 C 1349.15 883.29 1340.01 869.093 1331.92 859.214 C 1326.06 852.05 1323.78 838.376 1321.2 829.116 C 1318.32 818.708 1314.94 808.443 1311.08 798.356 C 1290.95 745.913 1249.76 690.442 1204.17 657.19 C 1206.12 648.436 1207.4 638.119 1208.73 629.146 z"/>
    <path fill="#afbea5" d="M 772.755 693.872 C 774.134 695.552 768.861 711.379 767.792 714.906 C 757.394 749.236 762.261 774.267 765.381 808.111 C 762.843 811.932 759.003 816.357 755.886 819.85 C 733.724 844.69 713.293 871.246 691.528 896.349 L 690.007 898.391 L 689.155 898.028 C 689.249 889.795 690.872 879.657 691.659 871.244 C 697.394 809.874 728.425 737.987 772.755 693.872 z"/>
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
