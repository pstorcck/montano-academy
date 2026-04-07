import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { messages, company_slug, conversation_id, user_id } = await req.json()

    // Obtener company_id primero
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', company_slug)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // Obtener el agente de esa empresa
    const { data: agentConfig, error: agentError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('company_id', company.id)
      .single()

    if (agentError || !agentConfig) {
      console.error('Error agente:', agentError)
      return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
    }

    // Llamar a OpenAI
    const response = await openai.chat.completions.create({
      model: agentConfig.model || 'gpt-4o',
      temperature: agentConfig.temperature || 0.7,
      messages: [
        { role: 'system', content: agentConfig.system_prompt },
        ...messages
      ],
    })

    const assistantMessage = response.choices[0].message.content || ''

    // Guardar mensajes en Supabase
    if (conversation_id) {
      const lastUserMessage = messages[messages.length - 1]
      await supabase.from('messages').insert([
        { conversation_id, role: 'user', content: lastUserMessage.content },
        { conversation_id, role: 'assistant', content: assistantMessage }
      ])
    }

    // Detectar aprobación
    const approved = assistantMessage.includes('CERTIFICADO_APROBADO')

    if (approved && conversation_id) {
      const nameMatch = assistantMessage.match(/nombre:\s*(.+)/)
      const scoreMatch = assistantMessage.match(/punteo:\s*(\d+)/)
      const courseMatch = assistantMessage.match(/curso:\s*(.+)/)

      const collaboratorName = nameMatch ? nameMatch[1].trim() : ''
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 80
      const course = courseMatch ? courseMatch[1].trim() : 'Inducción General'

      const year = new Date().getFullYear()
      const certNumber = `MA-${company_slug.toUpperCase().slice(0,2)}-${year}-${Math.floor(Math.random() * 900) + 100}`

      await supabase.from('certificates').insert({
        user_id,
        company_id: company.id,
        conversation_id,
        certificate_number: certNumber,
        score,
      })

      await supabase
        .from('conversations')
        .update({ status: 'completed', score, completed_at: new Date().toISOString() })
        .eq('id', conversation_id)

      return NextResponse.json({
        message: assistantMessage,
        approved: true,
        certificate: { number: certNumber, score, course, name: collaboratorName }
      })
    }

    return NextResponse.json({ message: assistantMessage, approved: false })

  } catch (error: any) {
    console.error('Error en el agente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
