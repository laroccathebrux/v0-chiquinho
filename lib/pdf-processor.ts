import * as pdfjsLib from "pdfjs-dist"
import * as XLSX from "xlsx"

// Configure PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

interface BatchData {
  batchNumber: string
  batchWeight: string
  numberOfBales: string
  micMin: number
  micAvg: number
  micMax: number
  polMin: number
  polAvg: number
  polMax: number
  strMin: number
  strAvg: number
  strMax: number
}

export async function processPDFs(files: File[], onProgress?: (current: number, total: number) => void): Promise<Blob> {
  const results: BatchData[] = []

  for (let i = 0; i < files.length; i++) {
    try {
      const data = await extractDataFromPDF(files[i])
      results.push(data)
      onProgress?.(i + 1, files.length)
    } catch (error) {
      console.error(`Error processing ${files[i].name}:`, error)
      throw new Error(`Failed to process ${files[i].name}: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  return generateExcel(results)
}

async function extractDataFromPDF(file: File): Promise<BatchData> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ""

  // Extract text from all pages
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(" ")
    fullText += pageText + "\n"
  }

  // Extract batch number (from header - looking for patterns like "Batch: XXX" or "Lote: XXX")
  const batchMatch = fullText.match(/(?:Batch|Lote|BATCH|LOTE)[:\s]+([A-Z0-9-]+)/i)
  const batchNumber = batchMatch ? batchMatch[1].trim() : "N/A"

  // Extract batch weight (looking for weight patterns near end of document)
  const weightMatch = fullText.match(/(?:Weight|Peso|WEIGHT|PESO)[:\s]+([0-9,.]+)\s*(?:kg|KG|Kg)?/i)
  const batchWeight = weightMatch ? weightMatch[1].trim() : "N/A"

  // Extract number of bales
  const balesMatch = fullText.match(/(?:Bales|Fardos|BALES|FARDOS)[:\s]+([0-9]+)/i)
  const numberOfBales = balesMatch ? balesMatch[1].trim() : "N/A"

  // Extract table data for Mic, Pol, STR
  const micValues = extractColumnValues(fullText, "Mic")
  const polValues = extractColumnValues(fullText, "Pol")
  const strValues = extractColumnValues(fullText, "STR")

  return {
    batchNumber,
    batchWeight,
    numberOfBales,
    micMin: micValues.length > 0 ? Math.min(...micValues) : 0,
    micAvg: micValues.length > 0 ? micValues.reduce((a, b) => a + b, 0) / micValues.length : 0,
    micMax: micValues.length > 0 ? Math.max(...micValues) : 0,
    polMin: polValues.length > 0 ? Math.min(...polValues) : 0,
    polAvg: polValues.length > 0 ? polValues.reduce((a, b) => a + b, 0) / polValues.length : 0,
    polMax: polValues.length > 0 ? Math.max(...polValues) : 0,
    strMin: strValues.length > 0 ? Math.min(...strValues) : 0,
    strAvg: strValues.length > 0 ? strValues.reduce((a, b) => a + b, 0) / strValues.length : 0,
    strMax: strValues.length > 0 ? Math.max(...strValues) : 0,
  }
}

function extractColumnValues(text: string, columnName: string): number[] {
  const values: number[] = []

  // Look for the column name and extract nearby numbers
  const lines = text.split("\n")
  let inTable = false

  for (const line of lines) {
    // Check if we're in a table with this column
    if (line.includes(columnName)) {
      inTable = true
      continue
    }

    if (inTable) {
      // Extract numbers from the line (looking for decimal numbers)
      const numbers = line.match(/\b\d+\.?\d*\b/g)
      if (numbers) {
        numbers.forEach((num) => {
          const value = Number.parseFloat(num)
          if (!isNaN(value) && value > 0 && value < 1000) {
            values.push(value)
          }
        })
      }

      // Stop if we hit an empty line or obvious table end
      if (line.trim() === "" || values.length > 50) {
        inTable = false
      }
    }
  }

  return values
}

function generateExcel(data: BatchData[]): Blob {
  // Create worksheet data
  const wsData = [
    [
      "Batch Number",
      "Batch Weight",
      "Number of Bales",
      "Mic (min)",
      "Mic (avg)",
      "Mic (max)",
      "Pol (min)",
      "Pol (avg)",
      "Pol (max)",
      "STR (min)",
      "STR (avg)",
      "STR (max)",
    ],
    ...data.map((row) => [
      row.batchNumber,
      row.batchWeight,
      row.numberOfBales,
      row.micMin.toFixed(2),
      row.micAvg.toFixed(2),
      row.micMax.toFixed(2),
      row.polMin.toFixed(2),
      row.polAvg.toFixed(2),
      row.polMax.toFixed(2),
      row.strMin.toFixed(2),
      row.strAvg.toFixed(2),
      row.strMax.toFixed(2),
    ]),
  ]

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  ws["!cols"] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Batch Summary")

  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  return new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}
