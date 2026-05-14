import { useEffect, useMemo, useRef, useState } from 'react'
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

const HOURLY_TIMES = [
  '08:00–09:00', '09:00–10:00', '10:00–11:00', '11:00–12:00',
  '12:00–13:00', '13:00–14:00', '14:00–15:00', '15:00–16:00',
  '16:00–17:00', '17:00–18:00', '18:00–19:00', '19:00–20:00',
]

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
  })
  const [reportData, setReportData] = useState([])
  const [missedEntries, setMissedEntries] = useState([])
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [editReason, setEditReason] = useState('')
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

  const authFetch = async (path, options = {}) => {
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
  }

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
    setUsers([])
    setMasters({})
    setAuditLogs([])
    setMissedEntries([])
  }

  const handleLogin = loginForm.handleSubmit(async (values) => {
    setErrorText('')
    setStatusText('Signing in...')
    try {
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
      await loadEntries()
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
      await loadEntries()
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const lockEntry = async (id) => {
    try {
      await authFetch(`/api/entries/${id}/lock`, { method: 'POST' })
      await loadEntries()
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const unlockEntry = async (id) => {
    try {
      await authFetch(`/api/entries/${id}/unlock`, { method: 'POST' })
      await loadEntries()
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
      await loadEntries()
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
    } catch (error) {
      setErrorText(error.message)
    }
  }

  const exportReportExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Production Monitoring')
    
    // Check if it's a detailed monitoring report
    if (reportFilters.type === 'monitoring' && reportData.length > 0) {
      // Production Monitoring Table format (matching Excel format)
      worksheet.columns = [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Line', key: 'line', width: 15 },
        { header: 'Machine', key: 'machine', width: 18 },
        { header: 'Operator', key: 'operator', width: 18 },
        { header: 'Process', key: 'process', width: 15 },
        { header: 'Shift', key: 'shift', width: 12 },
        { header: 'Target Qty', key: 'targetQty', width: 12 },
        { header: 'H1', key: 'h1', width: 8 },
        { header: 'H2', key: 'h2', width: 8 },
        { header: 'H3', key: 'h3', width: 8 },
        { header: 'H4', key: 'h4', width: 8 },
        { header: 'H5', key: 'h5', width: 8 },
        { header: 'H6', key: 'h6', width: 8 },
        { header: 'H7', key: 'h7', width: 8 },
        { header: 'H8', key: 'h8', width: 8 },
        { header: 'H9', key: 'h9', width: 8 },
        { header: 'H10', key: 'h10', width: 8 },
        { header: 'H11', key: 'h11', width: 8 },
        { header: 'H12', key: 'h12', width: 8 },
        { header: 'H13', key: 'h13', width: 8 },
        { header: 'Total', key: 'total', width: 10 },
        { header: 'Rejected', key: 'rejected', width: 10 },
        { header: 'Rework', key: 'rework', width: 10 },
        { header: 'Downtime', key: 'downtime', width: 10 },
        { header: 'Reason', key: 'reason', width: 15 },
        { header: 'Efficiency %', key: 'efficiency', width: 12 },
        { header: 'Remarks', key: 'remarks', width: 20 },
      ]

      reportData.forEach((row, idx) => {
        const hourlyData = row.hourlyInputs || Array(13).fill(0)
        worksheet.addRow({
          sno: idx + 1,
          date: row.date,
          line: row.lineId?.name || '-',
          machine: row.machineId?.name || '-',
          operator: row.operatorId?.name || '-',
          process: row.processId?.name || '-',
          shift: row.shiftId?.name || '-',
          targetQty: row.plannedQty,
          h1: hourlyData[0] || 0,
          h2: hourlyData[1] || 0,
          h3: hourlyData[2] || 0,
          h4: hourlyData[3] || 0,
          h5: hourlyData[4] || 0,
          h6: hourlyData[5] || 0,
          h7: hourlyData[6] || 0,
          h8: hourlyData[7] || 0,
          h9: hourlyData[8] || 0,
          h10: hourlyData[9] || 0,
          h11: hourlyData[10] || 0,
          h12: hourlyData[11] || 0,
          h13: hourlyData[12] || 0,
          total: row.totalProduction || 0,
          rejected: row.rejectQty || 0,
          rework: row.reworkQty || 0,
          downtime: row.downtimeMinutes || 0,
          reason: row.downtimeReasonId?.name || '-',
          efficiency: row.efficiencyPct || 0,
          remarks: row.remarks || '-',
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
        worksheet.addRow(row)
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
    const page = pdfDoc.addPage([842, 595])
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
    const pageHeight = 595
    const lineHeight = 14
    const marginBottom = 20

    reportData.slice(0, 40).forEach((row) => {
      if (y < marginBottom) {
        // Create new page if needed
        const newPage = pdfDoc.addPage([842, 595])
        y = 570
      }

      if (reportFilters.type === 'monitoring') {
        page.drawText(
          `${row.date} | ${row.lineId?.name || 'N/A'} | ${row.machineId?.name || 'N/A'} | ${row.operatorId?.name || 'N/A'} | Tgt: ${row.plannedQty} | Prod: ${row.totalProduction} | Eff: ${row.efficiencyPct}%`,
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
          `${row.key} | Records: ${row.records} | Planned: ${row.plannedQty} | Net: ${row.netProduction} | Efficiency: ${row.efficiencyPct}%`,
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'entry', label: 'Data Entry', icon: 'table_chart' },
    { id: 'reports', label: 'Reports', icon: 'insert_chart' },
    ...(canUseAdmin ? [
      { id: 'master', label: 'Admin Control', icon: 'settings' },
      { id: 'users', label: 'Users', icon: 'manage_accounts' },
    ] : []),
    ...(canUseSupervisorViews ? [{ id: 'audit', label: 'Audit Logs', icon: 'history' }] : []),
  ]

  if (!token || !user) {
    return (
      <div style={{minHeight:'100vh',background:'#001e40',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
        <div style={{width:'100%',maxWidth:'420px'}}>
          <div style={{textAlign:'center',marginBottom:'32px'}}>
            <h1 style={{fontSize:'48px',fontWeight:700,color:'#ffffff',letterSpacing:'-0.02em',margin:0,lineHeight:'56px'}}>
              Line<span style={{color:'#a7c8ff'}}>Ops</span>
            </h1>
            <p style={{color:'#799dd6',marginTop:'8px',fontSize:'16px',lineHeight:'24px',margin:'8px 0 0'}}>Manufacturing Production Monitoring</p>
          </div>
          <div style={{background:'#ffffff',borderRadius:'0.5rem',padding:'32px',boxShadow:'0 4px 32px rgba(0,0,0,0.24)'}}>
            <h2 style={{fontSize:'24px',fontWeight:600,color:'#191c1d',margin:'0 0 8px 0'}}>Sign In</h2>
            <p style={{fontSize:'14px',color:'#43474f',margin:'0 0 24px'}}>Enter your assigned credentials to continue.</p>
            <form style={{display:'flex',flexDirection:'column',gap:'16px'}} onSubmit={handleLogin}>
              <div>
                <label className="mfg-label">Username</label>
                <input className="mfg-input" {...loginForm.register('username')} />
                {loginForm.formState.errors.username ? (
                  <p style={{margin:'4px 0 0',fontSize:'12px',color:'#ba1a1a'}}>{loginForm.formState.errors.username.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mfg-label">Password</label>
                <input className="mfg-input" type="password" {...loginForm.register('password')} />
                {loginForm.formState.errors.password ? (
                  <p style={{margin:'4px 0 0',fontSize:'12px',color:'#ba1a1a'}}>{loginForm.formState.errors.password.message}</p>
                ) : null}
              </div>
              <button className="btn-primary-mfg" style={{width:'100%',marginTop:'8px'}} type="submit">Sign In</button>
            </form>
            {statusText ? <p style={{margin:'16px 0 0',fontSize:'14px',color:'#166534'}}>{statusText}</p> : null}
            {errorText ? <p style={{margin:'8px 0 0',fontSize:'14px',color:'#ba1a1a'}}>{errorText}</p> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{display:'flex',minHeight:'100vh',background:'#f8f9fa'}}>

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex" style={{width:'280px',background:'#ffffff',borderRight:'1px solid #c3c6d1',position:'fixed',top:0,left:0,bottom:0,flexDirection:'column',zIndex:30}}>
        <div style={{padding:'24px 20px 20px',borderBottom:'1px solid #edeeef'}}>
          <div style={{fontSize:'20px',fontWeight:700,color:'#191c1d',letterSpacing:'-0.01em'}}>
            LINE<span style={{color:'#3a5f94'}}>OPS</span>
          </div>
          <div style={{fontSize:'11px',color:'#43474f',marginTop:'2px',fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase'}}>Production Monitoring</div>
        </div>
        <nav style={{flex:1,padding:'12px 8px',display:'flex',flexDirection:'column',gap:'2px',overflowY:'auto'}} className="custom-scrollbar">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item${activeTab === item.id ? ' active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              type="button"
            >
              <span className="material-symbols-outlined" style={{fontSize:'20px',fontVariationSettings:activeTab===item.id?"'FILL' 1":"'FILL' 0"}}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{padding:'16px',borderTop:'1px solid #edeeef'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
            <div style={{width:'36px',height:'36px',borderRadius:'9999px',background:'#d0e1fb',display:'flex',alignItems:'center',justifyContent:'center',color:'#54647a',fontWeight:700,fontSize:'14px',flexShrink:0}}>
              {(user.fullName || user.username || 'U')[0].toUpperCase()}
            </div>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:'14px',fontWeight:600,color:'#191c1d',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.fullName || user.username}</div>
              <div style={{fontSize:'12px',color:'#43474f',textTransform:'capitalize'}}>{user.role}</div>
            </div>
          </div>
          <button className="btn-outline-mfg" style={{width:'100%'}} onClick={handleLogout} type="button">
            <span className="material-symbols-outlined" style={{fontSize:'18px'}}>logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden" style={{position:'fixed',top:0,left:0,right:0,zIndex:30,background:'#ffffff',borderBottom:'1px solid #c3c6d1',height:'56px',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px'}}>
        <div style={{fontSize:'18px',fontWeight:700,color:'#191c1d'}}>
          LINE<span style={{color:'#3a5f94'}}>OPS</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'11px',color:'#54647a',background:'#d0e1fb',borderRadius:'9999px',padding:'3px 10px',fontWeight:600,textTransform:'capitalize'}}>{user.role}</span>
          <button style={{background:'none',border:'none',cursor:'pointer',color:'#43474f',padding:'4px',display:'flex',alignItems:'center'}} onClick={handleLogout} type="button">
            <span className="material-symbols-outlined" style={{fontSize:'22px'}}>logout</span>
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="lg:pl-[280px]" style={{flex:1,overflowX:'hidden',minHeight:'100vh'}}>
        <div className="lg:p-8 pb-20 lg:pb-8" style={{padding:'16px',paddingTop:'72px'}}>
          <div style={{maxWidth:'1280px',margin:'0 auto'}}>

            {/* Status / Error banners */}
            {statusText ? (
              <div style={{marginBottom:'16px',padding:'12px 16px',background:'#dcfce7',borderRadius:'0.25rem',color:'#166534',fontSize:'14px',display:'flex',alignItems:'center',gap:'8px'}}>
                <span className="material-symbols-outlined" style={{fontSize:'18px'}}>check_circle</span>
                {statusText}
              </div>
            ) : null}
            {errorText ? (
              <div style={{marginBottom:'16px',padding:'12px 16px',background:'#ffdad6',borderRadius:'0.25rem',color:'#93000a',fontSize:'14px',display:'flex',alignItems:'center',gap:'8px'}}>
                <span className="material-symbols-outlined" style={{fontSize:'18px'}}>error</span>
                {errorText}
              </div>
            ) : null}

            {/* ════════════════════════════════ DASHBOARD ════════════════════════════════ */}
            {activeTab === 'dashboard' ? (
              <section>
                <div style={{marginBottom:'24px'}}>
                  <h1 style={{fontSize:'32px',fontWeight:600,color:'#191c1d',letterSpacing:'-0.01em',margin:0,lineHeight:'40px'}}>Dashboard</h1>
                  <p style={{fontSize:'16px',color:'#43474f',marginTop:'4px',margin:'4px 0 0'}}>Production overview — {new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:'24px',marginBottom:'24px'}}>
                  <div className="mfg-card">
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                      <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'24px'}}>assignment</span>
                      <span style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase'}}>Total Entries</span>
                    </div>
                    <div style={{fontSize:'48px',fontWeight:700,color:'#191c1d',letterSpacing:'-0.02em',lineHeight:'56px'}}>{entries.length}</div>
                    <div style={{fontSize:'14px',color:'#43474f',marginTop:'4px'}}>Records visible to your role</div>
                  </div>

                  <div className="mfg-card">
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                      <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'24px'}}>dataset</span>
                      <span style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase'}}>Total Masters</span>
                    </div>
                    <div style={{fontSize:'48px',fontWeight:700,color:'#191c1d',letterSpacing:'-0.02em',lineHeight:'56px'}}>{masterKinds.reduce((sum, kind) => sum + (masters[kind]?.length || 0), 0)}</div>
                    <div style={{fontSize:'14px',color:'#43474f',marginTop:'4px'}}>Dropdown options configured</div>
                  </div>

                  <div className="mfg-card">
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                      <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'24px'}}>group</span>
                      <span style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase'}}>Users</span>
                    </div>
                    <div style={{fontSize:'48px',fontWeight:700,color:'#191c1d',letterSpacing:'-0.02em',lineHeight:'56px'}}>{canUseAdmin ? users.length : '—'}</div>
                    <div style={{fontSize:'14px',color:'#43474f',marginTop:'4px'}}>Role-based user count</div>
                  </div>
                </div>

                {canUseSupervisorViews ? (
                  <div className="mfg-card">
                    <div className="mfg-card-header">
                      <span className="material-symbols-outlined" style={{color:'#854d0e',fontSize:'20px'}}>warning</span>
                      <h2 style={{fontSize:'18px',fontWeight:600,color:'#191c1d',margin:0}}>Missed Entry Notifications</h2>
                    </div>
                    {missedEntries.length === 0 ? (
                      <div style={{display:'flex',alignItems:'center',gap:'8px',color:'#166534',fontSize:'14px'}}>
                        <span className="material-symbols-outlined" style={{fontSize:'20px'}}>check_circle</span>
                        No missed operator entries today.
                      </div>
                    ) : (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'8px'}}>
                        {missedEntries.map((item) => (
                          <div key={item.id} style={{padding:'12px 16px',background:'#fef9c3',border:'1px solid #fde047',borderRadius:'0.25rem',fontSize:'14px',color:'#854d0e',display:'flex',alignItems:'center',gap:'8px'}}>
                            <span className="material-symbols-outlined" style={{fontSize:'18px'}}>person_alert</span>
                            {item.fullName} ({item.employeeId})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* ════════════════════════════════ DATA ENTRY ════════════════════════════════ */}
            {activeTab === 'entry' ? (
              <section>
                <div style={{marginBottom:'24px'}}>
                  <h1 style={{fontSize:'32px',fontWeight:600,color:'#001e40',letterSpacing:'-0.01em',margin:0,lineHeight:'40px'}}>Daily Entry</h1>
                  <p style={{fontSize:'16px',color:'#43474f',margin:'4px 0 0'}}>Log hourly production data for your shift</p>
                </div>

                <div style={{display:'grid',gap:'24px'}} className="xl:grid-cols-[400px_1fr]">

                  {/* Left column */}
                  <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>

                    {/* Work Context card */}
                    <div className="mfg-card">
                      <div className="mfg-card-header">
                        <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>settings</span>
                        <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Work Context</h2>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
                        <div>
                          <label className="mfg-label">Date</label>
                          <input className="mfg-input" type="date" onChange={(e) => setDraftField('date', e.target.value)} value={entryDraft.date} />
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                          <SelectField label="Line No" options={optionsByKind('line')} onChange={(v) => setDraftField('lineId', v)} value={entryDraft.lineId} />
                          <SelectField label="Machine" options={filteredMachines} onChange={(v) => setDraftField('machineId', v)} value={entryDraft.machineId} />
                        </div>
                        <SelectField label="Process Name" options={filteredProcesses} onChange={(v) => setDraftField('processId', v)} value={entryDraft.processId} />
                        <SelectField label="Operator" options={filteredOperators} onChange={(v) => setDraftField('operatorId', v)} value={entryDraft.operatorId} />
                        <SelectField label="Department" options={optionsByKind('department')} onChange={(v) => setDraftField('departmentId', v)} value={entryDraft.departmentId} />
                        <div>
                          <label className="mfg-label">Shift</label>
                          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                            {optionsByKind('shift').map(s => (
                              <label key={s._id} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'14px',color:'#191c1d',padding:'8px 12px',borderRadius:'0.25rem',border:`1px solid ${entryDraft.shiftId===s._id?'#001e40':'#c3c6d1'}`,background:entryDraft.shiftId===s._id?'#d5e3ff':'#ffffff',transition:'all 0.15s'}}>
                                <input
                                  type="radio"
                                  name="shift"
                                  value={s._id}
                                  checked={entryDraft.shiftId === s._id}
                                  onChange={() => setDraftField('shiftId', s._id)}
                                  style={{accentColor:'#001e40'}}
                                />
                                {s.name}
                              </label>
                            ))}
                          </div>
                        </div>
                        <SelectField label="Product" options={optionsByKind('product')} onChange={(v) => setDraftField('productId', v)} value={entryDraft.productId} />
                      </div>
                    </div>

                    {/* Targets card */}
                    <div className="mfg-card">
                      <div className="mfg-card-header">
                        <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>track_changes</span>
                        <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Targets</h2>
                      </div>
                      <div>
                        <label className="mfg-label">Planned Qty (Target Qty)</label>
                        <input
                          className="mfg-input"
                          inputMode="numeric"
                          min="0"
                          type="number"
                          onChange={(e) => setDraftField('plannedQty', Number(e.target.value || 0))}
                          value={entryDraft.plannedQty}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right column */}
                  <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>

                    {/* Production Data Hourly card */}
                    <div className="mfg-card">
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',paddingBottom:'12px',borderBottom:'1px solid #edeeef'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>bar_chart</span>
                          <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Production Data (Hourly)</h2>
                        </div>
                        <span style={{padding:'4px 12px',background:'#d0e1fb',color:'#54647a',borderRadius:'9999px',fontSize:'12px',fontWeight:600}}>Status: Logging</span>
                      </div>
                      <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
                          <thead>
                            <tr style={{background:'#f3f4f5'}}>
                              <th style={{padding:'10px 12px',textAlign:'left',fontWeight:600,fontSize:'12px',letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase',borderBottom:'1px solid #c3c6d1',whiteSpace:'nowrap',width:'40px'}}>Hr</th>
                              <th style={{padding:'10px 12px',textAlign:'left',fontWeight:600,fontSize:'12px',letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase',borderBottom:'1px solid #c3c6d1',whiteSpace:'nowrap'}}>Time</th>
                              <th style={{padding:'10px 12px',textAlign:'left',fontWeight:600,fontSize:'12px',letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase',borderBottom:'1px solid #c3c6d1'}}>Actual Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entryDraft.hourlyInputs.map((value, index) => (
                              <tr key={`hour-row-${index}`} style={{background:index % 2 === 0 ? '#ffffff' : '#f8f9fa'}}>
                                <td style={{padding:'6px 12px',borderBottom:'1px solid #edeeef',fontWeight:500,color:'#43474f',fontSize:'14px'}}>{index + 1}</td>
                                <td style={{padding:'6px 12px',borderBottom:'1px solid #edeeef',color:'#43474f',fontSize:'14px',whiteSpace:'nowrap'}}>{HOURLY_TIMES[index]}</td>
                                <td style={{padding:'4px 8px',borderBottom:'1px solid #edeeef'}}>
                                  <input
                                    className="mfg-input"
                                    style={{height:'36px',fontSize:'14px'}}
                                    inputMode="numeric"
                                    min="0"
                                    type="number"
                                    onChange={(e) => setHourlyValue(index, e.target.value)}
                                    value={value}
                                  />
                                </td>
                              </tr>
                            ))}
                            <tr style={{background:'#f3f4f5'}}>
                              <td colSpan={2} style={{padding:'10px 12px',borderTop:'2px solid #c3c6d1',fontSize:'14px',fontWeight:700,color:'#001e40'}}>Total</td>
                              <td style={{padding:'10px 12px',borderTop:'2px solid #c3c6d1',fontSize:'20px',fontWeight:700,color:'#001e40'}}>{calculated.totalProduction}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginTop:'16px'}}>
                        <div>
                          <label className="mfg-label" style={{color:'#93000a'}}>Reject Qty</label>
                          <input
                            className="mfg-input"
                            style={{borderColor:'#ffdad6'}}
                            inputMode="numeric"
                            min="0"
                            type="number"
                            onChange={(e) => setDraftField('rejectQty', Number(e.target.value || 0))}
                            value={entryDraft.rejectQty}
                          />
                        </div>
                        <div>
                          <label className="mfg-label" style={{color:'#723610'}}>Rework Qty</label>
                          <input
                            className="mfg-input"
                            style={{borderColor:'#ffdbca'}}
                            inputMode="numeric"
                            min="0"
                            type="number"
                            onChange={(e) => setDraftField('reworkQty', Number(e.target.value || 0))}
                            value={entryDraft.reworkQty}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Downtime & Performance card */}
                    <div className="mfg-card">
                      <div className="mfg-card-header">
                        <span className="material-symbols-outlined" style={{color:'#854d0e',fontSize:'20px'}}>warning</span>
                        <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Downtime &amp; Performance</h2>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                        <div>
                          <label className="mfg-label">Downtime Minutes</label>
                          <input
                            className="mfg-input"
                            inputMode="numeric"
                            min="0"
                            type="number"
                            onChange={(e) => setDraftField('downtimeMinutes', Number(e.target.value || 0))}
                            value={entryDraft.downtimeMinutes}
                          />
                        </div>
                        <SelectField label="Reason Code" options={optionsByKind('downtimeReason')} onChange={(v) => setDraftField('downtimeReasonId', v)} value={entryDraft.downtimeReasonId} />
                      </div>
                      {isOtherDowntimeSelected(entryDraft, optionsByKind('downtimeReason')) ? (
                        <div style={{marginBottom:'16px'}}>
                          <label className="mfg-label">Downtime Other Reason</label>
                          <input
                            className="mfg-input"
                            onChange={(e) => setDraftField('downtimeOtherText', e.target.value)}
                            value={entryDraft.downtimeOtherText}
                          />
                        </div>
                      ) : null}
                      <div style={{marginBottom:'24px'}}>
                        <label className="mfg-label">Remarks</label>
                        <textarea className="mfg-textarea" onChange={(e) => setDraftField('remarks', e.target.value)} rows={3} value={entryDraft.remarks} />
                      </div>
                      <div style={{padding:'16px',background:'#f3f4f5',borderRadius:'0.5rem',textAlign:'center'}}>
                        <div style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase',marginBottom:'8px'}}>Calculated Efficiency</div>
                        <div style={{fontSize:'48px',fontWeight:700,letterSpacing:'-0.02em',lineHeight:'56px',color:calculated.efficiencyPct>=90?'#166534':calculated.efficiencyPct>=70?'#854d0e':'#991b1b'}}>
                          {calculated.efficiencyPct}%
                        </div>
                        <div style={{display:'flex',justifyContent:'center',gap:'16px',marginTop:'12px',fontSize:'13px',color:'#43474f'}}>
                          <span>Net: <strong style={{color:'#191c1d'}}>{calculated.netProduction}</strong></span>
                          <span>Loss: <strong style={{color:'#991b1b'}}>{calculated.lossPct}%</strong></span>
                          <span>DT: <strong style={{color:'#854d0e'}}>{calculated.downtimePct}%</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center'}}>
                      <button className="btn-outline-mfg" onClick={clearRow} type="button">Clear Form</button>
                      <button className="btn-outline-mfg" onClick={saveDraft} type="button">Save Draft</button>
                      <button className="btn-outline-mfg" onClick={copyPreviousRow} type="button">Copy Previous</button>
                      <button className="btn-primary-mfg" onClick={() => saveEntry(false)} type="button">
                        <span className="material-symbols-outlined" style={{fontSize:'18px'}}>save</span>
                        Submit Log
                      </button>
                      <button className="btn-outline-mfg" onClick={undoLastChange} type="button">Undo</button>
                      <button className="btn-outline-mfg" onClick={clonePreviousDay} type="button">Clone Previous Day</button>
                      <span style={{fontSize:'13px',color:'#43474f',marginLeft:'4px'}}>Auto-save every 30 seconds</span>
                    </div>
                  </div>
                </div>

                {/* Submitted Entries */}
                <div className="mfg-card" style={{marginTop:'24px'}}>
                  <div className="mfg-card-header">
                    <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>table_view</span>
                    <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Submitted Entries (Inline Editable Grid)</h2>
                  </div>
                  <div style={{marginBottom:'16px'}}>
                    <input
                      className="mfg-input"
                      style={{maxWidth:'400px'}}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Edit reason (optional for critical fields)"
                      value={editReason}
                    />
                  </div>
                  <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                    <table style={{minWidth:'1100px',borderCollapse:'collapse',fontSize:'13px'}}>
                      <thead>
                        <tr style={{background:'#f3f4f5'}}>
                          <HeaderCell text="Date" />
                          <HeaderCell text="Status" />
                          <HeaderCell text="Planned" />
                          <HeaderCell text="H1" /><HeaderCell text="H2" /><HeaderCell text="H3" /><HeaderCell text="H4" />
                          <HeaderCell text="H5" /><HeaderCell text="H6" /><HeaderCell text="H7" /><HeaderCell text="H8" />
                          <HeaderCell text="H9" /><HeaderCell text="H10" /><HeaderCell text="H11" /><HeaderCell text="H12" />
                          <HeaderCell text="Reject" />
                          <HeaderCell text="Rework" />
                          <HeaderCell text="Downtime" />
                          <HeaderCell text="Efficiency" />
                          <HeaderCell text="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((row, rowIdx) => {
                          const isLocked = row.status === 'locked'
                          return (
                            <tr key={row._id} style={{background:isLocked?'#f3f4f5':rowIdx%2===0?'#ffffff':'#f8f9fa'}}>
                              <BodyCell>{row.date}</BodyCell>
                              <BodyCell>
                                <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 8px',borderRadius:'9999px',fontSize:'11px',fontWeight:600,background:row.status==='locked'?'#e7e8e9':row.status==='draft'?'#fef9c3':'#d0e1fb',color:row.status==='locked'?'#43474f':row.status==='draft'?'#854d0e':'#54647a'}}>
                                  {row.status === 'locked' ? '🔒' : row.status === 'draft' ? '📝' : '✅'} {row.status}
                                </span>
                              </BodyCell>
                              <BodyCell>{row.plannedQty}</BodyCell>
                              {(row.hourlyInputs || Array(12).fill(0)).map((value, idx) => (
                                <BodyCell key={`${row._id}-h-${idx}`}>
                                  <input
                                    className="mfg-input"
                                    style={{width:'60px',height:'32px',fontSize:'12px',padding:'0 6px'}}
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
                                <input className="mfg-input" style={{width:'60px',height:'32px',fontSize:'12px',padding:'0 6px'}} defaultValue={row.rejectQty} disabled={isLocked} onBlur={(e) => updateEntryInline(row._id, { rejectQty: Number(e.target.value || 0) })} type="number" />
                              </BodyCell>
                              <BodyCell>
                                <input className="mfg-input" style={{width:'60px',height:'32px',fontSize:'12px',padding:'0 6px'}} defaultValue={row.reworkQty} disabled={isLocked} onBlur={(e) => updateEntryInline(row._id, { reworkQty: Number(e.target.value || 0) })} type="number" />
                              </BodyCell>
                              <BodyCell>
                                <input className="mfg-input" style={{width:'60px',height:'32px',fontSize:'12px',padding:'0 6px'}} defaultValue={row.downtimeMinutes} disabled={isLocked} onBlur={(e) => updateEntryInline(row._id, { downtimeMinutes: Number(e.target.value || 0) })} type="number" />
                              </BodyCell>
                              <BodyCell>
                                <span style={{padding:'2px 8px',borderRadius:'9999px',fontSize:'12px',fontWeight:600,background:row.efficiencyPct>=90?'#dcfce7':row.efficiencyPct>=70?'#fef9c3':'#fee2e2',color:row.efficiencyPct>=90?'#166534':row.efficiencyPct>=70?'#854d0e':'#991b1b'}}>
                                  {row.efficiencyPct}%
                                </span>
                              </BodyCell>
                              <BodyCell>
                                <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                                  <button className="btn-outline-mfg" style={{height:'32px',padding:'0 10px',fontSize:'12px'}} onClick={() => setEditingRow(row)} type="button">
                                    <span className="material-symbols-outlined" style={{fontSize:'14px'}}>edit</span>
                                  </button>
                                  {canUseSupervisorViews && !isLocked ? (
                                    <button className="btn-outline-mfg" style={{height:'32px',padding:'0 10px',fontSize:'12px'}} onClick={() => lockEntry(row._id)} type="button">
                                      <span className="material-symbols-outlined" style={{fontSize:'14px'}}>lock</span>
                                    </button>
                                  ) : null}
                                  {canUseAdmin && isLocked ? (
                                    <button className="btn-outline-mfg" style={{height:'32px',padding:'0 10px',fontSize:'12px'}} onClick={() => unlockEntry(row._id)} type="button">
                                      <span className="material-symbols-outlined" style={{fontSize:'14px'}}>lock_open</span>
                                    </button>
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

            {/* ════════════════════════════════ REPORTS ════════════════════════════════ */}
            {activeTab === 'reports' ? (
              <section>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'16px'}}>
                  <div>
                    <h1 style={{fontSize:'32px',fontWeight:600,color:'#001e40',letterSpacing:'-0.01em',margin:0,lineHeight:'40px'}}>Production Analytics &amp; Reporting</h1>
                    <p style={{fontSize:'16px',color:'#43474f',margin:'4px 0 0'}}>
                      {reportFilters.from && reportFilters.to ? `${reportFilters.from} — ${reportFilters.to}` : reportFilters.date || 'All dates'}
                    </p>
                  </div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn-outline-mfg" onClick={exportReportExcel} disabled={reportData.length === 0} type="button">
                      <span className="material-symbols-outlined" style={{fontSize:'18px'}}>table_view</span>
                      Export to Excel
                    </button>
                    <button className="btn-primary-mfg" onClick={exportReportPdf} disabled={reportData.length === 0} type="button">
                      <span className="material-symbols-outlined" style={{fontSize:'18px'}}>picture_as_pdf</span>
                      Download PDF
                    </button>
                  </div>
                </div>

                <div className="mfg-card" style={{marginBottom:'24px'}}>
                  <div className="mfg-card-header">
                    <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>filter_list</span>
                    <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Filters</h2>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'16px',marginBottom:'16px'}}>
                    <div>
                      <label className="mfg-label">Report Type</label>
                      <select className="mfg-select" onChange={(e) => changeReportFilter('type', e.target.value)} value={reportFilters.type}>
                        {reportTypes.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                    {reportFilters.type === 'monitoring' ? (
                      <>
                        <div>
                          <label className="mfg-label">Date</label>
                          <input className="mfg-input" type="date" onChange={(e) => changeReportFilter('date', e.target.value)} value={reportFilters.date} />
                        </div>
                        <SelectField label="Department" options={optionsByKind('department')} onChange={(v) => changeReportFilter('departmentId', v)} value={reportFilters.departmentId} />
                        <SelectField label="Line" options={optionsByKind('line')} onChange={(v) => changeReportFilter('machineId', v)} value={reportFilters.machineId} />
                        <SelectField label="Shift" options={optionsByKind('shift')} onChange={(v) => changeReportFilter('shiftId', v)} value={reportFilters.shiftId} />
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="mfg-label">From Date</label>
                          <input className="mfg-input" type="date" onChange={(e) => changeReportFilter('from', e.target.value)} value={reportFilters.from} />
                        </div>
                        <div>
                          <label className="mfg-label">To Date</label>
                          <input className="mfg-input" type="date" onChange={(e) => changeReportFilter('to', e.target.value)} value={reportFilters.to} />
                        </div>
                        <SelectField label="Operator" options={optionsByKind('operator')} onChange={(v) => changeReportFilter('operatorId', v)} value={reportFilters.operatorId} />
                        <SelectField label="Machine" options={optionsByKind('machine')} onChange={(v) => changeReportFilter('machineId', v)} value={reportFilters.machineId} />
                      </>
                    )}
                  </div>
                  <button className="btn-primary-mfg" onClick={runReport} type="button">
                    <span className="material-symbols-outlined" style={{fontSize:'18px'}}>search</span>
                    Run Report
                  </button>
                </div>

                {reportData.length > 0 ? (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'16px',marginBottom:'24px'}}>
                    <div className="mfg-card">
                      <div style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase'}}>Total Records</div>
                      <div style={{fontSize:'32px',fontWeight:600,color:'#191c1d',marginTop:'4px'}}>{reportData.length}</div>
                    </div>
                    <div className="mfg-card">
                      <div style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase'}}>Total Planned</div>
                      <div style={{fontSize:'32px',fontWeight:600,color:'#191c1d',marginTop:'4px'}}>
                        {reportData.reduce((sum, r) => sum + (r.plannedQty || 0), 0)}
                      </div>
                    </div>
                    <div className="mfg-card">
                      <div style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase'}}>Avg Efficiency %</div>
                      {(() => {
                        const avg = reportData.reduce((sum, r) => sum + (r.efficiencyPct || 0), 0) / reportData.length
                        return (
                          <div style={{fontSize:'32px',fontWeight:600,marginTop:'4px',color:avg>=90?'#166534':avg>=70?'#854d0e':'#991b1b'}}>
                            {avg.toFixed(1)}%
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                ) : null}

                {reportData.length > 0 && reportFilters.type === 'monitoring' ? (
                  <div className="mfg-card">
                    <div className="mfg-card-header">
                      <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>table_chart</span>
                      <h3 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Production Monitoring Table — {reportFilters.date}</h3>
                    </div>
                    <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                      <table style={{minWidth:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                        <thead>
                          <tr style={{background:'#f3f4f5'}}>
                            <HeaderCell text="Line" />
                            <HeaderCell text="Machine" />
                            <HeaderCell text="Operator" />
                            <HeaderCell text="Process" />
                            <HeaderCell text="Shift" />
                            <HeaderCell text="Target" />
                            {Array.from({ length: 13 }, (_, i) => (
                              <HeaderCell key={`hr${i + 1}`} text={`H${i + 1}`} />
                            ))}
                            <HeaderCell text="Total" />
                            <HeaderCell text="Reject" />
                            <HeaderCell text="Rework" />
                            <HeaderCell text="DT(min)" />
                            <HeaderCell text="Reason" />
                            <HeaderCell text="Eff %" />
                            <HeaderCell text="Remarks" />
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.map((item, idx) => (
                            <tr key={idx} style={{background:idx%2===0?'#ffffff':'#f8f9fa'}}>
                              <BodyCell>{item.lineId?.name || 'N/A'}</BodyCell>
                              <BodyCell>{item.machineId?.name || 'N/A'}</BodyCell>
                              <BodyCell>{item.operatorId?.name || 'N/A'}</BodyCell>
                              <BodyCell>{item.processId?.name || 'N/A'}</BodyCell>
                              <BodyCell>{item.shiftId?.name || 'N/A'}</BodyCell>
                              <BodyCell><span style={{fontWeight:600,color:'#001e40'}}>{item.plannedQty}</span></BodyCell>
                              {(item.hourlyInputs || Array(13).fill(0)).map((val, i) => (
                                <BodyCell key={`h${i}`}>
                                  <span style={{color:val>0?'#166534':'#737780',fontWeight:val>0?600:400}}>{val || '—'}</span>
                                </BodyCell>
                              ))}
                              <BodyCell><span style={{fontWeight:600,color:'#166534'}}>{item.totalProduction || 0}</span></BodyCell>
                              <BodyCell><span style={{color:item.rejectQty>0?'#ba1a1a':'#191c1d'}}>{item.rejectQty}</span></BodyCell>
                              <BodyCell><span style={{color:item.reworkQty>0?'#723610':'#191c1d'}}>{item.reworkQty}</span></BodyCell>
                              <BodyCell><span style={{color:item.downtimeMinutes>0?'#ba1a1a':'#191c1d'}}>{item.downtimeMinutes}</span></BodyCell>
                              <BodyCell>{item.downtimeReasonId?.name || '—'}</BodyCell>
                              <BodyCell>
                                <span style={{padding:'2px 6px',borderRadius:'9999px',fontSize:'11px',fontWeight:600,background:(item.efficiencyPct||0)>=90?'#dcfce7':(item.efficiencyPct||0)>=70?'#fef9c3':'#fee2e2',color:(item.efficiencyPct||0)>=90?'#166534':(item.efficiencyPct||0)>=70?'#854d0e':'#991b1b'}}>
                                  {item.efficiencyPct || 0}%
                                </span>
                              </BodyCell>
                              <BodyCell>{item.remarks || '—'}</BodyCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {reportData.length > 0 && reportFilters.type !== 'monitoring' ? (
                  <div style={{display:'grid',gap:'24px'}} className="lg:grid-cols-2">
                    <div className="mfg-card">
                      <div className="mfg-card-header">
                        <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>bar_chart</span>
                        <h3 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Production Summary Chart</h3>
                      </div>
                      <div style={{height:'288px'}}>
                        <ResponsiveContainer>
                          <BarChart data={reportData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#edeeef" />
                            <XAxis dataKey="key" style={{fontSize:'12px'}} />
                            <YAxis style={{fontSize:'12px'}} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="plannedQty" fill="#b7c8e1" name="Planned" />
                            <Bar dataKey="netProduction" fill="#001e40" name="Net Production" />
                            <Bar dataKey="downtimeMinutes" fill="#d8885c" name="Downtime (min)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="mfg-card" style={{overflowX:'auto'}}>
                      <div className="mfg-card-header">
                        <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>table_view</span>
                        <h3 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Summary Table</h3>
                      </div>
                      <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                          <thead>
                            <tr style={{background:'#f3f4f5'}}>
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
                            {reportData.map((item, idx) => (
                              <tr key={item.key} style={{background:idx%2===0?'#ffffff':'#f8f9fa'}}>
                                <BodyCell><span style={{fontWeight:600}}>{item.key}</span></BodyCell>
                                <BodyCell>{item.records}</BodyCell>
                                <BodyCell>{item.plannedQty}</BodyCell>
                                <BodyCell>{item.totalProduction}</BodyCell>
                                <BodyCell><span style={{color:'#166534',fontWeight:600}}>{item.netProduction}</span></BodyCell>
                                <BodyCell><span style={{color:'#ba1a1a'}}>{item.rejectQty}</span></BodyCell>
                                <BodyCell><span style={{color:'#723610'}}>{item.reworkQty}</span></BodyCell>
                                <BodyCell><span style={{color:'#ba1a1a'}}>{item.downtimeMinutes}</span></BodyCell>
                                <BodyCell>
                                  <span style={{fontWeight:600,color:item.efficiencyPct>=90?'#166534':item.efficiencyPct>=70?'#854d0e':'#991b1b'}}>{item.efficiencyPct}%</span>
                                </BodyCell>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}

                {reportData.length === 0 ? (
                  <div className="mfg-card" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'64px 24px',textAlign:'center'}}>
                    <span className="material-symbols-outlined" style={{fontSize:'64px',color:'#c3c6d1',marginBottom:'16px'}}>insert_chart</span>
                    <p style={{fontSize:'18px',fontWeight:600,color:'#191c1d',margin:'0 0 8px'}}>Generate a report to view data</p>
                    <p style={{fontSize:'14px',color:'#43474f',margin:0}}>Select filters and click "Run Report" above</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* ════════════════════════════════ USERS ════════════════════════════════ */}
            {activeTab === 'users' && canUseAdmin ? (
              <section>
                <div style={{marginBottom:'24px'}}>
                  <h1 style={{fontSize:'32px',fontWeight:600,color:'#001e40',letterSpacing:'-0.01em',margin:0,lineHeight:'40px'}}>User Management</h1>
                  <p style={{fontSize:'16px',color:'#43474f',margin:'4px 0 0'}}>Manage system users and access roles</p>
                </div>

                <div className="mfg-card" style={{marginBottom:'24px'}}>
                  <div className="mfg-card-header">
                    <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>person_add</span>
                    <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Add New User</h2>
                  </div>
                  <form style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'16px'}} onSubmit={addUser}>
                    <TextInput label="Full Name" register={addUserForm.register('fullName')} />
                    <TextInput label="Employee ID" register={addUserForm.register('employeeId')} />
                    <TextInput label="Username" register={addUserForm.register('username')} />
                    <TextInput label="Password" register={addUserForm.register('password')} type="password" />
                    <div>
                      <label className="mfg-label">Role</label>
                      <select className="mfg-select" {...addUserForm.register('role')}>
                        <option value="admin">Admin</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="operator">Operator</option>
                      </select>
                    </div>
                    <div>
                      <label className="mfg-label">Assigned Department</label>
                      <select className="mfg-select" {...addUserForm.register('assignedDepartment')}>
                        <option value="">None</option>
                        {optionsByKind('department').map((item) => (
                          <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mfg-label">Status</label>
                      <select className="mfg-select" {...addUserForm.register('status')}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div style={{display:'flex',alignItems:'flex-end'}}>
                      <button className="btn-primary-mfg" type="submit">
                        <span className="material-symbols-outlined" style={{fontSize:'18px'}}>add</span>
                        Create User
                      </button>
                    </div>
                  </form>
                </div>

                <div className="mfg-card">
                  <div className="mfg-card-header">
                    <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>manage_accounts</span>
                    <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Users ({users.length})</h2>
                  </div>
                  <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
                      <thead>
                        <tr style={{background:'#f3f4f5'}}>
                          <HeaderCell text="Full Name" />
                          <HeaderCell text="Employee ID" />
                          <HeaderCell text="Username" />
                          <HeaderCell text="Role" />
                          <HeaderCell text="Status" />
                          <HeaderCell text="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((row, rowIdx) => (
                          <tr key={row.id} style={{background:rowIdx%2===0?'#ffffff':'#f8f9fa'}}>
                            <BodyCell>{row.fullName}</BodyCell>
                            <BodyCell>{row.employeeId}</BodyCell>
                            <BodyCell>{row.username}</BodyCell>
                            <BodyCell>
                              <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:'9999px',fontSize:'12px',fontWeight:600,background:row.role==='admin'?'#d5e3ff':row.role==='supervisor'?'#ffdbca':'#d0e1fb',color:row.role==='admin'?'#001b3c':row.role==='supervisor'?'#341100':'#54647a'}}>
                                {row.role}
                              </span>
                            </BodyCell>
                            <BodyCell>
                              {row.status === 'active' ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#d0e1fb] text-[#54647a] text-xs font-semibold">
                                  <span className="w-2 h-2 rounded-full bg-[#001e40] mr-2"></span> Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#e1e3e4] text-[#43474f] text-xs font-semibold">
                                  <span className="w-2 h-2 rounded-full bg-[#737780] mr-2"></span> Inactive
                                </span>
                              )}
                            </BodyCell>
                            <BodyCell>
                              <div style={{display:'flex',gap:'8px'}}>
                                <button className="btn-outline-mfg" style={{height:'32px',padding:'0 12px',fontSize:'12px'}} onClick={() => updateUserStatus(row.id, row.status === 'active' ? 'inactive' : 'active')} type="button">
                                  {row.status === 'active' ? 'Disable' : 'Enable'}
                                </button>
                                <button className="btn-outline-mfg" style={{height:'32px',padding:'0 12px',fontSize:'12px'}} onClick={() => resetPassword(row.id)} type="button">
                                  Reset Pwd
                                </button>
                              </div>
                            </BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {/* ════════════════════════════════ MASTER DATA ════════════════════════════════ */}
            {activeTab === 'master' && canUseAdmin ? (
              <section>
                <div style={{marginBottom:'24px'}}>
                  <h1 style={{fontSize:'32px',fontWeight:600,color:'#001e40',letterSpacing:'-0.01em',margin:0,lineHeight:'40px'}}>{masterTypeConfig[masterForm.kind]?.label} Management</h1>
                  <p style={{fontSize:'16px',color:'#43474f',margin:'4px 0 0'}}>{masterTypeConfig[masterForm.kind]?.description}</p>
                </div>

                <div style={{display:'flex',gap:'24px',alignItems:'flex-start'}}>
                  {/* Kind sidebar */}
                  <div className="hidden md:flex" style={{width:'200px',flexShrink:0,flexDirection:'column',gap:'2px'}}>
                    {masterKinds.map((kind) => (
                      <button
                        key={kind}
                        className={`nav-item${masterForm.kind === kind ? ' active' : ''}`}
                        onClick={() => { setMasterForm((prev) => ({ ...prev, kind, name: '', code: '', departmentId: '', lineId: '', machineId: '' })); setMasterSearch('') }}
                        type="button"
                        style={{justifyContent:'space-between'}}
                      >
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{masterTypeConfig[kind]?.label}</span>
                        <span style={{background:'#e7e8e9',borderRadius:'9999px',padding:'1px 8px',fontSize:'11px',fontWeight:600,color:'#43474f',flexShrink:0}}>
                          {(masters[kind] || []).length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Mobile kind selector */}
                  <div className="md:hidden" style={{marginBottom:'16px',width:'100%'}}>
                    <label className="mfg-label">Select Type</label>
                    <select
                      className="mfg-select"
                      onChange={(e) => { setMasterForm((prev) => ({ ...prev, kind: e.target.value, name: '', code: '', departmentId: '', lineId: '', machineId: '' })); setMasterSearch('') }}
                      value={masterForm.kind}
                    >
                      {masterKinds.map((kind) => (
                        <option key={kind} value={kind}>{masterTypeConfig[kind]?.label || kind}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:'24px',minWidth:0}}>
                    {/* Add form */}
                    <div className="mfg-card">
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',paddingBottom:'12px',borderBottom:'1px solid #edeeef',gap:'16px',flexWrap:'wrap'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>add_circle</span>
                          <h2 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>Add New {masterTypeConfig[masterForm.kind]?.label}</h2>
                        </div>
                        <label className="btn-outline-mfg" style={{cursor:'pointer'}}>
                          <span className="material-symbols-outlined" style={{fontSize:'18px'}}>upload_file</span>
                          Import Excel
                          <input style={{display:'none'}} onChange={importMasterExcel} type="file" />
                        </label>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'16px',marginBottom:'16px'}}>
                        {masterTypeConfig[masterForm.kind]?.fields.includes('name') ? (
                          <div>
                            <label className="mfg-label">{masterTypeConfig[masterForm.kind]?.displayFields?.name || 'Name'} *</label>
                            <input
                              className="mfg-input"
                              onChange={(e) => setMasterForm((prev) => ({ ...prev, name: e.target.value }))}
                              placeholder={`Enter ${masterTypeConfig[masterForm.kind]?.displayFields?.name || 'name'}`}
                              value={masterForm.name}
                            />
                          </div>
                        ) : null}
                        {masterTypeConfig[masterForm.kind]?.fields.includes('code') ? (
                          <div>
                            <label className="mfg-label">{masterTypeConfig[masterForm.kind]?.displayFields?.code || 'Code'}</label>
                            <input
                              className="mfg-input"
                              onChange={(e) => setMasterForm((prev) => ({ ...prev, code: e.target.value }))}
                              placeholder="Enter code"
                              value={masterForm.code}
                            />
                          </div>
                        ) : null}
                        {masterTypeConfig[masterForm.kind]?.fields.includes('departmentId') ? (
                          <div>
                            <label className="mfg-label">{masterTypeConfig[masterForm.kind]?.displayFields?.departmentId || 'Department'}</label>
                            <select className="mfg-select" onChange={(e) => setMasterForm((prev) => ({ ...prev, departmentId: e.target.value }))} value={masterForm.departmentId}>
                              <option value="">Select Department</option>
                              {(masters.department || []).map((item) => (
                                <option key={item._id} value={item._id}>{item.name} ({item.code})</option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        {masterTypeConfig[masterForm.kind]?.fields.includes('lineId') ? (
                          <div>
                            <label className="mfg-label">{masterTypeConfig[masterForm.kind]?.displayFields?.lineId || 'Line'}</label>
                            <select className="mfg-select" onChange={(e) => setMasterForm((prev) => ({ ...prev, lineId: e.target.value }))} value={masterForm.lineId}>
                              <option value="">Select Line</option>
                              {(masters.line || []).map((item) => (
                                <option key={item._id} value={item._id}>{item.name} ({item.code})</option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        {masterTypeConfig[masterForm.kind]?.fields.includes('machineId') ? (
                          <div>
                            <label className="mfg-label">{masterTypeConfig[masterForm.kind]?.displayFields?.machineId || 'Machine'}</label>
                            <select className="mfg-select" onChange={(e) => setMasterForm((prev) => ({ ...prev, machineId: e.target.value }))} value={masterForm.machineId}>
                              <option value="">Select Machine</option>
                              {(masters.machine || []).map((item) => (
                                <option key={item._id} value={item._id}>{item.name} ({item.code})</option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div>
                          <label className="mfg-label">Status</label>
                          <select className="mfg-select" onChange={(e) => setMasterForm((prev) => ({ ...prev, active: e.target.value === 'true' }))} value={String(masterForm.active)}>
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <button className="btn-primary-mfg" onClick={saveMasterItem} type="button">
                        <span className="material-symbols-outlined" style={{fontSize:'18px'}}>add</span>
                        Add {masterTypeConfig[masterForm.kind]?.label}
                      </button>
                    </div>

                    {/* Records table */}
                    <div className="mfg-card">
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',paddingBottom:'12px',borderBottom:'1px solid #edeeef',gap:'16px',flexWrap:'wrap'}}>
                        <h3 style={{fontSize:'16px',fontWeight:600,color:'#191c1d',margin:0}}>
                          {masterTypeConfig[masterForm.kind]?.label} Records ({filteredMasterRows.length})
                        </h3>
                        <div style={{position:'relative'}}>
                          <span className="material-symbols-outlined" style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',fontSize:'18px',color:'#737780',pointerEvents:'none'}}>search</span>
                          <input
                            className="mfg-input"
                            style={{paddingLeft:'40px',width:'260px'}}
                            onChange={(e) => setMasterSearch(e.target.value)}
                            placeholder="Search by name or code..."
                            value={masterSearch}
                          />
                        </div>
                      </div>
                      <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
                          <thead>
                            <tr style={{background:'#f3f4f5'}}>
                              {masterTypeConfig[masterForm.kind]?.tableColumns.includes('name') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.name || 'Name'} /> : null}
                              {masterTypeConfig[masterForm.kind]?.tableColumns.includes('code') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.code || 'Code'} /> : null}
                              {masterTypeConfig[masterForm.kind]?.tableColumns.includes('departmentId') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.departmentId || 'Department'} /> : null}
                              {masterTypeConfig[masterForm.kind]?.tableColumns.includes('lineId') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.lineId || 'Line'} /> : null}
                              {masterTypeConfig[masterForm.kind]?.tableColumns.includes('machineId') ? <HeaderCell text={masterTypeConfig[masterForm.kind]?.columnLabels?.machineId || 'Machine'} /> : null}
                              {masterTypeConfig[masterForm.kind]?.tableColumns.includes('active') ? <HeaderCell text="Status" /> : null}
                              <HeaderCell text="Actions" />
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMasterRows.map((item, rowIdx) => (
                              <tr key={item._id} style={{background:rowIdx%2===0?'#ffffff':'#f8f9fa'}}>
                                {masterTypeConfig[masterForm.kind]?.tableColumns.includes('name') ? <BodyCell>{item.name}</BodyCell> : null}
                                {masterTypeConfig[masterForm.kind]?.tableColumns.includes('code') ? <BodyCell>{item.code || '—'}</BodyCell> : null}
                                {masterTypeConfig[masterForm.kind]?.tableColumns.includes('departmentId') ? <BodyCell>{getParentName('department', item.departmentId)}</BodyCell> : null}
                                {masterTypeConfig[masterForm.kind]?.tableColumns.includes('lineId') ? <BodyCell>{getParentName('line', item.lineId)}</BodyCell> : null}
                                {masterTypeConfig[masterForm.kind]?.tableColumns.includes('machineId') ? <BodyCell>{getParentName('machine', item.machineId)}</BodyCell> : null}
                                {masterTypeConfig[masterForm.kind]?.tableColumns.includes('active') ? (
                                  <BodyCell>
                                    {item.active ? (
                                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#d0e1fb] text-[#54647a] text-xs font-semibold">
                                        <span className="w-2 h-2 rounded-full bg-[#001e40] mr-2"></span> Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#e1e3e4] text-[#43474f] text-xs font-semibold">
                                        <span className="w-2 h-2 rounded-full bg-[#737780] mr-2"></span> Inactive
                                      </span>
                                    )}
                                  </BodyCell>
                                ) : null}
                                <BodyCell>
                                  <div style={{display:'flex',gap:'8px'}}>
                                    <button className="btn-outline-mfg" style={{height:'32px',padding:'0 10px',fontSize:'12px',color:'#001e40',borderColor:'#001e40'}} onClick={() => toggleMasterActive(masterForm.kind, item)} type="button">
                                      <span className="material-symbols-outlined" style={{fontSize:'14px'}}>{item.active ? 'toggle_off' : 'toggle_on'}</span>
                                    </button>
                                    <button className="btn-outline-mfg" style={{height:'32px',padding:'0 10px',fontSize:'12px',color:'#ba1a1a',borderColor:'#ffdad6'}} onClick={() => deleteMasterItem(masterForm.kind, item._id)} type="button">
                                      <span className="material-symbols-outlined" style={{fontSize:'14px'}}>delete</span>
                                    </button>
                                  </div>
                                </BodyCell>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {/* ════════════════════════════════ AUDIT LOGS ════════════════════════════════ */}
            {activeTab === 'audit' && canUseSupervisorViews ? (
              <section>
                <div style={{marginBottom:'24px'}}>
                  <h1 style={{fontSize:'32px',fontWeight:600,color:'#001e40',letterSpacing:'-0.01em',margin:0,lineHeight:'40px'}}>Audit Logs</h1>
                  <p style={{fontSize:'16px',color:'#43474f',margin:'4px 0 0'}}>System activity and edit history</p>
                </div>
                <div className="mfg-card">
                  <div className="custom-scrollbar" style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                      <thead>
                        <tr style={{background:'#f3f4f5'}}>
                          <HeaderCell text="Time" />
                          <HeaderCell text="Action" />
                          <HeaderCell text="Entity" />
                          <HeaderCell text="Entity ID" />
                          <HeaderCell text="Metadata" />
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log, logIdx) => (
                          <tr key={log._id} style={{background:logIdx%2===0?'#ffffff':'#f8f9fa'}}>
                            <BodyCell>{new Date(log.createdAt).toLocaleString()}</BodyCell>
                            <BodyCell>
                              <span style={{padding:'2px 8px',borderRadius:'9999px',fontSize:'11px',fontWeight:600,background:'#d0e1fb',color:'#54647a'}}>{log.action}</span>
                            </BodyCell>
                            <BodyCell>{log.entity}</BodyCell>
                            <BodyCell><code style={{fontSize:'12px',color:'#43474f'}}>{log.entityId}</code></BodyCell>
                            <BodyCell><code style={{fontSize:'11px',color:'#43474f',wordBreak:'break-all'}}>{JSON.stringify(log.metadata)}</code></BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

          </div>
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <div className="lg:hidden" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:30,background:'#ffffff',borderTop:'1px solid #c3c6d1',display:'flex',justifyContent:'space-around',padding:'6px 0'}}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            type="button"
            style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',padding:'4px 8px',background:'none',border:'none',color:activeTab===item.id?'#54647a':'#43474f',cursor:'pointer',minWidth:0}}
          >
            <span className="material-symbols-outlined" style={{fontSize:'22px',fontVariationSettings:activeTab===item.id?"'FILL' 1":"'FILL' 0"}}>{item.icon}</span>
            <span style={{fontSize:'10px',fontWeight:activeTab===item.id?600:400}}>{item.label}</span>
          </button>
        ))}
      </div>

    </div>
  )
}

function HeaderCell({ text }) {
  return (
    <th style={{padding:'10px 12px',textAlign:'left',fontWeight:600,fontSize:'12px',letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase',borderBottom:'1px solid #c3c6d1',whiteSpace:'nowrap'}}>
      {text}
    </th>
  )
}

function BodyCell({ children, className = '' }) {
  return (
    <td className={className} style={{padding:'10px 12px',borderBottom:'1px solid #edeeef',verticalAlign:'top',color:'#191c1d'}}>
      {children}
    </td>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mfg-label">{label}</label>
      <select className="mfg-select" onChange={(e) => onChange(e.target.value)} value={value || ''}>
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
    <div style={{background:'#f3f4f5',borderRadius:'0.25rem',padding:'12px 16px',border:'1px solid #edeeef'}}>
      <p style={{fontSize:'12px',fontWeight:600,letterSpacing:'0.05em',color:'#43474f',textTransform:'uppercase',margin:'0 0 4px'}}>{label}</p>
      <p className={className} style={{fontSize:'24px',fontWeight:700,color:'#191c1d',margin:0}}>{value}</p>
    </div>
  )
}

function TextInput({ label, register, type = 'text' }) {
  return (
    <div>
      <label className="mfg-label">{label}</label>
      <input className="mfg-input" type={type} {...register} />
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
    <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'flex-end',background:'rgba(0,0,0,0.35)',padding:'16px'}}>
      <div className="mfg-card" style={{width:'100%',maxWidth:'480px',boxShadow:'0 8px 32px rgba(0,0,0,0.15)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px',paddingBottom:'12px',borderBottom:'1px solid #edeeef'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span className="material-symbols-outlined" style={{color:'#3a5f94',fontSize:'20px'}}>edit_note</span>
            <h3 style={{fontSize:'18px',fontWeight:600,color:'#191c1d',margin:0}}>Edit Row</h3>
          </div>
          <button className="btn-outline-mfg" style={{height:'36px',padding:'0 12px'}} onClick={onClose} type="button">
            <span className="material-symbols-outlined" style={{fontSize:'18px'}}>close</span>
          </button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
          <div>
            <label className="mfg-label">Planned Qty</label>
            <input className="mfg-input" type="number" onChange={(e) => setForm((prev) => ({ ...prev, plannedQty: Number(e.target.value || 0) }))} value={form.plannedQty} />
          </div>
          <div>
            <label className="mfg-label">Reject Qty</label>
            <input className="mfg-input" type="number" onChange={(e) => setForm((prev) => ({ ...prev, rejectQty: Number(e.target.value || 0) }))} value={form.rejectQty} />
          </div>
          <div>
            <label className="mfg-label">Rework Qty</label>
            <input className="mfg-input" type="number" onChange={(e) => setForm((prev) => ({ ...prev, reworkQty: Number(e.target.value || 0) }))} value={form.reworkQty} />
          </div>
          <div>
            <label className="mfg-label">Downtime Minutes</label>
            <input className="mfg-input" type="number" onChange={(e) => setForm((prev) => ({ ...prev, downtimeMinutes: Number(e.target.value || 0) }))} value={form.downtimeMinutes} />
          </div>
          <div>
            <label className="mfg-label">Remarks</label>
            <textarea className="mfg-textarea" onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} rows={3} value={form.remarks} />
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'24px',paddingTop:'16px',borderTop:'1px solid #edeeef'}}>
          <button className="btn-outline-mfg" onClick={onClose} type="button">Cancel</button>
          <button className="btn-primary-mfg" onClick={() => onSave(form)} type="button">
            <span className="material-symbols-outlined" style={{fontSize:'18px'}}>save</span>
            Save Row
          </button>
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-3 md:px-6">
          <h1 className="mr-auto text-sm font-semibold md:text-lg">Smart Production Monitoring System</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs capitalize dark:bg-slate-800">
            {user.role}
          </span>
          <button className="btn-muted" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} type="button">
            {theme === 'light' ? 'Dark' : 'Light'} Mode
          </button>
          <button className="btn-muted" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 pb-3 md:px-6">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'entry', label: 'Data Entry' },
            { id: 'reports', label: 'Reports' },
            ...(canUseAdmin ? [{ id: 'users', label: 'Users' }, { id: 'master', label: 'Master Data' }] : []),
            ...(canUseSupervisorViews ? [{ id: 'audit', label: 'Audit Logs' }] : []),
          ].map((tab) => (
            <button
              className={`btn ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-3 md:p-6">
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
          <section className="grid gap-4">
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
                <table className="min-w-[1100px] text-xs">
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
                    <SelectField label="Line" options={optionsByKind('line')} onChange={(v) => changeReportFilter('machineId', v)} value={reportFilters.machineId} />
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
                <button className="btn-muted" onClick={exportReportExcel} disabled={reportData.length === 0} type="button">
                  📊 Export Excel (.xlsx)
                </button>
                <button className="btn-muted" onClick={exportReportPdf} disabled={reportData.length === 0} type="button">
                  📄 Export PDF
                </button>
              </div>
            </div>

            {/* Production Monitoring Table - Show if data exists */}
            {reportData.length > 0 && reportFilters.type === 'monitoring' ? (
              <div className="card overflow-x-auto">
                <h3 className="mb-3 text-sm font-semibold">
                  Production Monitoring Table - {reportFilters.date}
                </h3>
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-200 dark:bg-slate-800">
                      <HeaderCell text="Line" />
                      <HeaderCell text="Machine" />
                      <HeaderCell text="Operator" />
                      <HeaderCell text="Process" />
                      <HeaderCell text="Shift" />
                      <HeaderCell text="Target" />
                      {Array.from({ length: 13 }, (_, i) => (
                        <HeaderCell key={`hr${i + 1}`} text={`H${i + 1}`} />
                      ))}
                      <HeaderCell text="Total" />
                      <HeaderCell text="Reject" />
                      <HeaderCell text="Rework" />
                      <HeaderCell text="DT(min)" />
                      <HeaderCell text="Reason" />
                      <HeaderCell text="Eff %" />
                      <HeaderCell text="Remarks" />
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800'}>
                        <BodyCell>{item.lineId?.name || 'N/A'}</BodyCell>
                        <BodyCell>{item.machineId?.name || 'N/A'}</BodyCell>
                        <BodyCell>{item.operatorId?.name || 'N/A'}</BodyCell>
                        <BodyCell>{item.processId?.name || 'N/A'}</BodyCell>
                        <BodyCell>{item.shiftId?.name || 'N/A'}</BodyCell>
                        <BodyCell className="font-semibold text-blue-600">{item.plannedQty}</BodyCell>
                        {(item.hourlyInputs || Array(13).fill(0)).map((val, i) => (
                          <BodyCell key={`h${i}`} className={val > 0 ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-gray-400'}>
                            {val || '-'}
                          </BodyCell>
                        ))}
                        <BodyCell className="font-semibold text-green-600">{item.totalProduction || 0}</BodyCell>
                        <BodyCell className={item.rejectQty > 0 ? 'text-red-600 font-semibold' : ''}>{item.rejectQty}</BodyCell>
                        <BodyCell className={item.reworkQty > 0 ? 'text-orange-600 font-semibold' : ''}>{item.reworkQty}</BodyCell>
                        <BodyCell className={item.downtimeMinutes > 0 ? 'text-red-700 font-semibold' : ''}>{item.downtimeMinutes}</BodyCell>
                        <BodyCell>{item.downtimeReasonId?.name || '-'}</BodyCell>
                        <BodyCell className="font-semibold">{item.efficiencyPct || 0}%</BodyCell>
                        <BodyCell className="text-xs">{item.remarks || '-'}</BodyCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                        <XAxis dataKey="key" />
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
                          <BodyCell className="font-semibold">{item.key}</BodyCell>
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
  )
}

function HeaderCell({ text }) {
  return <th className="border-b border-slate-300 p-2 text-left font-semibold dark:border-slate-700">{text}</th>
}

function BodyCell({ children }) {
  return <td className="border-b border-slate-200 p-2 align-top dark:border-slate-800">{children}</td>
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
