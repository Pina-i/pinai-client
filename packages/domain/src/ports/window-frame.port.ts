/** The colours of the system's window buttons, as `#rrggbb`. */
export interface TitleBarColors {
    /** The bar behind them. */
    background: string
    /** Their glyphs. */
    symbols: string
}

/** The desktop app's window, whose title bar the page draws; the browser's tab has none. */
export interface IWindowFramePort {
    /** Colours the system's buttons over the page's title bar like the page. */
    paintTitleBar(colors: TitleBarColors): Promise<void>
}
