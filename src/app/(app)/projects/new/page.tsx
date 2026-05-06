'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/components/layout/AppLayout'

const PROJECT_TYPES = [
  { id: 'migration',   icon: '🔄', label: 'Migration applicative',   sub: 'Migration SI, refonte, modernisation' },
  { id: 'infra',       icon: '🏗',  label: 'Infrastructure',          sub: 'Serveurs, cloud, datacenter' },
  { id: 'reseau',      icon: '🌐', label: 'Réseau & sécurité',       sub: 'LAN/WAN, firewall, sécurité' },
  { id: 'deploiement', icon: '⚡', label: 'Déploiement & intégration', sub: 'MEP, intégration continue' },
  { id: 'pra',         icon: '🛡', label: 'PRA / PCA',               sub: 'Plan reprise activité, continuité' },
  { id: 'solution_ia', icon: '🤖', label: 'Solution IA (CPMAI)',      sub: 'IA, ML, agents, data' },
  { id: 'rd_ia',       icon: '🔬', label: 'R&D IA / CIR',            sub: 'Recherche, innovation, brevets' },
  { id: 'secu',        icon: '🔒', label: 'Sécurité & conformité',   sub: 'ANSSI, ISO 27001, RGPD' },
  { id: 'devapp',      icon: '💻', label: 'Développement Agile',     sub: 'Scrum, SAFe, sprints' },
  { id: 'transfoSI',   icon: '🔁', label: 'Transformation SI',       sub: 'DSI, urbanisation, ERP' },
]

const SECTORS = ['Énergie / Nucléaire', 'Banque / Finance', 'Ferroviaire', 'Industrie / Défense', 'Administration publique', 'Télécoms', 'Santé', 'Retail / Distribution', 'Autre']

const CONSTRAINTS = ['ANSSI', 'RGPD', 'ISO 27001', 'Sûreté nucléaire', 'Haute disponibilité', 'Budget serré', 'Délai contraint', 'Équipes distribuées', 'Offshore', 'Réglementaire']

const STEPS = ['Type de projet', 'Informations', 'Secteur & Budget', 'Contraintes', 'Récapitulatif']

