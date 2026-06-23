import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MONDAY_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU0NTU1MDY2MSwiYWFpIjoxMSwidWlkIjoyMDk0NzQxMiwiaWFkIjoiMjAyNS0wNy0zMVQyMToyNDowOS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6ODQ0NDg3MSwicmduIjoidXNlMSJ9.I88fq3ZLBNqku34XLXqG31Uny8W3wBFISZ_AZ4_gdUw'
const BOARD_ID = '18418904832'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const mondayQuery = async (query: string) => {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query })
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Falta user_id' }, { status: 400 })

    const { data: user } = await supabaseAdmin
      .from('profiles')
      .select('*, companies(name, slug)')
      .eq('id', user_id)
      .single()

    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const columnValues = JSON.stringify({
      text_mm4kczg1: user.email,
      text_mm4kc0gx: user.companies?.name || '',
      color_mm4kehvb: { label: 'Sin iniciar' },
      numeric_mm4ktzc: 0,
    })

    await mondayQuery(
      `mutation { create_item(board_id: ${BOARD_ID}, item_name: ${JSON.stringify(user.full_name)}, column_values: ${JSON.stringify(columnValues)}) { id } }`
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
