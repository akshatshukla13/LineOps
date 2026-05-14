import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
  'department',
  'line',
  'machine',
  'process',
  'operator',
  'product',
  'defectType',
  'downtimeReason',
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
  department: {
    label: 'Department',
    fields: ['name', 'code'],
    displayFields: { name: 'Department Name', code: 'Department Code' },
    tableColumns: ['name', 'code', 'active'],
    columnLabels: { name: 'Name', code: 'Code', active: 'Status' },
    parent: null,
    description: 'Departments within factory',
    color: 'green',
    icon: '🏢',
  },
  line: {
    label: 'Production Line',
    fields: ['name', 'code', 'departmentId'],
    displayFields: { name: 'Line Name', code: 'Line Code', departmentId: 'Department' },
    tableColumns: ['name', 'code', 'departmentId', 'active'],
    columnLabels: { name: 'Line', code: 'Code', departmentId: 'Department', active: 'Status' },
    parent: 'department',
    description: 'Production lines under departments',
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
    fields: ['name', 'code', 'departmentId'],
    displayFields: { name: 'Operator Name', code: 'Employee ID', departmentId: 'Department' },
    tableColumns: ['name', 'code', 'departmentId', 'active'],
    columnLabels: { name: 'Name', code: 'Employee ID', departmentId: 'Department', active: 'Status' },
    parent: 'department',
    description: 'Factory operators by department',
    color: 'cyan',
    icon: '👤',
  },
  product: {
    label: 'Product',
    fields: ['name', 'code'],
    displayFields: { name: 'Product Name', code: 'Product Code' },
    tableColumns: ['name', 'code', 'active'],
    columnLabels: { name: 'Product', code: 'Code', active: 'Status' },
    parent: null,
    description: 'Products manufactured',
    color: 'indigo',
    icon: '📦',
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
  downtimeReason: {
    label: 'Downtime Reason',
    fields: ['name', 'code'],
    displayFields: { name: 'Reason Name', code: 'Reason Code' },
    tableColumns: ['name', 'code', 'active'],
    columnLabels: { name: 'Reason', code: 'Code', active: 'Status' },
    parent: null,
    description: 'Reasons for production downtime (Power, Maintenance, etc.)',
    color: 'amber',
    icon: '⏸️',
  },
}

const reportTypes = [
  { value: 'monitoring', label: 'Production Monitoring (Detailed)' },
  { value: 'daily', label: 'Daily Report (Summary)' },
  { value: 'line', label: 'Line-wise Report' },
  { value: 'operator', label: 'Operator-wise Report' },
  { value: 'machine', label: 'Machine-wise Report' },
  { value: 'shift', label: 'Shift-wise Report' },
  { value: 'dateRange', label: 'Date Range Report' },
]

const monitoringHourCount = 12
const monitoringColumns = [
  { key: 'sno', label: 'S.No.', width: 6, vertical: true },
  { key: 'line', label: 'Line No.', width: 8, vertical: true },
  { key: 'machine', label: 'Machine', width: 22 },
  { key: 'operator', label: 'Operator Name', width: 24 },
  { key: 'process', label: 'Process Name', width: 16 },
  { key: 'shift', label: 'Shift', width: 6, vertical: true },
  { key: 'hours', label: 'Hours', width: 6, vertical: true },
  { key: 'target', label: 'Target Qty', width: 10, vertical: true },
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
    reason: row.downtimeReasonId?.name || row.downtimeOtherText || '',
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
  assignedDepartment: z.string().optional(),
  status: z.enum(['active', 'inactive']),
})

const entrySchema = z.object({
  date: z.string().min(1),
  shiftId: z.string().min(1),
  departmentId: z.string().min(1),
  lineId: z.string().min(1),
  machineId: z.string().min(1),
  processId: z.string().min(1),
  operatorId: z.string().min(1),
  productId: z.string().min(1),
  plannedQty: z.coerce.number().min(0),
  rejectQty: z.coerce.number().min(0),
  reworkQty: z.coerce.number().min(0),
  downtimeMinutes: z.coerce.number().min(0),
  remarks: z.string().optional(),
  downtimeOtherText: z.string().optional(),
})

