/*
  # Make barcodes.code_produit nullable

  ## Problem
  The barcodes table has `code_produit text NOT NULL`, but when a product is
  created via the scanner (ScanEntrySheet CreateTab), the code_produit field
  was not being passed, causing the upsert to fail silently with a NOT NULL
  constraint violation. This meant no row was ever inserted in the barcodes
  table, so scanning the same EAN in Caisse returned "Code non reconnu".

  ## Fix
  Allow code_produit to be NULL so the upsert succeeds even when code_produit
  is not provided. The EAN is stored in the `barcode` column (the actual lookup
  key), making code_produit an optional redundant field.

  Note: code_produit is now also passed explicitly from ScanEntrySheet when
  creating a product via scanner (set to the scanned EAN), so both columns
  will be populated for new products going forward.
*/

ALTER TABLE barcodes ALTER COLUMN code_produit DROP NOT NULL;
