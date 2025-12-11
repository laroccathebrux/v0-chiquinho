// This module is client-side only - all browser APIs are guarded

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
}

// Comprehensive column name mappings for PT/EN
// Each key maps to an array of possible column names (case insensitive)
const COLUMN_ALIASES: Record<string, string[]> = {
  // Micronaire - índice finura/maturidade
  mic: ['mic', 'micron', 'micron.', 'micronaire', 'micronare', 'micronário'],

  // Length/Comprimento - UHM/UHML (can be in mm or inches)
  uhm: [
    'uhm', 'uhml', 'uhl', 'len', 'length', 'comprimento', 'comp',
    'fibra', 'fb', 'staple', 'staple length'
  ],

  // Strength/Resistência (gf/tex)
  str: [
    'str', 'res', 'resist', 'resist.', 'strength', 'resistência',
    'resistencia', 'tenacidade', 'tenacity', 'gf/tex'
  ],

  // Uniformity Index
  ui: ['ui', 'unif', 'uniformidade', 'uniformity', 'unf'],

  // Short Fiber Index / Fibras Curtas
  sfi: ['sfi', 'sfc', 'fc', 'short fiber', 'fibras curtas', 'fibra curta'],

  // Elongation / Alongamento
  elg: ['elg', 'along', 'alongamento', 'elongation', 'elong'],

  // Reflectance / Reflectância
  rd: ['rd', 'reflectance', 'reflectância', 'reflectancia', 'brilho'],

  // Yellowness / Amarelamento
  plusb: ['+b', 'b', 'amarelamento', 'yellowness', 'amarelo'],

  // SCI - Spinning Consistency Index
  sci: ['sci', 'spinning consistency', 'consistência'],

  // CSP - Count Strength Product
  csp: ['csp', 'count strength', 'produto resistência'],

  // Maturity / Maturidade
  mat: ['mat', 'maturity', 'maturidade', 'matur'],

  // Leaf/Trash - Folhas/Impurezas
  leaf: ['leaf', 'lf', 'trash', 'trid', 'folha', 'impurezas', 'trash grade'],

  // Weight / Peso
  weight: [
    'peso', 'weight', 'líquido', 'liquido', 'net weight', 'peso líquido',
    'peso liquido', 'kg', 'kilos'
  ],

  // Bale number / Número do fardo
  bale: [
    'fardo', 'bale', 'código gs1', 'codigo gs1', 'bale id', 'nº fardo',
    'numero fardo', 'n fardo'
  ],

  // Lot/Batch - Lote/Bloco/Pilha
  lot: [
    'lote', 'lot', 'bloco', 'romaneio', 'batch', 'block', 'lote nº',
    'lote numero', 'lot no', 'lot #', 'lote #', 'n° lote', 'nº lote',
    'lot number', 'batch number', 'batch no', 'take up', 'takeup',
    'pilha', 'pile', 'pilha/lote'
  ],

  // Bale count
  baleCount: [
    'qtde fardos', 'qtd fardos', 'fardos', 'qty bales', 'bale count',
    'quantidade', 'qtde', 'qty'
  ],
}

// Guard for client-side only execution
function isClient(): boolean {
  return typeof window !== "undefined"
}

// Load PDF.js from CDN
let pdfjsLibPromise: Promise<any> | null = null

function loadPdfJs(): Promise<any> {
  if (!isClient()) {
    return Promise.reject(new Error("PDF.js can only be loaded on the client side"))
  }

  if (pdfjsLibPromise) return pdfjsLibPromise

  pdfjsLibPromise = new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      const lib = (window as any).pdfjsLib
      lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
      resolve(lib)
      return
    }

    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
    script.async = true

    script.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        resolve(lib)
      } else {
        reject(new Error("PDF.js library not found after loading"))
      }
    }

    script.onerror = () => reject(new Error("Failed to load PDF.js from CDN"))
    document.head.appendChild(script)
  })

  return pdfjsLibPromise
}

// Dynamically import XLSX
async function getXLSX() {
  if (!isClient()) {
    throw new Error("XLSX can only be loaded on the client side")
  }
  const XLSX = await import("xlsx")
  return XLSX
}

/**
 * Find the column index for a given field type by checking against all aliases
 * Returns -1 if not found
 */
function findColumnIndex(headers: string[], fieldType: keyof typeof COLUMN_ALIASES): number {
  const aliases = COLUMN_ALIASES[fieldType]
  if (!aliases) return -1

  // Normalize headers (lowercase, trim, remove special chars)
  const normalizedHeaders = headers.map(h => {
    if (h === null || h === undefined) return ''
    return h.toString()
      .toLowerCase()
      .trim()
      .replace(/[\[\]()]/g, '') // Remove brackets
      .replace(/\s+/g, ' ')     // Normalize spaces
  })

  // Try to find exact match first
  for (const alias of aliases) {
    const aliasLower = alias.toLowerCase()
    const index = normalizedHeaders.findIndex(h => h === aliasLower)
    if (index !== -1) return index
  }

  // Try partial match
  for (const alias of aliases) {
    const aliasLower = alias.toLowerCase()
    const index = normalizedHeaders.findIndex(h => {
      if (!h || typeof h !== 'string') return false
      return h.includes(aliasLower) || (h.length > 0 && aliasLower.includes(h))
    })
    if (index !== -1) return index
  }

  return -1
}

/**
 * Parse numeric value handling comma as decimal separator
 */
function parseNumericValue(value: any): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value

  // Handle string values
  let str = value.toString().trim()

  // Remove thousands separator and normalize decimal
  // Brazilian format: 1.234,56 -> 1234.56
  // US format: 1,234.56 -> 1234.56
  if (str.includes(',') && str.includes('.')) {
    // If comma comes after dot, comma is decimal separator (BR format)
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // US format
      str = str.replace(/,/g, '')
    }
  } else if (str.includes(',')) {
    // Only comma - assume decimal separator
    str = str.replace(',', '.')
  }

  // Remove any remaining non-numeric chars except dot and minus
  str = str.replace(/[^\d.-]/g, '')

  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

/**
 * Calculate min, avg, max from array of numbers
 */
function calculateStats(values: number[]): { min: number; avg: number; max: number } {
  const validValues = values.filter(v => v > 0 && !isNaN(v) && isFinite(v))
  if (validValues.length === 0) {
    return { min: 0, avg: 0, max: 0 }
  }
  return {
    min: Math.min(...validValues),
    avg: validValues.reduce((a, b) => a + b, 0) / validValues.length,
    max: Math.max(...validValues),
  }
}

/**
 * Extract batch/lot number from text or filename
 */
