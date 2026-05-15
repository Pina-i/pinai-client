// Message hover action bar — proposals
// Shows the same conversation snippet with a hovered message revealing
// an action bar. Sender ("self") rows get edit + delete; receiver rows
// don't. Four directions: floating pill, quick-react palette, editorial
// monospace labels, compact icon stack. Plus a specimen sheet.

// ── extra icons local to this screen ─────────────────────────────────────
const MaIcons = {
  copy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2"/>
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5M7 10 5 12l7 1 1 7 2-2-1-4 4-4-7-1-1-7-2 2z"/>
    </svg>
  ),
  forward: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14l5-5-5-5"/>
      <path d="M20 9H10a6 6 0 0 0-6 6v3"/>
    </svg>
  ),
  bookmark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  smilePlus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5A8.5 8.5 0 0 1 4 11.5 8.38 8.38 0 0 1 12.5 3c1.32 0 2.59.31 3.5.86"/>
      <path d="M8.5 14s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5"/>
      <path d="M9 9h.01M15 9h.01"/>
      <path d="M19 2v6M22 5h-6"/>
    </svg>
  ),
};

const QUICK_REACTIONS = ['🌿','✦','♥','✓','✺','✿'];

// ── A small simplified Msg shell scoped to this screen ──────────────────
function MaMsg({ first, self, name, color, time, children, highlighted, hoverNode }) {
  return (
    <div
      style={{
        display:'flex', gap:14,
        padding: first ? '14px 8px 4px' : '0 8px 4px 62px',
        alignItems:'flex-start',
        position:'relative',
        background: highlighted
          ? 'color-mix(in oklab, var(--chat) 4%, transparent)'
          : 'transparent',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {first && <Avatar name={name} color={color} size={40}/>}
      <div style={{flex:1, minWidth:0}}>
        {first && (
          <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:3}}>
            <Serif style={{fontSize:14.5, fontWeight:500, color: self ? 'var(--chat)' : 'var(--foreground)'}}>{name}</Serif>
            <Mono style={{fontSize:10.5, color:'var(--muted-foreground)'}}>{time}</Mono>
          </div>
        )}
        <div style={{fontSize:13.5, lineHeight:1.55, color:'var(--foreground)', textWrap:'pretty'}}>
          {children}
        </div>
      </div>
      {hoverNode}
    </div>
  );
}

