import pg from 'pg'

const { Client } = pg

const TACTICA_CORE_DB_URL =
  process.env['DATABASE_URL'] ??
  'postgres://tactica_core:tactica_core_password@localhost:5440/tactica_core?sslmode=disable'

const SUPERTOKENS_DB_URL =
  process.env['SUPERTOKENS_DB_URL'] ??
  'postgres://supertokens:supertokens_password@localhost:5440/supertokens?sslmode=disable'

const runSql = async (connectionString: string, sql: string): Promise<void> => {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

export const cleanupDatabase = async (): Promise<void> => {
  // Wipe todos
  await runSql(TACTICA_CORE_DB_URL, 'TRUNCATE TABLE "Todo" CASCADE')

  // Wipe SuperTokens users. The table names here are the public schema tables that SuperTokens
  // v11 creates; truncating them with CASCADE removes all auth state without dropping the schema.
  await runSql(
    SUPERTOKENS_DB_URL,
    `
      TRUNCATE TABLE
        emailpassword_user_to_tenant,
        emailpassword_users,
        session_info,
        all_auth_recipe_users,
        app_id_to_user_id,
        user_metadata
      CASCADE
    `,
  )
}
