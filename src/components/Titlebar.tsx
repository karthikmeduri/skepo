import { Minus, Square, X } from 'lucide-react'

export function Titlebar() {
  return <header className="titlebar">
    <div className="titlebar-drag"><span className="app-mark">S</span><span>Skepo</span><span className="private-pill">Private</span></div>
    <div className="window-actions">
      <button aria-label="Minimize" onClick={() => window.localbot.windowMinimize()}><Minus size={15} /></button>
      <button aria-label="Maximize" onClick={() => window.localbot.windowMaximize()}><Square size={13} /></button>
      <button className="close" aria-label="Close" onClick={() => window.localbot.windowClose()}><X size={16} /></button>
    </div>
  </header>
}
