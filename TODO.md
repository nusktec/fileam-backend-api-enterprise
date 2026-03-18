# Fileam Backend – Implementation Todo List

## Expense & Sales Categorization (from analysis)

- [ ] **Schema changes**
  - [ ] Add `expenseType` (OPEX/COGS/CAPEX/Tax) to Expense model
  - [ ] Add `vendor` to Expense model
  - [ ] Add `revenueType` and `category` to Sale model
  - [ ] Run migrations

- [ ] **Constants & reference data**
  - [ ] Expand expense categories (Rent, Tools & Software, Marketing, etc.)
  - [ ] Add chart of accounts / expense type mapping
  - [ ] Add revenue types for sales

- [ ] **Services & APIs**
  - [ ] Update expense create/update to support `expenseType`, `vendor`
  - [ ] Update sale create/update to support `revenueType`, `category`
  - [ ] Rule-based suggestion API for category/type
  - [ ] Profitability helpers (COGS vs OPEX breakdown)

- [ ] **Later (NLP, OCR, learning)**
  - [ ] NLP-based category suggestion from description
  - [ ] Receipt OCR integration
  - [ ] Learning from user corrections

---

## Contacts & Types Endpoint

- [x] **Unified endpoint** – Single API call returns all contacts and reference types
  - [x] Types: business types, industries, document types, currencies, VAT types, VAT periods, report types, expense categories, payment types
  - [x] Contacts: clients (enterprise) / customers (mobile)
