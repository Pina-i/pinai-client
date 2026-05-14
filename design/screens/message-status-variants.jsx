// Six status-badge variants — flat row layout (no bubbles).
// Sender = Maia (sage avatar). Self = Alice (chat-tinted name).
// All threads end with a self message landing in `read` state.

const Tick = ({ color = 'currentColor', size = 12, double, stroke = 2 }) => (
  <svg width={size * (double ? 1.5 : 1)} height={size}
    viewBox={double ? '0 0 18 12' : '0 0 12 12'} fill="none"
    stroke={color} strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round">
    <path d={double ? 'M1 7l3 3 6-7' : 'M1 7l3 3 7-8'}/>
    {double && <path d="M7 7l3 3 7-8"/>}
  </svg>
);

const Spinner = ({ size = 11, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16"
    style={{animation:'pn-spin 1.1s linear infinite'}}>
    <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="2"/>
    <path d="M8 2a6 6 0 016 6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

function LegendRow({ items }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:'6px 16px', marginTop:12,
      paddingTop:10, borderTop:'1px dashed var(--border)'}}>
      {items.map(([badge, label], i) => (
        <span key={i} style={{display:'inline-flex', alignItems:'center', gap:6,
          fontSize:10, color:'var(--muted-foreground)',
          fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
          {badge}
          <span style={{textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</span>
        </span>
      ))}
    </div>
  );
}

const MAIA = 'oklch(0.72 0.07 330)';

// ── A · Ticks next to timestamp on first row ─────────────────────────────
function VariantTicks() {
  return (
    <Thread label="A · ticks" desc="Tick set sits beside the timestamp on the first row.">
      <MsgRow first name="Maia" color={MAIA} time="11:23">
        I'll review the lantern proto tonight.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:24"
        status={<Tick color="var(--muted-foreground)" double/>}>
        Took your notes — re-cropped the hero shot.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:26"
        status={<Tick color="var(--chat)" double/>}>
        Pushed v3 just now. Let me know what you think.
      </MsgRow>
      <LegendRow items={[
        [<Spinner color="var(--muted-foreground)"/>, 'sending'],
        [<Tick color="var(--muted-foreground)"/>, 'sent'],
        [<Tick color="var(--muted-foreground)" double/>, 'delivered'],
        [<Tick color="var(--chat)" double/>, 'read'],
      ]}/>
    </Thread>
  );
}

// ── B · Text label after timestamp ───────────────────────────────────────
function VariantText() {
  const tag = (label, color = 'var(--muted-foreground)') => (
    <Mono style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase',
      color, padding:'1px 6px', borderRadius:4,
      background:`color-mix(in oklab, ${color} 14%, transparent)`}}>{label}</Mono>
  );
  return (
    <Thread label="B · text label" desc="Quiet pill next to the timestamp. No glyphs.">
      <MsgRow first name="Maia" color={MAIA} time="11:23">
        I'll review the lantern proto tonight.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:24"
        status={tag('delivered')}>
        Took your notes — re-cropped the hero shot.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:26"
        status={tag('read', 'var(--chat)')}>
        Pushed v3 just now. Let me know what you think.
      </MsgRow>
      <LegendRow items={[
        [tag('sending…'), ''],
        [tag('sent'), ''],
        [tag('delivered'), ''],
        [tag('read', 'var(--chat)'), ''],
      ]}/>
    </Thread>
  );
}

// ── C · Avatar pip (recipient avatar trails the last read message) ───────
function VariantAvatarPip() {
  return (
    <Thread label="C · avatar pip" desc="Recipient's avatar slips after the last message they've read.">
      <MsgRow first name="Maia" color={MAIA} time="11:23">
        I'll review the lantern proto tonight.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:24">
        Took your notes — re-cropped the hero shot.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:26"
        statusInline={
          <span style={{display:'inline-flex', alignItems:'center', gap:6,
            opacity:0.95}}>
            <Mono style={{fontSize:10, color:'var(--chat)',
              letterSpacing:'0.06em', textTransform:'uppercase', fontWeight:600}}>seen</Mono>
            <Avatar name="Maia" color={MAIA} size={16}/>
          </span>
        }>
        Pushed v3 just now. Let me know what you think.
      </MsgRow>
      <LegendRow items={[
        [<Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.06em'}}>—</Mono>, 'sent · no glyph'],
        [<Avatar name="M" color={MAIA} size={14}/>, 'read'],
      ]}/>
    </Thread>
  );
}

// ── D · Left accent rule on the message row ─────────────────────────────
function VariantAccent() {
  // Three states stacked: sent / delivered / read shown by left border color.
  const Row = ({ first, time, body, accent, label, color }) => (
    <div style={{display:'flex', gap:14, padding: first ? '14px 0 2px' : '0 0 2px 54px',
      alignItems:'flex-start', position:'relative'}}>
      {first && <Avatar name="Alice" color="var(--chat)" size={40}/>}
      {/* accent bar — sits flush in the gutter */}
      <div style={{position:'absolute',
        left: first ? 54 : 54, top: first ? 18 : 0, bottom:2,
        width:2, borderRadius:2, background: accent}}/>
      <div style={{flex:1, minWidth:0, paddingLeft:8}}>
        {first && (
          <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:3}}>
            <Serif style={{fontSize:14.5, fontWeight:500, color:'var(--chat)'}}>Alice</Serif>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{time}</Mono>
            <Mono style={{fontSize:10, color, letterSpacing:'0.08em',
              textTransform:'uppercase', fontWeight:600}}>{label}</Mono>
          </div>
        )}
        <div style={{fontSize:13.5, lineHeight:1.55, color:'var(--foreground)'}}>{body}</div>
      </div>
    </div>
  );
  return (
    <Thread label="D · accent rule" desc="A 2px coloured rule in the avatar gutter encodes status.">
      <MsgRow first name="Maia" color={MAIA} time="11:23">
        I'll review the lantern proto tonight.
      </MsgRow>
      <Row first time="11:24" accent="var(--border-strong)" label="delivered"
        color="var(--muted-foreground)"
        body="Took your notes — re-cropped the hero shot."/>
      <Row first time="11:26" accent="var(--chat)" label="read"
        color="var(--chat)"
        body="Pushed v3 just now. Let me know what you think."/>
      <LegendRow items={[
        [<span style={{display:'inline-block', width:2, height:14,
          background:'var(--border-strong)', borderRadius:2}}/>, 'sent / delivered'],
        [<span style={{display:'inline-block', width:2, height:14,
          background:'var(--chat)', borderRadius:2}}/>, 'read'],
      ]}/>
    </Thread>
  );
}

