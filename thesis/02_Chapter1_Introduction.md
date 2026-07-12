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

# CHAPTER 1: INTRODUCTION

## 1.1 Background of the Study
In the era of Industry 4.0, manufacturing enterprises are undergoing rapid digital transformation to enhance their operational efficiency, throughput, and agility [1]. Traditionally, production shop floors operated in siloed environments where performance metrics, machine statuses, and operator yields were recorded on paper logs or individual local spreadsheets. However, modern competitive dynamics necessitate real-time data visibility, prompt decision-making, and seamless integration between physical operations and corporate systems. 

For academic domains like the Internet of Things (IoT), production monitoring serves as the logical starting point for establishing a cyber-physical system (CPS) [2]. Before physical sensors, vibration analyzers, or smart power meters can be deployed to stream machine status directly to the cloud, there must exist a structured transactional database and application layer that understands the basic organizational elements of the shop floor—specifically, shifts, production lines, machines, processes, operators, products, and daily yields. The establishment of this digital-twin data model is a prerequisite for contextualizing raw sensor telemetry data, thereby enabling higher-level analytics such as Overall Equipment Effectiveness (OEE) tracking and predictive maintenance.

## 1.2 Statement of the Problem
Despite the advent of high-performance database systems, many small-to-medium manufacturing enterprises (SMEs) continue to rely on manual Microsoft Excel spreadsheets for daily production logging. This practice presents several severe operational challenges:
1. **Lack of Real-time Visibility**: Excel sheets reside on local machines, leading to delayed reporting, where supervisors and plant managers only review daily reports hours or days after shifts end.
2. **Data Entry Errors and Inconsistencies**: Manual systems lack interactive validation. Operators frequently enter incorrect values, mismatched operator-department mappings, or invalid numeric ranges.
3. **No Audit Trial or Change Tracking**: When records are edited or modified post-submission, there is no history showing who modified the values, what the original values were, or the reasons behind the changes.
4. **Mismatched Workflows and Permissions**: Spreadsheets are generally shared without role-based access control (RBAC). Operators can accidentally overwrite formulas or delete historic logs, while unauthorized personnel can view confidential operator or product information.
5. **Absence of Record Locking**: Once production figures are finalized and approved, they must be locked to prevent retro-active changes for audit compliance. Manual spreadsheets cannot enforce such operational boundaries.

## 1.3 Motivation
The development of the LineOps Smart Production Monitoring System is motivated by the critical need to solve these spreadsheet-based data management issues. By implementing a central web application with role-based access control (RBAC), manufacturing firms can transition from localized Excel files to a unified, multi-user web portal. Furthermore, the application is designed to be mobile-first and desktop-friendly, recognizing that shop-floor operators and supervisors often require portable devices (like tablets or industrial mobile terminals) to enter data directly at the machine station. 

From an academic and technological perspective, the motivation is to design a software system that calculates vital metrics (e.g., Efficiency %, Loss %, and Downtime %) automatically and instantaneously. The system also logs every edit action to an audit history table, establishing a secure record of shop-floor activities. This transition establishes a robust digital ledger of production data, creating a clean dataset that is ready for downstream IoT sensor integration and AI-based anomaly detection.

## 1.4 Objectives of the Research
The primary objectives of this research project are as follows:
1. To design and implement a role-based authentication and authorization system (Admin, Supervisor, and Operator) to govern access and editing rights.
2. To build an interactive, mobile-friendly spreadsheet-like daily entry grid that streamlines data entry with numeric keypad support, copy-previous-row actions, and auto-saving mechanisms.
3. To implement automated, mathematical metrics calculation on the backend, calculating net production, hourly efficiencies, and downtime percentages on the fly.
4. To establish a Master Data Management (MDM) portal allowing administrators to update shifts, lines, machines, processes, operators, and products with validation.
5. To design and develop reporting modules with advanced filtering (by date, line, operator, machine, shift) and visual chart analysis using Recharts.
6. To implement automated Excel (via ExcelJS) and PDF (via pdf-lib) export capabilities directly from the client web browser.

## 1.5 Scope of the System
The scope of the LineOps system covers the software environment supporting the administrative configuration and production logging for a standard manufacturing shop floor. It includes the user roles, dropdown mappings, data-entry forms, and automated calculations. The scope is bounded as follows:
- **Target Users**: Limited to Operators (who enter data), Supervisors (who review and lock data), and Admins (who manage users, configure master data, and unlock records).
- **Time Horizon**: Production data is tracked across 12-hour shifts.
- **Reporting**: Daily and historical summaries are rendered as charts, with browser-generated exports. It does not include automated email reports or ERP synchronization.
- **IoT Integration Boundary**: The database design and APIs are structured to receive machine data, but direct PLC/SCADA physical sensor integrations are designated as future work.

## 1.6 Contributions of the Thesis
The primary contributions of this thesis include:
1. **Structured Data Validation & Mapping**: Implementation of dependent master dropdowns (e.g., Line to Machines, Machine to Processes) that prevent operators from entering physically impossible machine-process configurations.
2. **Audit Logging Framework**: Design of an automatic schema-level tracking array (`editLogs`) in Mongoose that records every field modification, storing old/new values, actor ID, timestamp, and edit reason.
3. **Draft Resiliency Mechanism**: Implementation of a 30-second client-side auto-save draft mechanism that prevents data loss from network drops or device shutoffs on the shop floor.
4. **Optimized Report Generation**: Execution of browser-side spreadsheet parsing and rendering, enabling zero-server-overhead PDF and Excel generation.

## 1.7 Organization of the Thesis
The rest of this thesis is organized into five main chapters as follows:
- **Chapter 2: Background Study & Tech Stack** reviews relevant manufacturing literature, the limitations of Excel-based reporting, related work, and details the tools and technologies (both software frameworks and database models) utilized in developing the LineOps application.
- **Chapter 3: proposed Design & Implementation** describes the core design and implementation of the proposed system. It includes the block diagram, system architecture, database ER diagrams, API route structures, operational workflows, and algorithms used.
- **Chapter 4: Results, Testing & Analysis** details the verification strategy, unit and integration test cases, realistic testing matrices, and analyzes the performance and advantages of the system, accompanied by visual UI descriptions.
- **Chapter 5: Conclusion & Future Scope** summarizes the overall work, details realistic future scope improvements—specifically focusing on physical IoT sensor data ingestion—and presents the final concluding remarks.
- **References** lists all standard academic documents and documentations cited throughout the chapters.
- **Appendix** contains configurations, the database schema definition, installation steps, and code snippets.
