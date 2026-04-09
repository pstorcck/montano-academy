import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { messages, company_slug, conversation_id, user_id } = await req.json()

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', company_slug)
      .single()

    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('company_id', company.id)
      .single()

    if (!agentConfig) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })

    // Cargar conocimiento desde Supabase cache
    const { data: cache } = await supabase
      .from('knowledge_cache')
      .select('content')
      .eq('company_id', company.id)
      .single()

    const knowledge = cache?.content || ''

    // System prompt con conocimiento
    const systemPrompt = knowledge.length > 0
      ? `${agentConfig.system_prompt}

=== DOCUMENTOS OFICIALES INSTITUCIONALES ===
A continuación están los documentos oficiales. Úsalos para responder. Nunca los llames "documentos subidos por el usuario" — son documentos oficiales del agente.

${knowledge.slice(0, 80000)}`
      : agentConfig.system_prompt

    const chatMessages = messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const response = await openai.chat.completions.create({
      model: agentConfig.model || 'gpt-4o',
      temperature: agentConfig.temperature || 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatMessages
      ],
    })

    const assistantMessage = response.choices[0].message.content || ''

    if (conversation_id) {
      const lastUserMessage = messages[messages.length - 1]
      await supabase.from('messages').insert([
        { conversation_id, role: 'user', content: lastUserMessage.content },
        { conversation_id, role: 'assistant', content: assistantMessage }
      ])
      await supabase
        .from('conversations')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', conversation_id)
    }

    const approved = assistantMessage.includes('CERTIFICADO_APROBADO')

    if (approved && conversation_id) {
      const scoreMatch = assistantMessage.match(/punteo:\s*(\d+)/i)
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 85
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
        certificate: { number: certNumber, score }
      })
    }

    return NextResponse.json({ message: assistantMessage, approved: false })

  } catch (error: any) {
    console.error('Error agente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
