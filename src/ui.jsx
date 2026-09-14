// ui.jsx — shared UI primitives + theme tokens

// ── Theme tokens ────────────────────────────────────────────────────────────
const THEMES = {
  editorial: {
    name: 'Editorial Navy & Cream',
    bg: '#F5EFE4',
    bgElev: '#FBF7EE',
    surface: '#FFFFFF',
    ink: '#0E1A35',
    inkSoft: '#3A4763',
    inkMuted: '#7A7E8C',
    rule: 'rgba(14,26,53,0.10)',
    accent: '#0E1A35',     // navy
    accentInk: '#FBF7EE',
    gold: '#B5894A',
    serif: '"Source Serif Pro", "Source Serif 4", Georgia, serif',
    sans: '"Inter Tight", "Manrope", -apple-system, system-ui, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", monospace',
    radius: 14,
  },
  athletic: {
    name: 'Dark Athletic',
    bg: '#0B0E14',
    bgElev: '#11151D',
    surface: '#171C26',
    ink: '#F4F6FA',
    inkSoft: '#C5CCD9',
    inkMuted: '#7B8499',
    rule: 'rgba(255,255,255,0.08)',
    accent: '#E8FF5A',
    accentInk: '#0B0E14',
    gold: '#E8FF5A',
    serif: '"Inter Tight", system-ui, sans-serif',
    sans: '"Inter Tight", "Manrope", -apple-system, system-ui, sans-serif',
    mono: '"JetBrains Mono", monospace',
    radius: 10,
  },
  fintech: {
    name: 'Clean Fintech',
    bg: '#F6F7F9',
    bgElev: '#FFFFFF',
    surface: '#FFFFFF',
    ink: '#0F172A',
    inkSoft: '#475569',
    inkMuted: '#94A3B8',
    rule: 'rgba(15,23,42,0.08)',
    accent: '#4F46E5',
    accentInk: '#FFFFFF',
    gold: '#4F46E5',
    serif: '"Inter Tight", system-ui, sans-serif',
    sans: '"Inter Tight", "Manrope", -apple-system, system-ui, sans-serif',
    mono: '"JetBrains Mono", monospace',
    radius: 12,
  },
};

const STATUS = {
  green:  '#43A047',
  yellow: '#F9A825',
  red:    '#E53935',
  gray:   '#94928C',
};

