// Mobile chat screen — iOS framing, applying mobile UX best practices:
// • bottom-anchored composer + safe-area awareness
// • 44pt tap targets
// • drag-and-drop → tap-"+" → bottom action sheet
// • GIF popover → bottom sheet
// • lightbox is full-screen swipe-down dismiss
// • attachments are full-width on mobile

const M_HUE_CHAT = 'oklch(0.72 0.07 145)';
const M_HUE_MAIA = 'oklch(0.72 0.07 330)';

function mTileBg(item) {
  const hue = item.hue ?? 60;
  const angle = item.angle ?? 135;
  return `repeating-linear-gradient(${angle}deg,
    oklch(0.32 0.04 ${hue}) 0 14px,
    oklch(0.27 0.03 ${hue}) 14px 28px)`;
}

const M_FILES_FIVE = [
  {kind:'image', name:'spec-overview.png', size:'2.4 MB', hue:200, angle:120},
  {kind:'image', name:'voice-swatch.jpg',  size:'620 KB', hue:48,  angle:45},
  {kind:'image', name:'chat-swatch.jpg',   size:'580 KB', hue:150, angle:75},
  {kind:'file',  name:'pinai-tokens.oklch.css', size:'4.2 KB', ext:'CSS'},
  {kind:'file',  name:'review-notes.md',   size:'12 KB', ext:'MD'},
];

function MobileChatScreen({ state = 'default' }) {
  return (
    <IOSDevice width={390} height={844} dark>
      <div style={{
        height:'100%',
        background:'var(--background)',
        color:'var(--foreground)',
        fontFamily:'Geist, ui-sans-serif, system-ui, sans-serif',
        fontSize:13.5,
        position:'relative',
        display:'flex', flexDirection:'column',
        paddingTop:54,  // status bar
      }}>
        <MobileHeader/>

        <div style={{
          flex:1, overflow:'hidden', position:'relative',
          display:'flex', flexDirection:'column',
        }}>
          <MobileThread state={state}/>

          {/* composer always anchored to bottom */}
          <MobileComposer state={state}/>
        </div>

        {/* overlays */}
        {state === 'attachSheet' && <MobileAttachSheet/>}
        {state === 'gifSheet' && <MobileGifSheet/>}
        {state === 'lightbox' && <MobileLightbox/>}
      </div>
    </IOSDevice>
  );
}

