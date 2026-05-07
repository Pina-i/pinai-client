// Screen 3: DM / Chat
function ChatScreen({ state = 'default' }) {
  const [lightbox, setLightbox] = React.useState(null);
  return (
    <Artboard w={1200} h={780} style={{display:'flex', position:'relative'}}>
      <ServerRail active="home"/>

      {/* Sidebar (condensed) */}
      <div style={{width:240, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 12px 10px'}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'0 10px', height:34,
            background:'var(--input)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)',
            color:'var(--muted-foreground)', fontSize:12,
          }}>
            {Icons.search}<span>Search conversations</span>
          </div>
        </div>
        <div style={{padding:'0 8px'}}>
          <NavItem icon={Icons.users} label="Friends"/>
        </div>
        <SectionHead>Direct Messages</SectionHead>
        <div style={{padding:'0 8px', flex:1}}>
          <DMItem name="Bob" color="oklch(0.75 0.06 70)" preview="thinking about the meeting" time="2m" dot="online"/>
          <div style={{borderRadius:'var(--radius-sm)', background:'color-mix(in oklab, var(--chat) 14%, transparent)'}}>
            <DMItem name="Maia" color="oklch(0.72 0.07 330)" preview="you: sounds good" time="now" dot="voice"/>
          </div>
          <DMItem name="Jules & Kai" color="oklch(0.74 0.06 200)" preview="Kai: pushed a fix" time="3h"/>
          <DMItem name="Tane" color="oklch(0.72 0.07 25)" preview="photos from the trip" time="yd"/>
        </div>
        <UserBar/>
      </div>

      {/* Main: chat */}
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
        {/* thread header */}
        <div style={{height:60, borderBottom:'1px solid var(--border)', padding:'0 22px',
          display:'flex', alignItems:'center', gap:14}}>
          <Avatar name="Maia" color="oklch(0.72 0.07 330)" size={34} dot="online"/>
          <div>
            <Serif style={{fontSize:17, fontWeight:450}}>Maia</Serif>
            <div style={{fontSize:11, color:'var(--muted-foreground)',
              fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
              <span style={{color:'var(--success)'}}>●</span> online · maia@studio.pinai
            </div>
          </div>
          <div style={{flex:1}}/>
          <IconBtn>{Icons.pin}</IconBtn>
          <IconBtn>{Icons.bell}</IconBtn>
          <IconBtn>{Icons.headset}</IconBtn>
          <div style={{width:1, height:18, background:'var(--border)', margin:'0 4px'}}/>
          <IconBtn>{Icons.more}</IconBtn>
        </div>

        {/* messages */}
        <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
          style={{flex:1, overflow:'auto', padding:'28px 28px 16px', display:'flex', flexDirection:'column', gap:2}}>
          <DateDivider>Tuesday, April 22</DateDivider>

          <Msg first name="Maia" color="oklch(0.72 0.07 330)" time="10:42">
            <p style={{margin:0}}>Hey — are we still good for the review at four?</p>
          </Msg>
          <Msg name="Maia" color="oklch(0.72 0.07 330)">
            <p style={{margin:0}}>I've put the new voice explorations into the shared room.</p>
          </Msg>

          <Msg first self name="Alice" color="var(--chat)" time="10:44">
            <p style={{margin:0}}>Yes! Pulling them up now.</p>
          </Msg>
          <Msg self name="Alice" color="var(--chat)">
            <Reactions items={[['🌿',3],['✦',1]]}/>
            <p style={{margin:0}}>
              The warm amber for voice is really singing against the sage.{' '}
              <code style={{fontFamily:'JetBrains Mono, monospace', fontSize:12,
                padding:'1px 6px', borderRadius:5, background:'var(--muted)',
                border:'1px solid var(--border)'}}>--voice: oklch(0.80 0.09 48)</code>
            </p>
          </Msg>

          <DateDivider>Today</DateDivider>

          <Msg first name="Maia" color="oklch(0.72 0.07 330)" time="13:48">
            <p style={{margin:'2px 0 8px'}}>Caught the late light through the studio window — thought you'd like this one.</p>
            <SingleImageAttachment
              item={{name:'studio-window.jpg', size:'2.1 MB', hue:30, angle:115, w:880, h:560}}
              onClick={() => setLightbox({name:'studio-window.jpg', size:'2.1 MB', hue:30, angle:115, w:880, h:560, sender:'Maia', time:'13:48'})}
            />
          </Msg>

          <Msg first name="Maia" color="oklch(0.72 0.07 330)" time="14:02">
            <p style={{margin:'2px 0 0'}}>
              Pushed the final token set — sending the export, a quick reference shot, and the writeup. Everything routes through <Mono style={{color:'var(--chat)'}}>--chat</Mono> / <Mono style={{color:'var(--voice)'}}>--voice</Mono> now.
            </p>
            <AttachmentBundle/>
          </Msg>

          <Msg first self name="Alice" color="var(--chat)" time="14:08">
            <p style={{margin:'2px 0 0'}}>
              Ok — here's the full set, five files. Three proposals for how this should look when we go past three attachments:
            </p>
          </Msg>

          <Msg self name="Alice" color="var(--chat)">
            <ProposalLabel n="A" title="Mosaic + N" desc="2×2 grid, last tile becomes the overflow affordance"/>
            <AttachmentBundle variant="mosaic" files={SAMPLE_FIVE}/>
          </Msg>

          <Msg self name="Alice" color="var(--chat)">
            <ProposalLabel n="B" title="Filmstrip" desc="single horizontal row, scrolls; scales to any count"/>
            <AttachmentBundle variant="filmstrip" files={SAMPLE_FIVE}/>
          </Msg>

          <Msg self name="Alice" color="var(--chat)">
            <ProposalLabel n="C" title="Group card" desc="collapsed bundle, click to expand inline"/>
            <AttachmentBundle variant="group" files={SAMPLE_FIVE}/>
          </Msg>

          <TypingRow name="Maia" color="oklch(0.72 0.07 330)"/>
        </div>

        {/* composer */}
        <div style={{padding:'0 22px 20px', position:'relative'}}>
          {state === 'gifPopover' && <GifPopover/>}
          <div style={{
            border: state === 'dragOver' ? '1.5px dashed var(--chat)' : '1px solid var(--border-strong)',
            borderRadius:'var(--radius-lg)',
            background: state === 'dragOver' ? 'color-mix(in oklab, var(--chat) 8%, var(--card))' : 'var(--card)',
            padding:'10px 10px 8px',
          }}>
            {state === 'uploading' && <ComposerUploadList/>}
            {state === 'previewChips' && <ComposerChipList/>}
            <div style={{display:'flex', alignItems:'flex-start', gap:10}}>
              <IconBtn>{Icons.plusCircle}</IconBtn>
              <div style={{flex:1, minHeight:28, padding:'4px 2px', color:'var(--foreground)', fontSize:13.5}}>
                {state === 'previewChips' ? (
                  <span>Here are the latest exports</span>
                ) : state === 'uploading' ? (
                  <span style={{color:'var(--muted-foreground)'}}>Uploading 3 files…</span>
                ) : (
                  <>Message Maia
                    <span style={{display:'inline-block', width:1.5, height:14, background:'var(--chat)',
                      verticalAlign:'middle', marginLeft:2, animation:'pn-blink 1s steps(2) infinite'}}/>
                  </>
                )}
              </div>
              <IconBtn>{Icons.smile}</IconBtn>
              <button title="GIF" style={{
                width:30, height:30,
                border: state === 'gifPopover' ? '1px solid var(--chat)' : '1px solid var(--border)',
                borderRadius:'var(--radius-sm)',
                background: state === 'gifPopover' ? 'color-mix(in oklab, var(--chat) 14%, transparent)' : 'transparent',
                color: state === 'gifPopover' ? 'var(--chat)' : 'var(--muted-foreground)',
                cursor:'pointer',
                fontFamily:'JetBrains Mono, monospace', fontSize:9.5, fontWeight:600,
                letterSpacing:'0.06em',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>GIF</button>
              <button style={{
                width:32, height:28, border:'none', borderRadius:'var(--radius-sm)',
                background:'var(--chat)', color:'var(--primary-foreground)', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>{Icons.send}</button>
            </div>
          </div>
          <div style={{display:'flex', gap:14, padding:'6px 4px 0',
            fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.08em',
            color:'var(--muted-foreground)', textTransform:'uppercase'}}>
            <span>⏎ send</span>
            <span>⇧⏎ new line</span>
            <span>/ commands</span>
            <span style={{marginLeft:'auto'}}>E2E encrypted</span>
          </div>
        </div>
      </div>

      {state === 'dragOver' && <DropOverlay/>}

      {lightbox && (
        <ImageLightbox item={lightbox} onClose={() => setLightbox(null)}/>
      )}
    </Artboard>
  );
}

function Msg({ first, self, name, color, time, children }) {
  return (
    <div style={{display:'flex', gap:14, padding: first ? '14px 0 2px' : '0 0 2px 54px', alignItems:'flex-start'}}>
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
    </div>
  );
}

function DateDivider({ children }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, margin:'18px 0 6px',
      fontFamily:'JetBrains Mono, monospace', fontSize:10, letterSpacing:'0.12em',
      color:'var(--muted-foreground)', textTransform:'uppercase'}}>
      <div style={{flex:1, height:1, background:'var(--border)'}}/>
      <span>{children}</span>
      <div style={{flex:1, height:1, background:'var(--border)'}}/>
    </div>
  );
}

function Reactions({ items }) {
  return (
    <div style={{display:'flex', gap:6, margin:'6px 0 2px'}}>
      {items.map(([e,n]) => (
        <span key={e} style={{
          display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px',
          fontSize:11.5, borderRadius:20, background:'var(--muted)',
          border:'1px solid var(--border)', color:'var(--muted-foreground)',
        }}>{e} <span style={{color:'var(--foreground)', fontFamily:'JetBrains Mono, monospace'}}>{n}</span></span>
      ))}
    </div>
  );
}

function Attachment() {
  return (
    <div style={{
      marginTop:6, borderRadius:'var(--radius)', border:'1px solid var(--border)',
      overflow:'hidden', maxWidth:420,
    }}>
      <div style={{
        height:160,
        background: `
          repeating-linear-gradient(135deg,
            oklch(0.28 0.02 60) 0 14px,
            oklch(0.24 0.02 60) 14px 28px)`,
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'var(--muted-foreground)', fontFamily:'JetBrains Mono, monospace', fontSize:11,
      }}>[ token-export · 1920×1080 ]</div>
      <div style={{padding:'10px 12px', background:'var(--muted)', borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:10}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:500}}>pinai-tokens.oklch.css</div>
          <div style={{fontSize:11, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace'}}>4.2 KB · shadcn compatible</div>
        </div>
        <button style={{fontSize:11, padding:'5px 10px', borderRadius:6,
          border:'1px solid var(--border-strong)', background:'transparent',
          color:'var(--foreground)', cursor:'pointer', fontFamily:'inherit'}}>Download</button>
      </div>
    </div>
  );
}

function AttachmentBundle({ variant = 'default', files }) {
  const items = files || DEFAULT_THREE;

  if (variant === 'mosaic') return <BundleMosaic items={items}/>;
  if (variant === 'filmstrip') return <BundleFilmstrip items={items}/>;
  if (variant === 'group') return <BundleGroup items={items}/>;

  // default: original 3-attachment hero+small+file layout
  return (
    <div style={{
      marginTop:8, display:'grid', gap:6,
      gridTemplateColumns:'1.4fr 1fr', gridTemplateRows:'auto auto',
      maxWidth:440,
    }}>
      <TileImage item={items[0]} style={{gridRow:'1 / span 2', minHeight:200}}/>
      <TileImage item={items[1]} style={{minHeight:97}} compact/>
      <TileFile item={items[2]}/>
    </div>
  );
}

const DEFAULT_THREE = [
  {kind:'image', name:'token-grid.png',  size:'1.8 MB', hue:330, angle:135},
  {kind:'image', name:'voice-swatch.jpg', size:'620 KB', hue:48,  angle:45},
  {kind:'file',  name:'pinai-tokens.oklch.css', size:'4.2 KB', ext:'CSS'},
];

const SAMPLE_FIVE = [
  {kind:'image', name:'spec-overview.png', size:'2.4 MB', hue:200, angle:120},
  {kind:'image', name:'voice-swatch.jpg',  size:'620 KB', hue:48,  angle:45},
  {kind:'image', name:'chat-swatch.jpg',   size:'580 KB', hue:150, angle:75},
  {kind:'file',  name:'pinai-tokens.oklch.css', size:'4.2 KB', ext:'CSS'},
  {kind:'file',  name:'review-notes.md',   size:'12 KB', ext:'MD'},
];

function tileBg(item) {
  const hue = item.hue ?? 60;
  const angle = item.angle ?? 135;
  return `repeating-linear-gradient(${angle}deg,
    oklch(0.32 0.04 ${hue}) 0 14px,
    oklch(0.27 0.03 ${hue}) 14px 28px)`;
}

function TileImage({ item, style, compact, overlayCount }) {
  return (
    <div style={{
      borderRadius:'var(--radius)', border:'1px solid var(--border)',
      overflow:'hidden', position:'relative',
      background: tileBg(item),
      display:'flex', alignItems:'flex-end',
      ...(style||{}),
    }}>
      {overlayCount && (
        <div style={{
          position:'absolute', inset:0,
          background:'oklch(0.18 0.01 60 / 0.62)',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'var(--foreground)',
          fontFamily:'var(--serif, Fraunces), serif', fontSize:28, fontWeight:400,
          letterSpacing:'0.02em',
        }}>+{overlayCount}</div>
      )}
      {!overlayCount && (
        <div style={{
          padding: compact ? '6px 8px' : '8px 10px', width:'100%',
          background:'linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)',
          color:'var(--muted-foreground)', fontFamily:'JetBrains Mono, monospace', fontSize:10,
          display:'flex', justifyContent:'space-between', gap:8,
        }}>
          <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</span>
          <span style={{flexShrink:0}}>{item.size}</span>
        </div>
      )}
    </div>
  );
}

function TileFile({ item, dense }) {
  return (
    <div style={{
      borderRadius:'var(--radius)', border:'1px solid var(--border)',
      background:'var(--muted)', padding: dense ? '8px 10px' : '10px 12px',
      display:'flex', alignItems:'center', gap:10, minWidth:0,
    }}>
      <div style={{
        width: dense ? 28 : 34, height: dense ? 28 : 34, borderRadius:6, flexShrink:0,
        background:'var(--card)', border:'1px solid var(--border-strong)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'JetBrains Mono, monospace', fontSize:9, fontWeight:600,
        letterSpacing:'0.04em', color:'var(--chat)',
      }}>{item.ext || 'FILE'}</div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12, fontWeight:500, whiteSpace:'nowrap',
          overflow:'hidden', textOverflow:'ellipsis'}}>{item.name}</div>
        <div style={{fontSize:10, color:'var(--muted-foreground)',
          fontFamily:'JetBrains Mono, monospace'}}>{item.size}</div>
      </div>
    </div>
  );
}

// Proposal A — Mosaic + N
// 2×2 grid of equal tiles. If items > 4, the 4th tile shows the next image
// dimmed with a "+N" overlay representing remaining count.
function BundleMosaic({ items }) {
  const visible = items.slice(0, 4);
  const overflow = Math.max(0, items.length - 4);
  // pad to 4 cells using image-like substitutes for file items
  return (
    <div style={{
      marginTop:8, display:'grid', gap:6,
      gridTemplateColumns:'1fr 1fr', gridTemplateRows:'112px 112px',
      maxWidth:380,
    }}>
      {visible.map((it, i) => {
        const isLast = i === 3 && overflow > 0;
        if (it.kind === 'image' || isLast) {
          return <TileImage key={i} item={it} compact overlayCount={isLast ? overflow : 0}/>;
        }
        // file as tile
        return (
          <div key={i} style={{
            borderRadius:'var(--radius)', border:'1px solid var(--border)',
            background:'var(--muted)', padding:'10px',
            display:'flex', flexDirection:'column', justifyContent:'space-between',
            minWidth:0, gap:6,
          }}>
            <div style={{
              width:30, height:30, borderRadius:6,
              background:'var(--card)', border:'1px solid var(--border-strong)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'JetBrains Mono, monospace', fontSize:9, fontWeight:600,
              letterSpacing:'0.04em', color:'var(--chat)',
            }}>{it.ext}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:11.5, fontWeight:500, whiteSpace:'nowrap',
                overflow:'hidden', textOverflow:'ellipsis'}}>{it.name}</div>
              <div style={{fontSize:10, color:'var(--muted-foreground)',
                fontFamily:'JetBrains Mono, monospace'}}>{it.size}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Proposal B — Filmstrip
// Single horizontal row of small thumbs. Scrolls horizontally; scales to any count.
function BundleFilmstrip({ items }) {
  return (
    <div style={{marginTop:8, maxWidth:440}}>
      <div style={{
        display:'flex', gap:6, overflowX:'auto',
        paddingBottom:6,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            flexShrink:0, width:96, height:96, borderRadius:'var(--radius)',
            border:'1px solid var(--border)', overflow:'hidden', position:'relative',
            background: it.kind === 'image' ? tileBg(it) : 'var(--muted)',
            display:'flex', flexDirection:'column', justifyContent:'flex-end',
          }}>
            {it.kind === 'file' && (
              <div style={{
                position:'absolute', top:8, left:8,
                width:26, height:26, borderRadius:5,
                background:'var(--card)', border:'1px solid var(--border-strong)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'JetBrains Mono, monospace', fontSize:8.5, fontWeight:600,
                color:'var(--chat)',
              }}>{it.ext}</div>
            )}
            <div style={{
              padding:'5px 7px',
              background: it.kind === 'image'
                ? 'linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)'
                : 'transparent',
              borderTop: it.kind === 'file' ? '1px solid var(--border)' : 'none',
              fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
              color:'var(--muted-foreground)',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            }}>{it.name}</div>
          </div>
        ))}
      </div>
      <div style={{
        fontFamily:'JetBrains Mono, monospace', fontSize:10,
        color:'var(--muted-foreground)', letterSpacing:'0.06em',
        textTransform:'uppercase', paddingLeft:2,
      }}>{items.length} files · scroll →</div>
    </div>
  );
}

// Proposal C — Group card
// Single card summarizing the whole bundle, with stacked thumb peek + expand.
function BundleGroup({ items }) {
  const peek = items.slice(0, 3);
  const totalSize = '7.6 MB';
  return (
    <div style={{
      marginTop:8, maxWidth:380,
      borderRadius:'var(--radius)', border:'1px solid var(--border)',
      background:'var(--card)', overflow:'hidden',
    }}>
      <div style={{
        padding:'10px 12px', display:'flex', alignItems:'center', gap:12,
      }}>
        {/* stacked peek */}
        <div style={{position:'relative', width:54, height:42, flexShrink:0}}>
          {peek.map((it, i) => (
            <div key={i} style={{
              position:'absolute', left: i*10, top: i*3,
              width:36, height:36, borderRadius:6,
              border:'1.5px solid var(--card)',
              background: it.kind === 'image' ? tileBg(it) : 'var(--muted)',
              display: it.kind === 'file' ? 'flex' : 'block',
              alignItems:'center', justifyContent:'center',
              fontFamily:'JetBrains Mono, monospace', fontSize:8, fontWeight:600,
              color:'var(--chat)',
              boxShadow:'0 1px 2px oklch(0.18 0.01 60 / 0.4)',
            }}>{it.kind === 'file' ? it.ext : ''}</div>
          ))}
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, fontWeight:500}}>
            {items.length} files attached
          </div>
          <div style={{fontSize:10.5, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
            {items.filter(i=>i.kind==='image').length} images ·{' '}
            {items.filter(i=>i.kind==='file').length} docs · {totalSize}
          </div>
        </div>
        <button style={{
          fontSize:10.5, padding:'5px 10px', borderRadius:6,
          border:'1px solid var(--border-strong)', background:'transparent',
          color:'var(--foreground)', cursor:'pointer',
          fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.06em',
          textTransform:'uppercase',
        }}>Expand</button>
      </div>
      {/* compact list preview */}
      <div style={{borderTop:'1px solid var(--border)', background:'var(--muted)'}}>
        {items.map((it, i) => (
          <div key={i} style={{
            padding:'7px 12px', display:'flex', alignItems:'center', gap:10,
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            fontSize:11.5,
          }}>
            <div style={{
              width:18, height:18, borderRadius:4, flexShrink:0,
              background: it.kind === 'image' ? tileBg(it) : 'var(--card)',
              border:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'JetBrains Mono, monospace', fontSize:7, fontWeight:600,
              color:'var(--chat)',
            }}>{it.kind === 'file' ? it.ext : ''}</div>
            <span style={{flex:1, minWidth:0, whiteSpace:'nowrap',
              overflow:'hidden', textOverflow:'ellipsis'}}>{it.name}</span>
            <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:10,
              color:'var(--muted-foreground)'}}>{it.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalLabel({ n, title, desc }) {
  return (
    <div style={{
      display:'flex', alignItems:'baseline', gap:8, marginTop:2, marginBottom:4,
      fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
      letterSpacing:'0.06em', color:'var(--muted-foreground)',
      textTransform:'uppercase',
    }}>
      <span style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:18, height:18, borderRadius:4,
        background:'var(--chat)', color:'var(--primary-foreground)',
        fontWeight:600, fontSize:10,
      }}>{n}</span>
      <span style={{color:'var(--foreground)', fontWeight:500}}>{title}</span>
      <span style={{textTransform:'none', letterSpacing:0, fontSize:11,
        fontFamily:'var(--serif, Fraunces), serif', fontStyle:'italic',
        color:'var(--muted-foreground)'}}>— {desc}</span>
    </div>
  );
}

function TypingRow({ name, color }) {
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'10px 0 4px 54px',
      fontSize:12, color:'var(--muted-foreground)', fontStyle:'italic', fontFamily:'var(--serif, Fraunces), serif'}}>
      <div style={{display:'flex', gap:3}}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width:5, height:5, borderRadius:'50%', background: color,
            animation:`pn-bounce 1.1s ${i*0.15}s ease-in-out infinite`,
          }}/>
        ))}
      </div>
      {name} is writing…
    </div>
  );
}

