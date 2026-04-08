import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getCompanyKnowledge } from '@/lib/sharepoint'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COMPANY_FOLDERS: Record<string, string> = {
  '8f8cf0fc-f956-4f15-b2f3-2c92c121a8c3': 'Colegio Montano',
  'ce6064aa-8b03-4a3d-b0e8-8ff91335832c': 'MAC Guatemala',
  '233536c1-e6e2-4fae-97e6-c43003db651a': 'Vitanova',
}

export async function POST() {
  try {
    const results = []
    for (const [companyId, folder] of Object.entries(COMPANY_FOLDERS)) {
      const knowledge = await getCompanyKnowledge(folder)
      if (knowledge.length > 0) {
        const { error } = await supabaseAdmin
          .from('knowledge_cache')
          .update({ content: knowledge, updated_at: new Date().toISOString() })
          .eq('company_id', companyId)
        results.push({ folder, success: !error, chars: knowledge.length })
      } else {
        results.push({ folder, success: false, chars: 0 })
      }
    }
    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Usa POST para sincronizar' })
}