// ── Icons (line set, 18px default) ─────────────────────────────────────────
const Icon = ({ name, size = 18, color = 'currentColor', stroke = 1.7 }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home':       return <svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case 'book':       return <svg {...p}><path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3V4z" /><path d="M4 4v13a3 3 0 003 3h12" /></svg>;
    case 'plus':       return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'chart':      return <svg {...p}><path d="M3 21h18" /><path d="M6 17V10M11 17V6M16 17v-9M21 17v-4" /></svg>;
    case 'user':       return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg>;
    case 'cog':        return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09c0 .67.39 1.27 1 1.51a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.24.61.84 1 1.51 1H21a2 2 0 110 4h-.09c-.67 0-1.27.39-1.51 1z"/></svg>;
    case 'check':      return <svg {...p}><path d="M4 12l5 5 11-11" /></svg>;
    case 'x':          return <svg {...p}><path d="M6 6l12 12M6 18L18 6" /></svg>;
    case 'chev-r':     return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case 'chev-l':     return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>;
    case 'chev-d':     return <svg {...p}><path d="M6 9l6 6 6-6" /></svg>;
    case 'chev-u':     return <svg {...p}><path d="M6 15l6-6 6 6" /></svg>;
    case 'alert':      return <svg {...p}><path d="M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0zM12 9v4M12 17h.01" /></svg>;
    case 'cal':        return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>;
    case 'star':       return <svg {...p}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
    case 'star-fill':  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
    case 'wifi-off':   return <svg {...p}><path d="M2 8.82a15 15 0 0120 0M5 12.86a10 10 0 0114 0M8.5 16.43a5 5 0 017 0M12 20h.01M2 2l20 20" /></svg>;
    case 'sync':       return <svg {...p}><path d="M21 12a9 9 0 01-15 6.7L3 16M3 12a9 9 0 0115-6.7L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></svg>;
    case 'cash':       return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4M18 10v4"/></svg>;
    case 'briefcase':  return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>;
    case 'shield':     return <svg {...p}><path d="M12 2l8 4v6c0 5-3.5 9.3-8 10-4.5-.7-8-5-8-10V6l8-4z"/></svg>;
    case 'tag':        return <svg {...p}><path d="M20 12L12 4H4v8l8 8 8-8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>;
    case 'bell':       return <svg {...p}><path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 21a2 2 0 004 0"/></svg>;
    case 'edit':       return <svg {...p}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    case 'doc':        return <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>;
    case 'sun':        return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
    case 'moon':       return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    case 'logout':     return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;

    // ── Premium nav icons (gsTeam custom set) ─────────────────────────────
    // Unique to the floating tab bar; designed to feel editorial + modern,
    // with a small accent dot on each so they read as a family.
    case 'nav-today':
      // Sunrise wave + gold dot accent — represents "today's prompts" / fresh start
      return <svg {...p}><path d="M3 18h18"/><path d="M5 14a7 7 0 0114 0"/><path d="M12 4v3"/><path d="M5.5 7.5l1.5 1.5M18.5 7.5L17 9"/><circle cx="12" cy="14" r="0.6" fill={color} stroke="none"/></svg>;
    case 'nav-accounts':
      // Storefront silhouette — the clients are gyms/studios. Awning + door.
      return <svg {...p}><path d="M3 9l2-4h14l2 4"/><path d="M4 9v11h16V9"/><path d="M10 20v-6h4v6"/><path d="M3 9h18"/></svg>;
    case 'nav-log':
      // Plus sign with subtle inner ring — "create" affordance
      return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>;
    case 'nav-score':
      // Bar chart with rising trend arrow — represents the scorecard
      return <svg {...p}><path d="M4 20V11M10 20V7M16 20v-4M22 20H2"/><path d="M4 7l6-3 6 5 6-4"/></svg>;
    case 'nav-me':
      // Avatar circle with ring — refined profile glyph
      return <svg {...p}><circle cx="12" cy="9" r="3.5"/><path d="M5 20a7 7 0 0114 0"/><circle cx="12" cy="12" r="10"/></svg>;

    default: return null;
  }
};

// ── Status pill (R/Y/G) ─────────────────────────────────────────────────────
function StatusPill({ status, size = 'sm' }) {
  const colors = {
    green:  { bg: 'rgba(67,160,71,0.12)',  fg: '#2E7D32', dot: STATUS.green },
    yellow: { bg: 'rgba(249,168,37,0.14)', fg: '#A06800', dot: STATUS.yellow },
    red:    { bg: 'rgba(229,57,53,0.12)',  fg: '#C62828', dot: STATUS.red },
    gray:   { bg: 'rgba(148,146,140,0.14)',fg: '#5C5A56', dot: STATUS.gray },
  };
  const labels = { green: 'On track', yellow: 'Watch', red: 'At risk', gray: 'No data' };
  const c = colors[status] || colors.gray;
  const fs = size === 'lg' ? 13 : 11;
  const pad = size === 'lg' ? '5px 10px 5px 8px' : '3px 8px 3px 6px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: c.bg, color: c.fg, borderRadius: 999, padding: pad,
      fontSize: fs, fontWeight: 600, letterSpacing: 0.1, lineHeight: 1,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: c.dot }} />
      {labels[status]}
    </span>
  );
}

