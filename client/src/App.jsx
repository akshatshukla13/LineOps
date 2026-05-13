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
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

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

const reportTypes = [
  { value: 'daily', label: 'Daily Report' },
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
    const worksheet = workbook.addWorksheet('Production Report')
    worksheet.columns = [
      { header: 'Key', key: 'key', width: 20 },
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

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lineops-report-${Date.now()}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportReportPdf = async () => {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([842, 595])
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    page.drawText('Smart Production Monitoring Report', {
      x: 30,
      y: 560,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })

    let y = 535
    reportData.slice(0, 25).forEach((row) => {
      page.drawText(
        `${row.key} | Rec:${row.records} | Plan:${row.plannedQty} | Net:${row.netProduction} | Eff:${row.efficiencyPct}%`,
        {
          x: 30,
          y,
          size: 10,
          font,
          color: rgb(0.2, 0.2, 0.2),
        },
      )
      y -= 18
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

  if (!token || !user) {
    return (
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
            <button className="btn-primary w-full" type="submit">Sign In</button>
          </form>
          {statusText ? <p className="text-xs text-emerald-600">{statusText}</p> : null}
          {errorText ? <p className="text-xs text-rose-600">{errorText}</p> : null}
        </div>
      </div>
    )
  }

  const selectedMasterRows = optionsByKind(masterForm.kind)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
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
            <div className="card">
              <h2 className="mb-3 text-base font-semibold">Reports & Exports</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Report Type</label>
                  <select className="select" onChange={(e) => changeReportFilter('type', e.target.value)} value={reportFilters.type}>
                    {reportTypes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Date</label>
                  <input className="input" onChange={(e) => changeReportFilter('date', e.target.value)} type="date" value={reportFilters.date} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">From</label>
                  <input className="input" onChange={(e) => changeReportFilter('from', e.target.value)} type="date" value={reportFilters.from} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">To</label>
                  <input className="input" onChange={(e) => changeReportFilter('to', e.target.value)} type="date" value={reportFilters.to} />
                </div>
                <SelectField label="Shift" options={optionsByKind('shift')} onChange={(v) => changeReportFilter('shiftId', v)} value={reportFilters.shiftId} />
                <SelectField label="Operator" options={optionsByKind('operator')} onChange={(v) => changeReportFilter('operatorId', v)} value={reportFilters.operatorId} />
                <SelectField label="Machine" options={optionsByKind('machine')} onChange={(v) => changeReportFilter('machineId', v)} value={reportFilters.machineId} />
                <SelectField label="Department" options={optionsByKind('department')} onChange={(v) => changeReportFilter('departmentId', v)} value={reportFilters.departmentId} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={runReport} type="button">Generate Report</button>
                <button className="btn-muted" onClick={exportReportExcel} type="button">Export Excel (.xlsx)</button>
                <button className="btn-muted" onClick={exportReportPdf} type="button">Export PDF</button>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-2 text-base font-semibold">Report Chart</h3>
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
                    <Bar dataKey="downtimeMinutes" fill="#f97316" name="Downtime" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-200 dark:bg-slate-800">
                    <HeaderCell text="Key" />
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
                      <BodyCell>{item.key}</BodyCell>
                      <BodyCell>{item.records}</BodyCell>
                      <BodyCell>{item.plannedQty}</BodyCell>
                      <BodyCell>{item.totalProduction}</BodyCell>
                      <BodyCell>{item.netProduction}</BodyCell>
                      <BodyCell>{item.rejectQty}</BodyCell>
                      <BodyCell>{item.reworkQty}</BodyCell>
                      <BodyCell>{item.downtimeMinutes}</BodyCell>
                      <BodyCell>{item.efficiencyPct}</BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <div className="card">
              <h2 className="mb-3 text-base font-semibold">Master Data Management</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Master Type</label>
                  <select
                    className="select"
                    onChange={(e) => setMasterForm((prev) => ({ ...prev, kind: e.target.value }))}
                    value={masterForm.kind}
                  >
                    {masterKinds.map((kind) => (
                      <option key={kind} value={kind}>{kind}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Name</label>
                  <input className="input" onChange={(e) => setMasterForm((prev) => ({ ...prev, name: e.target.value }))} value={masterForm.name} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Code</label>
                  <input className="input" onChange={(e) => setMasterForm((prev) => ({ ...prev, code: e.target.value }))} value={masterForm.code} />
                </div>
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

                <SelectField
                  label="Parent Department"
                  options={optionsByKind('department')}
                  onChange={(v) => setMasterForm((prev) => ({ ...prev, departmentId: v }))}
                  value={masterForm.departmentId}
                />
                <SelectField
                  label="Parent Line"
                  options={optionsByKind('line')}
                  onChange={(v) => setMasterForm((prev) => ({ ...prev, lineId: v }))}
                  value={masterForm.lineId}
                />
                <SelectField
                  label="Parent Machine"
                  options={optionsByKind('machine')}
                  onChange={(v) => setMasterForm((prev) => ({ ...prev, machineId: v }))}
                  value={masterForm.machineId}
                />
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
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-200 dark:bg-slate-800">
                    <HeaderCell text="Name" />
                    <HeaderCell text="Code" />
                    <HeaderCell text="Active" />
                    <HeaderCell text="Department" />
                    <HeaderCell text="Line" />
                    <HeaderCell text="Machine" />
                    <HeaderCell text="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {selectedMasterRows.map((item) => (
                    <tr key={item._id}>
                      <BodyCell>{item.name}</BodyCell>
                      <BodyCell>{item.code || '-'}</BodyCell>
                      <BodyCell>{item.active ? 'Yes' : 'No'}</BodyCell>
                      <BodyCell>{item.departmentId || '-'}</BodyCell>
                      <BodyCell>{item.lineId || '-'}</BodyCell>
                      <BodyCell>{item.machineId || '-'}</BodyCell>
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
