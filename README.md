# Smart Production Monitoring System

A full-stack production monitoring web application for manufacturing teams to replace Excel-based entry with a structured, role-based system.

## ✅ Implemented Features

### 1) User Roles & Authentication
- Role-based auth with **Admin**, **Supervisor**, and **Operator**
- Username/password login with JWT
- Admin user auto-seeded on backend startup
- Role-based route and action control in frontend and backend

### 2) Admin User Management
- Create users with:
  - Full Name
  - Employee ID
  - Username
  - Password
  - Role
  - Assigned Department
  - Status
- Disable/enable users
- Reset user passwords

### 3) Master Data Management
Admin can manage dropdown masters:
- Shift Types
- Departments
- Lines
- Machines
- Processes
- Operators
- Products
- Defect Types
- Downtime Reasons

Actions:
- Add
- Edit (status and values)
- Delete
- Activate/Deactivate
- Import master rows from Excel file

Default seeded values include:
- Shifts: Morning, Evening, Night
- Downtime Reasons: Power Failure, Machine Breakdown, Maintenance, Material Delay, Operator Break, Quality Issue, Other

### 4) Dependent Dropdowns
- **Line → Machines**
- **Machine → Processes**
- **Department → Operators**

### 5) Daily Production Entry
- Date picker
- Shift, Department, Line, Machine, Process, Operator, Product dropdowns
- Planned Qty
- Hour 1 to Hour 12 numeric inputs
- Reject Qty, Rework Qty, Downtime Minutes
- Downtime Reason dropdown
- "Other" downtime text input when reason is Other
- Remarks

### 6) Auto Calculations
Automatically computed:
- Total Production
- Net Production
- Efficiency %
- Loss %
- Downtime %

Formula:
- Net = Total - Reject - Rework
- Efficiency = (Net / Target) × 100

Visual highlights:
- Green / Yellow / Red based on efficiency bands

### 7) Editable Data Entry Experience
- Spreadsheet-like editable grid
- Inline cell edit on submitted rows
- Row edit mode in side modal
- Numeric keypad support via `inputMode="numeric"`
- Horizontal scrolling support for hourly columns (mobile-friendly)
- Quick actions:
  - Copy previous row
  - Duplicate shift entry
  - Undo last change
  - Clear row
  - Save draft
  - Save changes
- Auto-save draft every 30 seconds
- Save status indicators (Saving / Saved / Error)
- Change tracking:
  - Field changes
  - Old/New values
  - Edited by
  - Edit timestamp
  - Optional edit reason
- Record locking:
  - Supervisor/Admin can lock
  - Admin can unlock finalized records
- Visual indicators:
  - Edited cell highlight
  - Lock icon for locked rows
  - Draft icon for draft rows

### 8) Reports
- Daily report
- Line-wise report
- Operator-wise report
- Machine-wise report
- Shift-wise report
- Date range report

Filters:
- Date
- From / To
- Shift
- Operator
- Machine
- Department

### 9) Export Features
- Excel export (`.xlsx`) using **ExcelJS**
- PDF export using **pdf-lib**

### 10) Dashboard & Bonus Features
- Dashboard cards for entries, masters, users
- Missed entry notification panel for Supervisor/Admin
- Clone previous day setup
- Audit log view for edits and actions
- Recharts-based report visualization
- Dark/Light mode toggle

---

## Tech Stack

### Frontend
- React + Vite
- Tailwind CSS
- React Hook Form + Zod
- Recharts
- ExcelJS (Excel export)
- pdf-lib (PDF export)

### Backend
- Node.js + Express API
- MongoDB (Mongoose)
- JWT auth + bcrypt password hashing

---

## Environment Variables

### Backend (`server/.env`)
```env
PORT=5000
MONGODB_URI=mongodb+srv://akshat:akshat@testcluster.vsuz8.mongodb.net/?appName=lineops
MONGODB_DB_NAME=lineops
FRONTEND_URL=http://localhost:5173
JWT_SECRET=replace_with_secure_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123
```

### Frontend (`client/.env`)
```env
VITE_API_BASE_URL=http://localhost:5000
```

---

## Run Locally

### 1) Backend
```bash
cd /home/runner/work/LineOps/LineOps/server
npm install
npm run start
```

### 2) Frontend
```bash
cd /home/runner/work/LineOps/LineOps/client
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and connects to backend at `http://localhost:5000`.

---

## Notes
- This project is mobile-first and desktop-friendly.
- Role restrictions are enforced both in UI and API.
- Exports are generated from report data directly in frontend.
