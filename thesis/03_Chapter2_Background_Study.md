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

# CHAPTER 2: BACKGROUND STUDY & TECH STACK

## 2.1 Domain Knowledge and Context
In modern industrial engineering, lean manufacturing principles focus on the systematic minimization of waste ("Muda") within a manufacturing system without sacrificing productivity [3]. One of the most effective ways to identify and eliminate waste is to maintain high-resolution production tracking. This tracking measures the performance of machines, processes, and operators. The data points collected typically include planned targets, hourly yields, rejects, rework quantities, and machine downtime minutes.

By capturing these values hourly, management can analyze trends and calculate Key Performance Indicators (KPIs) such as Overall Equipment Effectiveness (OEE) [4]. OEE is calculated based on three factors:
1. **Availability**: The ratio of actual operating time to planned production time (impacted by downtime).
2. **Performance**: The ratio of actual output to the design capacity of the machine (impacted by slow cycles or minor stops).
3. **Quality**: The ratio of good parts produced to the total parts produced (impacted by reject and rework quantities).

In traditional setups, tracking these three metrics requires significant administrative labor, with data collected on paper logs and entered into Excel at the end of the day. This manual process introduces lag and is prone to errors, which hinders real-time waste minimization.

## 2.2 Literature Review: Limitations of Spreadsheets
Historically, Microsoft Excel has been the default choice for data logging due to its low initial cost, ease of use, and flexibility. However, database research shows that using spreadsheets as multi-user transaction engines introduces severe vulnerabilities [5]:
1. **Concurrency Failures**: Spreadsheets lack row-level or document-level locks. When multiple operators attempt to update the same spreadsheet simultaneously, write conflicts occur, resulting in data loss.
2. **Logic and Formula Corruption**: Excel formulas are embedded directly within cells. An operator can easily overwrite a calculation formula with a static value, corrupting subsequent aggregations.
3. **Absence of Referential Integrity**: Excel does not natively enforce relational bounds unless complex VBA scripts are written. As a result, an operator could type a machine name that does not exist on the specified line, corrupting database consistency.
4. **No Security and Traceability**: Spreadsheets do not record change logs. If an efficiency percentage is modified retroactively, there is no digital trail indicating the actor or the justification [6].

These limitations highlight the necessity of web-based Manufacturing Execution Systems (MES) that utilize relational or document-oriented databases with centralized business logic.

## 2.3 Prerequisites for Web-Based MES Systems
To build a scalable, multi-user web portal to replace spreadsheets, several modern software paradigms are required:
- **Model-View-Controller (MVC) and Layered Architecture**: Decoupling the data presentation (frontend), route management, and data access layers (backend) ensures that the application is maintainable and testable [7].
- **NoSQL Databases and Document Model**: Unlike traditional relational databases (SQL) that require rigid tables with complex joins, document-oriented databases (like MongoDB) store data in JSON-like documents. This flexible structure is well-suited for manufacturing environments where machine definitions, process steps, and hourly tracking sheets evolve.
- **Stateless Authentication**: Using JSON Web Tokens (JWT) allows the server to authenticate client requests without maintaining server-side session states, making the API scalable and compatible with edge device requests [8].

## 2.4 Related Enterprise Solutions
Currently, several commercial software systems address production monitoring, such as SAP Manufacturing Execution (SAP ME), Plex Smart Manufacturing Platform, and Siemens Opcenter. Table 2.1 provides a comparative analysis of these systems against the proposed LineOps system.

### Table 2.1: Comparative Analysis of Production Monitoring Solutions
| Feature / Parameter | SAP ME | Plex Cloud MES | Proposed LineOps System |
|---|---|---|---|
| **Target Enterprise** | Large Multinational Corps | Medium to Large Scale | Small to Medium Enterprises (SMEs) |
| **Cost & License** | Very High (Enterprise License) | High (SaaS Subscription) | Low (Open-Source Stack) |
| **Infrastructure** | On-Premises Servers / SAP Cloud | Pure Multi-Tenant Cloud | On-Premises or Private Cloud Hostable |
| **Deployment Time** | 6 to 18 Months | 3 to 9 Months | Under 1 Month |
| **Customization** | Complex (Requires SAP ABAP Devs) | Proprietary API Configuration | High (Javascript/React Stack) |
| **Data Security** | High | High | High (Self-hosted or Private Cloud) |
| **Learning Curve** | Steep (Requires Training) | Moderate | Very Low (Spreadsheet-like design) |

While commercial platforms are highly capable, their cost, long deployment times, and complex user interfaces make them impractical for small and medium manufacturing units. LineOps offers a lightweight, secure, and user-friendly alternative designed specifically for the needs of SMEs.

## 2.5 Justification of the Selected Tech Stack
The LineOps system was built using a modern, open-source JavaScript-centric stack to ensure rapid development, responsive UI rendering, and scalable database performance:

### 2.5.1 Backend Technologies
1. **Node.js**: A high-performance runtime environment built on Chrome's V8 JavaScript engine. Its non-blocking, event-driven I/O model makes it highly efficient for handling concurrent API requests from multiple frontend clients.
2. **Express.js**: A minimal and flexible web application framework for Node.js, providing robust features for routing, middleware integration, and RESTful API development.
3. **MongoDB**: A document-oriented NoSQL database that stores data in flexible, JSON-like documents. This structure maps directly to Javascript objects, simplifying data access and allowing the schema to adapt to changes in manufacturing processes.
4. **Mongoose ORM**: An Object Data Modeling (ODM) library for MongoDB and Node.js. It provides schema validation, type casting, middleware hooks, and query building to ensure database structure and integrity.
5. **JWT (JSON Web Token)**: Enforces stateless authentication, allowing users to log in securely and pass signed tokens in the HTTP Authorization headers of API requests.

### 2.5.2 Frontend Technologies
1. **React.js**: A component-based frontend library for building dynamic, single-page application (SPA) interfaces. Its virtual DOM diffing algorithm ensures fast rendering of data-dense grids.
2. **Vite**: A build tool that utilizes native ES modules to deliver fast development server start times and optimized production bundles.
3. **Tailwind CSS**: A utility-first CSS framework that enables rapid styling directly within markup, facilitating a responsive, mobile-first design for shop-floor tablets.
4. **React Hook Form & Zod**: Provides schema-based form validation on the client side, ensuring that invalid inputs are caught before they reach the network layer.
5. **Recharts**: A composable charting library built on React components and SVG, used to render production performance and downtime charts.
6. **ExcelJS & pdf-lib**: Client-side libraries that generate spreadsheet files (`.xlsx`) and document sheets (`.pdf`) directly in the user's browser, eliminating file compilation overhead on the backend server.