window.ChatScreen = ChatScreen;

// ── GIF popover ─────────────────────────────────────────────────────────
function GifPopover() {
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
  const cats = ['Trending','Reactions','Greetings','Sports','Animals','Mood'];
  return (
    <div style={{
      position:'absolute', right:22, bottom:'calc(100% - 14px)',
      width:340, marginBottom:8,
      background:'var(--popover)', color:'var(--popover-foreground)',
      border:'1px solid var(--border-strong)', borderRadius:'var(--radius-lg)',
      boxShadow:'0 16px 40px oklch(0.05 0.005 60 / 0.45)',
      overflow:'hidden', zIndex:5,
    }}>
      <div style={{padding:'10px 12px 8px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', gap:8}}>
        <Serif style={{fontSize:13.5, fontWeight:500, flex:1}}>Send a GIF</Serif>
        <Mono style={{fontSize:9.5, color:'var(--muted-foreground)',
          letterSpacing:'0.08em', textTransform:'uppercase'}}>powered by tenor</Mono>
      </div>
      <div style={{padding:'10px 12px'}}>
        <div style={{
          display:'flex', alignItems:'center', gap:8, padding:'0 10px', height:30,
          background:'var(--input)', borderRadius:'var(--radius-sm)',
          border:'1px solid var(--border)', color:'var(--muted-foreground)', fontSize:12,
        }}>
          {Icons.search}<span>Search GIFs · "celebrate"</span>
        </div>
      </div>
      <div style={{padding:'0 12px 8px', display:'flex', gap:6, flexWrap:'wrap'}}>
        {cats.map((c, i) => (
          <span key={c} style={{
            padding:'3px 8px', borderRadius:20,
            border:'1px solid var(--border)',
            background: i === 0 ? 'color-mix(in oklab, var(--chat) 14%, transparent)' : 'transparent',
            color: i === 0 ? 'var(--chat)' : 'var(--muted-foreground)',
            fontSize:10.5, fontFamily:'JetBrains Mono, monospace',
            letterSpacing:'0.04em',
          }}>{c}</span>
        ))}
      </div>
      <div style={{
        padding:'0 12px 12px',
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:6,
        maxHeight:240, overflow:'hidden',
      }}>
        {tiles.map((t, i) => (
          <div key={i} style={{
            aspectRatio:'4/3', borderRadius:8, overflow:'hidden',
            border:'1px solid var(--border)',
            background: tileBg(t),
            position:'relative',
            display:'flex', alignItems:'flex-end',
          }}>
            <div style={{
              padding:'4px 6px', width:'100%',
              background:'linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)',
              fontFamily:'JetBrains Mono, monospace', fontSize:9,
              color:'var(--muted-foreground)',
              letterSpacing:'0.04em', textTransform:'uppercase',
            }}>{t.label}</div>
            <div style={{
              position:'absolute', top:6, right:6,
              padding:'1px 5px', borderRadius:3,
              background:'oklch(0.18 0.01 60 / 0.7)',
              fontFamily:'JetBrains Mono, monospace', fontSize:8.5,
              color:'var(--foreground)',
            }}>GIF</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drop overlay ─────────────────────────────────────────────────────────
function DropOverlay() {
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:40,
      background:'oklch(0.10 0.005 60 / 0.55)',
      backdropFilter:'blur(2px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:32, pointerEvents:'none',
      animation:'pn-fade-in 140ms ease-out',
    }}>
      <div style={{
        flex:1, alignSelf:'stretch',
        margin:'80px 22px 110px 264px',
        border:'1.5px dashed var(--chat)',
        borderRadius:'var(--radius-lg)',
        background:'color-mix(in oklab, var(--chat) 8%, transparent)',
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', gap:12, color:'var(--foreground)',
      }}>
        <div style={{
          width:56, height:56, borderRadius:'50%',
          border:'1.5px solid var(--chat)',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'var(--chat)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5"/>
            <path d="M5 20h14"/>
          </svg>
        </div>
        <Serif style={{fontSize:22, fontWeight:400, letterSpacing:'-0.01em'}}>
          Drop files to attach
        </Serif>
        <Mono style={{fontSize:11, color:'var(--muted-foreground)',
          letterSpacing:'0.08em', textTransform:'uppercase'}}>
          up to 100 MB · images, video, docs
        </Mono>
      </div>
    </div>
  );
}

// ── Composer: per-file upload progress ───────────────────────────────────
function ComposerUploadList() {
  const items = [
    {name:'studio-window.jpg',  size:'2.1 MB',  pct:78, ext:'JPG'},
    {name:'voice-explorations.mp4', size:'14.8 MB', pct:42, ext:'MP4'},
    {name:'token-handoff.pdf',  size:'420 KB', pct:100, ext:'PDF'},
  ];
  return (
    <div style={{
      display:'flex', flexDirection:'column', gap:6,
      padding:'4px 4px 10px', marginBottom:6,
      borderBottom:'1px solid var(--border)',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'7px 10px', borderRadius:'var(--radius-sm)',
          background:'var(--muted)', border:'1px solid var(--border)',
        }}>
          <div style={{
            width:26, height:26, borderRadius:5, flexShrink:0,
            background:'var(--card)', border:'1px solid var(--border-strong)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'JetBrains Mono, monospace', fontSize:8.5, fontWeight:600,
            color:'var(--chat)',
          }}>{it.ext}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:4}}>
              <span style={{fontSize:11.5, fontWeight:500,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1}}>
                {it.name}</span>
              <Mono style={{fontSize:9.5, color:'var(--muted-foreground)',
                letterSpacing:'0.04em'}}>
                {it.pct === 100 ? `${it.size} · done` : `${it.pct}% · ${it.size}`}
              </Mono>
            </div>
            <div style={{
              height:3, borderRadius:3, overflow:'hidden',
              background:'color-mix(in oklab, var(--foreground) 8%, transparent)',
            }}>
              <div style={{
                height:'100%', width:`${it.pct}%`,
                background: it.pct === 100 ? 'var(--success)' : 'var(--chat)',
                transition:'width 200ms',
              }}/>
            </div>
          </div>
          <button style={{
            width:22, height:22, borderRadius:4, border:'none',
            background:'transparent', color:'var(--muted-foreground)',
            cursor:'pointer', fontSize:14, lineHeight:1,
          }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Composer: name+ext chips (no thumbs) ─────────────────────────────────
function ComposerChipList() {
  const chips = [
    {name:'studio-window', ext:'jpg'},
    {name:'voice-explorations', ext:'mp4'},
    {name:'pinai-tokens.oklch', ext:'css'},
    {name:'review-notes', ext:'md'},
  ];
  return (
    <div style={{
      display:'flex', flexWrap:'wrap', gap:6,
      padding:'4px 4px 10px', marginBottom:6,
      borderBottom:'1px solid var(--border)',
    }}>
      {chips.map((c, i) => (
        <span key={i} style={{
          display:'inline-flex', alignItems:'center', gap:8,
          padding:'4px 4px 4px 10px', borderRadius:20,
          background:'var(--muted)', border:'1px solid var(--border)',
          fontSize:11.5, color:'var(--foreground)',
        }}>
          <span style={{
            fontFamily:'JetBrains Mono, monospace', fontSize:9, fontWeight:600,
            color:'var(--chat)', letterSpacing:'0.06em',
          }}>{c.ext.toUpperCase()}</span>
          <span style={{
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            maxWidth:160,
          }}>{c.name}.{c.ext}</span>
          <button style={{
            width:18, height:18, borderRadius:'50%',
            border:'none', background:'var(--card)',
            color:'var(--muted-foreground)', cursor:'pointer',
            fontSize:11, lineHeight:1,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>×</button>
        </span>
      ))}
      <button style={{
        padding:'4px 12px', borderRadius:20,
        background:'transparent', border:'1px dashed var(--border-strong)',
        color:'var(--muted-foreground)', fontSize:11,
        fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em',
        cursor:'pointer',
      }}>+ add file</button>
    </div>
  );
}

function SingleImageAttachment({ item, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop:6, padding:0, cursor:'zoom-in',
        border:'1px solid var(--border)', borderRadius:'var(--radius)',
        overflow:'hidden', background:'transparent', display:'block',
        width:'100%', maxWidth:560, textAlign:'left',
      }}
    >
      <div style={{
        width:'100%',
        aspectRatio: `${item.w || 880} / ${item.h || 560}`,
        background: tileBg(item),
        position:'relative',
        display:'flex', alignItems:'flex-end',
      }}>
        <div style={{
          position:'absolute', top:10, right:10,
          padding:'4px 8px', borderRadius:6,
          background:'oklch(0.18 0.01 60 / 0.6)',
          color:'var(--foreground)',
          fontFamily:'JetBrains Mono, monospace', fontSize:9.5,
          letterSpacing:'0.06em', textTransform:'uppercase',
          backdropFilter:'blur(6px)',
        }}>Click to expand</div>
        <div style={{
          padding:'10px 14px', width:'100%',
          background:'linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)',
          color:'var(--muted-foreground)',
          fontFamily:'JetBrains Mono, monospace', fontSize:11,
          display:'flex', justifyContent:'space-between', gap:12,
        }}>
          <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</span>
          <span style={{flexShrink:0}}>{item.size}</span>
        </div>
      </div>
    </button>
  );
}

function ImageLightbox({ item, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position:'absolute', inset:0, zIndex:50,
        background:'oklch(0.10 0.005 60 / 0.82)',
        backdropFilter:'blur(8px)',
        display:'flex', flexDirection:'column',
        animation:'pn-fade-in 180ms ease-out',
      }}
    >
      {/* top bar */}
      <div style={{
        display:'flex', alignItems:'center', gap:14, padding:'14px 22px',
        color:'var(--foreground)',
      }}>
        <Avatar name={item.sender} color="oklch(0.72 0.07 330)" size={28}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:12.5, fontWeight:500}}>{item.sender}</div>
          <div style={{fontSize:10.5, color:'var(--muted-foreground)',
            fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'}}>
            {item.name} · {item.size} · {item.time}
          </div>
        </div>
        <button style={{
          fontSize:10.5, padding:'6px 12px', borderRadius:6,
          border:'1px solid var(--border-strong)', background:'transparent',
          color:'var(--foreground)', cursor:'pointer',
          fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.06em',
          textTransform:'uppercase',
        }}>Download</button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            width:32, height:32, borderRadius:'var(--radius-sm)',
            border:'1px solid var(--border-strong)', background:'transparent',
            color:'var(--foreground)', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:18, lineHeight:1,
          }}>×</button>
      </div>

      {/* image stage */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'0 32px 16px',
        }}
      >
        <div style={{
          width:'100%', maxWidth:'min(96%, 1080px)',
          aspectRatio: `${item.w || 880} / ${item.h || 560}`,
          maxHeight:'100%',
          borderRadius:'var(--radius-lg)',
          border:'1px solid var(--border)',
          background: tileBg(item),
          boxShadow:'0 24px 60px oklch(0.05 0.005 60 / 0.5)',
        }}/>
      </div>

      {/* footnote */}
      <div style={{
        padding:'10px 22px 18px',
        fontFamily:'JetBrains Mono, monospace', fontSize:10,
        letterSpacing:'0.08em', textTransform:'uppercase',
        color:'var(--muted-foreground)',
        display:'flex', gap:18,
      }}>
        <span>esc · close</span>
        <span>↓ · save</span>
        <span style={{marginLeft:'auto'}}>1 of 1</span>
      </div>
    </div>
  );
}
