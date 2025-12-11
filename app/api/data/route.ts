import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// Directory to store JSON files (relative to project root)
const JSON_DIR = path.join(process.cwd(), '..', 'json')

// Ensure the JSON directory exists
async function ensureJsonDir() {
  try {
    await fs.access(JSON_DIR)
  } catch {
    await fs.mkdir(JSON_DIR, { recursive: true })
  }
}

// Generate a unique filename based on content hash
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

// GET - Retrieve all stored data
export async function GET() {
  try {
    await ensureJsonDir()

    const files = await fs.readdir(JSON_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    const allData: { files: StoredFile[], summaries: Summary[] } = {
      files: [],
      summaries: []
    }

    for (const file of jsonFiles) {
      const content = await fs.readFile(path.join(JSON_DIR, file), 'utf-8')
      const parsed = JSON.parse(content)

      if (file.startsWith('summary_')) {
        allData.summaries.push(parsed)
      } else {
        allData.files.push(parsed)
      }
    }

    return NextResponse.json(allData)
  } catch (error) {
    console.error('Error reading data:', error)
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 })
  }
}

// POST - Save processed data
export async function POST(request: NextRequest) {
  try {
    await ensureJsonDir()

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
      const existingFiles = await fs.readdir(JSON_DIR)
      const existingFile = existingFiles.find(f => {
        if (!f.endsWith('.json') || f.startsWith('summary_')) return false
        try {
          const content = JSON.parse(
            require('fs').readFileSync(path.join(JSON_DIR, f), 'utf-8')
          )
          return content.filename === filename
        } catch {
          return false
        }
      })

      const targetFilename = existingFile || `file_${fileData.id}.json`
      await fs.writeFile(
        path.join(JSON_DIR, targetFilename),
        JSON.stringify(fileData, null, 2)
      )

      return NextResponse.json({
        success: true,
        id: fileData.id,
        isNew: !existingFile
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

      const summaryFilename = `summary_${summaryData.id}.json`
      await fs.writeFile(
        path.join(JSON_DIR, summaryFilename),
        JSON.stringify(summaryData, null, 2)
      )

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