// ── E · Trailing meta — tick aligned to right edge of message line ───────
function VariantTrailing() {
  return (
    <Thread label="E · trailing meta" desc="Time + tick floated to the right edge of each self line.">
      <MsgRow first name="Maia" color={MAIA} time="11:23">
        I'll review the lantern proto tonight.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:24"
        statusInline={
          <span style={{display:'inline-flex', alignItems:'center', gap:5,
            color:'var(--muted-foreground)'}}>
            <Mono style={{fontSize:10, letterSpacing:'0.06em'}}>11:24</Mono>
            <Tick color="currentColor" double/>
          </span>
        }>
        Took your notes — re-cropped the hero shot.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:26"
        statusInline={
          <span style={{display:'inline-flex', alignItems:'center', gap:5,
            color:'var(--chat)'}}>
            <Mono style={{fontSize:10, letterSpacing:'0.06em'}}>11:26</Mono>
            <Tick color="currentColor" double/>
          </span>
        }>
        Pushed v3 just now. Let me know what you think.
      </MsgRow>
      <LegendRow items={[
        [<Tick color="var(--muted-foreground)" size={11}/>, 'sent'],
        [<Tick color="var(--muted-foreground)" double size={11}/>, 'delivered'],
        [<Tick color="var(--chat)" double size={11}/>, 'read'],
      ]}/>
    </Thread>
  );
}

// ── F · Seen chip under the last read self message ──────────────────────
function VariantSeenChip() {
  return (
    <Thread label="F · seen chip" desc="A single pill below the last message Maia has read.">
      <MsgRow first name="Maia" color={MAIA} time="11:23">
        I'll review the lantern proto tonight.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:24">
        Took your notes — re-cropped the hero shot.
      </MsgRow>
      <MsgRow first self name="Alice" color="var(--chat)" time="11:26">
        Pushed v3 just now. Let me know what you think.
      </MsgRow>
      <div style={{paddingLeft:54, marginTop:5, marginBottom:2}}>
        <span style={{display:'inline-flex', alignItems:'center', gap:7,
          padding:'3px 9px 3px 4px', borderRadius:11,
          background:'color-mix(in oklab, var(--chat) 14%, transparent)',
          color:'var(--chat)'}}>
          <Avatar name="Maia" color={MAIA} size={16}/>
          <Mono style={{fontSize:10, letterSpacing:'0.08em',
            textTransform:'uppercase', fontWeight:600}}>Seen 11:26</Mono>
        </span>
      </div>
      <LegendRow items={[
        [<Mono style={{fontSize:10, color:'var(--muted-foreground)',
          letterSpacing:'0.06em'}}>—</Mono>, 'sent / delivered'],
        [<Avatar name="M" color={MAIA} size={14}/>, 'read'],
      ]}/>
    </Thread>
  );
}

Object.assign(window, {
  VariantTicks, VariantText, VariantAvatarPip,
  VariantAccent, VariantTrailing, VariantSeenChip,
});
