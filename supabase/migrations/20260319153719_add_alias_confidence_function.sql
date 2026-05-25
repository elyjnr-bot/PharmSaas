/*
  # Add RPC function to increment alias confidence

  1. New Functions
    - `increment_alias_confidence` - Increments the confidence counter for a given alias
      - Takes alias_text as parameter
      - Increments confidence by 1
      - Used for learning which aliases are most accurate

  2. Notes
    - This function helps the system learn which OCR errors are most common
    - Higher confidence aliases can be prioritized in future matching
*/

CREATE OR REPLACE FUNCTION increment_alias_confidence(alias_text text)
RETURNS void AS $$
BEGIN
  UPDATE medication_aliases
  SET confidence = confidence + 1
  WHERE LOWER(alias) = LOWER(alias_text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
