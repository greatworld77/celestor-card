const getPublicEnv = (key: string) => {
  const value = process.env[key];

  if (!value && process.env.NODE_ENV === "development") {
    console.warn(`Missing environment variable: ${key}`);
  }

  return value || "";
};

export const env = {
  SUPABASE_URL: getPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_ANON_KEY: getPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  REOWN_PROJECT_ID: getPublicEnv("NEXT_PUBLIC_REOWN_PROJECT_ID"),
  CELESTOR_CARD_CONTRACT: getPublicEnv("NEXT_PUBLIC_CELESTOR_CARD_CONTRACT"),
  CELESTOR_VAULT_CONTRACT: getPublicEnv("NEXT_PUBLIC_CELESTOR_VAULT_CONTRACT"),
  SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL || "https://celestor-card.vercel.app",
  ADMIN_EMAIL:
    process.env.NEXT_PUBLIC_ADMIN_EMAIL || "grove6027@gmail.com",
} as const;