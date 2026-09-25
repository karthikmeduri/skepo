import { Bot as BotIcon, BookOpen, ChevronLeft, ChevronRight, Download, MessageSquare, Network, PanelsTopLeft, Plus, Search, Settings, Sparkles } from 'lucide-react'
import type { Bot, Conversation } from '../types'
import { formatRelative } from '../lib'

export type View = 'chat' | 'bots' | 'models' | 'ledger' | 'runs' | 'web' | 'settings'

interface Props {
  collapsed: boolean
  view: View
  bots: Bot[]
  conversations: Conversation[]
  activeConversationId?: string
  onToggle(): void
  onView(view: View): void
  onNewChat(): void
  onSelectConversation(id: string): void
  onSearch(): void
}

export function Sidebar(props: Props) {
  const recent = [...props.conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 16)
  return <aside className={`sidebar ${props.collapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-top">
      <button className="new-chat" onClick={props.onNewChat} aria-label="New chat"><Plus size={18} /><span>New chat</span></button>
      <button className="icon-button" onClick={props.onSearch} aria-label="Search conversations"><Search size={18} /></button>
    </div>
    <nav className="main-nav" aria-label="Main navigation">
      <button className={props.view === 'bots' ? 'active' : ''} onClick={() => props.onView('bots')}><BotIcon size={18} /><span>Bots</span><b>{props.bots.length}</b></button>
      <button className={props.view === 'models' ? 'active' : ''} onClick={() => props.onView('models')}><Download size={18} /><span>Models</span></button>
      <button className={props.view === 'ledger' ? 'active' : ''} onClick={() => props.onView('ledger')}><BookOpen size={18} /><span>Shared Ledger</span></button>
      <button className={props.view === 'runs' ? 'active' : ''} onClick={() => props.onView('runs')}><Network size={18} /><span>Execution Board</span></button>
      <button className={props.view === 'web' ? 'active' : ''} onClick={() => props.onView('web')}><PanelsTopLeft size={18} /><span>Web Harness</span></button>
    </nav>
    {!props.collapsed && <>
      <div className="section-label"><span>Recent</span></div>
      <div className="conversation-list">
        {recent.length === 0 && <div className="empty-recents"><MessageSquare size={18} /><span>Your conversations will appear here</span></div>}
        {recent.map(conversation => {
          const bot = props.bots.find(item => item.id === conversation.botId)
          return <button key={conversation.id} className={conversation.id === props.activeConversationId && props.view === 'chat' ? 'active' : ''} onClick={() => props.onSelectConversation(conversation.id)}>
            <span className="conversation-title">{conversation.title}</span>
            <span className="conversation-meta"><i style={{ background: bot?.avatarColor }} />{bot?.name ?? 'Deleted bot'} · {formatRelative(conversation.updatedAt)}</span>
          </button>
        })}
      </div>
    </>}
    <div className="sidebar-footer">
      <button className={props.view === 'settings' ? 'active' : ''} onClick={() => props.onView('settings')}><Settings size={18} /><span>Settings</span></button>
      {!props.collapsed && <div className="local-badge"><Sparkles size={15} /><div><strong>100% local</strong><span>Your prompts stay on this device</span></div></div>}
      <button className="collapse-button" onClick={props.onToggle} aria-label={props.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{props.collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span>Collapse</span></>}</button>
    </div>
  </aside>
}
