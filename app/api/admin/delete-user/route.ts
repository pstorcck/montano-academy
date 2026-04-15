import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()

    if (!user_id) {
      return NextResponse.json({ error: 'Falta user_id' }, { status: 400 })
    }

    // Eliminar mensajes del usuario
    const { data: convs } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('user_id', user_id)

    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id)
      await supabaseAdmin.from('messages').delete().in('conversation_id', convIds)
    }

    // Eliminar conversaciones
    await supabaseAdmin.from('conversations').delete().eq('user_id', user_id)

    // Eliminar certificados
    await supabaseAdmin.from('certificates').delete().eq('user_id', user_id)

    // Eliminar document_sync si aplica
    await supabaseAdmin.from('user_companies').delete().eq('user_id', user_id)

    // Eliminar perfil
    await supabaseAdmin.from('profiles').delete().eq('id', user_id)

    // Eliminar de Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id)
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