// ── Score ring ──────────────────────────────────────────────────────────────
function ScoreRing({ value, size = 96, stroke = 8, color, bg = 'rgba(0,0,0,0.07)', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  const offset = c * (1 - v);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} stroke={bg} strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.2,.7,.3,1)' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      }}>{label}</div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
function Card({ children, theme, padding = 16, style = {}, onClick, role, ...rest }) {
  // When onClick is provided, render as an interactive element so click +
  // keyboard activation work. Without this branch the handler was silently
  // dropped (Bobby 2026-05-04 "tap to edit doesn't work"). Any extra props
  // (aria-label, data-*, etc.) flow through via ...rest.
  const interactive = typeof onClick === 'function';
  const baseStyle = {
    background: theme.surface, borderRadius: theme.radius,
    border: `1px solid ${theme.rule}`,
    padding,
    ...(interactive ? { cursor: 'pointer' } : null),
    ...style,
  };
  if (interactive) {
    return (
      <div
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } }}
        role={role || 'button'}
        tabIndex={0}
        style={baseStyle}
        {...rest}
      >{children}</div>
    );
  }
  return <div style={baseStyle} {...rest}>{children}</div>;
}

// ── Button ─────────────────────────────────────────────────────────────────
function Button({ children, onClick, variant = 'primary', theme, fullWidth = false, disabled = false, size = 'md', icon, type = 'button', loading = false }) {
  const sizes = {
    sm: { h: 38, fs: 14, px: 14, r: 10 },
    md: { h: 48, fs: 15, px: 18, r: 12 },
    lg: { h: 56, fs: 16, px: 22, r: 14 },
  };
  const s = sizes[size];
  const variants = {
    primary:   { bg: theme.accent, fg: theme.accentInk, border: 'transparent', shadow: '0 2px 6px rgba(14,26,53,0.10)' },
    secondary: { bg: theme.surface, fg: theme.ink, border: theme.rule, shadow: 'none' },
    ghost:     { bg: 'transparent', fg: theme.ink, border: 'transparent', shadow: 'none' },
    danger:    { bg: '#E53935', fg: '#fff', border: 'transparent', shadow: '0 2px 6px rgba(229,57,53,0.18)' },
  };
  const v = variants[variant];
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className="cabt-btn-press"
      style={{
        height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs, fontWeight: 600,
        background: v.bg, color: v.fg, border: `1px solid ${v.border}`,
        boxShadow: v.shadow,
        borderRadius: s.r, cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1, width: fullWidth ? '100%' : 'auto',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'inherit', letterSpacing: -0.1,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        position: 'relative',
      }}
    >
      {loading && (
        <span style={{
          width: s.fs + 2, height: s.fs + 2, borderRadius: '50%',
          border: `2px solid ${v.fg}55`, borderTopColor: v.fg,
          animation: 'spin 0.7s linear infinite',
          display: 'inline-block', marginRight: 4,
        }}/>
      )}
      {!loading && icon && <Icon name={icon} size={s.fs + 2} />}
      {children}
    </button>
  );
}

// ── Form Field ─────────────────────────────────────────────────────────────
function Field({ label, required, error, hint, children, theme }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: STATUS.red, marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {error && <span style={{ fontSize: 12, color: STATUS.red, fontWeight: 500 }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: theme.inkMuted }}>{hint}</span>}
    </label>
  );
}

function Input({ value, onChange, type = 'text', placeholder, theme, prefix, suffix, inputmode, autoFocus, error }) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = error ? STATUS.red : (focused ? theme.accent : theme.rule);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 48,
      background: theme.bgElev,
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      padding: '0 14px',
      transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
      boxShadow: focused
        ? `0 0 0 3px ${error ? STATUS.red + '33' : theme.accent + '33'}`
        : 'none',
    }}>
      {prefix && <span style={{ color: theme.inkMuted, marginRight: 8, fontSize: 15 }}>{prefix}</span>}
      <input
        type={type}
        inputMode={inputmode}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          flex: 1, height: '100%', border: 'none', background: 'transparent',
          fontSize: 16, color: theme.ink, outline: 'none', fontFamily: 'inherit',
          minWidth: 0,
        }}
      />
      {suffix && <span style={{ color: theme.inkMuted, marginLeft: 8, fontSize: 15 }}>{suffix}</span>}
    </div>
  );
}

