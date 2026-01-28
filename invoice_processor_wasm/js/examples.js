// Example invoice data for testing the processor
export const examples = {
  valid: {
    invoice_number: "INV-2024-001",
    customer_name: "Acme Corp",
    date: "2024-01-15",
    line_items: [
      {
        description: "Widget A",
        quantity: 10,
        unit_price: 25.00,
        tax_rate: 0.08
      },
      {
        description: "Service B",
        quantity: 5,
        unit_price: 100.00,
        tax_rate: 0.08
      },
      {
        description: "Premium Support",
        quantity: 1,
        unit_price: 500.00,
        tax_rate: 0.08
      }
    ],
    discount_percent: 10.0
  },

  "missing-field": {
    invoice_number: "",  // Empty required field
    customer_name: "Test Co",
    date: "2024-01-15",
    line_items: [
      {
        description: "Item",
        quantity: 1,
        unit_price: 100.00,
        tax_rate: 0.08
      }
    ],
    discount_percent: 0
  },

  "missing-items": {
    invoice_number: "INV-002",
    customer_name: "Test Co",
    date: "2024-01-15",
    line_items: [],  // No line items
    discount_percent: 0
  },

  "negative-price": {
    invoice_number: "INV-003",
    customer_name: "Test Co",
    date: "2024-01-15",
    line_items: [
      {
        description: "Item",
        quantity: 1,
        unit_price: -50.00,  // Negative price
        tax_rate: 0.08
      }
    ],
    discount_percent: 0
  },

  "invalid-quantity": {
    invoice_number: "INV-004",
    customer_name: "Test Co",
    date: "2024-01-15",
    line_items: [
      {
        description: "Item",
        quantity: 0,  // Zero quantity
        unit_price: 100.00,
        tax_rate: 0.08
      }
    ],
    discount_percent: 0
  },

  "invalid-discount": {
    invoice_number: "INV-005",
    customer_name: "Test Co",
    date: "2024-01-15",
    line_items: [
      {
        description: "Item",
        quantity: 1,
        unit_price: 100.00,
        tax_rate: 0.08
      }
    ],
    discount_percent: 150.0  // Discount > 100%
  },

  "invalid-tax-rate": {
    invoice_number: "INV-006",
    customer_name: "Test Co",
    date: "2024-01-15",
    line_items: [
      {
        description: "Item",
        quantity: 1,
        unit_price: 100.00,
        tax_rate: 1.5  // Tax rate > 1.0
      }
    ],
    discount_percent: 0
  }
};
