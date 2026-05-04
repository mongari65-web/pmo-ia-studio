'use client'
import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'

const GENERATORS = [
  { id:'charte',       icon:'📋', label:'Charte de Projet',    sub:'Objectifs SMART, périmètre, jalons', color:'var(--purple)' },
  { id:'wbs',          icon:'📊', label:'WBS + Work Packages', sub:'3 niveaux, dictionnaire, fiches WP', color:'var(--blue)' },
  { id:'raid',         icon:'⚠',  label:'Registre RAID',       sub:'Risques, Actions, Issues, Décisions', color:'var(--red)' },
  { id:'raci',         icon:'🎯', label:'Matrice RACI',         sub:'Rôles, responsabilités, activités', color:'var(--gold)' },
  { id:'plan_recette', icon:'🧪', label:'Plan de recette',      sub:'VABF, VSR, GO/NO-GO, bascule', color:'var(--green)' },
  { id:'gantt',        icon:'📅', label:'Gantt + PERT',          sub:'Planning, chemin critique, jalons', color:'var(--cyan)' },
  { id:'pmp',          icon:'📄', label:'Plan Management',      sub:'PMP complet PMBOK 7', color:'var(--amber)' },
]

const PROMPTS: Record<string, string> = {
  charte: "Génère une Charte de Projet complète et professionnelle en français selon PMBOK 7 pour un projet de migration applicative en milieu industriel. Inclure : objectifs SMART, périmètre IN/OUT, parties prenantes, jalons, budget, risques initiaux, critères d'acceptation.",
  wbs: "Génère un WBS complet à 3 niveaux avec dictionnaire et fiches Work Packages en français selon PMBOK 7 pour un projet IT complexe.",
  raid: "Génère un Registre RAID complet (Risques, Actions, Issues, Décisions) en français selon PMBOK 7. Inclure 5 risques, 5 actions, 3 issues, 3 décisions avec tous les champs.",
  raci: "Génère une Matrice RACI complète en français selon PMBOK 7. Inclure tous les rôles MOA/MOE et les activités clés. 1 seul A par activité.",
  plan_recette: "Génère un Plan de Recette complet (VABF, VSR, GO/NO-GO) en français selon PMBOK 7. Inclure : stratégie, campagnes, gestion anomalies, fiche GO/NO-GO, procédure bascule.",
  gantt: "Génère un planning Gantt structuré avec jalons et analyse PERT en français selon PMBOK 7. Inclure phases, durées, dépendances, chemin critique.",
  pmp: "Génère un Plan de Management de Projet complet en français selon PMBOK 7 incluant les 12 domaines de performance.",
}

export default function GeneratorsPage() {
  const [active, setActive]     = useState('')
  const [generating, setGen]    = useState(false)
  const [result, setResult]     = useState('')
  const [customPrompt, setCP]   = useState('')

  async function generate(docType: string, prompt: string) {
    setActive(docType); setGen(true); setResult('')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, docType })
      })
      const data = await res.json()
      setResult(data.text || data.error || 'Erreur')
    } catch (e: any) {
      setResult('Erreur : ' + e.message)
    }
    setGen(false)
  }

  return (
    <AppLayout>
      <div className="sec-label">// Documents PMI</div>
      <h1 className="sec-title">Générateurs de documents</h1>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
        Générez des documents PMI sans les lier à un projet. Pour des documents liés à un projet spécifique, allez dans <strong style={{ color: 'var(--gold2)' }}>Mes projets → Sélectionner un projet</strong>.
      </p>

      <div className="gen-grid" style={{ marginBottom: 24 }}>
        {GENERATORS.map(g => (
          <div key={g.id} className="gen-card" style={{ '--gc': g.color } as any}
            onClick={() => !generating && generate(g.id, PROMPTS[g.id])}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>{g.icon}</div>
            <div style={{ fontFamily: 'var(--syne)', fontSize: 13, fontWeight: 600, color: active === g.id ? 'var(--gold2)' : 'var(--white)', marginBottom: 4 }}>{g.label}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>{g.sub}</div>
            {generating && active === g.id ? (
              <div style={{ fontSize: 10, color: 'var(--gold)' }}>⏳ Génération...</div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--gold2)' }}>Cliquer pour générer →</div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hdr"><div className="card-title">✏ Prompt personnalisé</div></div>
        <div className="card-body">
          <textarea className="fi" rows={4} placeholder="Décrivez précisément le document PMI que vous souhaitez générer..." value={customPrompt} onChange={e => setCP(e.target.value)} style={{ resize: 'vertical', marginBottom: 12 }} />
          <button className="btn-gold" onClick={() => customPrompt.trim() && generate('custom', customPrompt)} disabled={!customPrompt.trim() || generating}>
            ⚡ Générer avec ce prompt
          </button>
        </div>
      </div>

      {(generating || result) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
              {generating ? '⏳ Génération en cours...' : '✓ Document généré'}
            </div>
            {result && !generating && (
              <button onClick={() => navigator.clipboard?.writeText(result)}
                style={{ padding: '4px 10px', background: 'var(--ink3)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--mono)' }}>
                Copier
              </button>
            )}
          </div>
          <div className="gen-result">{generating ? 'Génération en cours...' : result}</div>
        </div>
      )}
    </AppLayout>
  )
}
