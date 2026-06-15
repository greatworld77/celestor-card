export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "",
  CELESTOR_CARD_CONTRACT:
    process.env.NEXT_PUBLIC_CELESTOR_CARD_CONTRACT || "",
  CELESTOR_VAULT_CONTRACT:
    process.env.NEXT_PUBLIC_CELESTOR_VAULT_CONTRACT || "",
    CELESTOR_LOAD_CONTRACT:
  process.env.NEXT_PUBLIC_CELESTOR_LOAD_CONTRACT || "",
  SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL || "https://celestor-card.vercel.app",
  ADMIN_EMAIL:
    process.env.NEXT_PUBLIC_ADMIN_EMAIL || "grove6027@gmail.com",
} as const;