// Polished textarea — matches Input visual treatment.
// Use for multi-line text fields (notes, comments, descriptions).
function Textarea({ value, onChange, placeholder, theme, rows = 3, error, autoFocus, maxLength }) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = error ? STATUS.red : (focused ? theme.accent : theme.rule);
  return (
    <div style={{
      display: 'flex',
      background: theme.bgElev,
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      padding: '12px 14px',
      transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
      boxShadow: focused
        ? `0 0 0 3px ${error ? STATUS.red + '33' : theme.accent + '33'}`
        : 'none',
    }}>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        maxLength={maxLength}
        style={{
          flex: 1, width: '100%',
          border: 'none', background: 'transparent',
          fontSize: 15, lineHeight: 1.5, color: theme.ink,
          outline: 'none', fontFamily: 'inherit',
          resize: 'vertical', minHeight: rows * 22,
          minWidth: 0,
        }}
      />
    </div>
  );
}

// Custom branded dropdown — replaces native <select> so we can fully style
// the options panel. Renders via React portal to document.body so it escapes
// any parent with overflow: hidden (the Body container, scroll wrappers, etc).
// Position is computed from the trigger button's getBoundingClientRect.
function Select({ value, onChange, options, theme, placeholder = '— select —', disabled = false, searchable }) {
  const [open, setOpen] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(-1);
  const [pos, setPos] = React.useState(null); // {left, top, width, dropUp}
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const searchRef = React.useRef(null);

  const norm = React.useMemo(() => options.map(o => (
    typeof o === 'object' ? { value: o.value, label: o.label } : { value: o, label: o }
  )), [options]);
  const selected = norm.find(o => String(o.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;
  const hasValue = !!selected;

  // Auto-enable search when there are many options. Caller can force on/off.
  const showSearch = searchable !== undefined ? searchable : norm.length >= 8;
  const filtered = React.useMemo(() => {
    if (!showSearch || !query.trim()) return norm;
    const q = query.trim().toLowerCase();
    return norm.filter(o => String(o.label).toLowerCase().includes(q));
  }, [norm, query, showSearch]);

  // Compute panel position from trigger rect. Prefers below; flips above if no room.
  const computePos = React.useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const PANEL_MAX = 280;
    const SPACE_BELOW = window.innerHeight - r.bottom;
    const SPACE_ABOVE = r.top;
    const dropUp = SPACE_BELOW < 200 && SPACE_ABOVE > SPACE_BELOW;
    setPos({
      left: r.left, top: dropUp ? r.top : r.bottom,
      width: r.width,
      maxHeight: Math.max(160, Math.min(PANEL_MAX, dropUp ? SPACE_ABOVE - 16 : SPACE_BELOW - 16)),
      dropUp,
    });
  }, []);

  // Close on outside click / scroll / resize
  React.useEffect(() => {
    if (!open) return;
    computePos();
    const onDoc = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = () => computePos();
    const onResize = () => computePos();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, computePos]);

  React.useEffect(() => {
    if (!open) { setFocusIdx(-1); setQuery(''); return; }
    const idx = filtered.findIndex(o => String(o.value) === String(value));
    setFocusIdx(idx >= 0 ? idx : 0);
    // Auto-focus the search box when opened (skips on touch keyboards via timeout)
    if (showSearch) {
      setTimeout(() => { try { searchRef.current?.focus(); } catch (_e) {} }, 0);
    }
  }, [open]);

  // Reset focus when filter changes
  React.useEffect(() => {
    if (!open) return;
    setFocusIdx(filtered.length > 0 ? 0 : -1);
  }, [query]);

  const onKey = (e) => {
    if (disabled) return;
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(filtered.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focusIdx >= 0 && focusIdx < filtered.length) {
        onChange(filtered[focusIdx].value); setOpen(false);
      }
    }
  };

  const panel = (open && pos) ? (
    <div
      ref={panelRef}
      role="listbox"
      style={{
        position: 'fixed',
        left: pos.left,
        ...(pos.dropUp
          ? { bottom: window.innerHeight - pos.top + 6 }
          : { top: pos.top + 6 }),
        width: pos.width,
        background: theme.bgElev,
        border: `1px solid ${theme.rule}`,
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.22), 0 4px 8px rgba(0,0,0,0.1)',
        padding: 4,
        maxHeight: pos.maxHeight, overflowY: 'auto',
        zIndex: 9999,
        animation: 'modalIn 0.18s ease',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {showSearch && (
        <div style={{ padding: 4, position: 'sticky', top: 0, background: theme.bgElev, zIndex: 1, borderBottom: `1px solid ${theme.rule}` }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Search ${norm.length} options…`}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', borderRadius: 8,
              background: theme.bg, border: `1px solid ${theme.rule}`,
              color: theme.ink, fontSize: 14, fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>
      )}
      {filtered.length === 0 && (
        <div style={{ padding: '12px 14px', fontSize: 14, color: theme.inkMuted }}>
          {query ? `No matches for "${query}"` : 'No options'}
        </div>
      )}
      {filtered.map((o, i) => {
        const isSelected = String(o.value) === String(value);
        const isFocused = i === focusIdx;
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={isSelected}
            onMouseEnter={() => setFocusIdx(i)}
            onClick={() => { onChange(o.value); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              width: '100%', padding: '11px 12px',
              background: isFocused ? theme.accent + '20' : 'transparent',
              border: 'none', borderRadius: 8,
              color: theme.ink,
              fontSize: 15, fontWeight: isSelected ? 700 : 500,
              fontFamily: 'inherit', cursor: 'pointer',
              textAlign: 'left',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.1s ease',
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            {isSelected && (
              <span style={{ color: theme.accent, display: 'inline-flex' }}>
                <Icon name="check" size={16} stroke={2.4}/>
              </span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cabt-btn-press"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', height: 48,
          background: theme.bgElev,
          border: `1px solid ${open ? theme.accent : theme.rule}`,
          borderRadius: 12, padding: '0 14px',
          transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
          boxShadow: open ? `0 0 0 3px ${theme.accent}33` : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          fontFamily: 'inherit', fontSize: 16,
          color: hasValue ? theme.ink : theme.inkMuted,
          textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
        <span style={{
          display: 'inline-flex',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s ease',
          color: theme.inkMuted,
        }}>
          <Icon name="chev-d" size={16}/>
        </span>
      </button>
      {/* Render panel via portal so it escapes any parent with overflow: hidden */}
      {panel && typeof document !== 'undefined' && ReactDOM.createPortal(panel, document.body)}
    </>
  );
}

function Toggle({ value, onChange, theme }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', width: 52, height: 30, borderRadius: 999,
        background: value ? theme.accent : 'rgba(0,0,0,0.18)',
        border: 'none', cursor: 'pointer', padding: 0,
        transition: 'background .15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 25 : 3,
        width: 24, height: 24, borderRadius: 999, background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left .15s',
      }} />
    </button>
  );
}

function StarRating({ value, onChange, theme }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            width: 44, height: 44, border: 'none', background: 'transparent',
            cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon
            name={n <= value ? 'star-fill' : 'star'}
            size={28}
            color={n <= value ? theme.gold : theme.inkMuted}
          />
        </button>
      ))}
    </div>
  );
}

// ── Banner / Alert ──────────────────────────────────────────────────────────
function Banner({ tone = 'warning', icon = 'alert', title, children, action, onAction, theme }) {
  const tones = {
    warning: { bg: 'rgba(249,168,37,0.10)', fg: '#8C5A00', border: 'rgba(249,168,37,0.35)' },
    error:   { bg: 'rgba(229,57,53,0.08)',  fg: '#A6322F', border: 'rgba(229,57,53,0.3)' },
    info:    { bg: 'rgba(14,26,53,0.05)',   fg: theme.ink, border: theme.rule },
    success: { bg: 'rgba(67,160,71,0.10)',  fg: '#2E7D32', border: 'rgba(67,160,71,0.3)' },
  };
  const t = tones[tone];
  return (
    <div style={{
      background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
      borderRadius: theme.radius - 2, padding: '12px 14px',
      display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14,
    }}>
      <div style={{ flexShrink: 0, paddingTop: 1 }}>
        <Icon name={icon} size={18} />
      </div>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        {title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>}
        {children}
      </div>
      {action && (
        <button
          onClick={onAction}
          style={{
            background: 'transparent', border: 'none', color: t.fg,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 4,
            whiteSpace: 'nowrap', textDecoration: 'underline',
          }}
        >{action}</button>
      )}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
function Tabs({ tabs, value, onChange, theme }) {
  return (
    <div style={{
      display: 'flex', gap: 0, borderBottom: `1px solid ${theme.rule}`,
      overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
    }}>
      {tabs.map(t => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              padding: '12px 14px', border: 'none', background: 'transparent',
              fontSize: 14, fontWeight: active ? 700 : 500,
              color: active ? theme.ink : theme.inkMuted,
              borderBottom: `2px solid ${active ? theme.accent : 'transparent'}`,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              marginBottom: -1,
            }}
          >{t.label}</button>
        );
      })}
    </div>
  );
}

// ── Branded confirm dialog (replaces native window.confirm) ──────────────
// Renders centered on viewport via portal, sized for both mobile + desktop.
// Backdrop click + Escape both cancel.
function ConfirmDialog({ open, theme, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancel && onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const dangerColor = '#C62828';
  const dialog = (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cabt-confirm-title"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(8, 12, 24, 0.55)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding:
          'max(env(safe-area-inset-top), 20px)' +
          ' max(env(safe-area-inset-right), 20px)' +
          ' max(env(safe-area-inset-bottom), 20px)' +
          ' max(env(safe-area-inset-left), 20px)',
        animation: 'scrimIn 0.18s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400,
          background: theme.bg, color: theme.ink,
          borderRadius: 18,
          padding: '24px 22px 20px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.14)',
          animation: 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          fontFamily: theme.sans,
        }}
      >
        <div id="cabt-confirm-title" style={{
          fontFamily: theme.serif || 'inherit',
          fontSize: 20, fontWeight: 600, color: theme.ink,
          letterSpacing: -0.3, lineHeight: 1.25, marginBottom: 8,
        }}>{title}</div>
        {message && (
          <div style={{
            fontSize: 14, color: theme.inkMuted, lineHeight: 1.55, marginBottom: 22,
          }}>{message}</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            className="cabt-btn-press"
            style={{
              flex: 1, padding: '13px 16px', borderRadius: 12,
              background: 'transparent', color: theme.ink,
              border: `1.5px solid ${theme.rule}`,
              fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >{cancelLabel}</button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="cabt-btn-press"
            style={{
              flex: 1.2, padding: '13px 16px', borderRadius: 12,
              background: danger ? dangerColor : theme.accent,
              color: danger ? '#FFFFFF' : theme.accentInk,
              border: 'none',
              fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              boxShadow: danger
                ? '0 4px 12px rgba(198,40,40,0.30)'
                : `0 4px 12px ${theme.accent}55`,
            }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );

  return (typeof document !== 'undefined' && ReactDOM.createPortal)
    ? ReactDOM.createPortal(dialog, document.body)
    : dialog;
}

Object.assign(window, {
  THEMES, STATUS, Icon, StatusPill, ScoreRing, Card, Button,
  Field, Input, Textarea, Select, Toggle, StarRating, Banner, Tabs,
  ConfirmDialog,
});
