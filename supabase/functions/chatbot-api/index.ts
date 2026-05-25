import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { crypto } from "jsr:@std/crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

interface StockResponse {
  success: boolean;
  data?: {
    product_id: string;
    name: string;
    ean_code?: string;
    total_quantity: number;
    unit_quantity?: number;
    expiry_date?: string;
  };
  error?: string;
}

interface PriceResponse {
  success: boolean;
  data?: {
    product_id: string;
    name: string;
    price_public: number;
    price_cession?: number;
  };
  error?: string;
}

async function verifyApiKey(apiKey: string): Promise<string | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  try {
    const keyHash = await hashKey(apiKey);
    const { data, error } = await supabase
      .from("api_keys")
      .select("user_id")
      .eq("key_hash", keyHash)
      .eq("active", true)
      .maybeSingle();

    if (error || !data) return null;

    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key_hash", keyHash);

    return data.user_id;
  } catch {
    return null;
  }
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getProductStock(
  userId: string,
  query: string
): Promise<StockResponse> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  try {
    let medicationQuery = supabase
      .from("medications")
      .select(
        `
        id,
        name,
        code_produit,
        price_public,
        expiry_date,
        inventory_units(id, status)
      `
      )
      .eq("user_id", userId);

    if (!isNaN(Number(query))) {
      medicationQuery = medicationQuery.eq("code_produit", query);
    } else {
      medicationQuery = medicationQuery.ilike("name", `%${query}%`);
    }

    const { data, error } = await medicationQuery.limit(1).maybeSingle();

    if (error || !data) {
      return {
        success: false,
        error: "Produit non trouvé",
      };
    }

    const availableUnits = (data.inventory_units || []).filter(
      (u: { status: string }) => u.status === "available"
    ).length;

    const totalQuantity =
      (data.inventory_units || []).length + (data.quantity || 0);

    return {
      success: true,
      data: {
        product_id: data.id,
        name: data.name,
        ean_code: data.code_produit,
        total_quantity: totalQuantity,
        unit_quantity: availableUnits,
        expiry_date: data.expiry_date,
      },
    };
  } catch (err) {
    console.error("Stock query error:", err);
    return {
      success: false,
      error: "Erreur lors de la consultation du stock",
    };
  }
}

async function getProductPrice(
  userId: string,
  query: string
): Promise<PriceResponse> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  try {
    let medicationQuery = supabase
      .from("medications")
      .select("id, name, code_produit, price_public, price_cession")
      .eq("user_id", userId);

    if (!isNaN(Number(query))) {
      medicationQuery = medicationQuery.eq("code_produit", query);
    } else {
      medicationQuery = medicationQuery.ilike("name", `%${query}%`);
    }

    const { data, error } = await medicationQuery.limit(1).maybeSingle();

    if (error || !data) {
      return {
        success: false,
        error: "Produit non trouvé",
      };
    }

    return {
      success: true,
      data: {
        product_id: data.id,
        name: data.name,
        price_public: data.price_public || 0,
        price_cession: data.price_cession,
      },
    };
  } catch (err) {
    console.error("Price query error:", err);
    return {
      success: false,
      error: "Erreur lors de la consultation du prix",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const apiKey = req.headers.get("X-API-Key");

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Clé API requise (header X-API-Key)",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const userId = await verifyApiKey(apiKey);
  if (!userId) {
    return new Response(
      JSON.stringify({ success: false, error: "Clé API invalide" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const pathname = url.pathname;

  if (pathname === "/chatbot-api/stock" && req.method === "GET") {
    const query = url.searchParams.get("q") || "";
    if (!query) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Paramètre 'q' (nom ou code EAN) requis",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await getProductStock(userId, query);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (pathname === "/chatbot-api/price" && req.method === "GET") {
    const query = url.searchParams.get("q") || "";
    if (!query) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Paramètre 'q' (nom ou code EAN) requis",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await getProductPrice(userId, query);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: "Endpoint non trouvé. Utilisez /chatbot-api/stock ou /chatbot-api/price",
    }),
    {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
