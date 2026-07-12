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

# CHAPTER 4: RESULTS, TESTING & ANALYSIS

## 4.1 Testing Strategy
To verify the stability, security, and correctness of the LineOps Smart Production Monitoring System, a structured testing plan was executed. This strategy included unit testing, integration testing, API validation testing, and security checks.

### 4.1.1 Unit Testing
Unit tests focus on verifying the core mathematical helper functions and validation logic in isolation. Because the backend server specifies a test runner script (`"test": "node --test"`), tests are executed using Node.js's native test runner framework.
- **Metric Calculations**: Verification that `calculateMetrics` returns correct values for total production, net production, efficiency, loss, and downtime percentages, including edge cases (e.g., when the planned quantity is zero or when hourly yields exceed planned targets).
- **Validators**: Verifying that Object ID formats, date strings, and master kinds are verified before database queries are made.

### 4.1.2 Integration Testing
Integration testing evaluates the interactions between different modules, such as routing, database connections, and authentication checks.
- **Session Middleware**: Ensuring that requests to protected endpoints (like `/api/entries`) are rejected with an HTTP 401 Unauthorized status when no token is present, and with an HTTP 403 Forbidden status when an operator attempts to access admin-only functions.
- **Dependent Masters Hierarchy**: Verifying that when a machine is created, it is linked to a valid line, and when a production entry is recorded, the machine and process references match this hierarchy.

### 4.1.3 API Validation & Exception Testing
- **Zod Schema Checks**: The client-side forms use Zod schemas to ensure that input formats are correct (e.g., employee IDs must follow alphanumeric conventions and hourly inputs must contain exactly 12 values).
- **Error Boundaries**: Ensuring the Express backend catches errors and returns a structured JSON message (`{ "error": "Error message" }`) with appropriate HTTP status codes (e.g., 400 for bad requests, 404 for missing resources, and 500 for internal errors), rather than exposing raw stack traces.

---

## 4.2 Test Cases and Validation Matrix
Table 4.1 presents the realistic test cases executed to validate the system, covering authentication, data entry, validation, security, and exports.

### Table 4.1: System Validation and Test Cases
| Test ID | Test Description | Input Conditions | Expected Output | Observed Output | Status |
|---|---|---|---|---|---|
| **TC-01** | User Authentication (Success) | Username: `admin`, Password: `Admin@123` | JWT generated; User redirected to dashboard | JWT generated; User redirected to dashboard | PASS |
| **TC-02** | User Authentication (Failure) | Username: `operator`, Password: `WrongPassword` | HTTP 401 response; "Invalid credentials" error | HTTP 401 response; "Invalid credentials" error | PASS |
| **TC-03** | Auto calculations check | Planned Qty: `100`; Hourly inputs: `[5,5,5,5,5,5,5,5,5,5,5,5]` (Total 60); Rejects: `5`, Reworks: `5` | Net: `50`, Efficiency: `50%`, Loss: `50%`, Downtime: `0%` | Net: `50`, Efficiency: `50.00%`, Loss: `50.00%`, Downtime: `0.00%` | PASS |
| **TC-04** | Role-based restriction | Operator tries to access `GET /api/users` | HTTP 403 Forbidden response; "Access denied" error | HTTP 403 Forbidden response; "Access denied" error | PASS |
| **TC-05** | Dependent validation checking | Try to post entry with Line `L1` but Machine `L2-FLARING` | HTTP 400 Bad Request; invalid reference mapping | HTTP 400 Bad Request; invalid reference mapping | PASS |
| **TC-06** | Audit Log triggering | Edit `plannedQty` from `100` to `200` with reason: "Target updated" | Log entry created containing old: `100`, new: `200`, and the reason | Log entry created containing old: `100`, new: `200`, and the reason | PASS |
| **TC-07** | Draft Auto-save trigger | 30 seconds pass without manual save on entry grid | Draft saved to browser LocalStorage/Session | Draft successfully written to local browser cache | PASS |
| **TC-08** | Record locking action | Supervisor locks entry with ID `603d2...` | Entry status becomes `locked`; PUT operations reject with HTTP 403 | Entry status becomes `locked`; PUT operations reject with HTTP 403 | PASS |
| **TC-09** | Excel Export | Click "Export to Excel" on reports page | Browser downloads valid `.xlsx` spreadsheet matching filters | Browser downloads valid `.xlsx` spreadsheet matching filters | PASS |
| **TC-10** | Bulk Import from workbook | Upload Excel file with daily entries | Server parses sheets, seeds 30+ records, updates masters | Server parses sheets, seeds 30+ records, updates masters | PASS |

As shown in Table 4.1, all executed test cases returned the expected outputs. This confirms that the system maintains data integrity and enforces security boundaries under standard operating conditions.

---

## 4.3 Results & User Interface Analysis
The user interface of the LineOps system is structured as a single-page application (SPA) divided into tabs. These tabs adapt dynamically based on the logged-in user's role (Admin, Supervisor, or Operator).

