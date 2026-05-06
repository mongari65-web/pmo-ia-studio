'use client'
import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'

export default function PropalePage() {
  const [form, setForm] = useState({ client: '', mission: 'Chef de Projet', tjm: '700', duree: '6 mois', contexte: '' })
  const [generating, setGen] = useState(false)
  const [result, setResult]  = useState('')

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function generate() {
    setGen(true); setResult('')
    const prompt = `Génère une proposition commerciale professionnelle en français pour une mission de ${form.mission}.
CLIENT : ${form.client || 'Client confidentiel'}
TJM : ${form.tjm}€/jour | DURÉE : ${form.duree}
CONTEXTE : ${form.contexte || 'Mission de conseil en management de projet'}
PROFIL CP : Abdelhafid Touil, PMP® certifié, 22 ans expérience (CEA Saclay, BNP Paribas, SNCF, Orange)
Inclure : synthèse exécutive, compréhension du besoin, approche proposée, expériences références, conditions commerciales, planning d'intervention.`
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, docType: 'propale' }) })
      const data = await res.json()
      setResult(data.text || data.error)
    } catch (e: any) { setResult('Erreur : ' + e.message) }
    setGen(false)
  }

  return (
    <AppLayout>
      <div className="sec-label">// Commercial</div>
      <h1 className="sec-title">Générateur de proposition commerciale</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
        <div className="card">
          <div className="card-hdr"><div className="card-title">💼 Paramètres</div></div>
          <div className="card-body">
            <div className="fg"><label className="fl">Client</label><input className="fi" placeholder="Nom du client..." value={form.client} onChange={e => set('client', e.target.value)} /></div>
            <div className="fg"><label className="fl">Type de mission</label>
              <select className="fi fi-select" value={form.mission} onChange={e => set('mission', e.target.value)}>
                <option>Chef de Projet</option><option>PMO</option><option>Chef de Projet IA</option><option>Consultant management</option><option>Directeur de projet</option>
              </select>
            </div>
            <div className="grid-2">
              <div className="fg"><label className="fl">TJM (€/jour)</label><input className="fi" type="number" value={form.tjm} onChange={e => set('tjm', e.target.value)} /></div>
              <div className="fg"><label className="fl">Durée</label>
                <select className="fi fi-select" value={form.duree} onChange={e => set('duree', e.target.value)}>
                  <option>3 mois</option><option>6 mois</option><option>9 mois</option><option>12 mois</option><option>18 mois</option>
                </select>
              </div>
            </div>
            <div className="fg"><label className="fl">Contexte de la mission</label><textarea className="fi" rows={4} placeholder="Décrire le contexte, les enjeux, les objectifs..." value={form.contexte} onChange={e => set('contexte', e.target.value)} style={{ resize: 'vertical' }} /></div>
            <button className="btn-gold" style={{ width: '100%' }} onClick={generate} disabled={generating}>
              {generating ? '⏳ Génération...' : '⚡ Générer la proposition'}
            </button>
          </div>
        </div>
        <div>
          {(generating || result) ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{generating ? '⏳ Génération...' : '✓ Proposition générée'}</div>
                {result && <button onClick={() => navigator.clipboard?.writeText(result)} style={{ padding: '4px 10px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--mono)' }}>Copier</button>}
              </div>
              <div className="gen-result">{generating ? 'Génération en cours...' : result}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, background: 'var(--ink2)', border: '1px solid var(--line)', borderRadius: 12 }}>
              <div style={{ textAlign: 'center', opacity: .5 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>💼</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Remplissez les paramètres et cliquez sur Générer</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
