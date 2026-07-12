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

# ABSTRACT

In contemporary manufacturing industries, the shift from traditional manual operations toward Industry 4.0 paradigms is crucial for sustaining competitive advantages, improving operational efficiency, and reducing overhead costs. A fundamental pillar of this transition is the establishment of a robust digital data infrastructure that can reliably track shop-floor operations in real-time. This thesis presents the design, development, and implementation of the **Smart Production Monitoring System (LineOps)**, a role-based, full-stack web application developed to replace outdated, manual, and error-prone Excel-based data entry workflows on manufacturing assembly lines. 

The primary motivation of this work stems from the critical need to eliminate information silos, human errors, and late-reporting discrepancies that characterize paper-and-spreadsheet-based tracking systems. By introducing a centralized platform with structured data input validation, real-time metric computations, and granular authorization controls, LineOps ensures data integrity and operational visibility. For a five-year dual-degree curriculum in the Internet of Things (IoT), this system functions as a critical software foundation. It serves as the digital core and transaction layer upon which physical IoT sensors, edge monitoring gateways, and automated machine telemetry devices can be integrated to form a comprehensive cyber-physical production environment.

The architecture of LineOps is built upon a secure, scalable, and responsive technology stack. The backend server utilizes Node.js and Express to expose a RESTful API, coupled with MongoDB and Mongoose ORM for storing production logs, master data definitions, user records, and granular system activity logs. The frontend client is built using React, Vite, and Tailwind CSS, leveraging React Hook Form and Zod for client-side data validation. Key features of the system include an interactive, spreadsheet-like daily entry grid supporting touch and mobile input devices, dependent master dropdown selections (Line to Machine, Machine to Process, and Department to Operator), auto-calculations of metrics (total production, net production, efficiency, loss, and downtime percentages), automatic background draft auto-saving, visual performance band indicators, Excel/PDF reporting, and a supervisor notification panel for missed entries.

The system was evaluated through simulated and real production data imports, demonstrating significant improvements in data logging speed, immediate calculation accuracy, and report generation efficiency. Ultimately, the LineOps platform lays the groundwork for advanced IoT telemetry integrations, enabling future implementations of real-time machine downtime analysis, edge-based predictive maintenance, and closed-loop manufacturing execution system (MES) feedback.

<br>
<br>

<b>Keywords:</b> Industry 4.0, Production Monitoring, Full-Stack Web Application, Mongoose ORM, React, Data Integrity, Manufacturing Execution System, Internet of Things (IoT) Data Infrastructure.
