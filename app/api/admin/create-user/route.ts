import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { full_name, email, password, role, company_id, send_invite } = await req.json()

    let authData, authError

    if (send_invite) {
      const result = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, company_id, role }
      })
      authData = result.data
      authError = result.error
    } else {
      const result = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      authData = result.data
      authError = result.error
    }

    if (authError || !authData?.user) {
      return NextResponse.json({ error: authError?.message || 'Error creando usuario' }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user!.id,
        full_name, email, company_id, role, is_active: true,
      })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