// ── shared building blocks ──────────────────────────────────────────────
function ActBtn({ icon, title, accent, danger, dense }) {
  const size = dense ? 26 : 28;
  return (
    <button
      title={title}
      style={{
        width:size, height:size, padding:0, border:'none',
        borderRadius:'var(--radius-sm)',
        background:'transparent',
        color: danger ? 'var(--destructive)'
          : accent ? 'var(--chat)'
          : 'var(--muted-foreground)',
        cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
    >{icon}</button>
  );
}

function VSep() {
  return <div style={{width:1, alignSelf:'stretch', margin:'4px 1px', background:'var(--border)'}}/>;
}

// ── A · floating pill toolbar ───────────────────────────────────────────
function BarPill({ self }) {
  return (
    <div
      style={{
        position:'absolute', top:-14, right:14, zIndex:2,
        display:'flex', alignItems:'center', gap:1,
        padding:'3px 4px',
        background:'var(--popover)',
        border:'1px solid var(--border-strong)',
        borderRadius:999,
        boxShadow:'0 10px 24px oklch(0.05 0.005 60 / 0.45), 0 2px 4px oklch(0.05 0.005 60 / 0.4)',
        fontFamily:'inherit',
      }}
    >
      <ActBtn icon={MaIcons.smilePlus} title="Add reaction"/>
      <ActBtn icon={Icons.reply}       title="Reply"/>
      <ActBtn icon={MaIcons.copy}      title="Copy"/>
      {self && <ActBtn icon={MaIcons.edit} title="Edit"/>}
      <VSep/>
      <ActBtn icon={Icons.more} title="More"/>
    </div>
  );
}

// ── B · quick reactions + overflow ──────────────────────────────────────
function BarQuickReact({ self }) {
  return (
    <div
      style={{
        position:'absolute', top:-16, right:14, zIndex:2,
        display:'flex', alignItems:'center', gap:2,
        padding:'4px 6px',
        background:'var(--popover)',
        border:'1px solid var(--border-strong)',
        borderRadius:999,
        boxShadow:'0 12px 28px oklch(0.05 0.005 60 / 0.5)',
      }}
    >
      {QUICK_REACTIONS.map((e, i) => (
        <button
          key={e}
          title={`React ${e}`}
          style={{
            width:26, height:26, padding:0, border:'none',
            borderRadius:'50%',
            background: i === 0 ? 'color-mix(in oklab, var(--chat) 18%, transparent)' : 'transparent',
            cursor:'pointer',
            fontSize:13, lineHeight:1,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--foreground)',
          }}
        >{e}</button>
      ))}
      <ActBtn dense icon={MaIcons.smilePlus} title="More reactions"/>
      <VSep/>
      <ActBtn dense icon={Icons.reply}  title="Reply"/>
      <ActBtn dense icon={MaIcons.copy} title="Copy"/>
      {self && <ActBtn dense icon={MaIcons.edit} title="Edit"/>}
      <ActBtn dense icon={Icons.more}   title="More"/>
    </div>
  );
}

// ── C · editorial monospace labels ──────────────────────────────────────
function LabelBtn({ children, danger, accent }) {
  return (
    <button
      style={{
        padding:'5px 9px', border:'none', background:'transparent',
        fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
        letterSpacing:'0.1em', textTransform:'uppercase',
        color: danger ? 'var(--destructive)'
          : accent ? 'var(--chat)'
          : 'var(--muted-foreground)',
        cursor:'pointer', borderRadius:4,
      }}
    >{children}</button>
  );
}

function BarEditorial({ self }) {
  return (
    <div
      style={{
        position:'absolute', top:-14, right:18, zIndex:2,
        display:'flex', alignItems:'center', gap:0,
        padding:'2px 4px',
        background:'var(--popover)',
        border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius-sm)',
        boxShadow:'0 8px 22px oklch(0.05 0.005 60 / 0.42)',
      }}
    >
      <span style={{
        padding:'5px 8px 5px 10px',
        fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
        letterSpacing:'0.1em', textTransform:'uppercase',
        color:'var(--chat)', display:'flex', alignItems:'center', gap:6,
      }}>
        <span style={{fontSize:11}}>🌿</span>
        <span>React</span>
      </span>
      <VSep/>
      <LabelBtn>Reply</LabelBtn>
      <LabelBtn>Copy</LabelBtn>
      {self && <LabelBtn>Edit</LabelBtn>}
      {self && <LabelBtn danger>Delete</LabelBtn>}
      {!self && <LabelBtn>Pin</LabelBtn>}
      <VSep/>
      <LabelBtn>···</LabelBtn>
    </div>
  );
}

// ── D · compact stack on the edge ───────────────────────────────────────
function BarEdge({ self }) {
  return (
    <div
      style={{
        position:'absolute', top:'50%', right:8, zIndex:2,
        transform:'translateY(-50%)',
        display:'flex', flexDirection:'column', gap:2,
        padding:'4px 3px',
        background:'var(--popover)',
        border:'1px solid var(--border-strong)',
        borderRadius:'var(--radius)',
        boxShadow:'0 8px 20px oklch(0.05 0.005 60 / 0.42)',
      }}
    >
      <ActBtn dense icon={MaIcons.smilePlus} title="React"/>
      <ActBtn dense icon={Icons.reply}       title="Reply"/>
      <ActBtn dense icon={MaIcons.copy}      title="Copy"/>
      {self && <ActBtn dense icon={MaIcons.edit} title="Edit"/>}
      <div style={{height:1, background:'var(--border)', margin:'2px 4px'}}/>
      <ActBtn dense icon={Icons.more} title="More"/>
    </div>
  );
}