export default function NewProjectPage() {
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    project_type: '',
    name: '',
    description: '',
    client_name: '',
    sector: '',
    budget: '',
    duration: '',
    constraints: [] as string[],
    context: '',
  })

  function set(key: string, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function toggleConstraint(c: string) {
    setForm(f => ({
      ...f,
      constraints: f.constraints.includes(c)
        ? f.constraints.filter(x => x !== c)
        : [...f.constraints, c]
    }))
  }

  function canNext() {
    if (step === 0) return !!form.project_type
    if (step === 1) return !!form.name.trim()
    return true
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Créer le client si renseigné
    let client_id = null
    if (form.client_name.trim()) {
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', form.client_name.trim())
        .single()

      if (existing) {
        client_id = existing.id
      } else {
        const { data: newClient } = await supabase
          .from('clients')
          .insert({ user_id: user.id, name: form.client_name.trim(), sector: form.sector })
          .select()
          .single()
        client_id = newClient?.id
      }
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        user_id:      user.id,
        client_id,
        name:         form.name.trim(),
        project_type: form.project_type,
        sector:       form.sector,
        budget:       form.budget,
        duration:     form.duration,
        status:       'cadrage',
        progress:     0,
        context: {
          description:  form.description,
          client_name:  form.client_name,
          constraints:  form.constraints,
          context_text: form.context,
        }
      })
      .select()
      .single()

    if (error) {
      alert('Erreur lors de la création : ' + error.message)
      setSaving(false)
      return
    }

    router.push(`/projects/${project.id}`)
  }

  const typeInfo = PROJECT_TYPES.find(t => t.id === form.project_type)

  return (
    <AppLayout>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div className="sec-label">// Wizard de cadrage</div>
          <h1 className="sec-title">Nouveau projet</h1>
        </div>

        {/* Progress */}
        <div className="wizard-progress" style={{ marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s} className={`wizard-step${i === step ? ' active' : i < step ? ' done' : ''}`}
              onClick={() => i < step && setStep(i)}>
              <span className="wizard-step-num">{i < step ? '✓' : i + 1}</span>
              {s}
            </div>
          ))}
        </div>

        {/* ── ÉTAPE 0 : TYPE ── */}
        {step === 0 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.7 }}>
              Sélectionnez le type de projet — cela détermine les templates, les contraintes et les documents PMI générés.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
              {PROJECT_TYPES.map(t => (
                <div key={t.id}
                  onClick={() => set('project_type', t.id)}
                  style={{
                    background: form.project_type === t.id ? 'rgba(200,168,75,.1)' : 'var(--ink2)',
                    border: `1px solid ${form.project_type === t.id ? 'var(--gold)' : 'var(--line)'}`,
                    borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all .12s'
                  }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: form.project_type === t.id ? 'var(--gold2)' : 'var(--text)', marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{t.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ÉTAPE 1 : INFOS ── */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
              Renseignez les informations de base de votre projet.
            </p>
            {typeInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(200,168,75,.08)', border: '1px solid rgba(200,168,75,.2)', borderRadius: 8, marginBottom: 20 }}>
                <span style={{ fontSize: 18 }}>{typeInfo.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--gold2)' }}>{typeInfo.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{typeInfo.sub}</div>
                </div>
              </div>
            )}
            <div className="fg">
              <label className="fl">Nom du projet *</label>
              <input className="fi" placeholder="Ex : Migration SI CEA Saclay v2" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Client / Organisation</label>
              <input className="fi" placeholder="Ex : CEA Saclay, BNP Paribas..." value={form.client_name} onChange={e => set('client_name', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Description courte</label>
              <textarea className="fi" rows={3} placeholder="Décrivez brièvement l'objectif du projet..." value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* ── ÉTAPE 2 : SECTEUR & BUDGET ── */}
        {step === 2 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
              Ces informations permettent à l'IA d'adapter les documents au secteur et aux contraintes budgétaires.
            </p>
            <div className="fg">
              <label className="fl">Secteur d'activité</label>
              <select className="fi fi-select" value={form.sector} onChange={e => set('sector', e.target.value)}>
                <option value="">Sélectionner...</option>
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="fg">
                <label className="fl">Budget estimé</label>
                <select className="fi fi-select" value={form.budget} onChange={e => set('budget', e.target.value)}>
                  <option value="">Non défini</option>
                  <option>&lt; 50k€</option>
                  <option>50k – 150k€</option>
                  <option>150k – 500k€</option>
                  <option>500k – 1M€</option>
                  <option>&gt; 1M€</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Durée estimée</label>
                <select className="fi fi-select" value={form.duration} onChange={e => set('duration', e.target.value)}>
                  <option value="">Non définie</option>
                  <option>1 à 3 mois</option>
                  <option>3 à 6 mois</option>
                  <option>6 à 12 mois</option>
                  <option>12 à 24 mois</option>
                  <option>&gt; 24 mois</option>
                </select>
              </div>
            </div>
            <div className="fg">
              <label className="fl">Contexte spécifique</label>
              <textarea className="fi" rows={4} placeholder="Environnement technique, équipes, historique, enjeux particuliers..." value={form.context} onChange={e => set('context', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* ── ÉTAPE 3 : CONTRAINTES ── */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
              Sélectionnez les contraintes et exigences qui s'appliquent à ce projet. Ces informations enrichissent les documents générés.
            </p>
            <div className="fg">
              <label className="fl">Contraintes & exigences (sélection multiple)</label>
              <div className="chips">
                {CONSTRAINTS.map(c => (
                  <span key={c} className={`chip${form.constraints.includes(c) ? ' on' : ''}`}
                    onClick={() => toggleConstraint(c)}>
                    {form.constraints.includes(c) ? '✓ ' : ''}{c}
                  </span>
                ))}
              </div>
            </div>
            {form.constraints.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(200,168,75,.06)', border: '1px solid rgba(200,168,75,.15)', borderRadius: 8, fontSize: 11, color: 'var(--gold2)' }}>
                ✓ {form.constraints.length} contrainte{form.constraints.length > 1 ? 's' : ''} sélectionnée{form.constraints.length > 1 ? 's' : ''} : {form.constraints.join(', ')}
              </div>
            )}
          </div>
        )}

        {/* ── ÉTAPE 4 : RÉCAPITULATIF ── */}
        {step === 4 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
              Vérifiez les informations avant de créer votre projet. Vous pourrez les modifier par la suite.
            </p>
            <div className="card">
              <div className="card-hdr"><div className="card-title">📋 Récapitulatif du projet</div></div>
              <div className="card-body">
                {[
                  { label: 'Type', value: typeInfo ? `${typeInfo.icon} ${typeInfo.label}` : '—' },
                  { label: 'Nom', value: form.name || '—' },
                  { label: 'Client', value: form.client_name || 'Non renseigné' },
                  { label: 'Secteur', value: form.sector || 'Non renseigné' },
                  { label: 'Budget', value: form.budget || 'Non défini' },
                  { label: 'Durée', value: form.duration || 'Non définie' },
                  { label: 'Contraintes', value: form.constraints.length > 0 ? form.constraints.join(', ') : 'Aucune' },
                  { label: 'Contexte', value: form.context || 'Non renseigné' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ width: 100, fontSize: 11, color: 'var(--dim)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.06em' }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer navigation */}
        <div className="wizard-footer">
          <button className="btn-ghost" onClick={() => step === 0 ? router.push('/projects') : setStep(s => s - 1)}>
            {step === 0 ? 'Annuler' : '← Retour'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Étape {step + 1} / {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <button className="btn-gold" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                Continuer →
              </button>
            ) : (
              <button className="btn-gold" onClick={save} disabled={saving || !form.name.trim() || !form.project_type}>
                {saving ? 'Création...' : '✦ Créer le projet'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
