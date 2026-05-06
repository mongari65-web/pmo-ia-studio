'use client'
// components/ActionBar.tsx
// Universal action bar: History dropdown + Export buttons (Print, Excel, PDF, Drive, Notion, Gmail)

import { useState, useRef } from 'react'
import { HistoryEntry } from '@/hooks/useHistory'

interface ActionBarProps {
  // History
  history: HistoryEntry[]
  onLoadHistory: (entry: HistoryEntry) => void
  historyCount?: number
  // Primary action (Generate / + WP / etc.)
  primaryLabel?: string
  primaryIcon?: string
  onPrimary?: () => void
  // Secondary action (optional)
  secondaryLabel?: string
  secondaryIcon?: string
  onSecondary?: () => void
  // Export callbacks
  onPrint?: () => void
  onExportExcel?: () => void
  onExportPDF?: () => void
  onExportDrive?: () => void
  onExportNotion?: () => void
  onExportGmail?: () => void
  // Loading
  loading?: boolean
}

export default function ActionBar({
  history,
  onLoadHistory,
  historyCount,
  primaryLabel = 'Générer',
  primaryIcon = '⚡',
  onPrimary,
  secondaryLabel,
  secondaryIcon,
  onSecondary,
  onPrint,
  onExportExcel,
  onExportPDF,
  onExportDrive,
  onExportNotion,
  onExportGmail,
  loading = false,
}: ActionBarProps) {
  const [histOpen, setHistOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const histRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const count = historyCount ?? history.length

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      padding: '0 0 12px 0'
    }}>
      {/* ── HISTORIQUE ── */}
      <div ref={histRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setHistOpen(o => !o)}
          style={btnStyle('#1e293b', '#334155', count > 0 ? '#f59e0b' : '#64748b')}
        >
          📋 Historique ({count})
        </button>
        {histOpen && (
          <div style={dropdownStyle}>
            {history.length === 0 ? (
              <div style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 13 }}>
                Aucune génération enregistrée
              </div>
            ) : (
              history.map((entry, i) => (
                <button
                  key={entry.id}
                  onClick={() => { onLoadHistory(entry); setHistOpen(false) }}
                  style={histItemStyle(i === 0)}
                >
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {new Date(entry.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                  <span style={{ fontSize: 13, color: '#e2e8f0', marginTop: 2 }}>
                    {entry.label}
                  </span>
                  {i === 0 && (
                    <span style={{
                      fontSize: 10, background: '#f59e0b', color: '#000',
                      borderRadius: 4, padding: '1px 6px', alignSelf: 'flex-start'
                    }}>
                      Dernière
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── SECONDARY (ex: + WP) ── */}
      {secondaryLabel && onSecondary && (
        <button onClick={onSecondary} style={btnStyle('#1e293b', '#334155', '#60a5fa')}>
          {secondaryIcon} {secondaryLabel}
        </button>
      )}

      {/* ── EXPORT DROPDOWN ── */}
      <div ref={exportRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setExportOpen(o => !o)}
          style={btnStyle('#1e293b', '#334155', '#a78bfa')}
        >
          📤 Exporter ▾
        </button>
        {exportOpen && (
          <div style={dropdownStyle}>
            {onPrint && (
              <ExportItem icon="🖨️" label="Imprimer" color="#94a3b8"
                onClick={() => { onPrint(); setExportOpen(false) }} />
            )}
            {onExportExcel && (
              <ExportItem icon="📊" label="Excel (.xlsx)" color="#22c55e"
                onClick={() => { onExportExcel(); setExportOpen(false) }} />
            )}
            {onExportPDF && (
              <ExportItem icon="📄" label="PDF" color="#f87171"
                onClick={() => { onExportPDF(); setExportOpen(false) }} />
            )}
            {onExportDrive && (
              <ExportItem icon="🟡" label="Google Drive" color="#fbbf24"
                onClick={() => { onExportDrive(); setExportOpen(false) }} />
            )}
            {onExportNotion && (
              <ExportItem icon="⬛" label="Notion" color="#e2e8f0"
                onClick={() => { onExportNotion(); setExportOpen(false) }} />
            )}
            {onExportGmail && (
              <ExportItem icon="📧" label="Gmail" color="#f87171"
                onClick={() => { onExportGmail(); setExportOpen(false) }} />
            )}
          </div>
        )}
      </div>

      {/* ── PRIMARY (Generate) ── */}
      {onPrimary && (
        <button
          onClick={onPrimary}
          disabled={loading}
          style={{
            ...btnStyle('#1e3a5f', '#1e40af', '#60a5fa'),
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            fontWeight: 700,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⏳ Génération...' : `${primaryIcon} ${primaryLabel}`}
        </button>
      )}
    </div>
  )
}

function ExportItem({ icon, label, color, onClick }: {
  icon: string; label: string; color: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', padding: '9px 14px', background: 'none', border: 'none',
      cursor: 'pointer', color: '#e2e8f0', fontSize: 13, textAlign: 'left',
      borderBottom: '1px solid #1e293b',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ color }}>{label}</span>
    </button>
  )
}

// ── Styles ──
function btnStyle(bg: string, hover: string, textColor: string) {
  return {
    background: bg,
    border: `1px solid ${hover}`,
    borderRadius: 8,
    color: textColor,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  }
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '110%',
  left: 0,
  zIndex: 200,
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 10,
  minWidth: 220,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  overflow: 'hidden',
}

function histItemStyle(isFirst: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
    padding: '10px 14px',
    background: isFirst ? 'rgba(245,158,11,0.08)' : 'none',
    border: 'none',
    borderBottom: '1px solid #1e293b',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s',
  }
}
