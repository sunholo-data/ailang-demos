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
  }
};