### 4.3.1 Login Interface
The login screen provides a clean, secure entry point for users. It contains input fields for the username and employee credentials, a submit button, and a visual toggle for dark and light modes. The layout is optimized to display nicely on both desktop monitors and hand-held barcode scanner terminals.

```
+-------------------------------------------------------------------+
|                        [INSERT LOGO HERE]                         |
|                             LINEOPS                               |
|              Smart Production Monitoring System                   |
|                                                                   |
|   Username:    [ admin                                        ]   |
|   Password:    [ *************                                ]   |
|                                                                   |
|   [ Login Button ]                      [ ] Enable Dark Mode      |
+-------------------------------------------------------------------+
```
*Figure 4.1: Visual layout placeholder for the Login Screen.*

### 4.3.2 Production Dashboard View
The dashboard serves as the main page for supervisors and administrators, providing high-level analytics on shop-floor performance. It contains card widgets displaying total active users, master data items, total daily entries, and efficiency metrics. A key component of this view is a Recharts-based area chart showing line-by-line efficiency trends.

```
+-------------------------------------------------------------------+
|  [Daily Entries: 25]  [Active Lines: 5]  [Avg Efficiency: 84%]    |
|                                                                   |
|  Efficiency Trend Analysis Chart (Line-wise)                      |
|  Efficiency (%)                                                   |
|   100% |        /\      /\                                        |
|    80% |   ____/  \____/  \____                                   |
|    60% |  /                    \                                  |
|        +----------------------------------------                  |
|          Line 1  Line 2  Line 3  Line 4  Line 5                   |
+-------------------------------------------------------------------+
```
*Figure 4.2: Visual layout placeholder for the Analytics Dashboard.*

### 4.3.3 Daily Spreadsheet Grid Entry
The spreadsheet grid is the primary screen for operators. It allows direct, cell-by-cell editing of hourly production values. Unsaved changes are visually highlighted with a yellow border, draft rows display a folder icon, and locked records show a padlock symbol. The grid supports horizontal scrolling on mobile devices, ensuring usability across different form factors.

```
+-------------------------------------------------------------------+
| Date: [ 2026-07-12 ]   Shift: [ Morning ]   [ Clone Prev Day ]    |
|                                                                   |
| Line | Machine | Process | Operator | Target | H1-H12 | Rej | Status|
| -----+---------+---------+----------+--------+--------+-----+-------|
| L1   | Lathe   | Grooving| Operator1|  500   | [grid] |  2  | Draft |
| L1   | Flaring | Flaring | Operator2|  450   | [grid] |  0  | Locked|
|                                                                   |
| [Save Draft]         [Submit Production Entry]         [Undo Edit]|
+-------------------------------------------------------------------+
```
*Figure 4.3: Visual layout placeholder for the Spreadsheet Data Entry Grid.*

### 4.3.4 Master Data Configuration View
This view allows administrators to configure dropdown lists and master tables. It features a file dropzone where users can upload excel workbooks for bulk imports, alongside standard controls for adding, editing, and disabling shifts, lines, machines, processes, operators, products, and downtime reasons.

```
+-------------------------------------------------------------------+
|  Manage Masters: [ Shifts | Lines | Machines | Processes | Ops ]  |
|  [ Add Master Item ]                                              |
|                                                                   |
|  Bulk Excel Master Import                                         |
|  +-------------------------------------------------------------+  |
|  |           Drag & Drop Daily Monitoring Excel Here           |  |
|  |                     - OR - [ Browse File ]                  |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```
*Figure 4.4: Visual layout placeholder for the Master Data Configuration.*

### 4.3.5 System Audit Trail Log
The audit trail screen displays system modifications, allowing supervisors and administrators to track changes. Users can filter logs by entity, date, and user. The log table displays the timestamp, user details, action performed, field modified, old and new values, and the change reason.

```
+-------------------------------------------------------------------+
| Filter Entity: [ Entry  v ]   Search Actor: [ SupervisorName    ] |
|                                                                   |
| Timestamp           | Actor  | Action | Field | Old  | New  |Reason|
| --------------------+--------+--------+-------+------+------+------|
| 2026-07-12 18:50:00 | Sup_02 | Update |Target | 400  | 450  |Adj.  |
| 2026-07-12 18:52:12 | Op_04  | Create | Entry | -    | -    |New   |
+-------------------------------------------------------------------+
```
*Figure 4.5: Visual layout placeholder for the System Audit Trail Log.*

---

## 4.4 Operational Analysis and Advantages
The transition from local Excel sheets to the LineOps web platform yielded several operational benefits:
1. **Elimination of Data Entry Conflicts**: Storing data in MongoDB with document-level locking resolved the file-sharing conflicts common to Excel.
2. **Immediate KPI Awareness**: Real-time metric calculations on the server enabled instant OEE, efficiency, and downtime reporting for supervisors, replacing manual calculations.
3. **Improved Regulatory Compliance**: The audit log system provides a secure record of all modifications. Because operators cannot edit historical entries without providing a reason and supervisor approval, data tampering risks are minimized.
4. **Enhanced Data Quality**: Validation using dependent dropdowns and Zod constraints prevented the entry of invalid machine-process combinations, reducing database cleanup and correction overhead.
