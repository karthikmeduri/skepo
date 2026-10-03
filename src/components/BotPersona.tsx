import { useId } from 'react'
import type { BotPersona as Persona } from '../types'

export function BotPersona({ persona = 'pulse', color, label, size = 'medium', active = false }: { persona?: Persona; color: string; label: string; size?: 'small' | 'medium' | 'large' | 'xl'; active?: boolean }) {
  const rawId = useId()
  const id = `${persona}-${rawId.replace(/:/g, '')}`
  return <span className={`bot-persona ${size} ${active ? 'active' : ''}`} style={{ '--persona-color': color } as React.CSSProperties} role="img" aria-label={`${label} persona`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`glow-${id}`} cx="35%" cy="28%" r="72%"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".22" stopColor={color} stopOpacity=".9" /><stop offset="1" stopColor={color} stopOpacity=".12" /></radialGradient>
        <filter id={`blur-${id}`}><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>
      <circle cx="50" cy="50" r="42" fill={color} opacity=".08" />
      {persona === 'pulse' && <><circle cx="50" cy="50" r="24" fill={`url(#glow-${id})`} /><circle cx="50" cy="50" r="34" fill="none" stroke={color} strokeOpacity=".52" strokeWidth="2" strokeDasharray="4 8" /></>}
      {persona === 'orbit' && <><circle cx="50" cy="50" r="18" fill={`url(#glow-${id})`} /><ellipse cx="50" cy="50" rx="38" ry="20" fill="none" stroke={color} strokeWidth="3" transform="rotate(-24 50 50)" /><circle cx="82" cy="36" r="5" fill="#fff" /></>}
      {persona === 'bloom' && <>{[0,60,120].map(angle => <ellipse key={angle} cx="50" cy="32" rx="14" ry="27" fill={color} opacity=".5" transform={`rotate(${angle} 50 50)`} />)}<circle cx="50" cy="50" r="15" fill={`url(#glow-${id})`} /></>}
      {persona === 'prism' && <><path d="M50 12 84 72 50 90 16 72Z" fill={color} opacity=".35" /><path d="M50 12 50 90 16 72Z" fill={`url(#glow-${id})`} /><path d="M50 12 84 72 50 90" fill="none" stroke="#fff" strokeOpacity=".62" strokeWidth="2" /></>}
      {persona === 'nova' && <><path d="M50 7 58 36 87 25 64 47 91 60 60 59 64 92 48 65 27 88 37 59 7 55 36 46 18 21 44 36Z" fill={color} opacity=".48" filter={`url(#blur-${id})`} /><circle cx="50" cy="50" r="20" fill={`url(#glow-${id})`} /></>}
      {persona === 'wave' && <><path d="M12 54c13-31 25 31 38 0s25 31 38 0" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" opacity=".5" /><path d="M15 44c12-20 23 20 35 0s23 20 35 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".75" /></>}
      <circle className="persona-spark" cx="67" cy="27" r="3.5" fill="#fff" />
    </svg>
  </span>
}
