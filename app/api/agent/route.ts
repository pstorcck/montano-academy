import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCompanyKnowledge } from '@/lib/sharepoint'

const COMPANY_FOLDERS: Record<string, string> = {
  'colegio-montano': 'Colegio Montano',
  'mac': 'MAC Guatemala',
  'vitanova': 'Vitanova',
}

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { messages, company_slug, conversation_id, user_id } = await req.json()

    // Obtener empresa
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', company_slug)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // Obtener prompt del agente
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('company_id', company.id)
      .single()

    if (!agentConfig) {
      return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
    }

    // Obtener conocimiento de SharePoint
    const folder = COMPANY_FOLDERS[company_slug]
    let sharepointKnowledge = ''
    
    if (folder) {
      console.log(`Cargando conocimiento de SharePoint para: ${folder}`)
      sharepointKnowledge = await getCompanyKnowledge(folder)
      console.log(`Conocimiento cargado: ${sharepointKnowledge.length} chars`)
    }

    // Construir system prompt con conocimiento de SharePoint
    const systemPrompt = sharepointKnowledge.length > 0
      ? `${agentConfig.system_prompt}

=== CONOCIMIENTO OFICIAL DE LA EMPRESA ===
A continuación encontrarás los documentos oficiales de la empresa. 
Usa EXCLUSIVAMENTE esta información para responder. No inventes ni supongas nada fuera de estos documentos.

${sharepointKnowledge.slice(0, 80000)}`
      : agentConfig.system_prompt

    // Llamar a OpenAI
    const response = await openai.chat.completions.create({
      model: agentConfig.model || 'gpt-4o',
      temperature: agentConfig.temperature || 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
    })

    const assistantMessage = response.choices[0].message.content || ''

    // Guardar mensajes
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
        certificate: { number: certNumber, score, course }
      })
    }

    return NextResponse.json({ message: assistantMessage, approved: false })

  } catch (error: any) {
    console.error('Error agente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
