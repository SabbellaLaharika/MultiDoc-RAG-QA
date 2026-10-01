import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const outDir = path.resolve(process.cwd(), 'tests', 'sample_docs');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// ─── Generate Employee Handbook PDF (using pdfkit -> Buffer) ──────────────────
// pdfkit produces standard-format PDFs that pdf-parse can read natively.
// We collect the emitted chunks into a Buffer instead of piping to a file stream
// to ensure the write is synchronous and complete before returning.

async function createPDF() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();  // use default constructor - autoFirstPage:false causes XRef issues with pdf-parse
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(path.join(outDir, 'employee_handbook.pdf'), buffer);
      resolve();
    });
    doc.on('error', reject);

    // ── Title Page (default first page already added by PDFDocument()) ──────
    doc.fontSize(22).font('Helvetica-Bold').text('Acme Corp Employee Handbook', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(
      'Welcome to Acme Corp. This handbook outlines the company\'s core policies, ' +
      'benefits, and guidelines that all employees are expected to follow. ' +
      'It applies to all full-time and part-time employees regardless of position.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Our mission is to build the highest quality products in the industry while ' +
      'maintaining a healthy work-life balance for our team. We believe that innovation ' +
      'is driven by diverse perspectives and open communication. All employees are expected ' +
      'to adhere to our core values of integrity, transparency, and excellence in every ' +
      'aspect of their daily work.'
    );
    doc.moveDown(0.5);
    doc.text(
      'This handbook supersedes all prior versions. Acme Corp reserves the right to amend ' +
      'these policies at any time with written notice. Questions should be directed to the ' +
      'Human Resources department at hr@acmecorp.com.'
    );

    // ── Page 2: Attendance Policy ─────────────────────────────────────────────
    doc.addPage();
    doc.fontSize(16).font('Helvetica-Bold').text('Chapter 1: Attendance Policy');
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(
      'Standard working hours are 9:00 AM to 5:00 PM, Monday through Friday. ' +
      'Remote work is permitted for up to 2 days per week, subject to manager approval ' +
      'and department requirements. All employees must clock in using the Acme Time system.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Tardiness of more than 15 minutes requires prior notification via email or Slack. ' +
      'If you are unable to attend work due to unforeseen circumstances, you must notify ' +
      'your direct supervisor at least one hour before your scheduled start time. ' +
      'Chronic absenteeism, defined as more than 5 unplanned absences in a quarter, ' +
      'may lead to disciplinary action up to and including termination of employment.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Managers reserve the right to request medical documentation for absences exceeding ' +
      '3 consecutive days. Employees on approved medical leave will not have those days ' +
      'counted against their attendance record. All leave must be documented in the HR portal.'
    );

    // ── Page 3: PTO and Leave ─────────────────────────────────────────────────
    doc.addPage();
    doc.fontSize(16).font('Helvetica-Bold').text('Chapter 2: PTO and Leave');
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(
      'Full-time employees receive 20 days of paid time off (PTO) per year, accrued at ' +
      'a rate of 1.67 days per month. Part-time employees accrue PTO on a pro-rated basis. ' +
      'Sick leave is provided separately and is unlimited, but requires a doctor\'s note ' +
      'after 3 consecutive days of absence.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Unused PTO does not roll over to the next calendar year. Employees may not carry ' +
      'forward more than 5 days under any exception, which must be approved by HR in writing. ' +
      'PTO requests must be submitted through the HR portal at least 2 weeks in advance for ' +
      'planned absences. Emergency leave may be requested with shorter notice.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Acme Corp observes all statutory public holidays in the region of operation. ' +
      'Employees required to work on a public holiday will receive either double pay ' +
      'or a compensatory day off, to be agreed upon in advance with their manager.'
    );

    doc.end();
  });
}

// ─── Generate Contractor Guidelines DOCX ──────────────────────────────────────

async function createDOCX() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: 'Acme Corp Contractor Guidelines', bold: true, size: 36 })
            ]
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'This document governs the engagement of all external contractors ' +
                      'and freelancers working with Acme Corp. By accepting a contract with Acme Corp, ' +
                      'contractors agree to abide by the terms and conditions outlined herein.',
                size: 24
              })
            ]
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Compensation and Invoicing', bold: true, size: 28 })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Contractors are not eligible for employee health benefits, pension contributions, ' +
                      'or paid time off. All compensation is strictly as outlined in the master service agreement. ' +
                      'Invoices must be submitted by the 5th of each month via the vendor portal. ' +
                      'Standard payment terms are Net-30 from the date of invoice approval.',
                size: 24
              })
            ]
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Equipment and Access', bold: true, size: 28 })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Contractors must use their own licensed equipment and software. ' +
                      'Access to the Acme VPN is granted on a per-project basis and must be approved by IT Security. ' +
                      'Contractors will be issued a temporary badge for on-site visits, which must be returned upon project completion. ' +
                      'Unauthorized access to internal systems may result in immediate termination of the contract.',
                size: 24
              })
            ]
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Intellectual Property and Confidentiality', bold: true, size: 28 })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'All intellectual property created during the term of the contract remains the sole property of Acme Corp, ' +
                      'unless otherwise explicitly specified in the master service agreement. ' +
                      'Contractors are required to sign a Non-Disclosure Agreement (NDA) prior to beginning any engagement. ' +
                      'Any conflicts of interest must be disclosed to the legal department immediately upon discovery.',
                size: 24
              })
            ]
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'contractor_guidelines.docx'), buffer);
}

async function main() {
  console.log('Generating synthetic sample documents...');
  await createPDF();
  await createDOCX();
  console.log('✅ Created tests/sample_docs/employee_handbook.pdf');
  console.log('✅ Created tests/sample_docs/contractor_guidelines.docx');
}

main().catch(console.error);