function extractBatchNumber(text: string, filename: string): string {
  // Try patterns in order of specificity
  const patterns = [
    /Pilha\/Lote[:\s]*(\d+)/i,  // "Pilha/Lote: 1"
    /Pilha[:\s]+(\d+)/i,        // "Pilha: 1"
    /Lote[:\s]+(\d+)/i,
    /Romaneio\s+(\d+)/i,        // Siagri format: "Romaneio 3"
    /Romaneio[:\s]+(\d+)/i,
    /Batch[:\s]+(\d+)/i,
    /Bloco[:\s]+(\d+)/i,
    /LOT[:\s]+(\d+)/i,
    /Block[:\s]+(\d+)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1]
    }
  }

  // Fallback: extract from filename
  const filenamePatterns = [
    /blc\s*(\d+)/i,
    /lote[_-]?(\d+)/i,
    /lot[_-]?(\d+)/i,
    /(\d{2,4})(?=\.[^.]+$)/, // Numbers before extension
  ]

  for (const pattern of filenamePatterns) {
    const match = filename.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return "N/A"
}

/**
 * Determine if a UHM value is in millimeters or inches
 * mm values typically 25-35, inches typically 0.9-1.4
 */
function isValueInMillimeters(value: number): boolean {
  // Values > 10 are definitely in mm
  // Values between 1.5 and 10 could be ambiguous but likely mm if > 2
  return value > 2
}

/**
 * Normalize UHM value to inches
 * 1 inch = 25.4 mm
 */
function normalizeUhmToInches(value: number): number {
  if (value <= 0) return 0
  if (isValueInMillimeters(value)) {
    return value / 25.4
  }
  return value
}

/**
 * Check if a row is a summary row (not bale data)
 */
function isSummaryRow(firstCell: any): boolean {
  if (firstCell === null || firstCell === undefined) return false
  const str = String(firstCell).toLowerCase()
  if (!str) return false
  const summaryKeywords = [
    'média', 'media', 'average', 'avg',
    'mínimo', 'minimo', 'minimum', 'min',
    'máximo', 'maximo', 'maximum', 'max',
    'desvio', 'deviation', 'std', 'sd',
    'c.v', 'cv%', 'coeficiente',
    'qtd fardos', 'fardos:', 'total', 'sum'
  ]
  return summaryKeywords.some(kw => str.includes(kw))
}

/**
 * Check if a row is a data row (starts with bale number)
 */
function isDataRow(row: any[]): boolean {
  if (!row || row.length < 5) return false
  const firstCell = row[0]?.toString() || ''

  // Bale numbers typically start with 00 and are 15+ digits
  if (/^00\d{10,}/.test(firstCell)) return true

  // Or just long numeric codes
  if (/^\d{10,}/.test(firstCell)) return true

  // Or short numeric ID
  if (/^\d{4,8}$/.test(firstCell)) return true

  return false
}

// Result type for processFilesWithData
export interface ProcessResult {
  blob: Blob
  data: BatchData[]
}

