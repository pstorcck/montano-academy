import { NextResponse } from 'next/server'
import { getCompanyKnowledge, testSharePointConnection } from '@/lib/sharepoint'

export async function GET() {
  try {
    const connected = await testSharePointConnection()
    if (!connected) {
      return NextResponse.json({ success: false, error: 'No se pudo conectar' })
    }

    const knowledge = await getCompanyKnowledge('Colegio Montano')

    return NextResponse.json({
      success: true,
      connected: true,
      filesFound: knowledge.length > 0,
      knowledgeLength: knowledge.length,
      preview: knowledge.slice(0, 500)
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
