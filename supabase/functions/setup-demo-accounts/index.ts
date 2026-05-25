import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DemoAccount {
  email: string;
  password: string;
  role: string;
}

const demoAccounts: DemoAccount[] = [
  {
    email: "manager@pharmacy.cg",
    password: "password123",
    role: "manager",
  },
  {
    email: "staff@pharmacy.cg",
    password: "password123",
    role: "staff",
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const createdAccounts = [];
    const errors = [];

    for (const account of demoAccounts) {
      const { data: existingUser, error: checkError } = await supabaseAdmin.auth.admin.listUsers();

      if (checkError) {
        errors.push({ email: account.email, error: checkError.message });
        continue;
      }

      const userExists = existingUser.users.some(user => user.email === account.email);

      if (userExists) {
        createdAccounts.push({ email: account.email, status: "already_exists" });
        continue;
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: {
          role: account.role,
        },
      });

      if (error) {
        errors.push({ email: account.email, error: error.message });
      } else {
        createdAccounts.push({ email: account.email, status: "created", id: data.user?.id });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        created: createdAccounts,
        errors: errors,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Setup error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
