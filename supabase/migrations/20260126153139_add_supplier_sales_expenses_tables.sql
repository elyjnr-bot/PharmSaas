/*
  # Add Supplier, Sales, and Expenses Management

  ## Overview
  This migration extends the pharmacy management system with:
  - Supplier tracking for medications
  - Sales/Point of Sale functionality with multiple payment methods
  - Expenses tracking for non-medication costs
  - Offline sync support

  ## Changes

  ### Modifications to `medications` table
  - Add `supplier` (text) - Name of the supplier/wholesaler (e.g., Laborex Congo, Cophadom, SEP, COPHARCO)
  - Add `requires_verification` (boolean) - Flag for products requiring source verification
  
  ### New Tables
  
  #### `sales`
  - `id` (uuid, primary key) - Unique identifier for each sale
  - `sale_date` (timestamptz) - Date and time of the sale
  - `total_amount` (numeric) - Total sale amount in FCFA before tax
  - `tax_amount` (numeric) - TVA/tax amount in FCFA
  - `grand_total` (numeric) - Total including tax in FCFA
  - `payment_method` (text) - Payment method used: 'Espèces', 'Carte Bancaire', 'MTN Mobile Money'
  - `customer_name` (text) - Optional customer name
  - `notes` (text) - Additional notes
  - `created_at` (timestamptz) - Timestamp of record creation
  
  #### `sale_items`
  - `id` (uuid, primary key) - Unique identifier
  - `sale_id` (uuid, foreign key) - Reference to parent sale
  - `medication_id` (uuid, foreign key) - Reference to medication
  - `medication_name` (text) - Name of medication (denormalized for history)
  - `quantity` (integer) - Quantity sold
  - `unit_price` (numeric) - Price per unit in FCFA
  - `subtotal` (numeric) - Line item total in FCFA
  - `created_at` (timestamptz) - Timestamp of record creation

  #### `expenses`
  - `id` (uuid, primary key) - Unique identifier
  - `expense_date` (timestamptz) - Date of the expense
  - `category` (text) - Expense category (e.g., 'Électricité', 'Loyer', 'Salaires', 'Fournitures', 'Autre')
  - `description` (text) - Description of the expense
  - `amount` (numeric) - Amount in FCFA
  - `payment_method` (text) - How it was paid
  - `notes` (text) - Additional notes
  - `created_at` (timestamptz) - Timestamp of record creation

  ## Security
  
  - Enable RLS on all new tables
  - Add policies for authenticated users to manage their data
  - Maintain data integrity with foreign key constraints

  ## Notes
  
  - Tax rate is 18.9% (common VAT rate in Congo-Brazzaville)
  - All monetary values are stored in FCFA
  - Offline sync will be handled in the application layer using localStorage
*/

-- Add supplier and verification fields to medications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'supplier'
  ) THEN
    ALTER TABLE medications ADD COLUMN supplier text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'requires_verification'
  ) THEN
    ALTER TABLE medications ADD COLUMN requires_verification boolean DEFAULT false;
  END IF;
END $$;

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date timestamptz NOT NULL DEFAULT now(),
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  grand_total numeric(12, 2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('Espèces', 'Carte Bancaire', 'MTN Mobile Money')),
  customer_name text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create sale_items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medication_id uuid REFERENCES medications(id) ON DELETE SET NULL,
  medication_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create policies for sales
CREATE POLICY "Authenticated users can read sales"
  ON sales
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sales"
  ON sales
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sales"
  ON sales
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sales"
  ON sales
  FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for sale_items
CREATE POLICY "Authenticated users can read sale_items"
  ON sale_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sale_items"
  ON sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sale_items"
  ON sale_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sale_items"
  ON sale_items
  FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for expenses
CREATE POLICY "Authenticated users can read expenses"
  ON expenses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert expenses"
  ON expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update expenses"
  ON expenses
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expenses"
  ON expenses
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_medications_supplier ON medications(supplier);
