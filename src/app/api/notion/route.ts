import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { title, content, project_name, doc_type, client_name, date } = await request.json()

    const notionToken = process.env.NOTION_TOKEN
    const databaseId = process.env.NOTION_DATABASE_ID

    if (!notionToken || !databaseId) {
      return NextResponse.json({ error: 'Configuration Notion manquante' }, { status: 500 })
    }

    // Découper le contenu en blocs de 2000 chars max (limite Notion)
    const chunkText = (text: string, size = 1900) => {
      const chunks = []
      for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size))
      }
      return chunks
    }

    const contentChunks = chunkText(content)

    // Construire les blocs Notion
    const blocks = contentChunks.map((chunk: string) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: chunk }
        }]
      }
    }))

    // Créer la page dans Notion
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          // Propriété titre (nom de la page)
          Nom: {
            title: [{
              text: { content: title }
            }]
          },
          // Propriété Projet
          Projet: {
            rich_text: [{
              text: { content: project_name || '' }
            }]
          },
          // Propriété Type de document
          'Type de document': {
            select: { name: doc_type || 'Autre' }
          },
          // Propriété Client
          Client: {
            rich_text: [{
              text: { content: client_name || '' }
            }]
          },
          // Propriété Date
          Date: {
            date: { start: date || new Date().toISOString().split('T')[0] }
          },
          // Propriété Statut
          Statut: {
            select: { name: 'Généré' }
          },
        },
        // Contenu de la page
        children: [
          // En-tête
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ type: 'text', text: { content: title } }]
            }
          },
          {
            object: 'block',
            type: 'callout',
            callout: {
              rich_text: [{
                type: 'text',
                text: { content: `Généré par PMO-IA Studio · ${new Date().toLocaleDateString('fr-FR')} · Claude AI · PMBOK 7` }
              }],
              icon: { emoji: '🤖' },
              color: 'yellow_background'
            }
          },
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          // Contenu du document
          ...blocks
        ]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Erreur Notion:', data)
      return NextResponse.json({
        error: data.message || 'Erreur Notion',
        detail: data
      }, { status: response.status })
    }

    return NextResponse.json({
      success: true,
      notion_page_id: data.id,
      notion_url: data.url,
    })

  } catch (error: any) {
    console.error('Erreur route Notion:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
