'use client'
import AppLayout from '@/components/layout/AppLayout'

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="sec-label">// Paramètres</div>
      <h1 className="sec-title">Configuration</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-hdr"><div className="card-title">🤖 Modèle IA</div></div>
          <div className="card-body">
            <div className="fg"><label className="fl">Modèle Claude</label>
              <select className="fi fi-select">
                <option>claude-sonnet-4-5 (recommandé)</option>
              </select>
            </div>
            <div className="fg"><label className="fl">Langue</label>
              <select className="fi fi-select"><option>Français</option></select>
            </div>
            <div style={{ padding: '10px 14px', background: 'rgba(45,184,138,.06)', border: '1px solid rgba(45,184,138,.15)', borderRadius: 8, fontSize: 11, color: 'var(--green)' }}>
              ✓ API Claude connectée et opérationnelle
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hdr"><div className="card-title">🔗 Connecteurs MCP</div></div>
          <div className="card-body">
            {[
              { name: 'Notion', status: true },
              { name: 'Gmail', status: true },
              { name: 'Google Drive', status: true },
              { name: 'Google Calendar', status: true },
              { name: 'Stripe', status: false },
            ].map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{c.name}</span>
                <span style={{ fontSize: 10, color: c.status ? 'var(--green)' : 'var(--dim)' }}>{c.status ? '✓ Connecté' : '○ Non configuré'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
