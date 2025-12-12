import { NextRequest, NextResponse } from 'next/server'

// In-memory storage for serverless environment (Vercel doesn't allow filesystem writes)
// Note: This is ephemeral - data persists only during the lambda lifecycle
// For production, consider using Vercel KV, Supabase, or another database
const memoryStorage: {
  files: StoredFile[]
  summaries: Summary[]
} = {
  files: [],
  summaries: []
}

// Generate a unique ID based on content hash
function generateFileHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16)
}

export interface BatchData {
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

export interface StoredFile {
  id: string
  filename: string
  processedAt: string
  data: BatchData[]
}

export interface Summary {
  id: string
  createdAt: string
  files: string[]
  totalBatches: number
  data: BatchData[]
}

// GET - Retrieve all stored data from memory
export async function GET() {
  try {
    return NextResponse.json({
      files: memoryStorage.files,
      summaries: memoryStorage.summaries
    })
  } catch (error) {
    console.error('Error reading data:', error)
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 })
  }
}

// POST - Save processed data to memory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data, filename } = body

    if (type === 'file') {
      // Save individual file data
      const fileData: StoredFile = {
        id: generateFileHash(JSON.stringify(data) + filename),
        filename,
        processedAt: new Date().toISOString(),
        data
      }

      // Check if file already exists (by filename)
      const existingIndex = memoryStorage.files.findIndex(f => f.filename === filename)

      if (existingIndex >= 0) {
        // Update existing
        memoryStorage.files[existingIndex] = fileData
      } else {
        // Add new
        memoryStorage.files.push(fileData)
      }

      return NextResponse.json({
        success: true,
        id: fileData.id,
        isNew: existingIndex < 0
      })

    } else if (type === 'summary') {
      // Save summary data
      const summaryData: Summary = {
        id: generateFileHash(JSON.stringify(data) + Date.now()),
        createdAt: new Date().toISOString(),
        files: data.files || [],
        totalBatches: data.totalBatches || data.data?.length || 0,
        data: data.data || data
      }

      memoryStorage.summaries.push(summaryData)

      return NextResponse.json({
        success: true,
        id: summaryData.id
      })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  } catch (error) {
    console.error('Error saving data:', error)
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
  }
}
