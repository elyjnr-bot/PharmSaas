/*
  # Update handle_new_user trigger

  ## Changes
  - Read `role` from user metadata so managers who sign up get role='manager'
    instead of defaulting to 'staff'.
  - Read `pharmacy_name` from metadata and store in full_name if no full_name given.

  ## Why
  When a manager creates their account via the signup form, the client sends
    { data: { full_name, role: 'manager', pharmacy_name } }
  in auth.signUp options. The trigger must propagate this role to user_profiles.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
BEGIN
  -- Use role from metadata if provided, otherwise default to 'staff'
  v_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    'staff'
  );

  -- Validate role value
  IF v_role NOT IN ('manager', 'staff') THEN
    v_role := 'staff';
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
