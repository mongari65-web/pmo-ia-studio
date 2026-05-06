// components/pmo-shared.tsx
// Composants utilitaires partagés entre les pages PMO

export function EmptyState({ icon, label, hint }: { icon: string; label: string; hint: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#475569', background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 8, color: '#475569' }}>{hint}</div>
    </div>
  )
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#60a5fa', background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <div>{label}</div>
    </div>
  )
}