// Main processing function that returns both blob and data
export async function processFilesWithData(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<ProcessResult> {
  if (!isClient()) {
    throw new Error("processFilesWithData can only be called on the client side")
  }

  const results: BatchData[] = []

  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i]
      const extension = file.name.split('.').pop()?.toLowerCase()

      let data: BatchData[]
      if (extension === 'xlsx' || extension === 'xls') {
        data = await extractDataFromExcel(file)
      } else if (extension === 'pdf') {
        const singleResult = await extractDataFromPDF(file)
        data = [singleResult]
      } else {
        throw new Error(`Formato não suportado: ${extension}`)
      }

      results.push(...data)
      onProgress?.(i + 1, files.length)
    } catch (error) {
      console.error(`Erro processando ${files[i].name}:`, error)
      throw new Error(`Falha ao processar ${files[i].name}: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
    }
  }

  const blob = await generateExcel(results)
  return { blob, data: results }
}

// Legacy function for backwards compatibility
export async function processFiles(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const result = await processFilesWithData(files, onProgress)
  return result.blob
}

// Backward compatibility alias
export async function processPDFs(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  return processFiles(files, onProgress)
}

/**
 * Extract data from Excel file
 */
async function extractDataFromExcel(file: File): Promise<BatchData[]> {
  const XLSX = await getXLSX()
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  const results: BatchData[] = []

  // If multiple sheets, prefer "analítico", "analitico", "dados", "data", "detail", "hvi" sheets
  // Skip "resumo", "summary", "totais" sheets
  const summarySheetKeywords = ['resumo', 'summary', 'totais', 'total', 'consolidado']
  const preferredSheetKeywords = ['analítico', 'analitico', 'analytic', 'dados', 'data', 'detail', 'detalhe', 'fardos', 'bales', 'hvi']

  let sheetsToProcess = workbook.SheetNames

  // If there are multiple sheets, try to filter
  if (workbook.SheetNames.length > 1) {
    const sheetNameLower = workbook.SheetNames.map(s => s.toLowerCase())

    // First, try to find preferred sheets (analítico, dados, etc)
    const preferredSheets = workbook.SheetNames.filter((name, idx) =>
      preferredSheetKeywords.some(kw => sheetNameLower[idx].includes(kw))
    )

    if (preferredSheets.length > 0) {
      sheetsToProcess = preferredSheets
      console.log(`Found preferred sheets: ${preferredSheets.join(', ')}`)
    } else {
      // Otherwise, exclude summary sheets
      const nonSummarySheets = workbook.SheetNames.filter((name, idx) =>
        !summarySheetKeywords.some(kw => sheetNameLower[idx].includes(kw))
      )

      if (nonSummarySheets.length > 0) {
        sheetsToProcess = nonSummarySheets
        console.log(`Excluding summary sheets, processing: ${nonSummarySheets.join(', ')}`)
      }
    }
  }

  for (const sheetName of sheetsToProcess) {
    const worksheet = workbook.Sheets[sheetName]
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    if (rawData.length < 2) continue

    console.log(`\n=== Processing sheet: ${sheetName} ===`)

    // Find header row (scan first 15 rows for recognizable headers)
    let headerRowIndex = -1
    let headers: string[] = []

    for (let i = 0; i < Math.min(15, rawData.length); i++) {
      const row = rawData[i]
      if (!row || row.length < 3) continue

      // Safely convert row to strings
      const rowAsStrings = row.map(cell =>
        cell === null || cell === undefined ? '' : String(cell)
      )

      // Check if this row has recognizable column headers
      const micIdx = findColumnIndex(rowAsStrings, 'mic')
      const strIdx = findColumnIndex(rowAsStrings, 'str')
      const uhmIdx = findColumnIndex(rowAsStrings, 'uhm')

      // Need at least 2 out of 3 key columns to identify as header
      const matchCount = [micIdx, strIdx, uhmIdx].filter(i => i >= 0).length
      if (matchCount >= 2) {
        headerRowIndex = i
        headers = rowAsStrings
        console.log(`Header found at row ${i}:`, headers.slice(0, 15))
        break
      }
    }

    if (headerRowIndex === -1) {
      console.log(`No recognizable headers in sheet "${sheetName}"`)
      continue
    }

    // Map columns by field type
    console.log('Headers for mapping:', headers)
    const columnMap = {
      mic: findColumnIndex(headers, 'mic'),
      uhm: findColumnIndex(headers, 'uhm'),
      str: findColumnIndex(headers, 'str'),
      sci: findColumnIndex(headers, 'sci'),
      lot: findColumnIndex(headers, 'lot'),
      weight: findColumnIndex(headers, 'weight'),
      bale: findColumnIndex(headers, 'bale'),
      baleCount: findColumnIndex(headers, 'baleCount'),
      ui: findColumnIndex(headers, 'ui'),
      sfi: findColumnIndex(headers, 'sfi'),
    }

    console.log('Column mapping:', columnMap)
    console.log('Lot column index:', columnMap.lot, 'hasLotColumn:', columnMap.lot >= 0)

    // Determine if this is a summary sheet or raw data
    const hasBaleCountColumn = columnMap.baleCount >= 0
    const hasLotColumn = columnMap.lot >= 0
    const hasBaleColumn = columnMap.bale >= 0
    const sampleRow = rawData[headerRowIndex + 1]

    // Check if first cell looks like a long bale code (15+ digits starting with 00)
    const firstCellValue = sampleRow?.[0]?.toString() || ''
    const firstCellIsLongBaleCode = /^00\d{13,}/.test(firstCellValue)

    // Check if we need to group by lot (multiple rows per lot)
    // Group by lot when: we have a lot column AND (we have a separate bale column OR first cell is not a long bale code)
    if (hasLotColumn && (hasBaleColumn || !firstCellIsLongBaleCode)) {
      // Group data by lot number
      console.log('Processing with lot grouping')

      const lotDataMap: Map<string, {
        micValues: number[]
        uhmValues: number[]
        strValues: number[]
        sciValues: number[]
        weightValues: number[]
        baleCount: number
      }> = new Map()

      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i]
        if (!row || row.length < 3) continue
        if (isSummaryRow(row[0])) continue

        const lotValue = columnMap.lot >= 0 ? String(row[columnMap.lot] ?? '').trim() : ''
        if (!lotValue) continue

        const micValue = columnMap.mic >= 0 ? parseNumericValue(row[columnMap.mic]) : 0
        const uhmValue = columnMap.uhm >= 0 ? parseNumericValue(row[columnMap.uhm]) : 0
        const strValue = columnMap.str >= 0 ? parseNumericValue(row[columnMap.str]) : 0
        const sciValue = columnMap.sci >= 0 ? parseNumericValue(row[columnMap.sci]) : 0
        const weightValue = columnMap.weight >= 0 ? parseNumericValue(row[columnMap.weight]) : 0
        const baleCountValue = columnMap.baleCount >= 0 ? parseNumericValue(row[columnMap.baleCount]) : 1

        // Skip rows without meaningful data
        if (micValue === 0 && strValue === 0 && uhmValue === 0) continue

        // Get or create lot data
        if (!lotDataMap.has(lotValue)) {
          lotDataMap.set(lotValue, {
            micValues: [],
            uhmValues: [],
            strValues: [],
            sciValues: [],
            weightValues: [],
            baleCount: 0
          })
        }

        const lotData = lotDataMap.get(lotValue)!
        if (micValue > 0) lotData.micValues.push(micValue)
        if (uhmValue > 0) lotData.uhmValues.push(uhmValue)
        if (strValue > 0) lotData.strValues.push(strValue)
        if (sciValue > 0) lotData.sciValues.push(sciValue)
        if (weightValue > 0) lotData.weightValues.push(weightValue)
        lotData.baleCount += baleCountValue || 1
      }

      // Convert grouped data to results
      for (const [lotNumber, lotData] of lotDataMap) {
        const micStats = calculateStats(lotData.micValues)
        const uhmStats = calculateStats(lotData.uhmValues)
        const strStats = calculateStats(lotData.strValues)
        const sciStats = calculateStats(lotData.sciValues)
        const totalWeight = lotData.weightValues.reduce((a, b) => a + b, 0)

        results.push({
          batchNumber: lotNumber,
          batchWeight: totalWeight > 0 ? totalWeight.toFixed(2) : 'N/A',
          numberOfBales: lotData.baleCount.toString(),
          micMin: micStats.min,
          micAvg: micStats.avg,
          micMax: micStats.max,
          uhmMin: uhmStats.min,
          uhmAvg: uhmStats.avg,
          uhmMax: uhmStats.max,
          strMin: strStats.min,
          strAvg: strStats.avg,
          strMax: strStats.max,
          sciAvg: sciStats.avg > 0 ? sciStats.avg : null,
          sourceFile: file.name,
        })
      }

      console.log(`Grouped into ${results.length} lots`)
    } else if (hasBaleCountColumn && !firstCellIsLongBaleCode && !hasLotColumn) {
      // Summary sheet without lot column - each row is already a lot summary
      console.log('Processing as summary sheet')

      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i]
        if (!row || row.length < 3) continue
        if (isSummaryRow(row[0])) continue

        const micValue = columnMap.mic >= 0 ? parseNumericValue(row[columnMap.mic]) : 0
        const uhmValue = columnMap.uhm >= 0 ? parseNumericValue(row[columnMap.uhm]) : 0
        const strValue = columnMap.str >= 0 ? parseNumericValue(row[columnMap.str]) : 0
        const sciValue = columnMap.sci >= 0 ? parseNumericValue(row[columnMap.sci]) : null
        const weightValue = columnMap.weight >= 0 ? row[columnMap.weight]?.toString() : ''
        const baleCountValue = columnMap.baleCount >= 0 ? row[columnMap.baleCount]?.toString() : ''

        // Skip rows without meaningful data
        if (micValue === 0 && strValue === 0 && uhmValue === 0) continue

        const normalizedUhm = normalizeUhmToInches(uhmValue)

        results.push({
          batchNumber: extractBatchNumber('', file.name),
          batchWeight: weightValue ? weightValue.toString().replace(',', '.') : 'N/A',
          numberOfBales: baleCountValue || 'N/A',
          micMin: micValue,
          micAvg: micValue,
          micMax: micValue,
          uhmMin: normalizedUhm,
          uhmAvg: normalizedUhm,
          uhmMax: normalizedUhm,
          strMin: strValue,
          strAvg: strValue,
          strMax: strValue,
          sciAvg: sciValue && sciValue > 0 ? sciValue : null,
          sourceFile: file.name,
        })
      }
    } else {
      // Raw bale data - need to calculate statistics
      console.log('Processing as raw bale data')

      const micValues: number[] = []
      const uhmValues: number[] = []
      const strValues: number[] = []
      const sciValues: number[] = []
      const weightValues: number[] = []
      let lotNumber = ''

      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i]
        if (!row || row.length < 3) continue
        if (isSummaryRow(row[0])) continue

        // Extract values based on mapped columns
        if (columnMap.mic >= 0) {
          const val = parseNumericValue(row[columnMap.mic])
          if (val > 0) micValues.push(val)
        }
        if (columnMap.uhm >= 0) {
          const val = parseNumericValue(row[columnMap.uhm])
          if (val > 0) uhmValues.push(normalizeUhmToInches(val))
        }
        if (columnMap.str >= 0) {
          const val = parseNumericValue(row[columnMap.str])
          if (val > 0) strValues.push(val)
        }
        if (columnMap.sci >= 0) {
          const val = parseNumericValue(row[columnMap.sci])
          if (val > 0) sciValues.push(val)
        }
        if (columnMap.weight >= 0) {
          const val = parseNumericValue(row[columnMap.weight])
          if (val > 0) weightValues.push(val)
        }
        if (columnMap.lot >= 0 && !lotNumber) {
          const val = row[columnMap.lot]?.toString()
          if (val && val !== '0') lotNumber = val
        }
      }

      // Only create result if we have meaningful data
      if (micValues.length > 0 || uhmValues.length > 0 || strValues.length > 0) {
        const micStats = calculateStats(micValues)
        const uhmStats = calculateStats(uhmValues)
        const strStats = calculateStats(strValues)
        const sciStats = calculateStats(sciValues)
        const totalWeight = weightValues.reduce((a, b) => a + b, 0)

        // Extract lot from sheet name if not found in data
        const sheetLot = sheetName.replace(/[^\d]/g, '')
        const finalLotNumber = lotNumber || sheetLot || extractBatchNumber('', file.name)

        results.push({
          batchNumber: finalLotNumber,
          batchWeight: totalWeight > 0 ? totalWeight.toFixed(2) : 'N/A',
          numberOfBales: Math.max(micValues.length, uhmValues.length, strValues.length).toString(),
          micMin: micStats.min,
          micAvg: micStats.avg,
          micMax: micStats.max,
          uhmMin: uhmStats.min,
          uhmAvg: uhmStats.avg,
          uhmMax: uhmStats.max,
          strMin: strStats.min,
          strAvg: strStats.avg,
          strMax: strStats.max,
          sciAvg: sciStats.avg > 0 ? sciStats.avg : null,
          sourceFile: `${file.name} [${sheetName}]`,
        })
      }
    }
  }

  if (results.length === 0) {
    throw new Error(`Nenhum dado encontrado no arquivo Excel: ${file.name}`)
  }

  return results
}

/**
 * Extract data from PDF file
 */
async function extractDataFromPDF(file: File): Promise<BatchData> {
  const pdfjs = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let fullText = ""

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(" ")
    fullText += pageText + "\n"
  }

  console.log("PDF text preview:", fullText.substring(0, 2000))

  // Extract batch number
  const batchNumber = extractBatchNumber(fullText, file.name)

  // Extract bales count and weight
  let numberOfBales = "N/A"
  let batchWeight = "N/A"

  // Try "Romaneio com HVI" format first (has summary at end with Mínimo, Média, Máximo)
  // Format: Pilha/Lote: X - ... -Peso do Lote: XXXXX.X
  const romaneioHVIMatch = fullText.match(/Romaneio\s+com\s+HVI/i)
  const pilhaLoteMatch = fullText.match(/Pilha\/Lote[:\s]*(\d+)/i)
  const pesoLoteMatch = fullText.match(/Peso\s+do\s+Lote\s*[;:]?\s*([\d.,]+)/i)

  if (romaneioHVIMatch || (pilhaLoteMatch && fullText.includes('MIC') && fullText.includes('RES'))) {
    console.log("Romaneio com HVI format detected")

    // Extract lot number from "Pilha/Lote: X"
    if (pilhaLoteMatch) {
      // batchNumber is already set by extractBatchNumber, but override if we found Pilha/Lote
    }

    // Extract weight from "Peso do Lote: XXXXX.X"
    if (pesoLoteMatch) {
      batchWeight = pesoLoteMatch[1].replace(',', '.')
    }

    // Try to extract from summary lines (Mínimo, Média, Máximo at the end)
    // This format has columns: UHM LEN MIC UI RES ELG RD B COR Area Cnt LEAF MR SFC SCI CSP
    // Summary: "- Média - 30,48 1,20 4,2 82,42 30,78 6,76 78,56 8,74 - ,32 41,32 2,67 ,88 7,89 138 2279"
    // We need to extract more numbers to get SCI (position ~15)

    // Fallback to simpler pattern
    const minimoLine = fullText.match(/[^\w]M[íi]nimo[^\d]*([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i)
    const mediaLine = fullText.match(/[^\w]M[ée]dia[^\d]*([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i)
    const maximoLine = fullText.match(/[^\w]M[áa]ximo[^\d]*([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i)

    // Extract SCI from the full Média line
    // Pattern: find the line with "Média" and extract all numbers, SCI is near the end (3-digit number before CSP 4-digit)
    let sciAvgValue: number | null = null
    const mediaFullLine = fullText.match(/[^\w]M[ée]dia[^\n\r]+/i)
    if (mediaFullLine) {
      console.log("Full Média line:", mediaFullLine[0])
      // Extract all numbers from the line
      const allNumbers = mediaFullLine[0].match(/[\d,\.]+/g)
      if (allNumbers && allNumbers.length > 0) {
        console.log("All numbers in Média line:", allNumbers)
        // SCI is typically a 3-digit number (100-170 range) near the end, before CSP (4-digit)
        // Look for pattern: SCI (3 digits 100-170) followed by CSP (4 digits 2000-2500)
        for (let i = allNumbers.length - 2; i >= 0; i--) {
          const val = parseNumericValue(allNumbers[i])
          const nextVal = i + 1 < allNumbers.length ? parseNumericValue(allNumbers[i + 1]) : 0
          if (val >= 100 && val <= 180 && nextVal >= 2000 && nextVal <= 2500) {
            sciAvgValue = val
            console.log(`Found SCI avg: ${sciAvgValue} (followed by CSP: ${nextVal})`)
            break
          }
        }
      }
    }

    // Column order in summary: [1]UHM(mm), [2]LEN(inches), [3]MIC, [4]UI, [5]RES, [6]ELG
    // Use LEN (position 2) which is already in inches
    if (mediaLine) {
      console.log("Found summary - Média:", mediaLine.slice(1, 7))
      console.log("Found summary - Mínimo:", minimoLine?.slice(1, 7))
      console.log("Found summary - Máximo:", maximoLine?.slice(1, 7))

      // Position [2] is LEN in inches (1.20), Position [3] is MIC (4.2), Position [5] is RES (30.78)
      const uhmAvgRaw = parseNumericValue(mediaLine[2]) // LEN in inches
      const micAvg = parseNumericValue(mediaLine[3])
      const strAvg = parseNumericValue(mediaLine[5])

      const uhmMinRaw = minimoLine ? parseNumericValue(minimoLine[2]) : uhmAvgRaw
      const uhmMaxRaw = maximoLine ? parseNumericValue(maximoLine[2]) : uhmAvgRaw
      const micMin = minimoLine ? parseNumericValue(minimoLine[3]) : micAvg
      const micMax = maximoLine ? parseNumericValue(maximoLine[3]) : micAvg
      const strMin = minimoLine ? parseNumericValue(minimoLine[5]) : strAvg
      const strMax = maximoLine ? parseNumericValue(maximoLine[5]) : strAvg

      console.log(`Parsed values - UHM: ${uhmMinRaw}/${uhmAvgRaw}/${uhmMaxRaw}, MIC: ${micMin}/${micAvg}/${micMax}, STR: ${strMin}/${strAvg}/${strMax}, SCI: ${sciAvgValue}`)

      // Count bales by counting bale codes
      const baleCount = (fullText.match(/00\d{14,}/g) || []).length
      numberOfBales = baleCount > 0 ? baleCount.toString() : "N/A"

      // UHM values - use position [2] which should already be in inches (~1.15-1.25)
      // If value > 2, it's in mm and needs conversion
      const normalizedUhmMin = normalizeUhmToInches(uhmMinRaw)
      const normalizedUhmAvg = normalizeUhmToInches(uhmAvgRaw)
      const normalizedUhmMax = normalizeUhmToInches(uhmMaxRaw)

      return {
        batchNumber,
        batchWeight,
        numberOfBales,
        micMin: micMin,
        micAvg: micAvg,
        micMax: micMax,
        uhmMin: normalizedUhmMin,
        uhmAvg: normalizedUhmAvg,
        uhmMax: normalizedUhmMax,
        strMin: strMin,
        strAvg: strAvg,
        strMax: strMax,
        sciAvg: sciAvgValue,
        sourceFile: file.name,
      }
    }
  }

  // Try G4 COTTON / Classificação do Lote de Plumas format
  // This format has "Romaneio X" and "Qtd Fardos N" with summary averages on the same line
  // Columns: Fardo | Líquido | Máq | Tipo | Área | UHM | Ui | Sfc | Res | Elg | Mic | Rd | +b | Csp | Leaf | Cont | Mat | Fibra | Comp | Sugar | Neps | Neps Comp | Carameliz | SCI
  // Summary line: "Qtd Fardos 110 0,52 1,14 82,22 9,15 30,37 6,42 4,12 76,85 9,25 2.190,48 3,87 44,31 86,90 0,00 0,00 0,00 0,00 0,00 0,00 1,34"
  // Column order in summary: [1]Área [2]UHM [3]Ui [4]Sfc [5]Res [6]Elg [7]Mic [8]Rd [9]+b [10]Csp [11]Leaf [12]Cont [13]Mat [14]Fibra ... [last-1]Comp_value [last]SCI_value
  const hasG4Cotton = fullText.includes('G4 COTTON')
  const hasClassificacao = fullText.includes('Classificação do Lote de Plumas') || fullText.includes('Classificacao do Lote de Plumas')
  const hasRomaneioHeader = fullText.includes('Romaneio') && fullText.match(/Fardo\s+L[ií]quido/i)
  const isG4CottonFormat = hasG4Cotton || hasClassificacao || hasRomaneioHeader

  console.log(`G4 COTTON format check - hasG4Cotton: ${hasG4Cotton}, hasClassificacao: ${hasClassificacao}, hasRomaneioHeader: ${hasRomaneioHeader}`)

  // Match "Qtd Fardos 110" followed by averages - more flexible pattern
  // The numbers might be separated by various whitespace
  // Look for 2+ digit number after "Qtd Fardos" to avoid matching single digits
  const qtdFardosWithAvgMatch = fullText.match(/Qtd\s*Fardos\s+(\d{2,})\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i)

  console.log(`qtdFardosWithAvgMatch: ${qtdFardosWithAvgMatch ? 'found' : 'not found'}`)
  if (qtdFardosWithAvgMatch) {
    console.log(`Match groups: ${qtdFardosWithAvgMatch.slice(1, 9).join(', ')}`)
  }

  // Also try to get bale count by counting bale codes early
  const allBaleCodes = fullText.match(/00\d{14,}/g) || []
  const baleCodeCount = allBaleCodes.length
  console.log(`Total bale codes found in PDF: ${baleCodeCount}`)

  // Extract SCI from G4 COTTON format - SCI is the last column value on the summary line
  // The line ends with "... 0,00 1,34" where 1,34 is the Comp value and SCI values are in individual rows (85, 86, 87, 88)
  // Actually, looking at the PDF, SCI is in the last column of each bale row (values like 86,00, 85,00, etc.)
  let g4CottonSciAvg: number | null = null

  if (isG4CottonFormat && qtdFardosWithAvgMatch) {
    console.log("G4 COTTON / Classificação do Lote de Plumas format detected")

    // Extract averages from the summary line
    // Format: Qtd Fardos 110 [1]Área [2]UHM [3]Ui [4]Sfc [5]Res [6]Elg [7]Mic
    const uhmAvg = parseNumericValue(qtdFardosWithAvgMatch[3]) // UHM (1.14)
    const strAvg = parseNumericValue(qtdFardosWithAvgMatch[6]) // Res (30.37)
    const micAvg = parseNumericValue(qtdFardosWithAvgMatch[8]) // Mic (4.12)

    console.log(`G4 COTTON averages - UHM: ${uhmAvg}, STR: ${strAvg}, MIC: ${micAvg}`)

    // Parse individual bale data to get min/max values
    const micValues: number[] = []
    const uhmValues: number[] = []
    const strValues: number[] = []
    const weightValues: number[] = []
    const sciValues: number[] = []

    // Extract all numbers from text after each bale code
    const baleCodePattern = /00\d{14,}/g
    let match
    const balePositions: number[] = []

    while ((match = baleCodePattern.exec(fullText)) !== null) {
      balePositions.push(match.index + match[0].length)
    }

    console.log(`Found ${balePositions.length} bale codes`)

    // Use bale code count as the authoritative source for number of bales
    // The regex might not capture the full number correctly due to PDF text extraction issues
    numberOfBales = baleCodeCount > 0 ? baleCodeCount.toString() : qtdFardosWithAvgMatch[1]
    console.log(`Using bale count: ${numberOfBales}`)

    // For each bale, extract the numbers that follow
    // G4 COTTON column order after bale code:
    // [0]Líquido [1]Máq [2]Tipo(21-3) [3]Área [4]UHM [5]Ui [6]Sfc [7]Res [8]Elg [9]Mic [10]Rd [11]+b [12]Csp [13]Leaf [14]Cont [15]Mat [16]Fibra [17-21]zeros [22]Comp [23]SCI
    for (let i = 0; i < balePositions.length; i++) {
      const startPos = balePositions[i]
      const endPos = i < balePositions.length - 1 ? balePositions[i + 1] - 20 : startPos + 400
      const segment = fullText.substring(startPos, endPos)

      // Extract numbers from segment (skip tipo like "21-3")
      const numbers = segment
        .split(/\s+/)
        .filter(s => !/^\d+-\d+$/.test(s)) // Skip tipo patterns like "21-3"
        .map(s => {
          // Handle Brazilian number format: 2.233,0 -> 2233.0
          // If has both . and , where , comes last, it's Brazilian format
          if (s.includes('.') && s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
            return s.replace(/\./g, '').replace(',', '.')
          }
          return s.replace(',', '.')
        })
        .filter(s => /^-?\d+\.?\d*$/.test(s))
        .map(s => parseFloat(s))
        .filter(n => !isNaN(n))

      if (numbers.length >= 10) {
        const weight = numbers[0]
        if (weight >= 150 && weight <= 300) {
          weightValues.push(weight)
        }

        // UHM is typically at index 3 (after Líquido, Máq, Área) - value ~1.08-1.20
        const uhmCandidate = numbers.find((n, idx) => idx >= 2 && idx <= 5 && n >= 1.0 && n <= 1.35)
        if (uhmCandidate) uhmValues.push(uhmCandidate)

        // Res/STR is typically at index 6 - value ~29-32
        const strCandidate = numbers.find((n, idx) => idx >= 5 && idx <= 8 && n >= 28 && n <= 35)
        if (strCandidate) strValues.push(strCandidate)

        // Mic is typically at index 8 - value ~4.0-4.5
        const micCandidate = numbers.find((n, idx) => idx >= 7 && idx <= 10 && n >= 3.5 && n <= 5.5)
        if (micCandidate) micValues.push(micCandidate)

        // SCI is the last value in the row (typically 85-88 range for G4 COTTON)
        // It's a 2-digit integer at the end of the row (e.g., 86.00, 85.00, 87.00, 88.00)
        // Looking for values in 84-92 range at the end of the numbers array
        // The pattern is: ... Comp(1.2-1.5) SCI(85-88)
        // Look at the last few values to find SCI
        // SCI should be an integer value (85, 86, 87, 88) possibly with .00
        for (let idx = numbers.length - 1; idx >= Math.max(0, numbers.length - 8); idx--) {
          const val = numbers[idx]
          // SCI values are 84-92 range for G4 COTTON format
          // Must be a whole number (or very close to it like 86.00)
          if (val >= 84 && val <= 92 && Math.abs(val - Math.round(val)) < 0.01) {
            sciValues.push(Math.round(val))
            break
          }
        }
      }
    }

    console.log(`Extracted: ${weightValues.length} weights, ${micValues.length} mic, ${uhmValues.length} uhm, ${strValues.length} str, ${sciValues.length} sci`)

    // Calculate totals
    if (weightValues.length > 0) {
      batchWeight = weightValues.reduce((a, b) => a + b, 0).toFixed(2)
    }

    // Use extracted min/max, but use summary averages
    const micStats = calculateStats(micValues)
    const uhmStats = calculateStats(uhmValues)
    const strStats = calculateStats(strValues)
    const sciStats = calculateStats(sciValues)

    // Calculate SCI average from individual bale values
    g4CottonSciAvg = sciStats.avg > 0 ? sciStats.avg : null
    console.log(`G4 COTTON SCI average: ${g4CottonSciAvg}`)

    return {
      batchNumber,
      batchWeight,
      numberOfBales,
      micMin: micStats.min > 0 ? micStats.min : micAvg,
      micAvg: micAvg > 0 ? micAvg : micStats.avg,
      micMax: micStats.max > 0 ? micStats.max : micAvg,
      uhmMin: uhmStats.min > 0 ? uhmStats.min : uhmAvg,
      uhmAvg: uhmAvg > 0 ? uhmAvg : uhmStats.avg,
      uhmMax: uhmStats.max > 0 ? uhmStats.max : uhmAvg,
      strMin: strStats.min > 0 ? strStats.min : strAvg,
      strAvg: strAvg > 0 ? strAvg : strStats.avg,
      strMax: strStats.max > 0 ? strStats.max : strAvg,
      sciAvg: g4CottonSciAvg,
      sourceFile: file.name,
    }
  }

  // If G4 COTTON format detected but no summary line found, try to parse bale data directly
  if (isG4CottonFormat && !qtdFardosWithAvgMatch) {
    console.log("G4 COTTON format detected but no summary line - parsing bale data directly")

    // Use bale code count as authoritative source
    numberOfBales = baleCodeCount > 0 ? baleCodeCount.toString() : "N/A"

    const micValues: number[] = []
    const uhmValues: number[] = []
    const strValues: number[] = []
    const weightValues: number[] = []
    const sciValues: number[] = []

    // Extract all numbers from text after each bale code
    const baleCodePattern = /00\d{14,}/g
    let match
    const balePositions: number[] = []

    while ((match = baleCodePattern.exec(fullText)) !== null) {
      balePositions.push(match.index + match[0].length)
    }

    console.log(`Found ${balePositions.length} bale codes for direct parsing`)

    // For each bale, extract the numbers that follow
    for (let i = 0; i < balePositions.length; i++) {
      const startPos = balePositions[i]
      const endPos = i < balePositions.length - 1 ? balePositions[i + 1] - 20 : startPos + 400
      const segment = fullText.substring(startPos, endPos)

      // Extract numbers from segment (skip tipo like "21-3")
      const numbers = segment
        .split(/\s+/)
        .filter(s => !/^\d+-\d+$/.test(s)) // Skip tipo patterns like "21-3"
        .map(s => {
          // Handle Brazilian number format: 2.233,0 -> 2233.0
          if (s.includes('.') && s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
            return s.replace(/\./g, '').replace(',', '.')
          }
          return s.replace(',', '.')
        })
        .filter(s => /^-?\d+\.?\d*$/.test(s))
        .map(s => parseFloat(s))
        .filter(n => !isNaN(n))

      if (numbers.length >= 8) {
        const weight = numbers[0]
        if (weight >= 150 && weight <= 300) {
          weightValues.push(weight)
        }

        // UHM is typically ~1.08-1.20
        const uhmCandidate = numbers.find((n, idx) => idx >= 2 && idx <= 5 && n >= 1.0 && n <= 1.35)
        if (uhmCandidate) uhmValues.push(uhmCandidate)

        // Res/STR is typically ~29-32
        const strCandidate = numbers.find((n, idx) => idx >= 5 && idx <= 8 && n >= 28 && n <= 35)
        if (strCandidate) strValues.push(strCandidate)

        // Mic is typically ~4.0-4.5
        const micCandidate = numbers.find((n, idx) => idx >= 7 && idx <= 10 && n >= 3.5 && n <= 5.5)
        if (micCandidate) micValues.push(micCandidate)

        // SCI is the last value in the row (typically 85-88 range for G4 COTTON)
        // Look at the last few values to find SCI
        for (let idx = numbers.length - 1; idx >= Math.max(0, numbers.length - 8); idx--) {
          const val = numbers[idx]
          // SCI values are 84-92 range, must be whole number
          if (val >= 84 && val <= 92 && Math.abs(val - Math.round(val)) < 0.01) {
            sciValues.push(Math.round(val))
            break
          }
        }
      }
    }

    console.log(`Direct parsing extracted: ${weightValues.length} weights, ${micValues.length} mic, ${uhmValues.length} uhm, ${strValues.length} str, ${sciValues.length} sci`)

    if (micValues.length > 0 || uhmValues.length > 0 || strValues.length > 0) {
      if (weightValues.length > 0) {
        batchWeight = weightValues.reduce((a, b) => a + b, 0).toFixed(2)
      }

      const micStats = calculateStats(micValues)
      const uhmStats = calculateStats(uhmValues)
      const strStats = calculateStats(strValues)
      const sciStats = calculateStats(sciValues)

      return {
        batchNumber,
        batchWeight,
        numberOfBales: numberOfBales !== "N/A" ? numberOfBales : balePositions.length.toString(),
        micMin: micStats.min,
        micAvg: micStats.avg,
        micMax: micStats.max,
        uhmMin: uhmStats.min,
        uhmAvg: uhmStats.avg,
        uhmMax: uhmStats.max,
        strMin: strStats.min,
        strAvg: strStats.avg,
        strMax: strStats.max,
        sciAvg: sciStats.avg > 0 ? sciStats.avg : null,
        sourceFile: file.name,
      }
    }
  }

  // Try Siagri format - look for "Qtd Fardos" followed by numbers
  // Format: Qtd Fardos 110 [values...]
  const siagriMatch = fullText.match(/Qtd\s*Fardos\s+(\d+)/i)
  const isSiagriFormat = fullText.includes('Siagri') || fullText.includes('ALGODOEIRA')

  if (siagriMatch && isSiagriFormat) {
    console.log("Siagri format detected")
    numberOfBales = siagriMatch[1]

    // For Siagri, parse individual bale data to calculate statistics
    // Bale format: 0007898777051000005 212,00 1 323 0,2 1,18 78,3 12,1 27,6 6,3 4,38 75,1 7,1 ...
    // Columns: Fardo | Líquido | Máq | Q.Cor | %Umid | Área | Uhm | Unif | FC | Resist | Along | Micron | RD | +B

    const micValues: number[] = []
    const uhmValues: number[] = []
    const strValues: number[] = []
    const weightValues: number[] = []

    // Extract all numbers from text after each bale code
    const baleCodePattern = /00\d{14,}/g
    let match
    const balePositions: number[] = []

    while ((match = baleCodePattern.exec(fullText)) !== null) {
      balePositions.push(match.index + match[0].length)
    }

    console.log(`Found ${balePositions.length} bale codes`)

    // For each bale, extract the numbers that follow
    for (let i = 0; i < balePositions.length; i++) {
      const startPos = balePositions[i]
      const endPos = i < balePositions.length - 1 ? balePositions[i + 1] - 20 : startPos + 200
      const segment = fullText.substring(startPos, endPos)

      // Extract numbers from segment
      const numbers = segment
        .split(/\s+/)
        .map(s => s.replace(',', '.'))
        .filter(s => /^-?\d+\.?\d*$/.test(s))
        .map(s => parseFloat(s))
        .filter(n => !isNaN(n))

      if (numbers.length >= 10) {
        // Expected order after bale code:
        // [0] Líquido (weight ~200-230)
        // [1] Máq (1)
        // [2] Q.Cor (323)
        // [3] %Umid (0.2-0.7)
        // [4] Área (0.2-0.5) OR Uhm if Área column missing
        // [5] Uhm (1.12-1.22)
        // [6] Unif (77-84)
        // [7] FC (6-14) OR could be 0
        // [8] Resist (27-31)
        // [9] Along (5-7)
        // [10] Micron (4.0-4.7)

        const weight = numbers[0]
        if (weight >= 150 && weight <= 300) {
          weightValues.push(weight)
        }

        // Find UHM value (typically 1.12-1.25 range)
        const uhmCandidate = numbers.find((n, idx) => idx >= 4 && idx <= 6 && n >= 1.0 && n <= 1.35)
        if (uhmCandidate) uhmValues.push(uhmCandidate)

        // Find Resist/STR value (typically 27-32 range)
        const strCandidate = numbers.find((n, idx) => idx >= 7 && idx <= 10 && n >= 25 && n <= 35)
        if (strCandidate) strValues.push(strCandidate)

        // Find Micron value (typically 4.0-5.0 range)
        const micCandidate = numbers.find((n, idx) => idx >= 9 && n >= 3.5 && n <= 5.5)
        if (micCandidate) micValues.push(micCandidate)
      }
    }

    console.log(`Extracted: ${weightValues.length} weights, ${micValues.length} mic, ${uhmValues.length} uhm, ${strValues.length} str`)

    // Calculate totals and stats
    if (weightValues.length > 0) {
      batchWeight = weightValues.reduce((a, b) => a + b, 0).toFixed(2)
    }

    if (micValues.length > 0 || uhmValues.length > 0 || strValues.length > 0) {
      const micStats = calculateStats(micValues)
      const uhmStats = calculateStats(uhmValues)
      const strStats = calculateStats(strValues)

      return {
        batchNumber,
        batchWeight,
        numberOfBales,
        micMin: micStats.min,
        micAvg: micStats.avg,
        micMax: micStats.max,
        uhmMin: uhmStats.min,
        uhmAvg: uhmStats.avg,
        uhmMax: uhmStats.max,
        strMin: strStats.min,
        strAvg: strStats.avg,
        strMax: strStats.max,
        sciAvg: null,
        sourceFile: file.name,
      }
    }
  }

  // Standard bales patterns for other formats
  const balesPatterns = [
    /(\d+)\s*Fardos\s+([\d.,]+)/i,
    /Fardos[:\s]+(\d+)/i,
    /Qtd\s*Fardos[:\s]+(\d+)/i,
    /Peso[:\s]+([\d.,]+)\s*Kg/i,
  ]

  for (const pattern of balesPatterns) {
    const match = fullText.match(pattern)
    if (match) {
      if (pattern.source.includes('Peso')) {
        batchWeight = match[1].replace(",", ".")
      } else if (match[2]) {
        numberOfBales = match[1]
        batchWeight = match[2].replace(",", ".")
      } else {
        numberOfBales = match[1]
      }
    }
  }

  // Try to extract from summary lines (MÉDIA, MÍNIMO, MÁXIMO)
  const extractSummaryStats = () => {
    const result = {
      mic: { min: 0, avg: 0, max: 0 },
      uhm: { min: 0, avg: 0, max: 0 },
      str: { min: 0, avg: 0, max: 0 },
      sci: { min: 0, avg: 0, max: 0 },
    }

    // Labels for each statistic type
    const statLabels = {
      min: ['mínimo', 'minimo', 'minimum', 'min', '3- mínimo', '3-mínimo'],
      avg: ['média', 'media', 'average', 'avg', '1- média', '1-média'],
      max: ['máximo', 'maximo', 'maximum', 'max', '2- máximo', '2-máximo'],
    }

    for (const [statType, labels] of Object.entries(statLabels)) {
      for (const label of labels) {
        // Match label followed by numbers
        const regex = new RegExp(
          `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\s]+([\\d,\\.\\s]+)`,
          'i'
        )
        const match = fullText.match(regex)

        if (match) {
          const numbers = match[1]
            .split(/\s+/)
            .map(n => n.replace(',', '.'))
            .filter(n => /^\d+\.?\d*$/.test(n))
            .map(n => parseFloat(n))

          console.log(`${label} numbers:`, numbers)

          // Map numbers to fields based on typical column order
          // Most common: Mic, UHM, UI, SFI, STR, ELG...
          if (numbers.length > 0) {
            // Find Mic (usually 3-6 range, first such value)
            const micValue = numbers.find(n => n >= 3 && n <= 6)
            if (micValue) result.mic[statType as keyof typeof result.mic] = micValue

            // Find UHM (1.0-1.4 for inches, 25-35 for mm)
            const uhmValue = numbers.find(n => (n >= 0.9 && n <= 1.5) || (n >= 25 && n <= 40))
            if (uhmValue) result.uhm[statType as keyof typeof result.uhm] = normalizeUhmToInches(uhmValue)

            // Find STR (usually 27-35 range)
            const strValue = numbers.find(n => n >= 25 && n <= 40 && n !== uhmValue)
            if (strValue) result.str[statType as keyof typeof result.str] = strValue

            // Find SCI (usually 100-170 range)
            const sciValue = numbers.find(n => n >= 80 && n <= 200)
            if (sciValue) result.sci[statType as keyof typeof result.sci] = sciValue
          }
          break
        }
      }
    }

    return result
  }

  const stats = extractSummaryStats()

  // If summary extraction failed, try row-by-row parsing
  if (stats.mic.avg === 0 && stats.str.avg === 0) {
    console.log("Summary extraction failed, parsing individual rows")

    const micValues: number[] = []
    const uhmValues: number[] = []
    const strValues: number[] = []
    const sciValues: number[] = []

    // Split into lines and find data rows
    const lines = fullText.split(/\n|\s{3,}/)

    for (const line of lines) {
      // Look for rows starting with bale numbers
      if (/^00\d{10,}/.test(line.trim()) || /^\d{15,}/.test(line.trim())) {
        const numbers = line
          .split(/\s+/)
          .map(s => s.replace(',', '.'))
          .filter(s => /^\d+\.?\d*$/.test(s))
          .map(s => parseFloat(s))
          .filter(n => n < 10000) // Filter out bale numbers

        // Categorize by value range
        for (const num of numbers) {
          if (num >= 3 && num <= 6) micValues.push(num)
          else if (num >= 0.9 && num <= 1.5) uhmValues.push(num)
          else if (num >= 25 && num <= 40) {
            // Could be UHM in mm or STR
            if (num >= 27 && num <= 35) {
              // Ambiguous - check if we already have UHM values
              if (uhmValues.length > 0) strValues.push(num)
              else uhmValues.push(normalizeUhmToInches(num))
            } else if (num > 35) {
              strValues.push(num)
            } else {
              uhmValues.push(normalizeUhmToInches(num))
            }
          }
          else if (num >= 80 && num <= 200) sciValues.push(num)
        }
      }
    }

    if (micValues.length > 0) {
      const micCalc = calculateStats(micValues)
      stats.mic = { min: micCalc.min, avg: micCalc.avg, max: micCalc.max }
    }
    if (uhmValues.length > 0) {
      const uhmCalc = calculateStats(uhmValues)
      stats.uhm = { min: uhmCalc.min, avg: uhmCalc.avg, max: uhmCalc.max }
    }
    if (strValues.length > 0) {
      const strCalc = calculateStats(strValues)
      stats.str = { min: strCalc.min, avg: strCalc.avg, max: strCalc.max }
    }
    if (sciValues.length > 0) {
      const sciCalc = calculateStats(sciValues)
      stats.sci = { min: sciCalc.min, avg: sciCalc.avg, max: sciCalc.max }
    }

    if (numberOfBales === "N/A" && micValues.length > 0) {
      numberOfBales = micValues.length.toString()
    }
  }

  return {
    batchNumber,
    batchWeight,
    numberOfBales,
    micMin: stats.mic.min,
    micAvg: stats.mic.avg,
    micMax: stats.mic.max,
    uhmMin: stats.uhm.min,
    uhmAvg: stats.uhm.avg,
    uhmMax: stats.uhm.max,
    strMin: stats.str.min,
    strAvg: stats.str.avg,
    strMax: stats.str.max,
    sciAvg: stats.sci.avg > 0 ? stats.sci.avg : null,
    sourceFile: file.name,
  }
}

/**
 * Generate Excel output file
 */
async function generateExcel(data: BatchData[]): Promise<Blob> {
  const XLSX = await getXLSX()

  // Check if any row has SCI data
  const hasSCI = data.some(row => row.sciAvg !== null && row.sciAvg > 0)

  // Build headers
  const headers = [
    "Lote (Batch)",
    "Peso Total (kg)",
    "Qtd Fardos",
    "Mic (min)",
    "Mic (média)",
    "Mic (max)",
    "UHM (min)",
    "UHM (média)",
    "UHM (max)",
    "Str (min)",
    "Str (média)",
    "Str (max)",
  ]

  if (hasSCI) {
    headers.push("SCI (média)")
  }

  headers.push("Arquivo Origem")

  // Build data rows
  const wsData = [
    headers,
    ...data.map((row) => {
      const rowData = [
        row.batchNumber,
        row.batchWeight,
        row.numberOfBales,
        row.micMin > 0 ? row.micMin.toFixed(2) : "N/A",
        row.micAvg > 0 ? row.micAvg.toFixed(2) : "N/A",
        row.micMax > 0 ? row.micMax.toFixed(2) : "N/A",
        row.uhmMin > 0 ? row.uhmMin.toFixed(3) : "N/A",
        row.uhmAvg > 0 ? row.uhmAvg.toFixed(3) : "N/A",
        row.uhmMax > 0 ? row.uhmMax.toFixed(3) : "N/A",
        row.strMin > 0 ? row.strMin.toFixed(1) : "N/A",
        row.strAvg > 0 ? row.strAvg.toFixed(1) : "N/A",
        row.strMax > 0 ? row.strMax.toFixed(1) : "N/A",
      ]

      if (hasSCI) {
        rowData.push(row.sciAvg !== null && row.sciAvg > 0 ? row.sciAvg.toFixed(1) : "N/A")
      }

      rowData.push(row.sourceFile)
      return rowData
    }),
  ]

  // Create workbook
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  const colWidths = [
    { wch: 15 }, // Lote
    { wch: 14 }, // Peso
    { wch: 12 }, // Fardos
    { wch: 10 }, // Mic min
    { wch: 12 }, // Mic avg
    { wch: 10 }, // Mic max
    { wch: 10 }, // UHM min
    { wch: 12 }, // UHM avg
    { wch: 10 }, // UHM max
    { wch: 10 }, // Str min
    { wch: 12 }, // Str avg
    { wch: 10 }, // Str max
  ]

  if (hasSCI) {
    colWidths.push({ wch: 12 })
  }

  colWidths.push({ wch: 35 }) // Source file

  ws["!cols"] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, "Resumo Lotes")

  // Generate file
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })
}
