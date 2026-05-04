import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    notion_token_exists: !!process.env.NOTION_TOKEN,
    notion_token_length: (process.env.NOTION_TOKEN || '').length,
    notion_token_start: (process.env.NOTION_TOKEN || '').substring(0, 8),
    database_id_exists: !!process.env.NOTION_DATABASE_ID,
    database_id_length: (process.env.NOTION_DATABASE_ID || '').length,
  })
}
