import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import OpenAI from "openai"

// Directory to store JSON files (inside app directory for server deployment)
const JSON_DIR = path.join(process.cwd(), "data", "json")

interface BatchData {
  batchNumber: string
  batchWeight: string
  numberOfBales: string
  micMin: number
  micAvg: number
  micMax: number
  uhmMin: number
  uhmAvg: number
  uhmMax: number
  strMin: number
  strAvg: number
  strMax: number
  sciAvg: number | null
  sourceFile: string
  processedAt?: string
}

// Load all stored data
async function loadAllData(): Promise<{ files: unknown[]; summaries: unknown[]; allBatches: BatchData[] }> {
  try {
    await fs.access(JSON_DIR)
  } catch {
    return { files: [], summaries: [], allBatches: [] }
  }

  const files = await fs.readdir(JSON_DIR)
  const jsonFiles = files.filter((f) => f.endsWith(".json"))

  const storedFiles: unknown[] = []
  const summaries: unknown[] = []
  const allBatches: BatchData[] = []

  for (const file of jsonFiles) {
    const content = await fs.readFile(path.join(JSON_DIR, file), "utf-8")
    const parsed = JSON.parse(content)

    if (file.startsWith("summary_")) {
      summaries.push(parsed)
      if (parsed.data && Array.isArray(parsed.data)) {
        allBatches.push(...parsed.data)
      }
    } else {
      storedFiles.push(parsed)
      if (parsed.data && Array.isArray(parsed.data)) {
        allBatches.push(...parsed.data)
      }
    }
  }

  return { files: storedFiles, summaries, allBatches }
}

// Create context about the data for the AI
function createDataContext(data: { files: unknown[]; summaries: unknown[]; allBatches: BatchData[] }): string {
  const { allBatches } = data

  if (allBatches.length === 0) {
    return "Não há dados de algodão armazenados no momento."
  }

  // Group by source file (producer)
  const byProducer: Record<string, BatchData[]> = {}
  for (const batch of allBatches) {
    const producer = batch.sourceFile || "Desconhecido"
    if (!byProducer[producer]) {
      byProducer[producer] = []
    }
    byProducer[producer].push(batch)
  }

  // Calculate statistics per producer
  let context = `Dados de qualidade de algodão disponíveis:\n\n`
  context += `Total de lotes: ${allBatches.length}\n`
  context += `Produtores/Arquivos: ${Object.keys(byProducer).length}\n\n`

  for (const [producer, batches] of Object.entries(byProducer)) {
    context += `\n--- ${producer} ---\n`
    context += `Lotes: ${batches.length}\n`

    // Calculate averages for this producer
    const validSci = batches.filter((b) => b.sciAvg !== null && b.sciAvg > 0)
    const avgSci = validSci.length > 0 ? validSci.reduce((sum, b) => sum + (b.sciAvg || 0), 0) / validSci.length : null

    const avgMic = batches.reduce((sum, b) => sum + b.micAvg, 0) / batches.length
    const avgStr = batches.reduce((sum, b) => sum + b.strAvg, 0) / batches.length
    const avgUhm = batches.reduce((sum, b) => sum + b.uhmAvg, 0) / batches.length

    context += `Mic médio: ${avgMic.toFixed(2)}\n`
    context += `UHM médio: ${avgUhm.toFixed(3)} polegadas\n`
    context += `Resistência média: ${avgStr.toFixed(1)} gf/tex\n`
    if (avgSci !== null) {
      context += `SCI médio: ${avgSci.toFixed(1)}\n`
    }

    // List individual batches
    context += `Detalhes dos lotes:\n`
    for (const batch of batches) {
      context += `  - Lote ${batch.batchNumber}: Mic=${batch.micAvg.toFixed(2)}, UHM=${batch.uhmAvg.toFixed(3)}, STR=${batch.strAvg.toFixed(1)}`
      if (batch.sciAvg !== null && batch.sciAvg > 0) {
        context += `, SCI=${batch.sciAvg.toFixed(1)}`
      }
      context += `, Peso=${batch.batchWeight}kg, Fardos=${batch.numberOfBales}\n`
    }
  }

  return context
}

export async function POST(request: NextRequest) {
  try {
    const { message, generateChart } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Initialize OpenAI client at runtime
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Load all stored data
    const storedData = await loadAllData()
    const dataContext = createDataContext(storedData)

    // System prompt for the AI
    const systemPrompt = `Você é um assistente especializado em análise de qualidade de algodão.
Você tem acesso aos dados de classificação HVI (High Volume Instrument) de fardos de algodão.

Os principais parâmetros de qualidade são:
- MIC (Micronaire): índice de finura/maturidade da fibra (ideal: 3.5-4.9)
- UHM (Upper Half Mean): comprimento médio da fibra em polegadas (ideal: >1.10")
- STR (Strength/Resistência): resistência da fibra em gf/tex (ideal: >28)
- SCI (Spinning Consistency Index): índice de consistência de fiação (ideal: >130)
- UI (Uniformity Index): índice de uniformidade
- ELG (Elongation): alongamento

Dados disponíveis no sistema:
${dataContext}

Responda sempre em português brasileiro. Seja preciso com os números e cite os dados específicos quando relevante.
Se o usuário pedir para gerar um gráfico, você pode indicar que vai gerar um gráfico e fornecer os dados necessários.`

    // Prepare messages for OpenAI
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ]

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    })

    const assistantMessage = completion.choices[0]?.message?.content || "Desculpe, não consegui processar sua pergunta."

    // If chart generation is requested, prepare chart data
    let chartData = null
    if (generateChart && storedData.allBatches.length > 0) {
      // Group by producer for chart
      const byProducer: Record<string, { avgSci: number; avgMic: number; avgStr: number; count: number }> = {}

      for (const batch of storedData.allBatches) {
        const producer = batch.sourceFile.replace(".pdf", "").replace(".xlsx", "")
        if (!byProducer[producer]) {
          byProducer[producer] = { avgSci: 0, avgMic: 0, avgStr: 0, count: 0 }
        }
        byProducer[producer].avgMic += batch.micAvg
        byProducer[producer].avgStr += batch.strAvg
        if (batch.sciAvg !== null && batch.sciAvg > 0) {
          byProducer[producer].avgSci += batch.sciAvg
        }
        byProducer[producer].count++
      }

      chartData = {
        labels: Object.keys(byProducer),
        datasets: [
          {
            label: "SCI Médio",
            data: Object.values(byProducer).map((p) => p.avgSci / p.count || 0),
          },
          {
            label: "Mic Médio",
            data: Object.values(byProducer).map((p) => p.avgMic / p.count),
          },
          {
            label: "STR Médio",
            data: Object.values(byProducer).map((p) => p.avgStr / p.count),
          },
        ],
      }
    }

    return NextResponse.json({
      message: assistantMessage,
      chartData,
      hasData: storedData.allBatches.length > 0,
    })
  } catch (error) {
    console.error("Error in chat API:", error)
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 })
  }
}
