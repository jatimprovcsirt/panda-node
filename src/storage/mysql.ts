export class MySqlAdapter {
  constructor(private readonly connection: { query(sql: string): Promise<[any[], any]> | Promise<any> }) {}

  /**
   * Check if connection is TLS secured by querying SHOW SESSION STATUS.
   */
  async isTlsSecured(): Promise<boolean> {
    try {
      const result = await this.connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      // Handle both mysql2 (returns array of rows) and other query interfaces
      const rows = Array.isArray(result) ? result[0] : result;
      if (Array.isArray(rows) && rows.length > 0) {
        const value = rows[0].Value || rows[0].value;
        return !!value && String(value).toLowerCase() !== 'null' && String(value) !== '';
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}