// ── E · overflow menu when "···" is clicked (shown alongside pill) ──────
function OverflowMenu({ self, top = 24, right = 14 }) {
  const items = self
    ? [
        ['Reply',       Icons.reply,      false, false],
        ['Forward',     MaIcons.forward,  false, false],
        ['Copy text',   MaIcons.copy,     false, false],
        ['Edit message',MaIcons.edit,     false, true],
        ['Pin to chat', MaIcons.pin,      false, false],
        ['Bookmark',    MaIcons.bookmark, false, false],
        ['__sep'],
        ['Delete',      MaIcons.trash,    true,  false],
      ]
    : [
        ['Reply',        Icons.reply,      false, false],
        ['Forward',      MaIcons.forward,  false, false],
        ['Copy text',    MaIcons.copy,     false, false],
        ['Pin to chat',  MaIcons.pin,      false, false],
        ['Bookmark',     MaIcons.bookmark, false, false],
        ['__sep'],
        ['Report message', null,           true,  false],
      ];
  return (
    <div style={{
      position:'absolute', top, right, zIndex:3,
      width:218,
      background:'var(--popover)',
      border:'1px solid var(--border-strong)',
      borderRadius:'var(--radius)',
      boxShadow:'0 18px 40px oklch(0.05 0.005 60 / 0.55)',
      padding:'5px 0',
      fontFamily:'inherit',
    }}>
      {items.map(([label, icon, danger, hot], i) => {
        if (label === '__sep')
          return <div key={i} style={{height:1, background:'var(--border)', margin:'5px 8px'}}/>;
        return (
          <div key={label} style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'7px 12px',
            background: hot ? 'color-mix(in oklab, var(--chat) 12%, transparent)' : 'transparent',
            color: danger ? 'var(--destructive)' : 'var(--foreground)',
            fontSize:12.5, cursor:'pointer',
          }}>
            <span style={{
              width:16, height:16,
              display:'flex', alignItems:'center', justifyContent:'center',
              color: danger ? 'var(--destructive)' : 'var(--muted-foreground)',
            }}>{icon}</span>
            <span style={{flex:1}}>{label}</span>
            {hot && (
              <Mono style={{fontSize:9.5, color:'var(--muted-foreground)',
                letterSpacing:'0.06em'}}>E</Mono>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── The thread snippet, repeated per variant ────────────────────────────
function ThreadSnippet({ variant }) {
  const BarFor = variant === 'pill' ? BarPill
    : variant === 'quick' ? BarQuickReact
    : variant === 'editorial' ? BarEditorial
    : BarEdge;

  // The "hovered" rows
  return (
    <div style={{display:'flex', flexDirection:'column', gap:2, padding:'8px 0'}}>
      <MaMsg first name="Maia" color="oklch(0.72 0.07 330)" time="10:42">
        <p style={{margin:0}}>Hey — are we still good for the review at four?</p>
      </MaMsg>

      <MaMsg
        first
        name="Maia"
        color="oklch(0.72 0.07 330)"
        time="10:43"
        highlighted
        hoverNode={<BarFor self={false}/>}
      >
        <p style={{margin:0}}>I've put the new voice explorations into the shared room. Want to start there?</p>
      </MaMsg>

      <MaMsg first self name="Alice" color="var(--chat)" time="10:44">
        <p style={{margin:0}}>Yes! Pulling them up now.</p>
      </MaMsg>

      <MaMsg
        self
        name="Alice"
        color="var(--chat)"
        highlighted
        hoverNode={<BarFor self={true}/>}
      >
        <p style={{margin:0}}>
          The warm amber for voice is really singing against the sage.
        </p>
      </MaMsg>
    </div>
  );
}

// ── Per-variant artboard wrapper ────────────────────────────────────────
function MessageActionsArtboard({ variant, title, blurb }) {
  return (
    <Artboard w={1200} h={520} style={{padding:'28px 36px', display:'flex', flexDirection:'column'}}>
      {/* header */}
      <div style={{display:'flex', alignItems:'baseline', gap:14, marginBottom:14}}>
        <Mono style={{fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--muted-foreground)'}}>— Variant</Mono>
        <Serif style={{fontSize:22, fontWeight:400, letterSpacing:'-0.01em'}}>{title}</Serif>
        <Serif style={{fontSize:13, fontStyle:'italic', color:'var(--muted-foreground)'}}>
          {blurb}
        </Serif>
      </div>

      {/* the thread */}
      <div style={{
        flex:1,
        border:'1px solid var(--border)',
        borderRadius:'var(--radius)',
        background:'var(--background)',
        padding:'14px 18px',
        position:'relative',
        overflow:'visible',
      }}>
        <ThreadSnippet variant={variant}/>
      </div>

      {/* legend */}
      <div style={{
        display:'flex', alignItems:'center', gap:18, marginTop:12,
        fontFamily:'JetBrains Mono, monospace', fontSize:10,
        letterSpacing:'0.08em', textTransform:'uppercase',
        color:'var(--muted-foreground)',
      }}>
        <span><span style={{color:'var(--chat)'}}>●</span> hovered message</span>
        <span>Received → react · reply · copy · pin</span>
        <span>Sent → + edit · delete</span>
        <span style={{marginLeft:'auto'}}>visible only on hover / focus</span>
      </div>
    </Artboard>
  );
}

// ── Wrappers for the design canvas ──────────────────────────────────────
function MessageActionsPill() {
  return <MessageActionsArtboard
    variant="pill"
    title="A · Floating pill"
    blurb="— classic icon toolbar, sits above the message."
  />;
}
function MessageActionsQuick() {
  return <MessageActionsArtboard
    variant="quick"
    title="B · Quick-react palette"
    blurb="— six recents up front, full picker + actions behind."
  />;
}
function MessageActionsEditorial() {
  return <MessageActionsArtboard
    variant="editorial"
    title="C · Editorial labels"
    blurb="— typeset, on-brand, no icons. Slower but legible."
  />;
}
function MessageActionsEdge() {
  return <MessageActionsArtboard
    variant="edge"
    title="D · Edge stack"
    blurb="— vertical icon column hugging the right edge."
  />;
}

// ── Overflow menu artboard (the “···” expanded) ─────────────────────────
function MessageActionsOverflow() {
  return (
    <Artboard w={1200} h={560} style={{padding:'28px 36px', display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', alignItems:'baseline', gap:14, marginBottom:14}}>
        <Mono style={{fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--muted-foreground)'}}>— More menu</Mono>
        <Serif style={{fontSize:22, fontWeight:400, letterSpacing:'-0.01em'}}>
          Overflow menu · expanded
        </Serif>
        <Serif style={{fontSize:13, fontStyle:'italic', color:'var(--muted-foreground)'}}>
          — everything that doesn't earn a top-level slot. Sender-only actions appear when relevant.
        </Serif>
      </div>

      <div style={{
        flex:1, display:'grid', gap:18,
        gridTemplateColumns:'1fr 1fr',
      }}>
        {[false, true].map(self => (
          <div key={String(self)} style={{
            border:'1px solid var(--border)',
            borderRadius:'var(--radius)',
            background:'var(--background)',
            padding:'18px 22px',
            position:'relative',
          }}>
            <Mono style={{fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
              color: self ? 'var(--chat)' : 'var(--muted-foreground)'}}>
              {self ? 'sent · your message' : 'received · their message'}
            </Mono>
            <div style={{marginTop:14, position:'relative'}}>
              <MaMsg
                first
                self={self}
                name={self ? 'Alice' : 'Maia'}
                color={self ? 'var(--chat)' : 'oklch(0.72 0.07 330)'}
                time="10:44"
                highlighted
                hoverNode={<BarPill self={self}/>}
              >
                <p style={{margin:0}}>
                  {self
                    ? "The warm amber for voice is really singing against the sage."
                    : "Caught the late light through the studio window — thought you'd like this one."}
                </p>
              </MaMsg>
              <OverflowMenu self={self} top={42} right={14}/>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display:'flex', alignItems:'center', gap:18, marginTop:12,
        fontFamily:'JetBrains Mono, monospace', fontSize:10,
        letterSpacing:'0.08em', textTransform:'uppercase',
        color:'var(--muted-foreground)',
      }}>
        <span>highlighted item = primary action for that sender</span>
        <span style={{marginLeft:'auto'}}>Esc to dismiss · arrows to navigate</span>
      </div>
    </Artboard>
  );
}

// ── Specimens — zoom on each bar so we can see the chrome up close ─────
function MessageActionsSpecimens() {
  const rows = [
    { label:'A · Floating pill',         received:<BarPill self={false}/>,        sent:<BarPill self={true}/> },
    { label:'B · Quick-react palette',   received:<BarQuickReact self={false}/>,  sent:<BarQuickReact self={true}/> },
    { label:'C · Editorial labels',      received:<BarEditorial self={false}/>,   sent:<BarEditorial self={true}/> },
    { label:'D · Edge stack',            received:<BarEdge self={false}/>,        sent:<BarEdge self={true}/> },
  ];
  return (
    <Artboard w={1200} h={760} style={{padding:'30px 40px'}}>
      <div style={{display:'flex', alignItems:'baseline', gap:14, marginBottom:6}}>
        <Mono style={{fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--muted-foreground)'}}>— Specimens</Mono>
        <Serif style={{fontSize:22, fontWeight:400, letterSpacing:'-0.01em'}}>
          The four bars · side-by-side
        </Serif>
      </div>
      <Serif style={{fontSize:13, fontStyle:'italic', color:'var(--muted-foreground)', display:'block', marginBottom:24}}>
        Each row: receiver state (left) vs sender state (right, includes edit / delete).
      </Serif>

      <div style={{
        display:'grid',
        gridTemplateColumns:'180px 1fr 1fr',
        rowGap:36, columnGap:24,
        alignItems:'center',
      }}>
        <Mono style={{fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted-foreground)'}}>Variant</Mono>
        <Mono style={{fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted-foreground)'}}>Received · their message</Mono>
        <Mono style={{fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted-foreground)'}}>Sent · your message</Mono>

        {rows.map(({label, received, sent}, i) => (
          <React.Fragment key={i}>
            <div>
              <Serif style={{fontSize:15, fontWeight:500}}>{label}</Serif>
            </div>
            <SpecimenCell>{received}</SpecimenCell>
            <SpecimenCell>{sent}</SpecimenCell>
          </React.Fragment>
        ))}
      </div>
    </Artboard>
  );
}

function SpecimenCell({ children }) {
  return (
    <div style={{
      position:'relative',
      height:80,
      border:'1px dashed var(--border)',
      borderRadius:'var(--radius)',
      background:'color-mix(in oklab, var(--foreground) 2%, var(--background))',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      {/* faux message line behind the bar to give it context */}
      <div style={{
        position:'absolute', left:14, right:14, top:'50%', height:14,
        transform:'translateY(-50%)',
        borderRadius:3,
        background:'color-mix(in oklab, var(--foreground) 6%, transparent)',
      }}/>
      <div style={{position:'relative', width:'auto'}}>{children}</div>
    </div>
  );
}

// ── Recommendation note ─────────────────────────────────────────────────
function MessageActionsRec() {
  return (
    <Artboard w={1200} h={460} style={{padding:'34px 48px', display:'flex', flexDirection:'column', gap:18}}>
      <div>
        <Mono style={{fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--muted-foreground)'}}>— Recommendation</Mono>
        <Serif style={{fontSize:30, fontWeight:400, letterSpacing:'-0.015em', display:'block', marginTop:6}}>
          Default to <em style={{color:'var(--chat)'}}>B · Quick-react palette</em>,
          fall back to <em style={{color:'var(--chat)'}}>A · Floating pill</em> on narrow widths.
        </Serif>
      </div>
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14,
        fontSize:13, lineHeight:1.55,
      }}>
        <RecCard k="Reactions are the most-used action" v="Putting six emoji up front cuts reaction taps from two to one. The picker + overflow menu are still there for everything else."/>
        <RecCard k="Sender-only items live in overflow" v="“Edit” gets a top-slot icon when relevant; “Delete” lives inside the overflow with destructive styling. Keeps the bar from changing width between messages."/>
        <RecCard k="Reveal on hover, focus, and long-press" v="Desktop: hover. Keyboard: focus a message → bar focuses. Mobile: long-press opens the same set as a bottom sheet (already used for the attach picker)."/>
      </div>
      <div style={{
        marginTop:'auto',
        padding:'12px 14px',
        background:'var(--muted)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-sm)',
        fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
        letterSpacing:'0.06em', color:'var(--muted-foreground)',
        display:'flex', gap:18, flexWrap:'wrap',
      }}>
        <span>shortcuts · R react · ⌘C copy · E edit · ⌫ delete · ⇧⌫ delete confirm</span>
        <span style={{marginLeft:'auto'}}>bar reveals at 120ms · hides at 200ms</span>
      </div>
    </Artboard>
  );
}

function RecCard({ k, v }) {
  return (
    <div style={{
      padding:'14px 16px',
      border:'1px solid var(--border)',
      borderRadius:'var(--radius)',
      background:'var(--card)',
    }}>
      <Mono style={{fontSize:9.5, letterSpacing:'0.1em', textTransform:'uppercase',
        color:'var(--chat)', display:'block', marginBottom:8}}>{k}</Mono>
      <span style={{color:'var(--foreground)'}}>{v}</span>
    </div>
  );
}

Object.assign(window, {
  MessageActionsPill,
  MessageActionsQuick,
  MessageActionsEditorial,
  MessageActionsEdge,
  MessageActionsOverflow,
  MessageActionsSpecimens,
  MessageActionsRec,
});
