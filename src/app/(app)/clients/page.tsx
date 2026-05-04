'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', sector: '', contact_name: '', contact_email: '' })
  const [adding, setAdding] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('clients').select('*, projects(count)').eq('user_id', user.id).order('created_at', { ascending: false })
    setClients(data || [])
  }

  async function addClient() {
    if (!form.name.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('clients').insert({ user_id: user.id, ...form })
    setForm({ name: '', sector: '', contact_name: '', contact_email: '' })
    setAdding(false)
    load()
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div className="sec-label">// Portfolio</div>
          <h1 className="sec-title">Clients ({clients.length})</h1>
        </div>
        <button className="btn-gold" onClick={() => setAdding(!adding)}>+ Ajouter un client</button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-hdr"><div className="card-title">Nouveau client</div></div>
          <div className="card-body">
            <div className="grid-2">
              <div className="fg"><label className="fl">Nom *</label><input className="fi" placeholder="CEA Saclay" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="fg"><label className="fl">Secteur</label><input className="fi" placeholder="Énergie / Nucléaire" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} /></div>
              <div className="fg"><label className="fl">Contact</label><input className="fi" placeholder="Prénom Nom" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              <div className="fg"><label className="fl">Email</label><input className="fi" type="email" placeholder="contact@client.fr" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-gold" onClick={addClient}>Ajouter</button>
              <button className="btn-ghost" onClick={() => setAdding(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◎</div>
          <div style={{ fontFamily: 'var(--syne)', fontSize: 18, fontWeight: 600, color: 'var(--white)', marginBottom: 8 }}>Aucun client</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ajoutez vos clients pour les associer à vos projets.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {clients.map(c => (
            <div key={c.id} className="card">
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(200,168,75,.15)', color: 'var(--gold2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.name}</div>
                    {c.sector && <div style={{ fontSize: 11, color: 'var(--dim)' }}>{c.sector}</div>}
                  </div>
                </div>
                {c.contact_name && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>👤 {c.contact_name}</div>}
                {c.contact_email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>✉ {c.contact_email}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
