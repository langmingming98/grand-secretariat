'use client'

/**
 * Style Guide Page
 *
 * Grand Secretariat Design System
 * Woodblock Print Aesthetic
 * Inspired by: Omnipotent Youth Society album art
 */

export default function StyleGuidePage() {
  return (
    <div className="min-h-screen bg-canvas-200 text-ink-900">
      {/* Header - Woodblock style */}
      <header className="bg-ink-texture text-canvas-200 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="font-brush text-7xl mb-4 text-canvas-300 tracking-wider">
            內閣
          </h1>
          <p className="heading-display text-canvas-400 text-base mb-2">
            Grand Secretariat
          </p>
          <p className="text-canvas-500 text-sm tracking-wide">
            Woodblock Print Design System
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-24">

        {/* Typography */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            TYPOGRAPHY
          </h2>

          <div className="bg-canvas-100 border-2 border-ink-800 p-8 space-y-8" style={{ boxShadow: '4px 4px 0 rgba(28, 26, 24, 0.15)' }}>
            {/* Brush font - Logo only */}
            <div>
              <p className="text-xs text-ink-500 mb-2 uppercase tracking-widest">Zhi Mang Xing — Logo Only</p>
              <p className="font-brush text-6xl text-ink-950 tracking-wider">
                內閣
              </p>
            </div>

            {/* Display font - English headers */}
            <div>
              <p className="text-xs text-ink-500 mb-2 uppercase tracking-widest">Crimson Pro — English Headers</p>
              <p className="font-display text-3xl font-bold text-ink-900 tracking-wide">
                Grand Secretariat
              </p>
            </div>

            {/* Chinese serif - All Chinese text */}
            <div>
              <p className="text-xs text-ink-500 mb-2 uppercase tracking-widest">Noto Serif TC — Chinese Text</p>
              <p className="font-serif-tc text-2xl text-ink-900 leading-relaxed">
                三楊內閣 · 明初傳奇內閣
              </p>
              <p className="font-serif-tc text-lg text-ink-700 leading-relaxed max-w-xl mt-2">
                楊士奇、楊榮、楊溥三人同朝輔政二十餘年，開創內閣制度的黃金時代。
              </p>
            </div>

            {/* Sans-serif - Chat/body text */}
            <div>
              <p className="text-xs text-ink-500 mb-2 uppercase tracking-widest">DM Sans — Chat & Body Text</p>
              <p className="font-sans text-base text-ink-700 leading-relaxed max-w-xl">
                This is the default body font for chat messages and general content. DM Sans is a geometric humanist sans-serif, similar to Styrene B used by Claude.
              </p>
            </div>

            {/* Combined logo */}
            <div>
              <p className="text-xs text-ink-500 mb-2 uppercase tracking-widest">Combined Logo</p>
              <p className="text-2xl">
                <span className="font-brush text-3xl text-ink-900">內閣</span>
                <span className="mx-3 text-ink-400">·</span>
                <span className="font-display tracking-wide">GRAND SECRETARIAT</span>
              </p>
            </div>
          </div>
        </section>

        {/* Textures */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            TEXTURES
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div className="h-40 bg-canvas-texture flex items-center justify-center border-2 border-ink-300">
              <span className="font-display text-ink-700 text-sm tracking-wide">.bg-canvas-texture</span>
            </div>
            <div className="h-40 bg-rice-paper flex items-center justify-center border-2 border-ink-300">
              <span className="font-display text-ink-700 text-sm tracking-wide">.bg-rice-paper</span>
            </div>
            <div className="h-40 bg-ink-texture flex items-center justify-center">
              <span className="font-display text-canvas-400 text-sm tracking-wide">.bg-ink-texture</span>
            </div>
            <div className="h-40 bg-vermillion-solid flex items-center justify-center">
              <span className="font-display text-white text-sm tracking-wide">.bg-vermillion-solid</span>
            </div>
          </div>
        </section>

        {/* Color Palette */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            COLOR PALETTE
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
            <ColorPalette name="Vermillion" prefix="vermillion" />
            <ColorPalette name="Ink" prefix="ink" />
            <ColorPalette name="Canvas" prefix="canvas" />
            <ColorPalette name="Seal" prefix="seal" />
            <ColorPalette name="Jade" prefix="jade" />
            <ColorPalette name="Bronze" prefix="bronze" />
          </div>
        </section>

        {/* Decorative */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            DECORATIVE ELEMENTS
          </h2>

          <div className="space-y-8">
            {/* Seal stamps */}
            <div className="bg-canvas-100 p-6 border-2 border-ink-300">
              <p className="text-xs text-ink-500 mb-4 uppercase tracking-widest">Seal Stamps</p>
              <div className="flex gap-6 items-center">
                <span className="seal-stamp font-display">OFFICIAL</span>
                <span className="seal-stamp font-brush text-xl">內閣</span>
                <span className="seal-stamp-filled font-display">APPROVED</span>
                <span className="seal-stamp-filled font-brush text-xl">印</span>
              </div>
            </div>

            {/* Woodblock frame */}
            <div className="bg-canvas-100 p-6 border-2 border-ink-300">
              <p className="text-xs text-ink-500 mb-4 uppercase tracking-widest">Woodblock Frame</p>
              <div className="woodblock-frame bg-canvas-200 p-8 text-center">
                <p className="font-brush text-3xl text-ink-900">龍</p>
              </div>
            </div>

            {/* Dividers */}
            <div className="bg-canvas-100 p-6 border-2 border-ink-300">
              <p className="text-xs text-ink-500 mb-4 uppercase tracking-widest">Dividers</p>
              <div className="divider-woodblock"></div>
              <div className="divider-ornament"></div>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            BUTTONS
          </h2>

          <div className="flex flex-wrap gap-4">
            <button className="btn-ink">Ink Button</button>
            <button className="btn-vermillion">Vermillion</button>
            <button className="btn-outline">Outline</button>
          </div>
        </section>

        {/* Cards */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            CARDS
          </h2>

          <div className="grid grid-cols-3 gap-6">
            <div className="card-canvas p-6">
              <h3 className="font-display font-semibold text-ink-900 mb-2">Canvas Card</h3>
              <p className="text-sm text-ink-600">.card-canvas</p>
            </div>

            <div className="card-ink p-6">
              <h3 className="font-display font-semibold text-ink-900 mb-2">Ink Card</h3>
              <p className="text-sm text-ink-600">.card-ink</p>
            </div>

            <div className="card-vermillion p-6">
              <h3 className="font-display font-semibold text-ink-900 mb-2">Vermillion Card</h3>
              <p className="text-sm text-ink-600">.card-vermillion</p>
            </div>
          </div>
        </section>

        {/* Hero Options */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            HERO SECTIONS
          </h2>

          {/* Option 1: Monochrome ink - NO red, just ink + cream */}
          <div className="mb-8">
            <div className="bg-ink-texture py-20 px-8">
              <div className="text-center">
                <h1 className="font-brush text-7xl text-canvas-300 tracking-wider mb-4">
                  內閣
                </h1>
                <p className="font-display text-canvas-400 text-sm tracking-[0.25em] uppercase mb-8">
                  Grand Secretariat — Collaborative AI Council
                </p>
                <div className="flex justify-center gap-4">
                  <button className="px-6 py-3 rounded-sm bg-canvas-300 text-ink-900 font-display font-semibold tracking-wide uppercase text-sm border-2 border-canvas-400 transition-all duration-200 hover:bg-canvas-200" style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>
                    Create Room
                  </button>
                  <button className="px-6 py-3 rounded-sm bg-transparent text-canvas-400 font-display font-semibold tracking-wide uppercase text-sm border-2 border-canvas-500 transition-all duration-200 hover:border-canvas-300 hover:text-canvas-200">
                    Explore
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-ink-500 mt-2 text-center">Option 1: Monochrome — ink texture + cream tones only (recommended)</p>
          </div>

          {/* Option 2: Vermillion with texture - consistent pure white */}
          <div>
            <div className="bg-vermillion-texture py-20 px-8">
              <div className="text-center">
                <h1 className="font-brush text-7xl text-white tracking-wider mb-4 text-woodblock">
                  內閣
                </h1>
                <p className="font-display text-white text-sm tracking-[0.3em] uppercase mb-8">
                  Grand Secretariat
                </p>
                <div className="flex justify-center gap-4">
                  <button className="px-6 py-3 rounded-sm bg-white text-vermillion-800 font-display font-semibold tracking-wide uppercase text-sm border-2 border-white transition-all duration-200 hover:bg-white/90" style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>
                    Create Room
                  </button>
                  <button className="px-6 py-3 rounded-sm bg-transparent text-white font-display font-semibold tracking-wide uppercase text-sm border-2 border-white transition-all duration-200 hover:bg-white/10">
                    Explore
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-ink-500 mt-2 text-center">Option 2: Vermillion with texture — pure white throughout</p>
          </div>
        </section>

        {/* Chat Messages */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            CHAT MESSAGES
          </h2>

          <div className="bg-rice-paper border-2 border-ink-300 p-6 space-y-4">
            {/* Human */}
            <div className="flex gap-3">
              <div className="avatar avatar-human flex-shrink-0">U</div>
              <div className="message-human px-4 py-3 max-w-md">
                <p className="font-sans text-ink-700">What do you think about this design?</p>
              </div>
            </div>

            {/* Claude - Vermillion */}
            <div className="flex gap-3">
              <div className="avatar avatar-vermillion flex-shrink-0">C</div>
              <div className="message-llm message-llm-vermillion px-4 py-3 max-w-md">
                <p className="text-xs text-vermillion-700 font-sans font-medium mb-1">Claude · Safety Researcher</p>
                <p className="font-sans text-ink-700">The woodblock aesthetic brings gravitas and historical depth...</p>
              </div>
            </div>

            {/* GPT - Jade */}
            <div className="flex gap-3">
              <div className="avatar avatar-jade flex-shrink-0">G</div>
              <div className="message-llm message-llm-jade px-4 py-3 max-w-md">
                <p className="text-xs text-jade-700 font-sans font-medium mb-1">GPT · Policy Expert</p>
                <p className="font-sans text-ink-700">I appreciate the balance of traditional and modern elements...</p>
              </div>
            </div>

            {/* Grok - Cyber */}
            <div className="flex gap-3">
              <div className="avatar avatar-cyber flex-shrink-0">X</div>
              <div className="message-llm message-llm-cyber px-4 py-3 max-w-md">
                <p className="text-xs text-cyber-700 font-sans font-medium mb-1">Grok · Accelerationist</p>
                <p className="font-sans text-ink-700">Ship it! The rawness is refreshing. Less polish, more soul.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Room Cards */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-900 mb-8 tracking-wide">
            ROOM CARDS
          </h2>

          <div className="space-y-3">
            <div className="bg-canvas-100 hover:bg-canvas-200 border-2 border-ink-300 hover:border-ink-500 p-5 transition-all cursor-pointer" style={{ boxShadow: '3px 3px 0 rgba(28, 26, 24, 0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-sans font-semibold text-ink-900 text-lg">AI Safety Council</h3>
                <span className="text-xs text-ink-500 font-sans">Today</span>
              </div>
              <p className="text-sm text-ink-600 mb-3 font-sans">Debating alignment, safety, and governance</p>
              <div className="flex gap-2">
                <span className="text-xs px-2 py-1 bg-vermillion-100 text-vermillion-800 border border-vermillion-200 font-sans">Accelerationist</span>
                <span className="text-xs px-2 py-1 bg-jade-100 text-jade-800 border border-jade-200 font-sans">Safety First</span>
                <span className="text-xs px-2 py-1 bg-cyber-100 text-cyber-800 border border-cyber-200 font-sans">Policy Mind</span>
              </div>
            </div>

            <div className="bg-canvas-100 hover:bg-canvas-200 border-2 border-ink-300 hover:border-bronze-500 p-5 transition-all cursor-pointer" style={{ boxShadow: '3px 3px 0 rgba(28, 26, 24, 0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-serif-tc font-semibold text-ink-900 text-xl">三楊內閣</h3>
                <span className="text-xs text-ink-500 font-sans">Yesterday</span>
              </div>
              <p className="text-sm text-ink-600 mb-3 font-serif-tc">明初傳奇內閣，開創內閣制度的黃金時代</p>
              <div className="flex gap-2">
                <span className="text-xs px-2 py-1 bg-bronze-100 text-bronze-800 border border-bronze-200 font-serif-tc">楊士奇</span>
                <span className="text-xs px-2 py-1 bg-bronze-100 text-bronze-800 border border-bronze-200 font-serif-tc">楊榮</span>
                <span className="text-xs px-2 py-1 bg-bronze-100 text-bronze-800 border border-bronze-200 font-serif-tc">楊溥</span>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-ink-950 text-canvas-500 py-16 mt-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="font-brush text-4xl text-canvas-400 mb-2">內閣</p>
          <p className="font-display text-sm tracking-widest uppercase">Grand Secretariat</p>
        </div>
      </footer>
    </div>
  )
}

// Color definitions for the palette display
const COLOR_MAP: Record<string, Record<number, string>> = {
  vermillion: {
    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
    500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
  },
  ink: {
    50: '#f7f7f6', 100: '#e5e4e2', 200: '#cccac6', 300: '#a8a5a0', 400: '#85817a',
    500: '#6b6660', 600: '#56524d', 700: '#474440', 800: '#3b3936', 900: '#2a2826', 950: '#1c1a18',
  },
  canvas: {
    50: '#faf9f7', 100: '#f3f1ed', 200: '#e8e4dc', 300: '#d9d3c5', 400: '#c4bba8',
    500: '#a89f8b', 600: '#8f856f', 700: '#766d5a', 800: '#625a4b', 900: '#514a3f', 950: '#2c2721',
  },
  seal: {
    50: '#fdf3f3', 100: '#fce4e4', 200: '#facece', 300: '#f5abab', 400: '#ed7b7b',
    500: '#e15252', 600: '#cc3333', 700: '#ab2828', 800: '#8d2424', 900: '#752424', 950: '#3f0e0e',
  },
  jade: {
    50: '#f4f9f4', 100: '#e6f2e6', 200: '#cee5cf', 300: '#a6d0a9', 400: '#76b37b',
    500: '#529458', 600: '#3f7944', 700: '#346138', 800: '#2d4e30', 900: '#264129', 950: '#112314',
  },
  bronze: {
    50: '#faf8f3', 100: '#f3efe2', 200: '#e6ddc4', 300: '#d5c69e', 400: '#c2aa76',
    500: '#b4955a', 600: '#a17c4a', 700: '#86633f', 800: '#6e5138', 900: '#5b4431', 950: '#322318',
  },
}

function ColorPalette({ name, prefix }: { name: string; prefix: string }) {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
  const colors = COLOR_MAP[prefix] || {}

  return (
    <div>
      <p className="text-sm font-display font-semibold text-ink-700 mb-3 tracking-wide uppercase">{name}</p>
      <div className="space-y-1">
        {shades.map((shade) => (
          <div
            key={shade}
            className="h-5 flex items-center justify-between px-2"
            style={{ backgroundColor: colors[shade] }}
          >
            <span className={`text-xs font-display ${shade < 400 ? 'text-ink-700' : 'text-white'}`}>
              {shade}
            </span>
            <span className={`text-xs font-mono ${shade < 400 ? 'text-ink-500' : 'text-white/70'}`}>
              {colors[shade]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
