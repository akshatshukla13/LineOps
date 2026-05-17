import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE_SIZE = [1190, 842] // A3 landscape
const MARGIN = 24
const HEADER_BAND_HEIGHT = 56
const FOOTER_HEIGHT = 22
const ROW_HEIGHT = 15
const HEADER_ROW_HEIGHT = 20
const FONT_SIZE = 6.5
const HEADER_FONT_SIZE = 7

const COLORS = {
  brand: rgb(0, 0.118, 0.251), // #001e40
  brandLight: rgb(0.227, 0.373, 0.58), // #3a5f94
  headerBg: rgb(0.89, 0.93, 0.98),
  headerText: rgb(0.1, 0.15, 0.25),
  border: rgb(0.75, 0.78, 0.82),
  borderDark: rgb(0.55, 0.58, 0.62),
  text: rgb(0.12, 0.14, 0.18),
  textMuted: rgb(0.4, 0.43, 0.48),
  rowAlt: rgb(0.97, 0.98, 0.99),
  white: rgb(1, 1, 1),
  accent: rgb(0.2, 0.45, 0.75),
}

const PDF_COLUMNS = [
  { key: 'sno', label: '#', width: 20, align: 'center' },
  { key: 'date', label: 'Date', width: 46, align: 'center' },
  { key: 'line', label: 'Line', width: 28, align: 'center' },
  { key: 'machine', label: 'Machine', width: 68, align: 'left' },
  { key: 'operator', label: 'Operator', width: 68, align: 'left' },
  { key: 'process', label: 'Process', width: 54, align: 'left' },
  { key: 'shift', label: 'Sh', width: 22, align: 'center' },
  { key: 'hours', label: 'Hr', width: 20, align: 'center' },
  { key: 'target', label: 'Tgt', width: 26, align: 'right' },
  ...Array.from({ length: 12 }, (_, i) => ({
    key: `h${i + 1}`,
    label: String(i + 1),
    width: 19,
    align: 'center',
    hour: true,
  })),
  { key: 'total', label: 'T', width: 22, align: 'right', bold: true },
  { key: 'rejected', label: 'Rej', width: 22, align: 'right' },
  { key: 'rework', label: 'Rwk', width: 22, align: 'right' },
  { key: 'downtime', label: 'DT', width: 24, align: 'right' },
  { key: 'reason', label: 'Reason', width: 44, align: 'left' },
  { key: 'efficiency', label: 'Eff%', width: 26, align: 'center' },
  { key: 'remarks', label: 'Remarks', width: 52, align: 'left' },
]

const truncate = (value, maxChars = 24) => {
  const text = String(value ?? '')
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}

const getCellValue = (row, column) => {
  if (column.hour) {
    const index = Number(column.key.slice(1)) - 1
    const value = row.hourlyInputs?.[index]
    return value === '' || value == null ? '—' : String(value)
  }
  const value = row[column.key]
  if (value === '' || value == null) return '—'
  return String(value)
}

const scaleColumnsToWidth = (columns, availableWidth) => {
  const total = columns.reduce((sum, col) => sum + col.width, 0)
  if (total <= availableWidth) return columns
  const scale = availableWidth / total
  return columns.map((col) => ({ ...col, width: Math.max(14, Math.floor(col.width * scale)) }))
}

const drawTextInCell = (page, text, x, y, width, height, font, options = {}) => {
  const { align = 'left', size = FONT_SIZE, color = COLORS.text, bold = false } = options
  const display = truncate(text, Math.max(4, Math.floor(width / (size * 0.45))))
  const textWidth = font.widthOfTextAtSize(display, size)
  let textX = x + 3
  if (align === 'center') textX = x + (width - textWidth) / 2
  if (align === 'right') textX = x + width - textWidth - 3
  const textY = y - height / 2 - size / 2 + 1
  page.drawText(display, { x: Math.max(x + 2, textX), y: textY, size, font, color })
}

