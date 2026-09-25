// Ambient wash for a `relative` full-bleed container. The film grain is one
// element for the whole document, in index.html; see the layer scale in index.css.
export function Backdrop() {
    return <div aria-hidden className="pn-amb" />
}