const emptyEntry = () => ({
  date: new Date().toISOString().slice(0, 10),
  shiftId: '',
  departmentId: '',
  lineId: '',
  machineId: '',
  processId: '',
  operatorId: '',
  productId: '',
  plannedQty: 0,
  hourlyInputs: Array(12).fill(0),
  rejectQty: 0,
  reworkQty: 0,
  downtimeMinutes: 0,
  downtimeReasonId: '',
  downtimeOtherText: '',
  remarks: '',
  status: 'draft',
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
  const [entryHistory, setEntryHistory] = useState([])
  const [reportFilters, setReportFilters] = useState({
    type: 'daily',
    date: new Date().toISOString().slice(0, 10),
    from: '',
    to: '',
    shiftId: '',
    operatorId: '',
    machineId: '',
    departmentId: '',
    lineId: '',
  })
  const [reportData, setReportData] = useState([])
  const [reportSpreadsheetRows, setReportSpreadsheetRows] = useState([])
  const [dbSheetData, setDbSheetData] = useState([])
  const [missedEntries, setMissedEntries] = useState([])
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [editReason, setEditReason] = useState('')
  const [requestCount, setRequestCount] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [masterForm, setMasterForm] = useState({
    kind: 'department',
    name: '',
    code: '',
    active: true,
    departmentId: '',
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
      assignedDepartment: '',
      status: 'active',
    },
  })

  const autoSaveRef = useRef(null)

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

  const optionsByKind = (kind) => masters[kind] || []

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

  const filteredOperators = useMemo(() => {
    const operators = masters.operator || []
    if (!entryDraft.departmentId) return operators
    return operators.filter((item) => item.departmentId === entryDraft.departmentId)
  }, [entryDraft.departmentId, masters.operator])

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
    () => (reportSpreadsheetRows.length > 0 ? reportSpreadsheetRows : reportData).map((row, index) => normalizeMonitoringRow(row, index)),
    [reportData, reportSpreadsheetRows],
  )

  const dbSheetRows = useMemo(
    () => dbSheetData.map((row, index) => normalizeMonitoringRow(row, index)),
    [dbSheetData],
  )

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

  const loadDbSheet = async () => {
    const data = await authFetch('/api/reports?type=monitoring')
    setDbSheetData(data.spreadsheetRows || data.report || [])
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
      await Promise.all([loadMasters(), loadEntries(), loadDbSheet(), loadUsers(), loadAuditLogs(), loadMissedEntries()])
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
    setEntryHistory((prev) => [...prev.slice(-20), entryDraft])
    setEntryDraft((prev) => ({ ...prev, [key]: value }))
  }

  const setHourlyValue = (index, value) => {
    const numeric = Number.isNaN(Number(value)) ? 0 : Number(value)
    setEntryHistory((prev) => [...prev.slice(-20), entryDraft])
    setEntryDraft((prev) => {
      const next = [...prev.hourlyInputs]
      next[index] = numeric
      return { ...prev, hourlyInputs: next }
    })
  }

  const saveEntry = async (asDraft = false) => {
    setErrorText('')
    try {
      const parsed = entrySchema.parse(entryDraft)
      setIsSavingDraft(true)
      setStatusText('Saving...')
      const payload = {
        ...entryDraft,
        ...parsed,
        status: asDraft ? 'draft' : 'submitted',
      }
      await authFetch('/api/entries', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setStatusText('Saved')
      setEntryDraft(emptyEntry())
      setEntryHistory([])
      await Promise.all([loadEntries(), loadDbSheet()])
    } catch (error) {
      setErrorText(error.message)
      setStatusText('Error')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const saveDraft = () => saveEntry(true)

  const updateEntryInline = async (id, patch) => {
    setErrorText('')
    try {
      await authFetch(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...patch, editReason }),
      })
      setStatusText('Row updated')
      await Promise.all([loadEntries(), loadDbSheet()])
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const lockEntry = async (id) => {
    try {
      await authFetch(`/api/entries/${id}/lock`, { method: 'POST' })
      await Promise.all([loadEntries(), loadDbSheet()])
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const unlockEntry = async (id) => {
    try {
      await authFetch(`/api/entries/${id}/unlock`, { method: 'POST' })
      await Promise.all([loadEntries(), loadDbSheet()])
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const clonePreviousDay = async () => {
    try {
      await authFetch('/api/entries/clone-previous', {
        method: 'POST',
        body: JSON.stringify({
          date: entryDraft.date,
          lineId: entryDraft.lineId || undefined,
          machineId: entryDraft.machineId || undefined,
          shiftId: entryDraft.shiftId || undefined,
        }),
      })
      await Promise.all([loadEntries(), loadDbSheet()])
      setStatusText('Previous day setup cloned.')
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const undoLastChange = () => {
    const previous = entryHistory.at(-1)
    if (!previous) return
    setEntryDraft(previous)
    setEntryHistory((prev) => prev.slice(0, -1))
  }

  const clearRow = () => {
    setEntryDraft(emptyEntry())
    setEntryHistory([])
    setStatusText('Row cleared.')
  }

  const copyPreviousRow = () => {
    const latest = entries[0]
    if (!latest) return
    setEntryDraft({
      ...emptyEntry(),
      date: new Date().toISOString().slice(0, 10),
      shiftId: latest.shiftId || '',
      departmentId: latest.departmentId || '',
      lineId: latest.lineId || '',
      machineId: latest.machineId || '',
      processId: latest.processId || '',
      operatorId: latest.operatorId || '',
      productId: latest.productId || '',
      plannedQty: latest.plannedQty || 0,
      downtimeReasonId: latest.downtimeReasonId || '',
      remarks: latest.remarks || '',
    })
    setStatusText('Previous row copied.')
  }

  const duplicateShiftEntry = () => {
    setEntryDraft((prev) => ({ ...prev, hourlyInputs: Array(12).fill(0), status: 'draft' }))
    setStatusText('Shift setup duplicated.')
  }

  const runReport = async () => {
    const query = new URLSearchParams()
    Object.entries(reportFilters).forEach(([key, value]) => {
      if (value) query.set(key, value)
    })

    try {
      const data = await authFetch(`/api/reports?${query.toString()}`)
      setReportData(data.report || [])
      setReportSpreadsheetRows(data.spreadsheetRows || data.report || [])
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const exportReportExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Production Monitoring')

    if (reportFilters.type === 'monitoring' && monitoringRows.length > 0) {
      const firstHourColumn = 9
      const totalColumn = firstHourColumn + monitoringHourCount
      const reportDate = formatDisplayDate(reportFilters.date || monitoringRows[0]?.date)

      worksheet.columns = monitoringColumns.map((column) => ({ key: column.key, width: column.width }))
      worksheet.mergeCells(1, firstHourColumn, 1, totalColumn)
      worksheet.getCell(1, firstHourColumn).value = `Actual  Qty-Date-${reportDate}`

      monitoringColumns.forEach((column, index) => {
        const columnNumber = index + 1
        const isActualColumn = columnNumber >= firstHourColumn && columnNumber <= totalColumn
        const cell = worksheet.getCell(isActualColumn ? 2 : 1, columnNumber)
        cell.value = column.label
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          textRotation: column.vertical ? 90 : 0,
          wrapText: true,
        }

        if (!isActualColumn) {
          worksheet.mergeCells(1, columnNumber, 2, columnNumber)
        }
      })

      monitoringRows.forEach((row) => {
        worksheet.addRow([
          row.sno,
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

      worksheet.getRow(1).height = 28
      worksheet.getRow(2).height = 46
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          }
          cell.alignment = cell.alignment || { horizontal: 'center', vertical: 'middle', wrapText: true }
          if (rowNumber <= 2) {
            cell.font = { bold: true }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
          }
        })
      })
    } else {
      // Summary report format
      worksheet.columns = [
        { header: 'Category', key: 'key', width: 20 },
        { header: 'Records', key: 'records', width: 12 },
        { header: 'Planned Qty', key: 'plannedQty', width: 16 },
        { header: 'Total Production', key: 'totalProduction', width: 18 },
        { header: 'Net Production', key: 'netProduction', width: 16 },
        { header: 'Reject Qty', key: 'rejectQty', width: 12 },
        { header: 'Rework Qty', key: 'reworkQty', width: 12 },
        { header: 'Downtime Minutes', key: 'downtimeMinutes', width: 18 },
        { header: 'Efficiency %', key: 'efficiencyPct', width: 14 },
      ]

      reportData.forEach((row) => {
        worksheet.addRow({
          key: row.label || row.key,
          records: row.records,
          plannedQty: row.plannedQty,
          totalProduction: row.totalProduction,
          netProduction: row.netProduction,
          rejectQty: row.rejectQty,
          reworkQty: row.reworkQty,
          downtimeMinutes: row.downtimeMinutes,
          efficiencyPct: row.efficiencyPct,
        })
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lineops-${reportFilters.type}-report-${Date.now()}.xlsx`
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

    page.drawText(`Report Type: ${reportFilters.type} | Generated: ${new Date().toLocaleDateString()}`, {
      x: 30,
      y: 540,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })

    let y = 520
    const lineHeight = 14
    const marginBottom = 20

    const pdfRows = reportFilters.type === 'monitoring' ? monitoringRows : reportData

    pdfRows.slice(0, 40).forEach((row) => {
      if (y < marginBottom) {
        page = pdfDoc.addPage([842, 595])
        y = 570
      }

      if (reportFilters.type === 'monitoring') {
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
      } else {
        page.drawText(
          `${row.label || row.key} | Records: ${row.records} | Planned: ${row.plannedQty} | Net: ${row.netProduction} | Efficiency: ${row.efficiencyPct}%`,
          {
            x: 30,
            y,
            size: 9,
            font,
            color: rgb(0.2, 0.2, 0.2),
          },
        )
      }
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
      const payload = {
        ...values,
        assignedDepartment: values.assignedDepartment || null,
      }
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
        assignedDepartment: '',
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
          departmentId: masterForm.departmentId || null,
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
    setReportFilters((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!token || !user) return undefined

    if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    autoSaveRef.current = setInterval(() => {
      const hasMinimumData =
        entryDraft.date &&
        entryDraft.shiftId &&
        entryDraft.departmentId &&
        entryDraft.lineId &&
        entryDraft.machineId &&
        entryDraft.processId &&
        entryDraft.operatorId &&
        entryDraft.productId

      if (hasMinimumData && !isSavingDraft) {
        saveDraft()
      }
    }, 30000)

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, entryDraft, isSavingDraft])

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
    { id: 'dbSheet', label: 'DB Excel View', icon: 'grid_on' },
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
              <h2 className="mb-3 text-base font-semibold">Daily Production Entry</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Date</label>
                  <input className="input" onChange={(e) => setDraftField('date', e.target.value)} type="date" value={entryDraft.date} />
                </div>
                <SelectField label="Shift" options={optionsByKind('shift')} onChange={(v) => setDraftField('shiftId', v)} value={entryDraft.shiftId} />
                <SelectField label="Department" options={optionsByKind('department')} onChange={(v) => setDraftField('departmentId', v)} value={entryDraft.departmentId} />
                <SelectField label="Line" options={optionsByKind('line')} onChange={(v) => setDraftField('lineId', v)} value={entryDraft.lineId} />
                <SelectField label="Machine" options={filteredMachines} onChange={(v) => setDraftField('machineId', v)} value={entryDraft.machineId} />
                <SelectField label="Process" options={filteredProcesses} onChange={(v) => setDraftField('processId', v)} value={entryDraft.processId} />
                <SelectField label="Operator" options={filteredOperators} onChange={(v) => setDraftField('operatorId', v)} value={entryDraft.operatorId} />
                <SelectField label="Product" options={optionsByKind('product')} onChange={(v) => setDraftField('productId', v)} value={entryDraft.productId} />
                <div>
                  <label className="mb-1 block text-xs font-semibold">Planned Qty</label>
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
                <SelectField
                  label="Downtime Reason"
                  options={optionsByKind('downtimeReason')}
                  onChange={(v) => setDraftField('downtimeReasonId', v)}
                  value={entryDraft.downtimeReasonId}
                />
              </div>

              {isOtherDowntimeSelected(entryDraft, optionsByKind('downtimeReason')) ? (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold">Downtime Other (required for Other)</label>
                  <input
                    className="input"
                    onChange={(e) => setDraftField('downtimeOtherText', e.target.value)}
                    value={entryDraft.downtimeOtherText}
                  />
                </div>
              ) : null}

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
                <button className="btn-primary" onClick={() => saveEntry(false)} type="button">Save Changes</button>
                <button className="btn-muted" onClick={saveDraft} type="button">Save Draft</button>
                <button className="btn-muted" onClick={copyPreviousRow} type="button">Copy Previous Row</button>
                <button className="btn-muted" onClick={duplicateShiftEntry} type="button">Duplicate Shift Entry</button>
                <button className="btn-muted" onClick={undoLastChange} type="button">Undo Last Change</button>
                <button className="btn-muted" onClick={clearRow} type="button">Clear Row</button>
                <button className="btn-muted" onClick={clonePreviousDay} type="button">Clone Previous Day Setup</button>
                <span className="self-center text-xs text-slate-500">Auto-save every 30 seconds</span>
              </div>
            </div>

            <div className="card">
              <h2 className="mb-2 text-base font-semibold">Submitted Entries (Inline Editable Grid)</h2>
              <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  className="input md:max-w-xs"
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Edit reason (optional for critical fields)"
                  value={editReason}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs" style={{ minWidth: '1100px' }}>
                  <thead className="sticky top-0 bg-slate-200 dark:bg-slate-800">
                    <tr>
                      <HeaderCell text="Date" />
                      <HeaderCell text="Status" />
                      <HeaderCell text="Planned" />
                      <HeaderCell text="H1" />
                      <HeaderCell text="H2" />
                      <HeaderCell text="H3" />
                      <HeaderCell text="H4" />
                      <HeaderCell text="H5" />
                      <HeaderCell text="H6" />
                      <HeaderCell text="H7" />
                      <HeaderCell text="H8" />
                      <HeaderCell text="H9" />
                      <HeaderCell text="H10" />
                      <HeaderCell text="H11" />
                      <HeaderCell text="H12" />
                      <HeaderCell text="Reject" />
                      <HeaderCell text="Rework" />
                      <HeaderCell text="Downtime" />
                      <HeaderCell text="Efficiency" />
                      <HeaderCell text="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((row) => {
                      const isLocked = row.status === 'locked'
                      const rowHighlight = isLocked ? 'bg-slate-100 dark:bg-slate-900' : ''
                      return (
                        <tr className={rowHighlight} key={row._id}>
                          <BodyCell>{row.date}</BodyCell>
                          <BodyCell>
                            <span className="inline-flex items-center gap-1">
                              {row.status === 'locked' ? '🔒' : row.status === 'draft' ? '📝' : '✅'} {row.status}
                            </span>
                          </BodyCell>
                          <BodyCell>{row.plannedQty}</BodyCell>
                          {(row.hourlyInputs || Array(12).fill(0)).map((value, idx) => (
                            <BodyCell key={`${row._id}-h-${idx}`}>
                              <input
                                className={`input w-16 ${row.editedCells?.includes('hourlyInputs') ? 'border-amber-400' : ''}`}
                                defaultValue={value}
                                disabled={isLocked}
                                inputMode="numeric"
                                onBlur={(e) => {
                                  const next = [...(row.hourlyInputs || Array(12).fill(0))]
                                  next[idx] = Number(e.target.value || 0)
                                  updateEntryInline(row._id, { hourlyInputs: next })
                                }}
                                type="number"
                              />
                            </BodyCell>
                          ))}
                          <BodyCell>
                            <input
                              className={`input w-16 ${row.editedCells?.includes('rejectQty') ? 'border-amber-400' : ''}`}
                              defaultValue={row.rejectQty}
                              disabled={isLocked}
                              onBlur={(e) => updateEntryInline(row._id, { rejectQty: Number(e.target.value || 0) })}
                              type="number"
                            />
                          </BodyCell>
                          <BodyCell>
                            <input
                              className={`input w-16 ${row.editedCells?.includes('reworkQty') ? 'border-amber-400' : ''}`}
                              defaultValue={row.reworkQty}
                              disabled={isLocked}
                              onBlur={(e) => updateEntryInline(row._id, { reworkQty: Number(e.target.value || 0) })}
                              type="number"
                            />
                          </BodyCell>
                          <BodyCell>
                            <input
                              className={`input w-16 ${row.editedCells?.includes('downtimeMinutes') ? 'border-amber-400' : ''}`}
                              defaultValue={row.downtimeMinutes}
                              disabled={isLocked}
                              onBlur={(e) => updateEntryInline(row._id, { downtimeMinutes: Number(e.target.value || 0) })}
                              type="number"
                            />
                          </BodyCell>
                          <BodyCell>
                            <span className={row.efficiencyPct >= 90 ? 'text-emerald-600' : row.efficiencyPct >= 70 ? 'text-yellow-500' : 'text-rose-600'}>
                              {row.efficiencyPct}%
                            </span>
                          </BodyCell>
                          <BodyCell>
                            <div className="flex flex-wrap gap-1">
                              <button className="btn-muted" onClick={() => setEditingRow(row)} type="button">Row Edit</button>
                              {canUseSupervisorViews && !isLocked ? (
                                <button className="btn-muted" onClick={() => lockEntry(row._id)} type="button">Lock</button>
                              ) : null}
                              {canUseAdmin && isLocked ? (
                                <button className="btn-muted" onClick={() => unlockEntry(row._id)} type="button">Unlock</button>
                              ) : null}
                            </div>
                          </BodyCell>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {editingRow ? (
              <RowEditModal
                entry={editingRow}
                onClose={() => setEditingRow(null)}
                onSave={async (patch) => {
                  await updateEntryInline(editingRow._id, patch)
                  setEditingRow(null)
                }}
              />
            ) : null}
          </section>
        ) : null}

        {activeTab === 'dbSheet' ? (
          <section className="grid gap-4">
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Database Excel View</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    All role-visible production entries in one spreadsheet-style table.
                  </p>
                </div>
                <button className="btn-primary" onClick={loadDbSheet} type="button">
                  Refresh DB View
                </button>
              </div>
            </div>

            <div className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">All Entries - {dbSheetRows.length} rows</h3>
                <span className="text-xs text-slate-500">Includes Date, 1-12 hourly actuals, total, quality, downtime, and remarks.</span>
              </div>

              {dbSheetRows.length > 0 ? (
                <ExcelSheet rows={dbSheetRows} includeDate title="Actual Qty-Date-All Entries" />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No production entries found in the database for your role.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'reports' ? (
          <section className="grid gap-4">
            {/* Filter Section */}
            <div className="card">
              <h2 className="mb-4 text-base font-semibold flex items-center gap-2">
                <span>📊</span> Production Monitoring Report
              </h2>
              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Report Type</label>
                  <select className="select" onChange={(e) => changeReportFilter('type', e.target.value)} value={reportFilters.type}>
                    {reportTypes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                {reportFilters.type === 'monitoring' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold">Date</label>
                      <input className="input" onChange={(e) => changeReportFilter('date', e.target.value)} type="date" value={reportFilters.date} />
                    </div>
                    <SelectField label="Department" options={optionsByKind('department')} onChange={(v) => changeReportFilter('departmentId', v)} value={reportFilters.departmentId} />
                    <SelectField label="Line" options={optionsByKind('line')} onChange={(v) => changeReportFilter('lineId', v)} value={reportFilters.lineId} />
                    <SelectField label="Shift" options={optionsByKind('shift')} onChange={(v) => changeReportFilter('shiftId', v)} value={reportFilters.shiftId} />
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold">From Date</label>
                      <input className="input" onChange={(e) => changeReportFilter('from', e.target.value)} type="date" value={reportFilters.from} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold">To Date</label>
                      <input className="input" onChange={(e) => changeReportFilter('to', e.target.value)} type="date" value={reportFilters.to} />
                    </div>
                    <SelectField label="Operator" options={optionsByKind('operator')} onChange={(v) => changeReportFilter('operatorId', v)} value={reportFilters.operatorId} />
                    <SelectField label="Machine" options={optionsByKind('machine')} onChange={(v) => changeReportFilter('machineId', v)} value={reportFilters.machineId} />
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={runReport} type="button">
                  🔍 Generate Report
                </button>
                <button className="btn-muted" onClick={exportReportExcel} disabled={(reportFilters.type === 'monitoring' ? monitoringRows : reportData).length === 0} type="button">
                  📊 Export Excel (.xlsx)
                </button>
                <button className="btn-muted" onClick={exportReportPdf} disabled={(reportFilters.type === 'monitoring' ? monitoringRows : reportData).length === 0} type="button">
                  📄 Export PDF
                </button>
              </div>
            </div>

            {/* Production Monitoring Table - Show if data exists */}
            {monitoringRows.length > 0 && reportFilters.type === 'monitoring' ? (
              <div className="card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Production Monitoring Table - {formatDisplayDate(reportFilters.date)}
                  </h3>
                  <span className="text-xs text-slate-500">Excel export uses this same input/output format.</span>
                </div>
                <div className="monitoring-sheet overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        {monitoringColumns.slice(0, 8).map((column) => (
                          <th className={column.vertical ? 'vertical-head' : ''} key={column.key} rowSpan={2}>
                            {column.label}
                          </th>
                        ))}
                        <th className="actual-head" colSpan={monitoringHourCount + 1}>
                          Actual&nbsp; Qty-Date-{formatDisplayDate(reportFilters.date || monitoringRows[0]?.date)}
                        </th>
                        {monitoringColumns.slice(21).map((column) => (
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
                      {monitoringRows.map((item) => (
                        <tr key={`${item.sno}-${item.machine}-${item.operator}`}>
                          <td>{item.sno}</td>
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
              </div>
            ) : null}

            {/* Summary Chart - Show for other report types */}
            {reportData.length > 0 && reportFilters.type !== 'monitoring' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="card">
                  <h3 className="mb-2 text-base font-semibold">Production Summary Chart</h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer>
                      <BarChart data={reportData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="plannedQty" fill="#94a3b8" name="Planned" />
                        <Bar dataKey="netProduction" fill="#2563eb" name="Net Production" />
                        <Bar dataKey="downtimeMinutes" fill="#f97316" name="Downtime (min)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card overflow-x-auto">
                  <h3 className="mb-3 text-base font-semibold">Summary Table</h3>
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-200 dark:bg-slate-800">
                        <HeaderCell text="Category" />
                        <HeaderCell text="Records" />
                        <HeaderCell text="Planned" />
                        <HeaderCell text="Total" />
                        <HeaderCell text="Net" />
                        <HeaderCell text="Reject" />
                        <HeaderCell text="Rework" />
                        <HeaderCell text="Downtime" />
                        <HeaderCell text="Efficiency %" />
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((item) => (
                        <tr key={item.key}>
                          <BodyCell className="font-semibold">{item.label || item.key}</BodyCell>
                          <BodyCell>{item.records}</BodyCell>
                          <BodyCell>{item.plannedQty}</BodyCell>
                          <BodyCell>{item.totalProduction}</BodyCell>
                          <BodyCell className="text-green-600 font-semibold">{item.netProduction}</BodyCell>
                          <BodyCell className="text-red-600">{item.rejectQty}</BodyCell>
                          <BodyCell className="text-orange-600">{item.reworkQty}</BodyCell>
                          <BodyCell className="text-red-700">{item.downtimeMinutes}</BodyCell>
                          <BodyCell className="font-semibold">{item.efficiencyPct}%</BodyCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {reportData.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-12 text-center">
                <p className="text-4xl mb-2">📊</p>
                <p className="text-base font-semibold">Generate a report to view data</p>
                <p className="text-sm text-slate-500 mt-1">Select filters and click "Generate Report" above</p>
              </div>
            ) : null}
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
                  <label className="mb-1 block text-xs font-semibold">Assigned Department</label>
                  <select className="select" {...addUserForm.register('assignedDepartment')}>
                    <option value="">None</option>
                    {optionsByKind('department').map((item) => (
                      <option key={item._id} value={item._id}>{item.name}</option>
                    ))}
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
                  onClick={() => setMasterForm((prev) => ({ ...prev, kind, name: '', code: '', departmentId: '', lineId: '', machineId: '' })) && setMasterSearch('')}
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
                  onChange={(e) => setMasterForm((prev) => ({ ...prev, kind: e.target.value, name: '', code: '', departmentId: '', lineId: '', machineId: '' }))}
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

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">{label}</label>
      <select className="select" onChange={(e) => onChange(e.target.value)} value={value || ''}>
        <option value="">Select {label}</option>
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

function RowEditModal({ entry, onClose, onSave }) {
  const [form, setForm] = useState({
    plannedQty: entry.plannedQty || 0,
    rejectQty: entry.rejectQty || 0,
    reworkQty: entry.reworkQty || 0,
    downtimeMinutes: entry.downtimeMinutes || 0,
    remarks: entry.remarks || '',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/35 p-2 md:p-4">
      <div className="card w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Row Edit Mode</h3>
          <button className="btn-muted" onClick={onClose} type="button">Close</button>
        </div>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Planned Qty</label>
            <input
              className="input"
              onChange={(e) => setForm((prev) => ({ ...prev, plannedQty: Number(e.target.value || 0) }))}
              type="number"
              value={form.plannedQty}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Reject Qty</label>
            <input
              className="input"
              onChange={(e) => setForm((prev) => ({ ...prev, rejectQty: Number(e.target.value || 0) }))}
              type="number"
              value={form.rejectQty}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Rework Qty</label>
            <input
              className="input"
              onChange={(e) => setForm((prev) => ({ ...prev, reworkQty: Number(e.target.value || 0) }))}
              type="number"
              value={form.reworkQty}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Downtime Minutes</label>
            <input
              className="input"
              onChange={(e) => setForm((prev) => ({ ...prev, downtimeMinutes: Number(e.target.value || 0) }))}
              type="number"
              value={form.downtimeMinutes}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Remarks</label>
            <textarea
              className="textarea"
              onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
              rows={3}
              value={form.remarks}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-muted" onClick={onClose} type="button">Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)} type="button">Save Row</button>
        </div>
      </div>
    </div>
  )
}

function isOtherDowntimeSelected(entryDraft, reasons) {
  const selected = reasons.find((item) => item._id === entryDraft.downtimeReasonId)
  return selected?.name?.toLowerCase() === 'other'
}

export default App