// ── Header ───────────────────────────────────────────────────────────────
function MobileHeader() {
  return (
    <div style={{
      height:56, padding:'0 8px 0 4px',
      borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center', gap:8,
      background:'var(--card)',
      flexShrink:0,
    }}>
      <button style={{
        width:44, height:44, border:'none', background:'transparent',
        color:'var(--chat)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6"/>
        </svg>
      </button>
      <Avatar name="Maia" color={M_HUE_MAIA} size={34} dot="online"/>
      <div style={{flex:1, minWidth:0, marginLeft:2}}>
        <Serif style={{fontSize:15, fontWeight:500}}>Maia</Serif>
        <div style={{fontSize:10.5, color:'var(--muted-foreground)',
          fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
          <span style={{color:'var(--success)'}}>●</span> online
        </div>
      </div>
      <button style={{
        width:44, height:44, border:'none', background:'transparent',
        color:'var(--muted-foreground)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-1a4 4 0 0 1 4-4h1m8 0h1a4 4 0 0 1 4 4v1M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/>
          <path d="m20 8 2 2-2 2M22 10h-6"/>
        </svg>
      </button>
      <button style={{
        width:44, height:44, border:'none', background:'transparent',
        color:'var(--muted-foreground)', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
        </svg>
      </button>
    </div>
  );
}

// ── Thread ───────────────────────────────────────────────────────────────
function MobileThread({ state }) {
  return (
    <div
      ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
      style={{
        flex:1, overflow:'auto',
        padding:'14px 14px 12px',
        display:'flex', flexDirection:'column', gap:8,
      }}
    >
      <MDateDivider>Today</MDateDivider>

      <MMsg name="Maia" color={M_HUE_MAIA} time="13:42">
        <p style={{margin:0}}>Hey — caught the late light through the studio window.</p>
      </MMsg>

      <MMsg name="Maia" color={M_HUE_MAIA} continuation>
        <MImageMessage
          item={{name:'studio-window.jpg', size:'2.1 MB', hue:30, angle:115}}
        />
      </MMsg>

      <MMsg self time="13:48">
        <p style={{margin:0}}>That's gorgeous. Saving for the moodboard.</p>
      </MMsg>

      <MMsg name="Maia" color={M_HUE_MAIA} time="14:02">
        <p style={{margin:'0 0 8px'}}>Pushed the final tokens — five files in this batch.</p>
        <MAttachmentBundle files={M_FILES_FIVE}/>
      </MMsg>

      {/* push the last bubble up so composer doesn't crowd it */}
      <div style={{height:8}}/>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────
function MMsg({ name, color, time, self, continuation, children }) {
  const align = self ? 'flex-end' : 'flex-start';
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems: align,
      gap:2, marginTop: continuation ? -4 : 0,
    }}>
      {!continuation && !self && (
        <div style={{display:'flex', alignItems:'center', gap:8, marginLeft:4, marginBottom:2}}>
          <Avatar name={name} color={color} size={20}/>
          <Serif style={{fontSize:12, fontWeight:500}}>{name}</Serif>
          <Mono style={{fontSize:10, color:'var(--muted-foreground)'}}>{time}</Mono>
        </div>
      )}
      <div style={{
        maxWidth:'82%',
        padding:'9px 12px',
        borderRadius: self
          ? '16px 16px 4px 16px'
          : continuation
            ? '16px 16px 16px 4px'
            : '4px 16px 16px 16px',
        background: self
          ? 'color-mix(in oklab, var(--chat) 18%, var(--card))'
          : 'var(--card)',
        border:'1px solid var(--border)',
        color:'var(--foreground)',
        fontSize:13.5, lineHeight:1.5,
      }}>
        {children}
      </div>
      {self && time && (
        <Mono style={{fontSize:9.5, color:'var(--muted-foreground)',
          marginRight:4, marginTop:2, letterSpacing:'0.04em'}}>{time} · delivered</Mono>
      )}
    </div>
  );
}

function MDateDivider({ children }) {
  return (
    <div style={{
      display:'flex', justifyContent:'center', margin:'4px 0 2px',
    }}>
      <span style={{
        padding:'3px 10px', borderRadius:20,
        background:'var(--muted)', border:'1px solid var(--border)',
        fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
        letterSpacing:'0.1em', textTransform:'uppercase',
        color:'var(--muted-foreground)',
      }}>{children}</span>
    </div>
  );
}

// ── Single image attachment (full width on mobile) ──────────────────────
function MImageMessage({ item }) {
  return (
    <div style={{
      borderRadius:14, overflow:'hidden',
      border:'1px solid var(--border)',
      background: mTileBg(item),
      aspectRatio:'4/3', position:'relative',
      display:'flex', alignItems:'flex-end',
      cursor:'zoom-in',
    }}>
      <div style={{
        padding:'7px 10px', width:'100%',
        background:'linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)',
        color:'var(--muted-foreground)',
        fontFamily:'JetBrains Mono, monospace', fontSize:10,
        display:'flex', justifyContent:'space-between', gap:8,
      }}>
        <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</span>
        <span style={{flexShrink:0}}>{item.size}</span>
      </div>
    </div>
  );
}

// ── Multi-attachment: mosaic + N (most mobile-friendly) ─────────────────
function MAttachmentBundle({ files }) {
  const visible = files.slice(0, 4);
  const overflow = Math.max(0, files.length - 4);
  return (
    <div style={{
      display:'grid', gridTemplateColumns:'1fr 1fr', gap:4,
      borderRadius:12, overflow:'hidden',
    }}>
      {visible.map((it, i) => {
        const isOverflow = i === 3 && overflow > 0;
        return (
          <div key={i} style={{
            aspectRatio:'1/1',
            background: it.kind === 'image' ? mTileBg(it) : 'var(--muted)',
            border:'1px solid var(--border)',
            borderRadius:8, overflow:'hidden',
            position:'relative',
            display:'flex', alignItems: it.kind === 'file' ? 'center' : 'flex-end',
            justifyContent: it.kind === 'file' ? 'center' : 'flex-start',
          }}>
            {it.kind === 'file' && !isOverflow && (
              <div style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                padding:8, textAlign:'center', minWidth:0, width:'100%',
              }}>
                <div style={{
                  width:30, height:30, borderRadius:6,
                  background:'var(--card)', border:'1px solid var(--border-strong)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:'JetBrains Mono, monospace', fontSize:9, fontWeight:600,
                  color:'var(--chat)',
                }}>{it.ext}</div>
                <div style={{fontSize:10.5, fontWeight:500,
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  width:'100%'}}>{it.name}</div>
              </div>
            )}
            {it.kind === 'image' && !isOverflow && (
              <div style={{
                padding:'5px 7px', width:'100%',
                background:'linear-gradient(to top, oklch(0.18 0.01 60 / 0.8), transparent)',
                fontFamily:'JetBrains Mono, monospace', fontSize:9,
                color:'var(--muted-foreground)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              }}>{it.name}</div>
            )}
            {isOverflow && (
              <div style={{
                position:'absolute', inset:0,
                background:'oklch(0.18 0.01 60 / 0.62)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--foreground)',
                fontFamily:'var(--serif, Fraunces), serif', fontSize:24, fontWeight:400,
              }}>+{overflow}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────
function MobileComposer({ state }) {
  return (
    <div style={{
      borderTop:'1px solid var(--border)',
      background:'var(--card)',
      padding:'8px 8px 30px',  // 30px = home indicator safe area
      display:'flex', flexDirection:'column', gap:8,
      flexShrink:0,
    }}>
      {state === 'uploading' && <MUploadList/>}
      {state === 'chips' && <MChipList/>}

      <div style={{display:'flex', alignItems:'flex-end', gap:6}}>
        <button style={{
          width:40, height:40, flexShrink:0,
          border:'none', borderRadius:'50%',
          background: state === 'attachSheet'
            ? 'color-mix(in oklab, var(--chat) 22%, transparent)'
            : 'var(--muted)',
          color: state === 'attachSheet' ? 'var(--chat)' : 'var(--muted-foreground)',
          cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {state === 'attachSheet'
              ? <path d="M6 18 18 6M6 6l12 12"/>
              : <><path d="M12 5v14M5 12h14"/></>}
          </svg>
        </button>

        <div style={{
          flex:1, minHeight:40,
          padding:'10px 14px',
          background:'var(--muted)', borderRadius:20,
          fontSize:14, color:'var(--muted-foreground)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          {state === 'chips' ? (
            <span style={{color:'var(--foreground)'}}>Here are the latest exports</span>
          ) : state === 'uploading' ? (
            <span>Uploading 3 files…</span>
          ) : (
            <>
              <span style={{flex:1}}>Message</span>
              <button style={{
                border:'none', background:'transparent', padding:0,
                width:30, height:30, borderRadius:6,
                color: state === 'gifSheet' ? 'var(--chat)' : 'var(--muted-foreground)',
                fontFamily:'JetBrains Mono, monospace', fontSize:9, fontWeight:600,
                letterSpacing:'0.06em', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                background: state === 'gifSheet'
                  ? 'color-mix(in oklab, var(--chat) 18%, transparent)'
                  : 'transparent',
              }}>GIF</button>
              <button style={{
                border:'none', background:'transparent', padding:0,
                width:30, height:30, borderRadius:6,
                color:'var(--muted-foreground)', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>
                </svg>
              </button>
            </>
          )}
        </div>

        <button style={{
          width:40, height:40, flexShrink:0,
          border:'none', borderRadius:'50%',
          background:'var(--chat)', color:'var(--primary-foreground)',
          cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Composer: upload list ────────────────────────────────────────────────
function MUploadList() {
  const items = [
    {name:'studio-window.jpg', size:'2.1 MB', pct:78, ext:'JPG'},
    {name:'voice-explorations.mp4', size:'14.8 MB', pct:42, ext:'MP4'},
    {name:'token-handoff.pdf', size:'420 KB', pct:100, ext:'PDF'},
  ];
  return (
    <div style={{display:'flex', flexDirection:'column', gap:6}}>
      {items.map((it, i) => (
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'8px 10px', borderRadius:12,
          background:'var(--muted)', border:'1px solid var(--border)',
        }}>
          <div style={{
            width:30, height:30, borderRadius:6, flexShrink:0,
            background:'var(--card)', border:'1px solid var(--border-strong)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'JetBrains Mono, monospace', fontSize:8.5, fontWeight:600,
            color:'var(--chat)',
          }}>{it.ext}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:5}}>
              <span style={{fontSize:12, fontWeight:500, flex:1,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                {it.name}</span>
              <Mono style={{fontSize:9.5, color:'var(--muted-foreground)'}}>
                {it.pct === 100 ? 'done' : `${it.pct}%`}
              </Mono>
            </div>
            <div style={{
              height:3, borderRadius:3, overflow:'hidden',
              background:'color-mix(in oklab, var(--foreground) 8%, transparent)',
            }}>
              <div style={{
                height:'100%', width:`${it.pct}%`,
                background: it.pct === 100 ? 'var(--success)' : 'var(--chat)',
              }}/>
            </div>
          </div>
          <button style={{
            width:28, height:28, borderRadius:'50%', border:'none',
            background:'var(--card)', color:'var(--muted-foreground)',
            cursor:'pointer', fontSize:14, lineHeight:1,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Composer: chips (name + ext only) ────────────────────────────────────
function MChipList() {
  const chips = [
    {name:'studio-window', ext:'jpg'},
    {name:'voice-explorations', ext:'mp4'},
    {name:'pinai-tokens.oklch', ext:'css'},
    {name:'review-notes', ext:'md'},
  ];
  return (
    <div style={{
      display:'flex', gap:6, overflowX:'auto', paddingBottom:2,
      margin:'0 -2px',
    }}>
      {chips.map((c, i) => (
        <span key={i} style={{
          display:'inline-flex', alignItems:'center', gap:8, flexShrink:0,
          padding:'5px 5px 5px 10px', borderRadius:20,
          background:'var(--muted)', border:'1px solid var(--border)',
          fontSize:12, color:'var(--foreground)',
        }}>
          <span style={{
            fontFamily:'JetBrains Mono, monospace', fontSize:9, fontWeight:600,
            color:'var(--chat)', letterSpacing:'0.06em',
          }}>{c.ext.toUpperCase()}</span>
          <span style={{whiteSpace:'nowrap', maxWidth:130,
            overflow:'hidden', textOverflow:'ellipsis'}}>{c.name}.{c.ext}</span>
          <button style={{
            width:22, height:22, borderRadius:'50%',
            border:'none', background:'var(--card)',
            color:'var(--muted-foreground)', cursor:'pointer',
            fontSize:13, lineHeight:1, flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>×</button>
        </span>
      ))}
    </div>
  );
}

// ── Bottom-sheet shell ───────────────────────────────────────────────────
function MBottomSheet({ children, height }) {
  return (
    <>
      <div style={{
        position:'absolute', inset:0, zIndex:40,
        background:'oklch(0.05 0.005 60 / 0.5)',
        animation:'pn-fade-in 160ms ease-out',
      }}/>
      <div style={{
        position:'absolute', left:0, right:0, bottom:0, zIndex:41,
        height: height || 'auto',
        maxHeight:'82%',
        background:'var(--card)',
        borderTopLeftRadius:24, borderTopRightRadius:24,
        boxShadow:'0 -10px 30px oklch(0.05 0.005 60 / 0.4)',
        display:'flex', flexDirection:'column',
        paddingBottom:30, // safe area
        animation:'pn-fade-in 200ms ease-out',
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'10px 0 4px'}}>
          <div style={{
            width:36, height:4, borderRadius:4,
            background:'var(--border-strong)',
          }}/>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Attachment bottom sheet (replaces drag-and-drop) ─────────────────────
function MobileAttachSheet() {
  const actions = [
    {label:'Photo Library', sub:'Recent', icon:(
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="9" cy="9" r="2"/>
        <path d="m21 15-3.5-3.5L8 21"/>
      </svg>
    )},
    {label:'Take Photo', sub:'Camera', icon:(
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2z"/>
        <circle cx="12" cy="13" r="3.5"/>
      </svg>
    )},
    {label:'File', sub:'Documents, code, archives', icon:(
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
        <path d="M14 3v5h5"/>
      </svg>
    )},
    {label:'GIF', sub:'Search GIPHY / Tenor', icon:(
      <span style={{
        fontFamily:'JetBrains Mono, monospace', fontSize:10, fontWeight:700,
        letterSpacing:'0.04em',
      }}>GIF</span>
    )},
    {label:'Voice clip', sub:'Record up to 2 min', icon:(
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="12" rx="3"/>
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
      </svg>
    )},
    {label:'Location', sub:'Share where you are', icon:(
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    )},
  ];

  return (
    <MBottomSheet>
      <div style={{padding:'2px 18px 6px'}}>
        <Serif style={{fontSize:16, fontWeight:500}}>Attach</Serif>
      </div>
      <div style={{padding:'6px 12px 16px',
        display:'flex', flexDirection:'column', gap:2}}>
        {actions.map((a, i) => (
          <button key={i} style={{
            display:'flex', alignItems:'center', gap:14,
            padding:'12px 12px',
            border:'none', background:'transparent',
            color:'var(--foreground)', cursor:'pointer',
            textAlign:'left', borderRadius:12,
            minHeight:52,
          }}>
            <div style={{
              width:40, height:40, borderRadius:10,
              background:'color-mix(in oklab, var(--chat) 14%, var(--muted))',
              color:'var(--chat)', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>{a.icon}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:500}}>{a.label}</div>
              <div style={{fontSize:11.5, color:'var(--muted-foreground)',
                fontFamily:'var(--serif, Fraunces), serif', fontStyle:'italic'}}>
                {a.sub}
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{color:'var(--muted-foreground)'}}>
              <path d="m9 6 6 6-6 6"/>
            </svg>
          </button>
        ))}
      </div>
    </MBottomSheet>
  );
}

// ── GIF bottom sheet ─────────────────────────────────────────────────────
function MobileGifSheet() {
  const tiles = [
    {hue:330, angle:120, label:'celebrate'},
    {hue:200, angle:60,  label:'high five'},
    {hue:48,  angle:135, label:'sip coffee'},
    {hue:150, angle:90,  label:'thumbs up'},
    {hue:25,  angle:45,  label:'shrug'},
    {hue:280, angle:160, label:'nod'},
    {hue:90,  angle:75,  label:'sparkle'},
    {hue:10,  angle:105, label:'eye roll'},
  ];
  const cats = ['Trending','Reactions','Greetings','Mood','Animals'];
  return (
    <MBottomSheet height="72%">
      <div style={{padding:'4px 14px 10px',
        display:'flex', alignItems:'center', gap:10}}>
        <Serif style={{fontSize:16, fontWeight:500, flex:1}}>Send a GIF</Serif>
        <Mono style={{fontSize:9, color:'var(--muted-foreground)',
          letterSpacing:'0.08em', textTransform:'uppercase'}}>tenor</Mono>
      </div>
      <div style={{padding:'0 14px 10px'}}>
        <div style={{
          display:'flex', alignItems:'center', gap:8, padding:'0 12px', height:36,
          background:'var(--input)', borderRadius:10,
          border:'1px solid var(--border)', color:'var(--muted-foreground)', fontSize:13,
        }}>
          {Icons.search}<span>Search GIFs</span>
        </div>
      </div>
      <div style={{padding:'0 14px 10px',
        display:'flex', gap:6, overflowX:'auto'}}>
        {cats.map((c, i) => (
          <span key={c} style={{
            padding:'5px 12px', borderRadius:20, flexShrink:0,
            border:'1px solid var(--border)',
            background: i === 0 ? 'color-mix(in oklab, var(--chat) 18%, transparent)' : 'transparent',
            color: i === 0 ? 'var(--chat)' : 'var(--muted-foreground)',
            fontSize:11.5, fontFamily:'JetBrains Mono, monospace',
            letterSpacing:'0.04em',
          }}>{c}</span>
        ))}
      </div>
      <div style={{
        flex:1, overflow:'auto',
        padding:'0 14px 14px',
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:6,
      }}>
        {tiles.map((t, i) => (
          <div key={i} style={{
            aspectRatio:'4/3', borderRadius:10, overflow:'hidden',
            border:'1px solid var(--border)',
            background: mTileBg(t),
            position:'relative',
            display:'flex', alignItems:'flex-end',
          }}>
            <div style={{
              padding:'4px 7px', width:'100%',
              background:'linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)',
              fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
              color:'var(--muted-foreground)',
              letterSpacing:'0.04em', textTransform:'uppercase',
            }}>{t.label}</div>
            <div style={{
              position:'absolute', top:6, right:6,
              padding:'1.5px 5px', borderRadius:3,
              background:'oklch(0.18 0.01 60 / 0.7)',
              fontFamily:'JetBrains Mono, monospace', fontSize:8.5,
              color:'var(--foreground)',
            }}>GIF</div>
          </div>
        ))}
      </div>
    </MBottomSheet>
  );
}

// ── Lightbox (full-screen, swipe-down to dismiss) ────────────────────────
function MobileLightbox() {
  const item = {hue:30, angle:115, name:'studio-window.jpg', size:'2.1 MB'};
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:60,
      background:'#000',
      display:'flex', flexDirection:'column',
      animation:'pn-fade-in 160ms ease-out',
    }}>
      {/* top bar */}
      <div style={{
        padding:'58px 16px 12px',
        display:'flex', alignItems:'center', gap:12,
        color:'#fff',
      }}>
        <button style={{
          width:36, height:36, borderRadius:'50%',
          background:'rgba(255,255,255,0.14)', border:'none', color:'#fff',
          fontSize:20, lineHeight:1, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          backdropFilter:'blur(12px)',
        }}>×</button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, fontWeight:500}}>Maia</div>
          <div style={{fontSize:10.5, opacity:0.7,
            fontFamily:'JetBrains Mono, monospace'}}>
            {item.name} · {item.size}
          </div>
        </div>
        <button style={{
          width:36, height:36, borderRadius:'50%',
          background:'rgba(255,255,255,0.14)', border:'none', color:'#fff',
          cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          backdropFilter:'blur(12px)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>
          </svg>
        </button>
      </div>

      <div style={{flex:1, display:'flex', alignItems:'center',
        justifyContent:'center', padding:'0 12px'}}>
        <div style={{
          width:'100%', aspectRatio:'4/3',
          borderRadius:14, background: mTileBg(item),
          boxShadow:'0 24px 60px rgba(0,0,0,0.5)',
        }}/>
      </div>

      <div style={{
        padding:'14px 22px 40px',
        display:'flex', justifyContent:'space-around',
        color:'#fff',
      }}>
        {[
          {label:'Reply', icon:'M3 10h11a4 4 0 0 1 4 4v3M3 10l4-4M3 10l4 4'},
          {label:'Forward', icon:'M21 12H7m6-6 6 6-6 6'},
          {label:'Save', icon:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8'},
          {label:'More', icon:'M5 12a1 1 0 1 0 0-.001M12 12a1 1 0 1 0 0-.001M19 12a1 1 0 1 0 0-.001'},
        ].map(a => (
          <button key={a.label} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:6,
            background:'transparent', border:'none', color:'#fff',
            cursor:'pointer', padding:6,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={a.icon}/>
            </svg>
            <span style={{fontSize:10.5, fontFamily:'JetBrains Mono, monospace',
              letterSpacing:'0.06em', textTransform:'uppercase', opacity:0.85}}>
              {a.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

window.MobileChatScreen = MobileChatScreen;