const drawPageChrome = (page, fonts, meta, pageIndex, pageCount) => {
  const { width, height } = page.getSize()
  const { brandTitle, reportTitle, generatedAt, rowCount } = meta

  page.drawRectangle({
    x: MARGIN,
    y: height - MARGIN - HEADER_BAND_HEIGHT,
    width: width - MARGIN * 2,
    height: HEADER_BAND_HEIGHT,
    color: COLORS.brand,
  })

  page.drawText(brandTitle, {
    x: MARGIN + 14,
    y: height - MARGIN - 22,
    size: 13,
    font: fonts.bold,
    color: COLORS.white,
  })

  page.drawText(reportTitle, {
    x: MARGIN + 14,
    y: height - MARGIN - 38,
    size: 9,
    font: fonts.regular,
    color: rgb(0.85, 0.9, 0.95),
  })

  const metaRight = `Generated ${generatedAt}  •  ${rowCount} record${rowCount === 1 ? '' : 's'}`
  const metaWidth = fonts.regular.widthOfTextAtSize(metaRight, 8)
  page.drawText(metaRight, {
    x: width - MARGIN - 14 - metaWidth,
    y: height - MARGIN - 30,
    size: 8,
    font: fonts.regular,
    color: rgb(0.8, 0.86, 0.92),
  })

  const footer = `Page ${pageIndex} of ${pageCount}`
  const footerWidth = fonts.regular.widthOfTextAtSize(footer, 8)
  page.drawText(footer, {
    x: (width - footerWidth) / 2,
    y: MARGIN - 6,
    size: 8,
    font: fonts.regular,
    color: COLORS.textMuted,
  })

  page.drawLine({
    start: { x: MARGIN, y: MARGIN + FOOTER_HEIGHT },
    end: { x: width - MARGIN, y: MARGIN + FOOTER_HEIGHT },
    thickness: 0.5,
    color: COLORS.border,
  })
}

const drawTableHeader = (page, fonts, columns, startX, topY) => {
  let x = startX
  columns.forEach((column) => {
    page.drawRectangle({
      x,
      y: topY - HEADER_ROW_HEIGHT,
      width: column.width,
      height: HEADER_ROW_HEIGHT,
      color: COLORS.headerBg,
      borderColor: COLORS.borderDark,
      borderWidth: 0.5,
    })
    drawTextInCell(page, column.label, x, topY, column.width, HEADER_ROW_HEIGHT, fonts.bold, {
      align: 'center',
      size: HEADER_FONT_SIZE,
      color: COLORS.headerText,
      bold: true,
    })
    x += column.width
  })
}

const drawTableRow = (page, fonts, columns, row, startX, topY, rowIndex) => {
  let x = startX
  const fill = rowIndex % 2 === 1 ? COLORS.rowAlt : COLORS.white

  columns.forEach((column) => {
    page.drawRectangle({
      x,
      y: topY - ROW_HEIGHT,
      width: column.width,
      height: ROW_HEIGHT,
      color: fill,
      borderColor: COLORS.border,
      borderWidth: 0.35,
    })

    const cellFont = column.bold ? fonts.bold : fonts.regular
    drawTextInCell(page, getCellValue(row, column), x, topY, column.width, ROW_HEIGHT, cellFont, {
      align: column.align,
      bold: column.bold,
    })
    x += column.width
  })
}

/**
 * Export monitoring spreadsheet rows to a formatted multi-page PDF.
 */
export async function exportMonitoringPdf({ rows, reportTitle, brandTitle }) {
  if (!rows?.length) {
    throw new Error('No data to export.')
  }

  const pdfDoc = await PDFDocument.create()
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  }

  const [pageWidth, pageHeight] = PAGE_SIZE
  const tableWidth = pageWidth - MARGIN * 2
  const columns = scaleColumnsToWidth(PDF_COLUMNS, tableWidth)
  const tableStartX = MARGIN + (tableWidth - columns.reduce((s, c) => s + c.width, 0)) / 2

  const contentTop = pageHeight - MARGIN - HEADER_BAND_HEIGHT - 10
  const contentBottom = MARGIN + FOOTER_HEIGHT + 8
  const rowsPerPage = Math.floor((contentTop - contentBottom - HEADER_ROW_HEIGHT) / ROW_HEIGHT)

  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  const generatedAt = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const meta = {
    brandTitle: brandTitle || 'Manufacturing Data Software',
    reportTitle: reportTitle || 'Production Monitoring Report',
    generatedAt,
    rowCount: rows.length,
  }

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdfDoc.addPage(PAGE_SIZE)
    drawPageChrome(page, fonts, meta, pageIndex + 1, pageCount)

    let tableTop = contentTop
    drawTableHeader(page, fonts, columns, tableStartX, tableTop)
    tableTop -= HEADER_ROW_HEIGHT

    const slice = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)
    slice.forEach((row, index) => {
      drawTableRow(page, fonts, columns, row, tableStartX, tableTop, pageIndex * rowsPerPage + index)
      tableTop -= ROW_HEIGHT
    })

    if (pageIndex === 0 && rows.length > 0) {
      const summary = `Showing production monitoring data — ${rows.length} row${rows.length === 1 ? '' : 's'} total`
      page.drawText(summary, {
        x: MARGIN,
        y: contentBottom - 2,
        size: 7.5,
        font: fonts.regular,
        color: COLORS.textMuted,
      })
    }
  }

  const bytes = await pdfDoc.save()
  return bytes
}

export async function downloadMonitoringPdf(options) {
  const bytes = await exportMonitoringPdf(options)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dewas-hydroquip-report-${Date.now()}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
