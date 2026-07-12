<style>
body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12pt;
  line-height: 1.5;
  text-align: justify;
}
h1 {
  font-size: 16pt;
  text-align: center;
  page-break-before: always;
}
h2, h3, h4 {
  font-size: 14pt;
}
</style>

# APPENDIX

## A.1 System Installation and Deployment
The LineOps system is configured as a decoupled web application. The frontend client builds into static HTML/JS/CSS assets via Vite, and the backend Express server operates as a stateless API service.

### A.1.1 Installation Prerequisites
- **Runtime Environment**: Node.js (v18.x or later) and npm (v9.x or later) installed locally.
- **Database Server**: MongoDB Community Server installed locally (port 27017) or a MongoDB Atlas cloud instance.

### A.1.2 Backend Deployment Steps
1. Navigate to the server folder:
   ```bash
   cd server
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` configuration file in the server root:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB_NAME=lineops
   FRONTEND_URL=http://localhost:5173
   JWT_SECRET=production_secure_jwt_token_secret_key_123!
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=Admin@123
   ```
4. Start the server (deploys database seed data and runs synchronization on startup):
   ```bash
   npm start
   ```

### A.1.3 Frontend Deployment Steps
1. Navigate to the client folder:
   ```bash
   cd client
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the client root:
   ```env
   VITE_API_BASE_URL=http://localhost:5000
   ```
4. Run the local Vite development server:
   ```bash
   npm run dev
   ```
5. Building the production bundle:
   ```bash
   npm run build
   ```
   *(This outputs static assets to `client/dist`, ready to be served by web engines like Nginx or Apache).*

---

## A.2 Complete Rest API Endpoint Listing
Table A.1 lists the REST API routes available in the LineOps Express application.

### Table A.1: API Endpoints Reference
| HTTP Method | Route Endpoint | Role Required | Description |
|---|---|---|---|
| **POST** | `/api/auth/login` | Public | Validates credentials; returns signed JWT. |
| **GET** | `/api/auth/me` | Operator, Supervisor, Admin | Returns current authenticated user object. |
| **GET** | `/api/users` | Admin | Lists all user accounts registered in database. |
| **POST** | `/api/users` | Admin | Creates a user account with role/department. |
| **PUT** | `/api/users/:id` | Admin | Updates user properties (role, lines, status). |
| **POST** | `/api/users/:id/reset-password` | Admin | Resets target user's password. |
| **GET** | `/api/master/:kind` | Operator, Supervisor, Admin | Retrieves active master items (shifts, lines, etc.). |
| **POST** | `/api/master/:kind` | Admin | Creates a master item. |
| **PUT** | `/api/master/:kind/:id` | Admin | Updates a master item's fields or active status. |
| **DELETE** | `/api/master/:kind/:id` | Admin | Deletes a master item. |
| **POST** | `/api/master/import` | Admin | Bulk-imports master records via JSON array. |
| **GET** | `/api/entries` | Operator, Supervisor, Admin | Lists production logs matching filters (date, line). |
| **POST** | `/api/entries` | Operator, Supervisor, Admin | Creates a production entry document. |
| **PUT** | `/api/entries/:id` | Operator, Supervisor, Admin | Edits entry details and appends to `editLogs`. |
| **DELETE** | `/api/entries/:id` | Admin | Deletes a production entry document. |
| **POST** | `/api/entries/:id/lock` | Admin | Locks entry to prevent further modifications. |
| **POST** | `/api/entries/:id/unlock` | Admin | Unlocks entry to allow corrections. |
| **POST** | `/api/entries/clone-previous` | Operator, Supervisor, Admin | Clones previous-day setup for current date. |
| **GET** | `/api/reports` | Operator, Supervisor, Admin | Retrieves aggregated monitoring report. |
| **GET** | `/api/audit-logs` | Supervisor, Admin | Retrieves system audit trails. |
| **GET** | `/api/notifications/missed-entries` | Supervisor, Admin | Identifies active operators with missing entries today. |

---

## A.3 Critical Code Snippets

### A.3.1 KPI Metrics Calculations (`server/src/utils/helpers.js`)
```javascript
export const calculateMetrics = (entry) => {
  const totalProduction = (entry.hourlyInputs || []).reduce((sum, n) => sum + Number(n || 0), 0);
  const netProduction = Math.max(
    totalProduction - Number(entry.rejectQty || 0) - Number(entry.reworkQty || 0),
    0
  );
  const target = Number(entry.plannedQty || 0);
  const efficiencyPct = target > 0 ? (netProduction / target) * 100 : 0;
  const lossPct = target > 0 ? ((target - netProduction) / target) * 100 : 0;
  const downtimePct = 720 > 0 ? (Number(entry.downtimeMinutes || 0) / 720) * 100 : 0;
  
  return {
    totalProduction,
    netProduction,
    efficiencyPct: Number(efficiencyPct.toFixed(2)),
    lossPct: Number(lossPct.toFixed(2)),
    downtimePct: Number(downtimePct.toFixed(2)),
  };
};
```

### A.3.2 Production Entry Schema with Audit Log (`server/src/models/index.js`)
```javascript
export const editLogSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

export const productionEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    processId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    plannedQty: { type: Number, required: true, min: 0 },
    hourlyInputs: {
      type: [Number],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 12,
        message: 'hourlyInputs must contain 12 values',
      },
      required: true,
    },
    rejectQty: { type: Number, default: 0, min: 0 },
    reworkQty: { type: Number, default: 0, min: 0 },
    downtimeMinutes: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['draft', 'submitted', 'locked'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editLogs: [editLogSchema],
    totalProduction: { type: Number, default: 0 },
    netProduction: { type: Number, default: 0 },
    efficiencyPct: { type: Number, default: 0 },
    lossPct: { type: Number, default: 0 },
    downtimePct: { type: Number, default: 0 },
  },
  { timestamps: true }
);
```

### A.3.3 API Update Route with Audit Check (`server/src/routes/entries.js`)
```javascript
router.put('/:id', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
  const entry = await ProductionEntry.findById(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found.' });

  if (!canEditEntry(req.user, entry)) {
    return res.status(403).json({ error: 'You cannot edit this entry.' });
  }

  const editableFields = ['plannedQty', 'hourlyInputs', 'rejectQty', 'reworkQty', 'downtimeMinutes', 'remarks', 'status'];
  const editReason = req.body.editReason || '';
  const changedFields = [];

  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      const oldValue = entry[field];
      const newValue = req.body[field];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        entry[field] = newValue;
        changedFields.push(field);
        entry.editLogs.push({
          field,
          oldValue,
          newValue,
          editedBy: req.user._id,
          editedAt: new Date(),
          reason: editReason,
        });
      }
    }
  });

  if (changedFields.length > 0) {
    entry.updatedBy = req.user._id;
    Object.assign(entry, calculateMetrics(entry));
    await entry.save();
    await recordAudit(req.user._id, 'update', 'entry', entry._id, { changedFields, editReason });
  }

  return res.json(entry);
});
```
