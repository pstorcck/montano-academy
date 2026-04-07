import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { full_name, email, password, role, company_id } = body

    console.log('Creando usuario:', { full_name, email, role, company_id })

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('ERROR: Falta SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({ error: 'Configuración incompleta del servidor' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    console.log('Auth result:', authData?.user?.id, authError?.message)

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Crear perfil
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name,
        email,
        company_id,
        role,
        is_active: true,
      })

    console.log('Profile error:', profileError?.message)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // Agregar a user_companies
    await supabaseAdmin
      .from('user_companies')
      .insert({
        user_id: authData.user.id,
        company_id,
        is_primary: true,
      })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error inesperado:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
