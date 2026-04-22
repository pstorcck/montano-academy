import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST() {
  try {
    const { data: configs, error } = await supabaseAdmin
      .from('agent_configs')
      .select('*, companies(name)')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const results = []

    for (const config of configs || []) {
      if (config.openai_assistant_id && config.system_prompt) {
        await openai.beta.assistants.update(config.openai_assistant_id, {
          instructions: config.system_prompt,
          model: config.model || 'gpt-4o-mini',
        })
        results.push({ company: config.companies?.name, status: 'updated' })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
