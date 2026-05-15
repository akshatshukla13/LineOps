import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import ExcelJS from 'exceljs'

const TOKEN_KEY = 'lineops_token'
const USER_KEY = 'lineops_user'
const THEME_KEY = 'lineops_theme'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is required in production builds')
}

const masterKinds = [
  'shift',
  'line',
  'machine',
  'process',
  'operator',
  'defectType',
]

const masterTypeConfig = {
  shift: {
    label: 'Shift',
    fields: ['name'],
    displayFields: { name: 'Shift Name' },
    tableColumns: ['name', 'active'],
    columnLabels: { name: 'Shift Name', active: 'Status' },
    parent: null,
    description: 'Work shifts (Morning, Evening, Night)',
    color: 'blue',
    icon: '🕐',
  },
  line: {
    label: 'Production Line',
    fields: ['name', 'code'],
    displayFields: { name: 'Line Name', code: 'Line Code' },
    tableColumns: ['name', 'code', 'active'],
    columnLabels: { name: 'Line', code: 'Code', active: 'Status' },
    parent: null,
    description: 'Production lines (Line 1–5 and Line F)',
    color: 'purple',
    icon: '🏭',
  },
  machine: {
    label: 'Machine',
    fields: ['name', 'code', 'lineId'],
    displayFields: { name: 'Machine Name', code: 'Machine Code', lineId: 'Production Line' },
    tableColumns: ['name', 'code', 'lineId', 'active'],
    columnLabels: { name: 'Machine', code: 'Code', lineId: 'Line', active: 'Status' },
    parent: 'line',
    description: 'Machines on production lines',
    color: 'orange',
    icon: '⚙️',
  },
  process: {
    label: 'Process',
    fields: ['name', 'code', 'machineId'],
    displayFields: { name: 'Process Name', code: 'Process Code', machineId: 'Machine' },
    tableColumns: ['name', 'code', 'machineId', 'active'],
    columnLabels: { name: 'Process', code: 'Code', machineId: 'Machine', active: 'Status' },
    parent: 'machine',
    description: 'Manufacturing processes per machine',
    color: 'pink',
    icon: '⚡',
  },
  operator: {
    label: 'Operator',
    fields: ['name', 'code'],
    displayFields: { name: 'Operator Name', code: 'Employee ID' },
    tableColumns: ['name', 'code', 'active'],
    columnLabels: { name: 'Name', code: 'Employee ID', active: 'Status' },
    parent: null,
    description: 'Factory operators',
    color: 'cyan',
    icon: '👤',
  },
  defectType: {
    label: 'Defect Type',
    fields: ['name', 'code'],
    displayFields: { name: 'Defect Type Name', code: 'Type Code' },
    tableColumns: ['name', 'code', 'active'],
    columnLabels: { name: 'Type', code: 'Code', active: 'Status' },
    parent: null,
    description: 'Types of product defects (Critical, Major, Minor)',
    color: 'red',
    icon: '❌',
  },
}

const monitoringHourCount = 12
const monitoringColumns = [
  { key: 'sno', label: 'S.No.', width: 6, vertical: true },
  { key: 'line', label: 'Line No.', width: 8, vertical: true },
  { key: 'machine', label: 'Machine', width: 22 },
  { key: 'operator', label: 'Operator Name', width: 24 },
  { key: 'process', label: 'Process Name', width: 16 },
  { key: 'shift', label: 'Shift', width: 6, vertical: true },
  { key: 'hours', label: 'Hours', width: 6, vertical: true },
  { key: 'target', label: 'Target Quantity', width: 10, vertical: true },
  ...Array.from({ length: monitoringHourCount }, (_, index) => ({
    key: `h${index + 1}`,
    label: String(index + 1),
    width: 7,
  })),
  { key: 'total', label: 'T', width: 7 },
  { key: 'rejected', label: 'Rejected', width: 7, vertical: true },
  { key: 'rework', label: 'Rework', width: 7, vertical: true },
  { key: 'downtime', label: 'Downtime (min)', width: 8, vertical: true },
  { key: 'reason', label: 'Reason', width: 12, vertical: true },
  { key: 'efficiency', label: 'Efficiency (%)', width: 10, vertical: true },
  { key: 'remarks', label: 'Remarks', width: 16, vertical: true },
]

const formatDisplayDate = (value) => {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

const getMasterLabel = (value, fallback = '-') => value?.name || value?.code || fallback

const getShiftCode = (value) => {
  const label = getMasterLabel(value, '')
  const compact = label.replace(/^shift\s+/i, '').trim()
  return compact ? compact.charAt(0).toUpperCase() : '-'
}

const toMonitoringRow = (row, index) => {
  const hourlyInputs = [...(row.hourlyInputs || []), ...Array(monitoringHourCount).fill('')].slice(0, monitoringHourCount)
  const total = row.totalProduction ?? hourlyInputs.reduce((sum, value) => sum + Number(value || 0), 0)
  return {
    sno: index + 1,
    date: formatDisplayDate(row.date),
    line: row.sheetLineNo || row.lineId?.code || row.lineId?.name?.replace(/\D+/g, '') || getMasterLabel(row.lineId, '-'),
    machine: getMasterLabel(row.machineId),
    operator: getMasterLabel(row.operatorId),
    process: getMasterLabel(row.processId),
    shift: row.sheetShift ?? getShiftCode(row.shiftId),
    hours: row.scheduledHours ?? 8,
    target: row.plannedQty ?? 0,
    hourlyInputs,
    total,
    rejected: row.rejectQty || '',
    rework: row.reworkQty || '',
    downtime: row.downtimeMinutes || '',
    reason: row.downtimeOtherText || '',
    efficiency: `${Math.round(Number(row.efficiencyPct || 0))}%`,
    remarks: row.remarks || '',
  }
}

const isMonitoringDisplayRow = (row) =>
  Array.isArray(row?.hourlyInputs) &&
  Object.prototype.hasOwnProperty.call(row, 'line') &&
  Object.prototype.hasOwnProperty.call(row, 'machine') &&
  Object.prototype.hasOwnProperty.call(row, 'operator')

const normalizeMonitoringRow = (row, index) => (isMonitoringDisplayRow(row) ? { ...row, sno: row.sno ?? index + 1 } : toMonitoringRow(row, index))

const getLoadingMessage = (path, method = 'GET') => {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  if (path.includes('/api/auth/login')) return 'Signing in...'
  if (normalizedMethod === 'GET') return 'Loading data...'
  return 'Saving changes...'
}

const UNSPECIFIED_TOKEN = '__UNSPECIFIED__'

const resolveMasterId = (value) => {
  if (value == null || value === '') return ''
  if (typeof value === 'object' && value._id) return String(value._id)
  return String(value)
}

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

const userSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  username: z.string().min(3, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  role: z.enum(['admin', 'supervisor', 'operator']),
  status: z.enum(['active', 'inactive']),
})

const entrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  shiftId: z.string().min(1, 'Shift is required'),
  lineId: z.string().min(1, 'Line is required'),
  machineId: z.string().min(1, 'Machine is required'),
  processId: z.string().min(1, 'Process is required'),
  operatorId: z.string().min(1, 'Operator is required'),
  plannedQty: z.coerce.number().min(0, 'Target quantity must be 0 or more'),
  rejectQty: z.coerce.number().min(0),
  reworkQty: z.coerce.number().min(0),
  downtimeMinutes: z.coerce.number().min(0),
  remarks: z.string().optional(),
  downtimeOtherText: z.string().optional(),
})

const emptyEntry = () => ({
  date: new Date().toISOString().slice(0, 10),
  shiftId: '',
  lineId: '',
  machineId: '',
  processId: '',
  operatorId: '',
  plannedQty: 0,
  hourlyInputs: Array(12).fill(0),
  rejectQty: 0,
  reworkQty: 0,
  downtimeMinutes: 0,
  downtimeOtherText: '',
  remarks: '',
  status: 'draft',
})

const entryToDraft = (entry) => ({
  ...emptyEntry(),
  date: entry.date || emptyEntry().date,
  shiftId: resolveMasterId(entry.shiftId),
  lineId: resolveMasterId(entry.lineId),
  machineId: resolveMasterId(entry.machineId),
  processId: resolveMasterId(entry.processId),
  operatorId: resolveMasterId(entry.operatorId),
  plannedQty: entry.plannedQty ?? 0,
  hourlyInputs: [...(entry.hourlyInputs || []), ...Array(12).fill(0)].slice(0, 12).map((value) => Number(value || 0)),
  rejectQty: entry.rejectQty ?? 0,
  reworkQty: entry.reworkQty ?? 0,
  downtimeMinutes: entry.downtimeMinutes ?? 0,
  downtimeOtherText: entry.downtimeOtherText || '',
  remarks: entry.remarks || '',
  status: entry.status || 'submitted',
})

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState('')
  const [masters, setMasters] = useState({})
  const [users, setUsers] = useState([])
  const [entries, setEntries] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [entryDraft, setEntryDraft] = useState(emptyEntry)
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [reportFilters, setReportFilters] = useState({
    dateMode: 'all',
    from: '',
    to: '',
    lineId: '',
    machineId: '',
    processId: '',
    shiftId: '',
    operatorName: '',
  })
  const [reportSpreadsheetRows, setReportSpreadsheetRows] = useState([])
  const [reportHasRun, setReportHasRun] = useState(false)
  const [missedEntries, setMissedEntries] = useState([])
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [requestCount, setRequestCount] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [masterForm, setMasterForm] = useState({
    kind: 'line',
    name: '',
    code: '',
    active: true,
    lineId: '',
    machineId: '',
  })
  const [masterSearch, setMasterSearch] = useState('')
  const loadingResetRef = useRef(null)

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  const addUserForm = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: {
      fullName: '',
      employeeId: '',
      username: '',
      password: '',
      role: 'operator',
      status: 'active',
    },
  })


  const isLoading = requestCount > 0

  useEffect(() => {
    if (requestCount > 0) {
      if (loadingResetRef.current) {
        window.clearTimeout(loadingResetRef.current)
        loadingResetRef.current = null
      }
      return undefined
    }

    loadingResetRef.current = window.setTimeout(() => setLoadingMessage(''), 150)
    return () => {
      if (loadingResetRef.current) {
        window.clearTimeout(loadingResetRef.current)
        loadingResetRef.current = null
      }
    }
  }, [requestCount])

  const beginRequest = useCallback((message) => {
    setRequestCount((count) => count + 1)
    setLoadingMessage((current) => current || message)
  }, [])

  const endRequest = useCallback(() => {
    setRequestCount((count) => Math.max(0, count - 1))
  }, [])

  const authFetch = useCallback(async (path, options = {}) => {
    const method = options.method || 'GET'
    beginRequest(getLoadingMessage(path, method))

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      if (response.status === 204) {
        return null
      }

      return response.json()
    } finally {
      endRequest()
    }
  }, [beginRequest, endRequest, token])

  const optionsByKind = (kind) => (masters[kind] || []).filter((item) => item.active !== false)

  const masterNameById = (kind, id) => {
    if (!id) return '-'
    const match = optionsByKind(kind).find((item) => String(item._id) === String(id))
    return match?.name || '-'
  }

  const getParentName = (parentKind, parentId) => {
    if (!parentId || !parentKind) return '-'
    const parent = (masters[parentKind] || []).find((item) => item._id === parentId)
    return parent ? `${parent.name} (${parent.code || 'N/A'})` : '-'
  }

  const selectedMasterRows = optionsByKind(masterForm.kind)

  const filteredMasterRows = useMemo(() => {
    if (!masterSearch.trim()) return selectedMasterRows
    const search = masterSearch.toLowerCase()
    return selectedMasterRows.filter((item) =>
      (item.name?.toLowerCase().includes(search) ||
      item.code?.toLowerCase().includes(search))
    )
  }, [selectedMasterRows, masterSearch])

  const filteredMachines = useMemo(() => {
    const machines = masters.machine || []
    if (!entryDraft.lineId) return machines
    return machines.filter((item) => item.lineId === entryDraft.lineId)
  }, [entryDraft.lineId, masters.machine])

  const filteredProcesses = useMemo(() => {
    const processes = masters.process || []
    if (!entryDraft.machineId) return processes
    return processes.filter((item) => item.machineId === entryDraft.machineId)
  }, [entryDraft.machineId, masters.process])

  const filteredReportMachines = useMemo(() => {
    const machines = (masters.machine || []).filter((item) => item.active !== false)
    if (!reportFilters.lineId) return machines
    return machines.filter((item) => String(item.lineId) === String(reportFilters.lineId))
  }, [reportFilters.lineId, masters.machine])

  const filteredReportProcesses = useMemo(() => {
    const processes = (masters.process || []).filter((item) => item.active !== false)
    if (!reportFilters.machineId) return processes
    return processes.filter((item) => String(item.machineId) === String(reportFilters.machineId))
  }, [reportFilters.machineId, masters.process])

  const calculated = useMemo(() => {
    const totalProduction = entryDraft.hourlyInputs.reduce((sum, value) => sum + Number(value || 0), 0)
    const netProduction = Math.max(totalProduction - Number(entryDraft.rejectQty || 0) - Number(entryDraft.reworkQty || 0), 0)
    const planned = Number(entryDraft.plannedQty || 0)
    const efficiencyPct = planned > 0 ? (netProduction / planned) * 100 : 0
    const lossPct = planned > 0 ? ((planned - netProduction) / planned) * 100 : 0
    const downtimePct = (Number(entryDraft.downtimeMinutes || 0) / 720) * 100
    return {
      totalProduction,
      netProduction,
      efficiencyPct: Number(efficiencyPct.toFixed(2)),
      lossPct: Number(lossPct.toFixed(2)),
      downtimePct: Number(downtimePct.toFixed(2)),
    }
  }, [entryDraft])

  const efficiencyClass = useMemo(() => {
    if (calculated.efficiencyPct >= 90) return 'text-emerald-600'
    if (calculated.efficiencyPct >= 70) return 'text-yellow-500'
    return 'text-rose-600'
  }, [calculated.efficiencyPct])

  const monitoringRows = useMemo(
    () => reportSpreadsheetRows.map((row, index) => normalizeMonitoringRow(row, index)),
    [reportSpreadsheetRows],
  )

  const reportSheetTitle = useMemo(() => {
    if (reportFilters.dateMode === 'all') return 'Production Database — All Dates'
    if (reportFilters.from && reportFilters.to) {
      return `Production Database — ${formatDisplayDate(reportFilters.from)} to ${formatDisplayDate(reportFilters.to)}`
    }
    if (reportFilters.from) return `Production Database — From ${formatDisplayDate(reportFilters.from)}`
    if (reportFilters.to) return `Production Database — Until ${formatDisplayDate(reportFilters.to)}`
    return 'Production Database — Date Range'
  }, [reportFilters.dateMode, reportFilters.from, reportFilters.to])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const loadMasters = async () => {
    const responses = await Promise.all(masterKinds.map((kind) => authFetch(`/api/master/${kind}`)))
    const merged = {}
    masterKinds.forEach((kind, index) => {
      merged[kind] = responses[index]
    })
    setMasters(merged)
  }

  const loadEntries = async () => {
    const data = await authFetch('/api/entries')
    setEntries(data)
  }

  const loadUsers = async () => {
    if (user?.role !== 'admin') return
    const data = await authFetch('/api/users')
    setUsers(data)
  }

  const loadAuditLogs = async () => {
    if (!['admin', 'supervisor'].includes(user?.role || '')) return
    const data = await authFetch('/api/audit-logs')
    setAuditLogs(data)
  }

  const loadMissedEntries = async () => {
    if (!['admin', 'supervisor'].includes(user?.role || '')) return
    const data = await authFetch('/api/notifications/missed-entries')
    setMissedEntries(data.missed || [])
  }

  const bootstrap = async () => {
    try {
      setErrorText('')
      await Promise.all([loadMasters(), loadEntries(), loadUsers(), loadAuditLogs(), loadMissedEntries()])
    } catch (error) {
      setErrorText(error.message)
    }
  }

  useEffect(() => {
    if (!token || !user) return
    bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role])

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUser(null)
    setActiveTab('dashboard')
    setEntries([])
    setDbSheetData([])
    setUsers([])
    setMasters({})
    setAuditLogs([])
    setMissedEntries([])
  }

  const handleLogin = loginForm.handleSubmit(async (values) => {
    setErrorText('')
    setStatusText('Signing in...')
    try {
      beginRequest('Signing in...')
      const data = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }).then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload.error || 'Login failed')
        }
        return res.json()
      })

      setToken(data.token)
      setUser(data.user)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setStatusText('Signed in.')
    } catch (error) {
      setErrorText(error.message)
      setStatusText('')
    } finally {
      endRequest()
    }
  })

  const setDraftField = (key, value) => {
    setEntryDraft((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'lineId') {
        next.machineId = ''
        next.processId = ''
      }
      if (key === 'machineId') {
        next.processId = ''
      }
      return next
    })
  }

  const setHourlyValue = (index, value) => {
    const numeric = Number.isNaN(Number(value)) ? 0 : Number(value)
    setEntryDraft((prev) => {
      const next = [...prev.hourlyInputs]
      next[index] = numeric
      return { ...prev, hourlyInputs: next }
    })
  }

  const loadEntryForEdit = (entry) => {
    if (entry.status === 'locked') {
      setErrorText('Locked entries cannot be edited.')
      return
    }
    setErrorText('')
    setEditingEntryId(entry._id)
    setEntryDraft(entryToDraft(entry))
    setStatusText('Entry loaded for editing. Update fields and click Save.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveEntry = async () => {
    setErrorText('')
    try {
      const normalized = {
        ...entryDraft,
        shiftId: resolveMasterId(entryDraft.shiftId),
        lineId: resolveMasterId(entryDraft.lineId),
        machineId: resolveMasterId(entryDraft.machineId),
        processId: resolveMasterId(entryDraft.processId),
        operatorId: resolveMasterId(entryDraft.operatorId),
      }
      const parsed = entrySchema.parse(normalized)
      setIsSavingEntry(true)
      setStatusText(editingEntryId ? 'Updating...' : 'Saving...')
      const payload = {
        ...normalized,
        ...parsed,
        departmentId: null,
        productId: null,
        downtimeReasonId: null,
        status: 'submitted',
      }

      if (editingEntryId) {
        await authFetch(`/api/entries/${editingEntryId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setStatusText('Entry updated.')
      } else {
        await authFetch('/api/entries', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setStatusText('Entry saved.')
      }

      setEditingEntryId(null)
      setEntryDraft(emptyEntry())
      await loadEntries()
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? error.issues[0]?.message
          : error.message || 'Could not save entry.'
      setErrorText(message)
      setStatusText('')
    } finally {
      setIsSavingEntry(false)
    }
  }

  const runReport = async () => {
    setErrorText('')
    const query = new URLSearchParams()
    query.set('type', 'monitoring')
    query.set('dateMode', reportFilters.dateMode)

    if (reportFilters.dateMode === 'range') {
      if (reportFilters.from) query.set('from', reportFilters.from)
      if (reportFilters.to) query.set('to', reportFilters.to)
    }

    if (reportFilters.lineId) query.set('lineId', reportFilters.lineId)
    if (reportFilters.machineId) query.set('machineId', reportFilters.machineId)
    if (reportFilters.processId) query.set('processId', reportFilters.processId)
    if (reportFilters.shiftId) query.set('shiftId', reportFilters.shiftId)
    if (reportFilters.operatorName.trim()) query.set('operatorName', reportFilters.operatorName.trim())

    try {
      const data = await authFetch(`/api/reports?${query.toString()}`)
      setReportSpreadsheetRows(data.spreadsheetRows || [])
      setReportHasRun(true)
      setStatusText(`Loaded ${data.totalRows ?? 0} entries.`)
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const exportReportExcel = async () => {
    if (!monitoringRows.length) return

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Production Database')
    const firstHourColumn = 10
    const totalColumn = firstHourColumn + monitoringHourCount

    worksheet.columns = [
      { key: 'sno', width: 6 },
      { key: 'date', width: 12 },
      ...monitoringColumns.slice(1).map((column) => ({ key: column.key, width: column.width })),
    ]
    worksheet.mergeCells(1, firstHourColumn, 1, totalColumn)
    worksheet.getCell(1, firstHourColumn).value = reportSheetTitle

    const headerLabels = ['S.No.', 'Date', ...monitoringColumns.slice(1).map((column) => column.label)]
    headerLabels.forEach((label, index) => {
      const columnNumber = index + 1
      const isActualColumn = columnNumber >= firstHourColumn && columnNumber <= totalColumn
      const cell = worksheet.getCell(isActualColumn ? 2 : 1, columnNumber)
      cell.value = label
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        textRotation: index > 0 && monitoringColumns[index - 1]?.vertical ? 90 : 0,
        wrapText: true,
      }
      if (!isActualColumn) {
        worksheet.mergeCells(1, columnNumber, 2, columnNumber)
      }
    })

    monitoringRows.forEach((row) => {
      worksheet.addRow([
        row.sno,
        row.date,
        row.line,
        row.machine,
        row.operator,
        row.process,
        row.shift,
        row.hours,
        row.target,
        ...row.hourlyInputs.map((value) => value || ''),
        row.total,
        row.rejected,
        row.rework,
        row.downtime,
        row.reason,
        row.efficiency,
        row.remarks,
      ])
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lineops-production-database-${Date.now()}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportReportPdf = async () => {
    const pdfDoc = await PDFDocument.create()
    let page = pdfDoc.addPage([842, 595])
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
    page.drawText('Production Monitoring Report', {
      x: 30,
      y: 560,
      size: 18,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    page.drawText(`${reportSheetTitle} | Generated: ${new Date().toLocaleDateString()}`, {
      x: 30,
      y: 540,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })

    let y = 520
    const lineHeight = 14
    const marginBottom = 20

    monitoringRows.slice(0, 40).forEach((row) => {
      if (y < marginBottom) {
        page = pdfDoc.addPage([842, 595])
        y = 570
      }

      page.drawText(
        `${row.date} | ${row.line} | ${row.machine} | ${row.operator} | Tgt: ${row.target} | Prod: ${row.total} | Eff: ${row.efficiency}`,
        {
          x: 30,
          y,
          size: 9,
          font,
          color: rgb(0.2, 0.2, 0.2),
        },
      )
      y -= lineHeight
    })

    const bytes = await pdfDoc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lineops-report-${Date.now()}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  }

  const addUser = addUserForm.handleSubmit(async (values) => {
    try {
      const payload = { ...values }
      await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      addUserForm.reset({
        fullName: '',
        employeeId: '',
        username: '',
        password: '',
        role: 'operator',
        status: 'active',
      })
      await loadUsers()
      setStatusText('User created.')
    } catch (error) {
      setErrorText(error.message)
    }
  })

  const updateUserStatus = async (id, status) => {
    try {
      await authFetch(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      await loadUsers()
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const resetPassword = async (id) => {
    const password = window.prompt('Enter new password (min 6 chars):')
    if (!password) return

    try {
      await authFetch(`/api/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      setStatusText('Password reset complete.')
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const saveMasterItem = async () => {
    if (!masterForm.name.trim()) {
      setErrorText('Master item name is required.')
      return
    }

    try {
      await authFetch(`/api/master/${masterForm.kind}`, {
        method: 'POST',
        body: JSON.stringify({
          name: masterForm.name.trim(),
          code: masterForm.code.trim(),
          active: masterForm.active,
          lineId: masterForm.lineId || null,
          machineId: masterForm.machineId || null,
        }),
      })
      setMasterForm((prev) => ({ ...prev, name: '', code: '' }))
      await loadMasters()
      setStatusText('Master item saved.')
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const toggleMasterActive = async (kind, item) => {
    try {
      await authFetch(`/api/master/${kind}/${item._id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !item.active }),
      })
      await loadMasters()
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const deleteMasterItem = async (kind, id) => {
    try {
      await authFetch(`/api/master/${kind}/${id}`, { method: 'DELETE' })
      await loadMasters()
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const importMasterExcel = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const workbook = new ExcelJS.Workbook()
      const buffer = await file.arrayBuffer()
      await workbook.xlsx.load(buffer)
      const ws = workbook.worksheets[0]
      const rows = []

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        const kind = String(row.getCell(1).value || '').trim()
        const name = String(row.getCell(2).value || '').trim()
        const code = String(row.getCell(3).value || '').trim()
        const active = String(row.getCell(4).value || 'true').toLowerCase() !== 'false'
        if (kind && name) {
          rows.push({ kind, name, code, active })
        }
      })

      if (!rows.length) {
        throw new Error('No rows found in selected Excel file.')
      }

      await authFetch('/api/master/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      })
      await loadMasters()
      setStatusText(`Imported ${rows.length} master rows.`)
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const changeReportFilter = (key, value) => {
    setReportFilters((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'dateMode' && value === 'all') {
        next.from = ''
        next.to = ''
      }
      if (key === 'lineId') {
        next.machineId = ''
        next.processId = ''
      }
      if (key === 'machineId') {
        next.processId = ''
      }
      return next
    })
  }

  useEffect(() => {
    if (!token || !user || activeTab !== 'reports') return
    runReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, user?.role])

  const canUseAdmin = user?.role === 'admin'
  const canUseSupervisorViews = ['admin', 'supervisor'].includes(user?.role || '')
  const loadingBar = isLoading ? (
    <div className="pointer-events-none fixed inset-x-0 top-0" style={{ zIndex: 60 }}>
      <div className="loading-rail h-1 overflow-hidden bg-slate-200/90 dark:bg-slate-800/90">
        <div className="loading-rail__bar h-full w-full" />
      </div>
      <div className="flex justify-end px-4 pt-2 sm:px-6">
        <div className="loading-pill">{loadingMessage || 'Working...'}</div>
      </div>
    </div>
  ) : null

  if (!token || !user) {
    return (
      <>
        {loadingBar}
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-900">
          <div className="card w-full max-w-md space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Smart Production Monitoring System</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Sign in with your assigned credentials.</p>
            <form className="space-y-3" onSubmit={handleLogin}>
              <div>
                <label className="mb-1 block text-sm font-medium">Username</label>
                <input className="input" {...loginForm.register('username')} />
                {loginForm.formState.errors.username ? (
                  <p className="mt-1 text-xs text-rose-600">{loginForm.formState.errors.username.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Password</label>
                <input className="input" type="password" {...loginForm.register('password')} />
                {loginForm.formState.errors.password ? (
                  <p className="mt-1 text-xs text-rose-600">{loginForm.formState.errors.password.message}</p>
                ) : null}
              </div>
              <button className="btn-primary w-full" disabled={isLoading} type="submit">
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
            {statusText ? <p className="text-xs text-emerald-600">{statusText}</p> : null}
            {errorText ? <p className="text-xs text-rose-600">{errorText}</p> : null}
          </div>
        </div>
      </>
    )
  }

  const navigationTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'entry', label: 'Data Entry', icon: 'table_chart' },
    { id: 'reports', label: 'Reports', icon: 'insert_chart' },
    ...(canUseAdmin ? [
      { id: 'users', label: 'Users', icon: 'group' },
      { id: 'master', label: 'Admin Control', icon: 'settings' },
    ] : []),
    ...(canUseSupervisorViews ? [{ id: 'audit', label: 'Audit Logs', icon: 'history' }] : []),
  ]

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#191c1d] dark:bg-slate-950 dark:text-slate-100 md:flex">
      {loadingBar}
      <aside className="hidden w-72 shrink-0 border-r border-[#c3c6d1] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 md:flex md:min-h-screen md:flex-col">
        <div className="border-b border-[#c3c6d1] px-6 py-7 dark:border-slate-800">
          <div className="text-2xl font-black text-[#001e40] dark:text-blue-200">STITCH<span className="text-[#3a5f94]">OPS</span></div>
          <p className="mt-1 text-xs font-semibold uppercase text-[#43474f] dark:text-slate-400">Manufacturing Data Hub</p>
        </div>
        <nav className="flex flex-1 flex-col gap-2 p-4">
          {navigationTabs.map((tab) => (
            <button
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-[#d0e1fb] text-[#001e40]'
                  : 'text-[#43474f] hover:bg-[#f3f4f5] dark:text-slate-300 dark:hover:bg-slate-900'
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[#c3c6d1] p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#003366] text-sm font-bold text-white">
              {user.fullName?.slice(0, 2).toUpperCase() || 'OP'}
            </div>
            <div>
              <div className="text-sm font-bold">{user.fullName || user.username}</div>
              <div className="text-xs capitalize text-[#43474f] dark:text-slate-400">{user.role}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-muted flex-1" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} type="button">
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button className="btn-muted flex-1" onClick={handleLogout} type="button">Logout</button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-[#c3c6d1] bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black text-[#001e40] dark:text-blue-200">STITCHOPS</div>
            <button className="btn-muted" onClick={handleLogout} type="button">Logout</button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {navigationTabs.map((tab) => (
              <button
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === tab.id ? 'bg-[#d0e1fb] text-[#001e40]' : 'bg-[#f3f4f5] text-[#43474f]'}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

      <main className="grid min-w-0 w-full max-w-full gap-4 overflow-x-hidden p-4 md:p-8">
        {statusText ? <div className="card text-sm text-emerald-600">{statusText}</div> : null}
        {errorText ? <div className="card text-sm text-rose-600">{errorText}</div> : null}

        {activeTab === 'dashboard' ? (
          <section className="grid gap-4 md:grid-cols-3">
            <div className="card">
              <h2 className="text-sm font-semibold uppercase text-slate-500">Entries</h2>
              <p className="mt-2 text-3xl font-bold">{entries.length}</p>
              <p className="mt-1 text-xs text-slate-500">Total records visible to your role</p>
            </div>
            <div className="card">
              <h2 className="text-sm font-semibold uppercase text-slate-500">Masters</h2>
              <p className="mt-2 text-3xl font-bold">{masterKinds.reduce((sum, kind) => sum + (masters[kind]?.length || 0), 0)}</p>
              <p className="mt-1 text-xs text-slate-500">Dropdown options configured</p>
            </div>
            <div className="card">
              <h2 className="text-sm font-semibold uppercase text-slate-500">Users</h2>
              <p className="mt-2 text-3xl font-bold">{canUseAdmin ? users.length : 'Restricted'}</p>
              <p className="mt-1 text-xs text-slate-500">Role-based user count</p>
            </div>

            {canUseSupervisorViews ? (
              <div className="card md:col-span-3">
                <h2 className="text-base font-semibold">Missed Entry Notifications</h2>
                {missedEntries.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-600">No missed operator entries today.</p>
                ) : (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {missedEntries.map((item) => (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" key={item.id}>
                        {item.fullName} ({item.employeeId})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'entry' ? (
          <section className="grid min-w-0 gap-4">
            <div className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Daily Production Entry</h2>
                {editingEntryId ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    Editing saved entry — click Save to update
                  </span>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Date</label>
                  <input className="input" onChange={(e) => setDraftField('date', e.target.value)} type="date" value={entryDraft.date} />
                </div>
                <SelectField label="Shift" options={optionsByKind('shift')} onChange={(v) => setDraftField('shiftId', v)} value={entryDraft.shiftId} />
                <SelectField label="Line" options={optionsByKind('line')} onChange={(v) => setDraftField('lineId', v)} value={entryDraft.lineId} />
                <SelectField label="Machine" options={filteredMachines} onChange={(v) => setDraftField('machineId', v)} value={entryDraft.machineId} />
                <SelectField label="Process" options={filteredProcesses} onChange={(v) => setDraftField('processId', v)} value={entryDraft.processId} />
                <SelectField label="Operator" options={optionsByKind('operator')} onChange={(v) => setDraftField('operatorId', v)} value={entryDraft.operatorId} />
                <div>
                  <label className="mb-1 block text-xs font-semibold">Target Quantity</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    min="0"
                    onChange={(e) => setDraftField('plannedQty', Number(e.target.value || 0))}
                    type="number"
                    value={entryDraft.plannedQty}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Reject Qty</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    min="0"
                    onChange={(e) => setDraftField('rejectQty', Number(e.target.value || 0))}
                    type="number"
                    value={entryDraft.rejectQty}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Rework Qty</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    min="0"
                    onChange={(e) => setDraftField('reworkQty', Number(e.target.value || 0))}
                    type="number"
                    value={entryDraft.reworkQty}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Downtime Minutes</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    min="0"
                    onChange={(e) => setDraftField('downtimeMinutes', Number(e.target.value || 0))}
                    type="number"
                    value={entryDraft.downtimeMinutes}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Downtime Reason</label>
                  <input
                    className="input"
                    onChange={(e) => setDraftField('downtimeOtherText', e.target.value)}
                    placeholder="Enter downtime reason"
                    type="text"
                    value={entryDraft.downtimeOtherText}
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold">Remarks</label>
                <textarea className="textarea" onChange={(e) => setDraftField('remarks', e.target.value)} rows={2} value={entryDraft.remarks} />
              </div>

              <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-200 dark:bg-slate-800">
                    <tr>
                      {Array.from({ length: 12 }).map((_, index) => (
                        <th className="border-b border-slate-300 p-2 text-left font-semibold dark:border-slate-700" key={`hour-${index + 1}`}>
                          Hour {index + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {entryDraft.hourlyInputs.map((value, index) => (
                        <td className="border-b border-slate-200 p-1 dark:border-slate-700" key={`cell-${index}`}>
                          <input
                            className="input"
                            inputMode="numeric"
                            min="0"
                            onChange={(e) => setHourlyValue(index, e.target.value)}
                            type="number"
                            value={value}
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <MetricCard label="Total Production" value={calculated.totalProduction} />
                <MetricCard label="Net Production" value={calculated.netProduction} />
                <MetricCard className={efficiencyClass} label="Efficiency %" value={calculated.efficiencyPct} />
                <MetricCard label="Loss %" value={calculated.lossPct} />
                <MetricCard label="Downtime %" value={calculated.downtimePct} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={isSavingEntry} onClick={() => saveEntry()} type="button">
                  {isSavingEntry ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="mb-2 text-base font-semibold">Saved Entries</h2>
              <p className="mb-3 text-sm text-slate-500">
                Click Edit to load an entry into the form above, change values, then Save to update.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-200 dark:bg-slate-800">
                    <tr>
                      <HeaderCell text="Date" />
                      <HeaderCell text="Line" />
                      <HeaderCell text="Machine" />
                      <HeaderCell text="Process" />
                      <HeaderCell text="Operator" />
                      <HeaderCell text="Shift" />
                      <HeaderCell text="Target Quantity" />
                      <HeaderCell text="Total" />
                      <HeaderCell text="Efficiency" />
                      <HeaderCell text="Status" />
                      <HeaderCell text="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <BodyCell colSpan={11}>No entries saved yet.</BodyCell>
                      </tr>
                    ) : (
                      entries.map((row) => {
                        const isLocked = row.status === 'locked'
                        const isEditing = editingEntryId === row._id
                        const total = (row.hourlyInputs || []).reduce((sum, value) => sum + Number(value || 0), 0)
                        return (
                          <tr
                            className={`${isLocked ? 'bg-slate-100 dark:bg-slate-900' : ''} ${isEditing ? 'ring-2 ring-amber-400 ring-inset' : ''}`}
                            key={row._id}
                          >
                            <BodyCell>{row.date}</BodyCell>
                            <BodyCell>{masterNameById('line', resolveMasterId(row.lineId))}</BodyCell>
                            <BodyCell>{masterNameById('machine', resolveMasterId(row.machineId))}</BodyCell>
                            <BodyCell>{masterNameById('process', resolveMasterId(row.processId))}</BodyCell>
                            <BodyCell>{masterNameById('operator', resolveMasterId(row.operatorId))}</BodyCell>
                            <BodyCell>{masterNameById('shift', resolveMasterId(row.shiftId))}</BodyCell>
                            <BodyCell>{row.plannedQty}</BodyCell>
                            <BodyCell>{total}</BodyCell>
                            <BodyCell>
                              <span className={row.efficiencyPct >= 90 ? 'text-emerald-600' : row.efficiencyPct >= 70 ? 'text-yellow-500' : 'text-rose-600'}>
                                {Math.round(Number(row.efficiencyPct || 0))}%
                              </span>
                            </BodyCell>
                            <BodyCell>
                              <span className="inline-flex items-center gap-1 capitalize">
                                {row.status === 'locked' ? '🔒' : row.status === 'draft' ? '📝' : '✅'} {row.status}
                              </span>
                            </BodyCell>
                            <BodyCell>
                              <button
                                className="btn-muted"
                                disabled={isLocked}
                                onClick={() => loadEntryForEdit(row)}
                                type="button"
                              >
                                Edit
                              </button>
                            </BodyCell>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        ) : null}

        {activeTab === 'reports' ? (
          <section className="grid gap-4">
            <div className="card">
              <h2 className="mb-1 text-base font-semibold">Production Database Report</h2>
              <p className="mb-4 text-sm text-slate-500">
                Full database view in Excel-style layout. Use filters to narrow results, or leave blank for all records.
              </p>
              <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Date Range</label>
                  <select
                    className="select"
                    onChange={(e) => changeReportFilter('dateMode', e.target.value)}
                    value={reportFilters.dateMode}
                  >
                    <option value="all">All dates</option>
                    <option value="range">Custom range</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Start Date</label>
                  <input
                    className="input"
                    disabled={reportFilters.dateMode === 'all'}
                    onChange={(e) => changeReportFilter('from', e.target.value)}
                    type="date"
                    value={reportFilters.from}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">End Date</label>
                  <input
                    className="input"
                    disabled={reportFilters.dateMode === 'all'}
                    onChange={(e) => changeReportFilter('to', e.target.value)}
                    type="date"
                    value={reportFilters.to}
                  />
                </div>
                <SelectField
                  emptyLabel="All lines"
                  includeUnspecified={false}
                  label="Line No."
                  onChange={(v) => changeReportFilter('lineId', v)}
                  options={optionsByKind('line')}
                  value={reportFilters.lineId}
                />
                <SelectField
                  emptyLabel="All machines"
                  includeUnspecified={false}
                  label="Machine"
                  onChange={(v) => changeReportFilter('machineId', v)}
                  options={filteredReportMachines}
                  value={reportFilters.machineId}
                />
                <div>
                  <label className="mb-1 block text-xs font-semibold">Operator Name</label>
                  <input
                    className="input"
                    onChange={(e) => changeReportFilter('operatorName', e.target.value)}
                    placeholder="Search operator name"
                    type="text"
                    value={reportFilters.operatorName}
                  />
                </div>
                <SelectField
                  emptyLabel="All processes"
                  includeUnspecified={false}
                  label="Process Name"
                  onChange={(v) => changeReportFilter('processId', v)}
                  options={filteredReportProcesses}
                  value={reportFilters.processId}
                />
                <SelectField
                  emptyLabel="All shifts"
                  includeUnspecified={false}
                  label="Shift"
                  onChange={(v) => changeReportFilter('shiftId', v)}
                  options={optionsByKind('shift')}
                  value={reportFilters.shiftId}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={runReport} type="button">
                  Apply Filters
                </button>
                <button className="btn-muted" disabled={!monitoringRows.length} onClick={exportReportExcel} type="button">
                  Export Excel
                </button>
                <button className="btn-muted" disabled={!monitoringRows.length} onClick={exportReportPdf} type="button">
                  Export PDF
                </button>
              </div>
            </div>

            <div className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  Database View — {monitoringRows.length} {monitoringRows.length === 1 ? 'row' : 'rows'}
                </h3>
                <span className="text-xs text-slate-500">{reportSheetTitle}</span>
              </div>
              {reportHasRun && monitoringRows.length > 0 ? (
                <ExcelSheet includeDate rows={monitoringRows} title={reportSheetTitle} />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  {reportHasRun
                    ? 'No entries match the selected filters.'
                    : 'Loading production database...'}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'users' && canUseAdmin ? (
          <section className="grid gap-4">
            <div className="card">
              <h2 className="mb-3 text-base font-semibold">User Management</h2>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={addUser}>
                <TextInput label="Full Name" register={addUserForm.register('fullName')} />
                <TextInput label="Employee ID" register={addUserForm.register('employeeId')} />
                <TextInput label="Username" register={addUserForm.register('username')} />
                <TextInput label="Password" register={addUserForm.register('password')} type="password" />
                <div>
                  <label className="mb-1 block text-xs font-semibold">Role</label>
                  <select className="select" {...addUserForm.register('role')}>
                    <option value="admin">Admin</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="operator">Operator</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Status</label>
                  <select className="select" {...addUserForm.register('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <button className="btn-primary" type="submit">Create User</button>
                </div>
              </form>
            </div>

            <div className="card overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-200 dark:bg-slate-800">
                    <HeaderCell text="Full Name" />
                    <HeaderCell text="Employee ID" />
                    <HeaderCell text="Username" />
                    <HeaderCell text="Role" />
                    <HeaderCell text="Status" />
                    <HeaderCell text="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id}>
                      <BodyCell>{row.fullName}</BodyCell>
                      <BodyCell>{row.employeeId}</BodyCell>
                      <BodyCell>{row.username}</BodyCell>
                      <BodyCell>{row.role}</BodyCell>
                      <BodyCell>{row.status}</BodyCell>
                      <BodyCell>
                        <div className="flex flex-wrap gap-1">
                          <button
                            className="btn-muted"
                            onClick={() => updateUserStatus(row.id, row.status === 'active' ? 'inactive' : 'active')}
                            type="button"
                          >
                            {row.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                          <button className="btn-muted" onClick={() => resetPassword(row.id)} type="button">Reset Password</button>
                        </div>
                      </BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === 'master' && canUseAdmin ? (
          <section className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
              {masterKinds.map((kind) => (
                <button
                  className={`card cursor-pointer text-center transition-all ${
                    masterForm.kind === kind
                      ? 'ring-2 ring-blue-500'
                      : 'hover:shadow-md'
                  }`}
                  key={kind}
                  onClick={() => setMasterForm((prev) => ({ ...prev, kind, name: '', code: '', lineId: '', machineId: '' })) && setMasterSearch('')}
                  type="button"
                >
                  <div className={`mb-2 inline-block rounded-full p-2 text-white text-lg ${
                    masterTypeConfig[kind]?.color === 'blue' ? 'bg-blue-500' :
                    masterTypeConfig[kind]?.color === 'green' ? 'bg-green-500' :
                    masterTypeConfig[kind]?.color === 'purple' ? 'bg-purple-500' :
                    masterTypeConfig[kind]?.color === 'orange' ? 'bg-orange-500' :
                    masterTypeConfig[kind]?.color === 'pink' ? 'bg-pink-500' :
                    masterTypeConfig[kind]?.color === 'cyan' ? 'bg-cyan-500' :
                    masterTypeConfig[kind]?.color === 'indigo' ? 'bg-indigo-500' :
                    masterTypeConfig[kind]?.color === 'red' ? 'bg-red-500' :
                    'bg-amber-500'
                  }`}>
                    {masterTypeConfig[kind]?.icon || '◆'}
                  </div>
                  <h3 className="text-xs font-semibold">{masterTypeConfig[kind]?.label}</h3>
                  <p className="mt-2 text-lg font-bold">{(masters[kind] || []).length}</p>
                  <p className="text-xs text-slate-500">items</p>
                </button>
              ))}
            </div>

            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Master Data Management</h2>
                  <p className="mt-1 text-xs text-slate-500">{masterTypeConfig[masterForm.kind]?.description}</p>
                </div>
                <select
                  className="select w-40"
                  onChange={(e) => setMasterForm((prev) => ({ ...prev, kind: e.target.value, name: '', code: '', lineId: '', machineId: '' }))}
                  value={masterForm.kind}
                >
                  {masterKinds.map((kind) => (
                    <option key={kind} value={kind}>{masterTypeConfig[kind]?.label || kind}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {masterTypeConfig[masterForm.kind]?.fields.includes('name') ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">{masterTypeConfig[masterForm.kind]?.displayFields?.name || 'Name'} *</label>
                    <input
                      className="input"
                      onChange={(e) => setMasterForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={`Enter ${masterTypeConfig[masterForm.kind]?.displayFields?.name || 'name'}`}
                      value={masterForm.name}
                    />
                  </div>
                ) : null}

                {masterTypeConfig[masterForm.kind]?.fields.includes('code') ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">{masterTypeConfig[masterForm.kind]?.displayFields?.code || 'Code'}</label>
                    <input
                      className="input"
                      onChange={(e) => setMasterForm((prev) => ({ ...prev, code: e.target.value }))}
                      placeholder={`Enter ${masterTypeConfig[masterForm.kind]?.displayFields?.code || 'code'}`}
                      value={masterForm.code}
                    />
                  </div>
                ) : null}

                {masterTypeConfig[masterForm.kind]?.fields.includes('departmentId') ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">{masterTypeConfig[masterForm.kind]?.displayFields?.departmentId || 'Department'}</label>
                    <select
                      className="select"
                      onChange={(e) => setMasterForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                      value={masterForm.departmentId}
                    >
                      <option value="">Select Department</option>
                      {(masters.department || []).map((item) => (
                        <option key={item._id} value={item._id}>{item.name} ({item.code})</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {masterTypeConfig[masterForm.kind]?.fields.includes('lineId') ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">{masterTypeConfig[masterForm.kind]?.displayFields?.lineId || 'Line'}</label>
                    <select
                      className="select"
                      onChange={(e) => setMasterForm((prev) => ({ ...prev, lineId: e.target.value }))}
                      value={masterForm.lineId}
                    >
                      <option value="">Select Line</option>
                      {(masters.line || []).map((item) => (
                        <option key={item._id} value={item._id}>{item.name} ({item.code})</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {masterTypeConfig[masterForm.kind]?.fields.includes('machineId') ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold">{masterTypeConfig[masterForm.kind]?.displayFields?.machineId || 'Machine'}</label>
                    <select
                      className="select"
                      onChange={(e) => setMasterForm((prev) => ({ ...prev, machineId: e.target.value }))}
                      value={masterForm.machineId}
                    >
                      <option value="">Select Machine</option>
                      {(masters.machine || []).map((item) => (
                        <option key={item._id} value={item._id}>{item.name} ({item.code})</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-xs font-semibold">Status</label>
                  <select
                    className="select"
                    onChange={(e) => setMasterForm((prev) => ({ ...prev, active: e.target.value === 'true' }))}
                    value={String(masterForm.active)}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={saveMasterItem} type="button">Add Master Item</button>
                <label className="btn-muted cursor-pointer">
                  Import Master Excel
                  <input className="hidden" onChange={importMasterExcel} type="file" />
                </label>
              </div>
            </div>

            <div className="card overflow-x-auto">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold">{masterTypeConfig[masterForm.kind]?.label} Records ({filteredMasterRows.length})</h3>
                <input
                  className="input flex-1"
                  onChange={(e) => setMasterSearch(e.target.value)}
                  placeholder="Search by name or code..."
                  value={masterSearch}
                />
              </div>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-200 dark:bg-slate-800">
                    {masterTypeConfig[masterForm.kind]?.tableColumns.includes('name') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.name || 'Name'} /> : null}
                    {masterTypeConfig[masterForm.kind]?.tableColumns.includes('code') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.code || 'Code'} /> : null}
                    {masterTypeConfig[masterForm.kind]?.tableColumns.includes('departmentId') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.departmentId || 'Department'} /> : null}
                    {masterTypeConfig[masterForm.kind]?.tableColumns.includes('lineId') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.lineId || 'Line'} /> : null}
                    {masterTypeConfig[masterForm.kind]?.tableColumns.includes('machineId') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.machineId || 'Machine'} /> : null}
                    {masterTypeConfig[masterForm.kind]?.tableColumns.includes('active') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.active || 'Status'} /> : null}
                    <HeaderCell text="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredMasterRows.map((item) => (
                    <tr key={item._id}>
                      {masterTypeConfig[masterForm.kind]?.tableColumns.includes('name') ? <BodyCell>{item.name}</BodyCell> : null}
                      {masterTypeConfig[masterForm.kind]?.tableColumns.includes('code') ? <BodyCell>{item.code || '-'}</BodyCell> : null}
                      {masterTypeConfig[masterForm.kind]?.tableColumns.includes('departmentId') ? <BodyCell>{getParentName('department', item.departmentId)}</BodyCell> : null}
                      {masterTypeConfig[masterForm.kind]?.tableColumns.includes('lineId') ? <BodyCell>{getParentName('line', item.lineId)}</BodyCell> : null}
                      {masterTypeConfig[masterForm.kind]?.tableColumns.includes('machineId') ? <BodyCell>{getParentName('machine', item.machineId)}</BodyCell> : null}
                      {masterTypeConfig[masterForm.kind]?.tableColumns.includes('active') ? <BodyCell>{item.active ? '✓ Active' : '✗ Inactive'}</BodyCell> : null}
                      <BodyCell>
                        <div className="flex flex-wrap gap-1">
                          <button className="btn-muted" onClick={() => toggleMasterActive(masterForm.kind, item)} type="button">
                            {item.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button className="btn-muted" onClick={() => deleteMasterItem(masterForm.kind, item._id)} type="button">Delete</button>
                        </div>
                      </BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === 'audit' && canUseSupervisorViews ? (
          <section className="card overflow-x-auto">
            <h2 className="mb-3 text-base font-semibold">Edit Audit Log</h2>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-200 dark:bg-slate-800">
                  <HeaderCell text="Time" />
                  <HeaderCell text="Action" />
                  <HeaderCell text="Entity" />
                  <HeaderCell text="Entity ID" />
                  <HeaderCell text="Metadata" />
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log._id}>
                    <BodyCell>{new Date(log.createdAt).toLocaleString()}</BodyCell>
                    <BodyCell>{log.action}</BodyCell>
                    <BodyCell>{log.entity}</BodyCell>
                    <BodyCell>{log.entityId}</BodyCell>
                    <BodyCell>
                      <code>{JSON.stringify(log.metadata)}</code>
                    </BodyCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
      </div>
    </div>
  )
}

function ExcelSheet({ rows, includeDate = false, title }) {
  const leadingColumns = includeDate
    ? [
        monitoringColumns[0],
        { key: 'date', label: 'Date', width: 12 },
        ...monitoringColumns.slice(1, 8),
      ]
    : monitoringColumns.slice(0, 8)
  const trailingColumns = monitoringColumns.slice(21)

  return (
    <div className={`monitoring-sheet ${includeDate ? 'db-excel-sheet' : ''} overflow-auto`}>
      <table>
        <thead>
          <tr>
            {leadingColumns.map((column) => (
              <th className={column.vertical ? 'vertical-head' : ''} key={column.key} rowSpan={2}>
                {column.label}
              </th>
            ))}
            <th className="actual-head" colSpan={monitoringHourCount + 1}>
              {title}
            </th>
            {trailingColumns.map((column) => (
              <th className={column.vertical ? 'vertical-head' : ''} key={column.key} rowSpan={2}>
                {column.label}
              </th>
            ))}
          </tr>
          <tr>
            {Array.from({ length: monitoringHourCount }, (_, index) => (
              <th className="hour-head" key={`hour-head-${index + 1}`}>
                {index + 1}
              </th>
            ))}
            <th className="hour-head">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={`${item.sno}-${item.date}-${item.machine}-${item.operator}`}>
              <td>{item.sno}</td>
              {includeDate ? <td>{item.date}</td> : null}
              <td>{item.line}</td>
              <td className="sheet-text">{item.machine}</td>
              <td className="sheet-text">{item.operator}</td>
              <td className="sheet-text">{item.process}</td>
              <td>{item.shift}</td>
              <td>{item.hours}</td>
              <td>{item.target}</td>
              {item.hourlyInputs.map((value, index) => (
                <td key={`${item.sno}-h-${index}`}>{value || ''}</td>
              ))}
              <td className="sheet-total">{item.total}</td>
              <td>{item.rejected}</td>
              <td>{item.rework}</td>
              <td>{item.downtime}</td>
              <td className="sheet-text">{item.reason}</td>
              <td>{item.efficiency}</td>
              <td className="sheet-text">{item.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeaderCell({ text }) {
  return <th className="border-b border-slate-300 p-2 text-left font-semibold dark:border-slate-700">{text}</th>
}

function BodyCell({ children, className = '' }) {
  return <td className={`border-b border-slate-200 p-2 align-top dark:border-slate-800 ${className}`}>{children}</td>
}

function SelectField({ label, value, onChange, options, emptyLabel, includeUnspecified = true }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">{label}</label>
      <select className="select" onChange={(e) => onChange(e.target.value)} value={value || ''}>
        <option value="">{emptyLabel || `Select ${label}`}</option>
        {includeUnspecified ? <option value={UNSPECIFIED_TOKEN}>Unspecified</option> : null}
        {options.map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>
    </div>
  )
}

function MetricCard({ label, value, className = '' }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${className}`}>{value}</p>
    </div>
  )
}

function TextInput({ label, register, type = 'text' }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">{label}</label>
      <input className="input" type={type} {...register} />
    </div>
  )
}

export default App
