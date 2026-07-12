import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const __dirname = path.resolve();

async function run() {
  // Step 1: Install marked locally in the thesis directory if not present
  try {
    console.log('Installing "marked" dependency for Markdown parsing...');
    execSync('npm install --no-save marked', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to install marked. Trying to continue...', error);
  }

  // Import marked dynamically after installation
  const { marked } = await import('marked');

  // Read the combined markdown file
  const mdPath = path.join(__dirname, 'LineOps_MTech_Thesis_Combined.md');
  if (!fs.existsSync(mdPath)) {
    console.error('LineOps_MTech_Thesis_Combined.md not found!');
    process.exit(1);
  }

  const md = fs.readFileSync(mdPath, 'utf8');

  // Parse markdown to HTML
  let htmlContent = marked.parse(md);

  // Post-process HTML to replace markdown code blocks for mermaid with div containers for rendering
  htmlContent = htmlContent.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
    const decodedCode = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return `<pre class="mermaid">${decodedCode}</pre>`;
  });

  // Construct the full HTML document with IEEE and university formatting specifications
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>B.Tech+M.Tech (Internet of Things) Thesis - LineOps</title>
  <!-- Load Mermaid Library from CDN -->
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'neutral',
      flowchart: { useMaxWidth: false, htmlLabels: true }
    });
  </script>
  <style>
    @page {
      size: A4;
      margin: 25mm 20mm 20mm 20mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Times New Roman', serif;
        font-size: 10pt;
      }
    }
    
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      text-align: justify;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: 'Times New Roman', Times, serif;
      color: #000;
      page-break-after: avoid;
    }

    /* Chapter Title Styling */
    h1 {
      font-size: 16pt;
      text-align: center;
      margin-top: 50px;
      margin-bottom: 25px;
      text-transform: uppercase;
      page-break-before: always;
      line-height: 1.3;
    }

    /* First heading shouldn't have page break-before if it's the title page */
    .title-page-container h1 {
      page-break-before: avoid !important;
      margin-top: 0;
    }

    /* Headings Styling */
    h2 {
      font-size: 14pt;
      margin-top: 35px;
      margin-bottom: 15px;
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
    }

    h3 {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 25px;
      margin-bottom: 10px;
    }

    h4 {
      font-size: 12pt;
      font-style: italic;
      margin-top: 20px;
      margin-bottom: 10px;
    }

    p {
      margin-top: 0;
      margin-bottom: 15px;
      text-indent: 0.5in;
    }

    /* Remove indent on lists, figures, tables, code blocks */
    li p, blockquote p, pre p, td p, .no-indent {
      text-indent: 0 !important;
    }

    ul, ol {
      margin-top: 0;
      margin-bottom: 15px;
      padding-left: 30px;
    }

    li {
      margin-bottom: 5px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #000;
      padding: 10px;
      text-align: left;
      font-size: 11pt;
    }

    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }

    pre, code {
      font-family: 'Consolas', 'Courier New', Courier, monospace;
      font-size: 10pt;
      background-color: #f5f5f5;
    }

    code {
      padding: 2px 5px;
      border-radius: 3px;
    }

    pre {
      padding: 15px;
      border: 1px solid #ccc;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    pre code {
      padding: 0;
      background-color: transparent;
    }

    /* Mermaid rendering box styling */
    .mermaid {
      background: transparent;
      border: none;
      display: flex;
      justify-content: center;
      margin: 30px 0;
      page-break-inside: avoid;
    }

    /* Centered text helper */
    .text-center {
      text-align: center;
    }

    /* Cover Page/Title Page layout overrides */
    .title-page-layout {
      text-align: center;
      padding: 40px 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
`;

  const htmlPath = path.join(__dirname, 'LineOps_MTech_Thesis_Combined.html');
  fs.writeFileSync(htmlPath, fullHtml, 'utf8');
  console.log('HTML file with embedded formatting created at:', htmlPath);

  // Step 2: Compile to PDF using Microsoft Edge headlessly
  const pdfPath = path.join(__dirname, 'LineOps_MTech_Thesis.pdf');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  console.log('Converting HTML to PDF via Microsoft Edge...');
  const command = `"${edgePath}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${pdfPath}" --no-margins "${htmlPath}"`;

  // Wait 3 seconds for Mermaid JavaScript to execute and draw diagrams before printing
  console.log('Waiting for JavaScript and Mermaid diagram rendering (3 seconds)...');
  setTimeout(() => {
    try {
      execSync(command);
      console.log('==================================================================');
      console.log('SUCCESS: M.Tech Thesis PDF successfully generated at:');
      console.log(pdfPath);
      console.log('==================================================================');
      process.exit(0);
    } catch (err) {
      console.error('Edge conversion command failed:', err);
      process.exit(1);
    }
  }, 3000);
}

run().catch((error) => {
  console.error('Execution error:', error);
  process.exit(1);
});
