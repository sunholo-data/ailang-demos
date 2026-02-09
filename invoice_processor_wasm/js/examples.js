/**
 * Demo extraction scenarios for the AILANG Document Extractor.
 * Each example includes: document text, schema definition, and pre-extracted result.
 * Pre-extracted results are used in demo mode (no API key).
 */

export const demoExamples = {
  invoice: {
    label: 'Invoice',
    description: 'Extract vendor, totals, and line item count from an invoice',
    document: `INVOICE #INV-2024-001
From: Acme Corp
Bill To: Sunholo Pty Ltd
Date: January 15, 2024

Description                  Qty    Unit Price    Tax
Widget A                      10      $25.00     8%
Service B - Consulting         5     $100.00     8%
Premium Support Package        1     $500.00     8%

Discount: 10%
Subtotal: $1,250.00
Tax: $100.00
Total Due: $1,215.00

Payment Terms: Net 30
Due Date: February 14, 2024`,

    schema: {
      name: 'InvoiceExtraction',
      fields: [
        { name: 'invoice_number', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'vendor_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'customer_name', type: 'string', required: true, constraints: [] },
        { name: 'date', type: 'string', required: true, constraints: [] },
        { name: 'subtotal_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'tax_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'total_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'discount_percent', type: 'int', required: false, constraints: ['>= 0', '<= 100'] },
        { name: 'item_count', type: 'int', required: false, constraints: ['>= 0'] }
      ]
    },

    preExtracted: {
      invoice_number: 'INV-2024-001',
      vendor_name: 'Acme Corp',
      customer_name: 'Sunholo Pty Ltd',
      date: '2024-01-15',
      subtotal_cents: 125000,
      tax_cents: 10000,
      total_cents: 121500,
      discount_percent: 10,
      item_count: 3
    }
  },

  pdfInvoice: {
    label: 'PDF Invoice',
    description: 'Extract fields from a real PDF car hire invoice using multimodal AI',
    document: '',
    pdfUrl: 'assets/bristol-car-hire-demo.pdf',
    schema: {
      name: 'CarHireInvoice',
      fields: [
        { name: 'company_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'invoice_number', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'customer_name', type: 'string', required: true, constraints: [] },
        { name: 'hire_date', type: 'string', required: true, constraints: [] },
        { name: 'return_date', type: 'string', required: true, constraints: [] },
        { name: 'vehicle_type', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'total_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'tax_cents', type: 'int', required: false, constraints: ['>= 0'] }
      ]
    },
    preExtracted: null // Requires API key — no pre-extracted data for PDF demos
  },

  contract: {
    label: 'Contract',
    description: 'Extract parties, dates, and key terms from a service agreement',
    document: `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of March 1, 2024
by and between:

Provider: Sunholo Pty Ltd, ABN 12 345 678 901
         Level 10, 100 Collins Street, Melbourne VIC 3000

Client:   Global Tech Inc
         500 Technology Drive, San Francisco CA 94105

1. SERVICES
   The Provider shall deliver cloud infrastructure management services,
   including 24/7 monitoring, monthly reporting, and incident response.

2. TERM
   This Agreement shall commence on April 1, 2024 and continue for a
   period of 12 months, unless terminated earlier per Section 6.

3. COMPENSATION
   Monthly Fee: $5,000 (Five Thousand US Dollars)
   Payment Terms: Net 30 from invoice date

4. SERVICE LEVEL
   Uptime Guarantee: 99.9%
   Response Time: 15 minutes for critical incidents

5. CONFIDENTIALITY
   Both parties agree to maintain confidentiality of proprietary information.

6. TERMINATION
   Either party may terminate with 60 days written notice.

Signed on behalf of the parties on the date first written above.`,

    schema: {
      name: 'ContractExtraction',
      fields: [
        { name: 'provider_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'client_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'start_date', type: 'string', required: true, constraints: [] },
        { name: 'term_months', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'monthly_fee_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'notice_period_days', type: 'int', required: false, constraints: ['>= 0'] },
        { name: 'uptime_guarantee', type: 'string', required: false, constraints: [] }
      ]
    },

    preExtracted: {
      provider_name: 'Sunholo Pty Ltd',
      client_name: 'Global Tech Inc',
      start_date: '2024-04-01',
      term_months: 12,
      monthly_fee_cents: 500000,
      notice_period_days: 60,
      uptime_guarantee: '99.9%'
    }
  },

  resume: {
    label: 'Resume',
    description: 'Extract candidate details, experience, and skills from a CV',
    document: `EMILY WATSON
Senior Software Engineer

Email: emily.watson@email.com
Phone: +61 412 345 678
Location: Melbourne, VIC, Australia
LinkedIn: linkedin.com/in/emilywatson

SUMMARY
Experienced software engineer with 8 years of expertise in cloud-native
applications, distributed systems, and machine learning infrastructure.
Passionate about building reliable, scalable systems.

EXPERIENCE
Senior Software Engineer — Sunholo Pty Ltd (2022 – Present)
  - Lead engineer on AI infrastructure platform
  - Designed event-driven microservices handling 50k req/sec
  - Mentored team of 4 junior engineers

Software Engineer — Atlassian (2018 – 2022)
  - Built CI/CD pipelines for Bitbucket Pipelines
  - Reduced deployment times by 40%
  - Contributed to open-source Kubernetes tooling

Junior Developer — Canva (2016 – 2018)
  - Full-stack development with React and Go
  - Implemented image processing pipeline

EDUCATION
B.Sc. Computer Science — University of Melbourne (2016)
  First Class Honours

SKILLS
Languages: Python, Go, TypeScript, Rust
Cloud: GCP, AWS, Kubernetes, Terraform
ML: PyTorch, TensorFlow, MLflow`,

    schema: {
      name: 'ResumeExtraction',
      fields: [
        { name: 'candidate_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'current_title', type: 'string', required: true, constraints: [] },
        { name: 'email', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'location', type: 'string', required: false, constraints: [] },
        { name: 'years_experience', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'current_employer', type: 'string', required: true, constraints: [] },
        { name: 'education', type: 'string', required: false, constraints: [] },
        { name: 'num_roles', type: 'int', required: false, constraints: ['>= 0'] }
      ]
    },

    preExtracted: {
      candidate_name: 'Emily Watson',
      current_title: 'Senior Software Engineer',
      email: 'emily.watson@email.com',
      location: 'Melbourne, VIC, Australia',
      years_experience: 8,
      current_employer: 'Sunholo Pty Ltd',
      education: 'B.Sc. Computer Science, University of Melbourne',
      num_roles: 3
    }
  },

  // ── Office Document Demos (DocParse → AI Extraction) ────────
  // These demos showcase the full pipeline: DocParse extracts text,
  // then AI extracts structured fields, then AILANG validates.
  docxDemo: {
    label: 'Sports Data (DOCX)',
    description: 'DocParse extracts a sports table from Word, AI pulls structured athlete data',
    document: '',
    officeUrl: 'assets/tables.docx',
    schema: {
      name: 'SportsDataExtraction',
      fields: [
        { name: 'athlete_count', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'top_athlete', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'top_sport', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'highest_fame', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'sports_mentioned', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'has_controversy', type: 'string', required: false, constraints: [] }
      ]
    },
    preExtracted: {
      athlete_count: 3,
      top_athlete: 'Lebron James',
      top_sport: 'Basketball',
      highest_fame: 'Very High',
      sports_mentioned: 3,
      has_controversy: 'Yes'
    }
  },

  pptxDemo: {
    label: 'Presentation (PPTX)',
    description: 'DocParse extracts slides from PowerPoint, AI summarizes the presentation',
    document: '',
    officeUrl: 'assets/pandoc_basic.pptx',
    schema: {
      name: 'PresentationExtraction',
      fields: [
        { name: 'slide_count', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'main_topic', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'person_name', type: 'string', required: false, constraints: [] },
        { name: 'person_age', type: 'int', required: false, constraints: ['>= 0'] },
        { name: 'has_tables', type: 'string', required: false, constraints: [] },
        { name: 'has_diagrams', type: 'string', required: false, constraints: [] }
      ]
    },
    preExtracted: {
      slide_count: 4,
      main_topic: 'LLM Providers and AI',
      person_name: 'Anton Antich',
      person_age: 23,
      has_tables: 'Yes',
      has_diagrams: 'Yes'
    }
  },

  xlsxDemo: {
    label: 'People Data (XLSX)',
    description: 'DocParse extracts spreadsheet cells, AI structures the person records',
    document: '',
    officeUrl: 'assets/pandoc_basic.xlsx',
    schema: {
      name: 'SpreadsheetExtraction',
      fields: [
        { name: 'row_count', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'column_count', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'first_person', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'first_location', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'person_count', type: 'int', required: true, constraints: ['> 0'] },
        { name: 'countries_mentioned', type: 'int', required: false, constraints: ['>= 0'] }
      ]
    },
    preExtracted: {
      row_count: 2,
      column_count: 3,
      first_person: 'Anton Antich',
      first_location: 'Switzerland',
      person_count: 2,
      countries_mentioned: 2
    }
  }
};
