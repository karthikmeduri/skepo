import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type ToastData = { id: string; kind: 'success' | 'error'; message: string }
export function Toasts({ items, onDismiss }: { items: ToastData[]; onDismiss(id: string): void }) {
  return <div className="toast-stack" aria-live="polite">{items.map(item => <div className={`toast ${item.kind}`} key={item.id}>{item.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{item.message}</span><button onClick={() => onDismiss(item.id)} aria-label="Dismiss"><X size={15} /></button></div>)}</div>
}
