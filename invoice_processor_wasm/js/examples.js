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

  receipt: {
    label: 'Receipt',
    description: 'Extract merchant, items, and total from a retail receipt',
    document: `COFFEE HOUSE
123 Main Street, Anytown CA 90210
Tel: (555) 123-4567

Date: 2024-02-20  Time: 14:30
Server: Maria  Table: 7

Latte (Large)           $5.50
Blueberry Muffin        $3.25
Bottled Water           $2.00
Avocado Toast           $8.75

Subtotal:              $19.50
Tax (7.25%):            $1.41
Total:                 $20.91

Payment: Visa ***1234
Auth: 847291

Thank you for visiting Coffee House!`,

    schema: {
      name: 'ReceiptExtraction',
      fields: [
        { name: 'merchant_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'date', type: 'string', required: true, constraints: [] },
        { name: 'subtotal_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'tax_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'total_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'payment_method', type: 'string', required: false, constraints: [] },
        { name: 'item_count', type: 'int', required: false, constraints: ['>= 0'] }
      ]
    },

    preExtracted: {
      merchant_name: 'Coffee House',
      date: '2024-02-20',
      subtotal_cents: 1950,
      tax_cents: 141,
      total_cents: 2091,
      payment_method: 'Visa',
      item_count: 4
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

  bankStatement: {
    label: 'Bank Statement',
    description: 'Extract account details, balance, and transaction summary',
    document: `NATIONAL BANK OF AUSTRALIA
Monthly Statement — Personal Cheque Account

Account Holder: Sarah J. Mitchell
Account Number: 0621-4478-9903
BSB: 082-140
Statement Period: 1 March 2024 – 31 March 2024

Opening Balance:                    $4,231.50

TRANSACTIONS
Date        Description                     Debit       Credit
03 Mar      Direct Debit — Netflix           $22.99
05 Mar      Salary — Sunholo Pty Ltd                    $6,450.00
07 Mar      EFTPOS — Woolworths             $187.30
12 Mar      Transfer to Savings             $500.00
15 Mar      ATM Withdrawal                  $200.00
18 Mar      BPAY — AGL Energy              $142.80
22 Mar      EFTPOS — Bunnings               $89.50
25 Mar      Direct Debit — Health Ins       $175.00
28 Mar      Interest Earned                              $3.12

Total Debits:    $1,317.59
Total Credits:   $6,453.12

Closing Balance:                    $9,367.03`,

    schema: {
      name: 'BankStatementExtraction',
      fields: [
        { name: 'account_holder', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'account_number', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'statement_period', type: 'string', required: true, constraints: [] },
        { name: 'opening_balance_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'closing_balance_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'total_debits_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'total_credits_cents', type: 'int', required: true, constraints: ['>= 0'] },
        { name: 'transaction_count', type: 'int', required: false, constraints: ['>= 0'] }
      ]
    },

    preExtracted: {
      account_holder: 'Sarah J. Mitchell',
      account_number: '0621-4478-9903',
      statement_period: '2024-03-01 to 2024-03-31',
      opening_balance_cents: 423150,
      closing_balance_cents: 936703,
      total_debits_cents: 131759,
      total_credits_cents: 645312,
      transaction_count: 9
    }
  },

  shippingLabel: {
    label: 'Shipping',
    description: 'Extract sender, recipient, and tracking info from a shipping label',
    document: `═══════════════════════════════════════
        AUSTRALIA POST — EXPRESS POST
═══════════════════════════════════════

FROM:
  Sunholo Pty Ltd
  Level 10, 100 Collins Street
  Melbourne VIC 3000
  AU

TO:
  James Chen
  42 Harbour View Drive
  Pyrmont NSW 2009
  AU

Tracking: EP349201847AU
Service:  Express Post — Next Business Day
Weight:   1.2 kg
Declared Value: $85.00

Parcel ID: PKG-2024-00417
Date Shipped: 2024-03-15
Signature Required: Yes

═══════════════════════════════════════`,

    schema: {
      name: 'ShippingExtraction',
      fields: [
        { name: 'sender_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'recipient_name', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'recipient_city', type: 'string', required: true, constraints: [] },
        { name: 'tracking_number', type: 'string', required: true, constraints: ['!= ""'] },
        { name: 'service_type', type: 'string', required: true, constraints: [] },
        { name: 'weight_grams', type: 'int', required: false, constraints: ['>= 0'] },
        { name: 'declared_value_cents', type: 'int', required: false, constraints: ['>= 0'] },
        { name: 'signature_required', type: 'string', required: false, constraints: [] }
      ]
    },

    preExtracted: {
      sender_name: 'Sunholo Pty Ltd',
      recipient_name: 'James Chen',
      recipient_city: 'Pyrmont',
      tracking_number: 'EP349201847AU',
      service_type: 'Express Post — Next Business Day',
      weight_grams: 1200,
      declared_value_cents: 8500,
      signature_required: 'Yes'
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
  }
};
