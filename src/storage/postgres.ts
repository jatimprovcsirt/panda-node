export class PostgresAdapter {
  constructor(private readonly connection: { query(sql: string): Promise<{ rows: any[] }> | Promise<any> }) {}

  /**
   * Check if connection is TLS secured by querying pg_stat_ssl.
   */
  async isTlsSecured(): Promise<boolean> {
    try {
      const result = await this.connection.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
      const rows = result && typeof result === 'object' && 'rows' in result ? result.rows : result;
      if (Array.isArray(rows) && rows.length > 0) {
        return !!rows[0].ssl;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}
