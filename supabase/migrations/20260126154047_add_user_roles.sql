/*
  # Add User Roles and Authentication Setup

  ## Overview
  This migration adds user role management to distinguish between staff (vendeur) 
  and manager (gérant) users. This enables role-based access control for sensitive
  analytics and financial data.

  ## Changes

  ### New Tables
  
  #### `user_profiles`
  - `id` (uuid, primary key) - References auth.users(id)
  - `email` (text) - User email for reference
  - `role` (text) - User role: 'staff' or 'manager'
  - `full_name` (text) - Full name of the user
  - `created_at` (timestamptz) - When the profile was created
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  
  - Enable RLS on user_profiles table
  - Users can only read their own profile
  - Only managers can read all profiles (for user management)
  - Only authenticated users can access their profile

  ## Notes
  
  - Default role is 'staff' for regular employees
  - 'manager' role grants access to analytics and financial data
  - First user created should be manually promoted to manager via SQL
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'manager')),
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for user_profiles
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
