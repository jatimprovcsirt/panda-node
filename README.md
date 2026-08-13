# PANDA Node.js SDK

**PANDA (Private And Secure Data Access)** — AES-256-GCM field-level encryption SDK for Node.js/TypeScript applications.

> Melindungi data pribadi warga (NIK, nama, nomor HP, alamat) dari kebocoran database, sesuai amanah UU PDP No. 27/2022.

## Requirements

- Node.js ≥ 18 (LTS)
- npm / yarn / pnpm

## Key Provider Options

PANDA SDK supports three key provider options for storing encryption keys:

### 1. LocalKeyProvider (Development Only)
- **Best for**: Development, testing, quick prototypes
- **Setup**: Zero configuration required
- **Security**: Keys stored in environment variables (NOT production-ready)
- **Cost**: Free

### 2. InfisicalKeyProvider (Recommended for Production)
- **Best for**: Startups, SMBs, teams new to secret management
- **Setup**: Sign up at https://infisical.com (free tier available)
- **Security**: Cloud or self-hosted with Machine Identity authentication
- **Cost**: Free tier available, paid tiers for advanced features

### 3. VaultKeyProvider (Enterprise Option)
- **Best for**: Enterprise environments with existing Vault infrastructure
- **Setup**: Self-hosted HashiCorp Vault with KV v2
- **Security**: Industry-standard secret management
- **Cost**: Self-hosted free, paid enterprise support available

> **Important**: For production deployments, always use InfisicalKeyProvider or VaultKeyProvider. Never use LocalKeyProvider in production.

See [Key Provider Comparison](../../docs/key-provider-comparison.md) for detailed comparison.

## Installation

```bash
npm install @jatimprovcsirt/panda-node
```

---

## 1. PANDA Master Key Initialization (Langkah Pertama yang Wajib)

Sebelum menulis kode integrasi apapun, Anda harus menghasilkan kunci master lokal untuk aplikasi Anda. Ini adalah gerbang keamanan satu kali sebelum PANDA bisa beroperasi.

### Langkah 1: Dapatkan PANDA Access Token

Anda harus memiliki PANDA Access Token untuk menginisialisasi kunci master aplikasi Anda.

**Daftar aplikasi dan dapatkan token di:** https://csirt.jatimprov.go.id/panda

> [!NOTE]
> Setiap aplikasi memerlukan token unik. Token digunakan sebagai gerbang keamanan satu kali untuk inisialisasi kunci.

### Langkah 2: Jalankan Perintah Init

Jalankan perintah berikut di direktori root proyek Anda. Ganti `opd-dukcapil-key-1` dengan key identifier (KID) Anda dan `YOUR_TOKEN` dengan PANDA Access Token yang diperoleh dari portal (panjang: 48 atau 64 karakter hex):

```bash
npx panda init --kid opd-dukcapil-key-1 --token YOUR_TOKEN
```

> [!NOTE]
> Untuk pengembangan lokal, Anda dapat menggunakan demo token bawaan:
> `panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2`

### Langkah 2: Apa yang Terjadi?

Perintah `init` melakukan hal berikut:
1. Memvalidasi format token Anda.
2. Menghasilkan kunci 256-bit yang aman secara kriptografis secara **lokal** (token tidak pernah menerima kunci ini).
3. Secara otomatis menambahkan kunci dalam format base64 ke file `.env` Anda (misal: `PANDA_KEY_OPD_DUKCAPIL_KEY_1=...`).

### Langkah 3: Restart Terminal/Server (Penting!)

> [!IMPORTANT]
> Karena Node.js membaca variabel environment saat startup:
> - **Jika menjalankan web server** (Express, NestJS, Fastify, dll.), Anda **HARUS merestart server** agar variabel environment baru terbaca.
> - **Jika menjalankan script di terminal/CMD**, Anda **HARUS membuka terminal baru** atau reload variabel environment.

### Menambahkan KID/Kunci Tambahan

Jika aplikasi Anda membutuhkan lebih dari satu kunci (misalnya untuk bidang data yang berbeda atau rotasi secara bertahap), jalankan perintah `init` kembali dengan KID baru dan token yang sama:

```bash
# Kunci pertama: untuk field NIK
npx panda init --kid opd-dukcapil-key-1 --token YOUR_TOKEN

# Kunci kedua: untuk field nomor HP
npx panda init --kid opd-dukcapil-key-2 --token YOUR_TOKEN

# Kunci untuk blind index (suffix -idx wajib dipisah)
npx panda init --kid opd-dukcapil-key-1-idx --token YOUR_TOKEN
```

> [!NOTE]
> Satu token dapat digunakan untuk menginisialisasi beberapa KID/kunci dalam aplikasi yang sama. Token digunakan kembali setiap kali Anda perlu menghasilkan kunci baru.

### Rotasi Kunci (Tanpa Portal)

Untuk merotasi kunci pada KID yang sudah ada, gunakan `rotate-key`. Perintah ini berjalan **sepenuhnya lokal** tanpa memerlukan token:

```bash
# Rotasi: buat kunci baru dan set sebagai default KID aktif
npx panda rotate-key --new-kid opd-dukcapil-key-2
```

### Menghapus Kunci (Crypto-Shred)

```bash
# Hapus kunci secara permanen (HATI-HATI: data yang dienkripsi dengan kunci ini tidak bisa didekripsi lagi!)
npx panda shred opd-dukcapil-key-old
```

---

## Infisical Setup (Production-Ready Alternative)

Untuk deployment produksi, disarankan menggunakan Infisical sebagai KeyProvider alih-alih LocalKeyProvider (env vars).

### Setup Infisical Cloud

1. **Buat Akun Infisical**
   - Daftar di https://infisical.com (free tier tersedia)
   - Buat project baru
   - Buat environment (dev, staging, prod)

2. **Buat Machine Identity**
   - Buka "Machine Identities" di project Anda
   - Klik "Create Machine Identity"
   - Pilih environment yang diakses
   - Copy Client ID dan Client Secret

3. **Upload Kunci Enkripsi**
   - Buka "Secrets" di project
   - Pilih environment
   - Klik "Add Secret"
   - Secret Key: `nik-key` (atau KID Anda)
   - Secret Value: `<base64-encoded-32-byte-key>` (generate dengan `openssl rand -base64 32`)

4. **Konfigurasi Aplikasi**
   ```bash
   # .env
   PANDA_KEY_PROVIDER_DRIVER=infisical
   PANDA_INFISICAL_SITE_URL=https://app.infisical.com
   PANDA_INFISICAL_CLIENT_ID=<client-id>
   PANDA_INFISICAL_CLIENT_SECRET=<client-secret>
   PANDA_INFISICAL_PROJECT_ID=<project-id>
   PANDA_INFISICAL_ENVIRONMENT=dev
   PANDA_INFISICAL_CACHE_TTL=300
   ```

### Menggunakan InfisicalKeyProvider dalam Kode

```typescript
import { InfisicalKeyProvider, FieldCipher } from '@jatimprovcsirt/panda-node';

// Baca dari environment variables atau config
const keyProvider = new InfisicalKeyProvider({
  siteUrl: process.env.PANDA_INFISICAL_SITE_URL!,
  clientId: process.env.PANDA_INFISICAL_CLIENT_ID!,
  clientSecret: process.env.PANDA_INFISICAL_CLIENT_SECRET!,
  projectId: process.env.PANDA_INFISICAL_PROJECT_ID!,
  environment: process.env.PANDA_INFISICAL_ENVIRONMENT!,
  cacheTTL: 300, // optional, default 300 seconds
});

const cipher = new FieldCipher(keyProvider);

// Sisa kode tetap sama
const encrypted = await cipher.encrypt("3201012501990001", "nik-key");
```

**Keuntungan Infisical:**
- ✅ Production-ready dengan auto-renewal (tanpa token expiration)
- ✅ UI modern yang mudah digunakan
- ✅ Free tier untuk project kecil
- ✅ Cloud atau self-hosted options

Untuk setup lengkap Infisical, lihat [Infisical Setup Guide](../../docs/infisical-setup-guide.md).

---

## 2. Quick Start — Express.js

### Langkah 1: Siapkan KeyProvider dan FieldCipher

```typescript
import { LocalKeyProvider, FieldCipher } from '@jatimprovcsirt/panda-node';

// KeyProvider membaca PANDA_KEY_<KID> dari environment
const keyProvider = new LocalKeyProvider();
const cipher = new FieldCipher(keyProvider);
```

### Langkah 2: Enkripsi Data (Sebelum Disimpan ke DB)

```typescript
const rawNik = '3201012501990001';
const kid = 'opd-dukcapil-key-1';

const envelope = await cipher.encrypt(rawNik, kid);
const jsonForDatabase = envelope.toJson();
// Simpan jsonForDatabase ke kolom TEXT di database
```

### Langkah 3: Dekripsi Data (Dari Query DB)

```typescript
import { Envelope } from '@jatimprovcsirt/panda-node';

const row = await db.query('SELECT nik FROM citizens WHERE id = 1');
const envelope = Envelope.fromJson(row.nik);

// A. Dekripsi dengan masking (aman untuk log/tampilan umum)
const masked = await cipher.decrypt(envelope);
console.log(masked); // "32************01"

// B. Dekripsi penuh — untuk audit/export
const raw = await cipher.decryptRaw(envelope);
console.log(raw); // "3201012501990001"
```

### Langkah 4: Blind Index untuk Pencarian

Untuk mencari data terenkripsi, simpan hash deterministik (blind index) di kolom terpisah (`nik_bidx`):

```typescript
import { BlindIndexer } from '@jatimprovcsirt/panda-node';

// KID blind index HARUS menggunakan suffix -idx
const blindIndexKid = 'opd-dukcapil-key-1-idx';
const blindIndexKey = keyProvider.getKey(blindIndexKid);

// Saat INSERT/UPDATE: hitung blind index
const blindIndexValue = BlindIndexer.generate(rawNik, blindIndexKey, 'digits');
// Simpan blindIndexValue ke kolom 'nik_bidx'

// Saat SELECT: hash nilai pencarian dan query berdasarkan hash
const searchHash = BlindIndexer.generate('3201012501990001', blindIndexKey, 'digits');
const result = await db.query('SELECT * FROM citizens WHERE nik_bidx = ?', [searchHash]);
```

---

## 3. Express Middleware

```typescript
import { decryptBodyFields } from '@jatimprovcsirt/panda-node';

app.post('/api/citizens', decryptBodyFields(cipher, ['nik', 'phone']), (req, res) => {
  // req.body.nik sudah terdekripsi
  res.json({ success: true });
});
```

---

## 4. NestJS Module

```typescript
import { PandaModule } from '@jatimprovcsirt/panda-node';

@Module({
  imports: [PandaModule.forRoot({ defaultKid: 'opd-dukcapil-key-1' })],
})
export class AppModule {}
```

---

## 5. Database Refactoring & Zero-Downtime Migration

Jika Anda memiliki aplikasi yang sudah berjalan dengan data plaintext di database, ikuti alur migrasi ini tanpa downtime.

### Alur Migrasi

```
Step 1: ALTER kolom → TEXT + tambah kolom _bidx
      ↓
Step 2: Init PANDA master key + restart server
      ↓
Step 3: Jalankan migrate CLI (konversi plaintext ke envelope)
      ↓
Step 4: Update kode aplikasi (enkripsi on-write, query via _bidx)
      ↓
Step 5: Backfill blind index untuk data yang sudah terenkripsi
```

### Step 1: Alter Kolom Database

```sql
ALTER TABLE citizens MODIFY COLUMN nik TEXT;
ALTER TABLE citizens ADD COLUMN nik_bidx VARCHAR(64) NULL;
CREATE INDEX idx_citizens_nik_bidx ON citizens(nik_bidx);
```

### Step 2: Init PANDA Key

Lihat Bagian 1 di atas.

### Step 3: Jalankan Migrasi CLI

```bash
# Konversi semua plaintext ke encrypted envelope (resumable jika terputus)
npx panda migrate citizens nik opd-dukcapil-key-1

# Opsi tambahan:
# --batch-size <n>  : jumlah baris per chunk (default: 100)
# --delay <ms>      : jeda antar chunk (default: 100ms)
# --pk <col>        : nama kolom primary key (default: id)
# --dry-run         : estimasi scope tanpa mengubah data
npx panda migrate citizens nik opd-dukcapil-key-1 --batch-size 500 --dry-run
```

Perintah ini menyimpan checkpoint di tabel `panda_migration_state`, jadi aman jika terputus dan bisa dilanjutkan.

### Step 4: Backfill Blind Index

```typescript
import { BlindIndexer, Envelope, LocalKeyProvider } from '@jatimprovcsirt/panda-node';

const keyProvider = new LocalKeyProvider();
const cipher = new FieldCipher(keyProvider);
const blindIndexKey = keyProvider.getKey('opd-dukcapil-key-1-idx');

// Proses semua baris yang belum punya blind index
const rows = await db.query('SELECT id, nik FROM citizens WHERE nik_bidx IS NULL');
for (const row of rows) {
  const envelope = Envelope.fromJson(row.nik);
  const rawVal = await cipher.decryptRaw(envelope);
  const hash = BlindIndexer.generate(rawVal, blindIndexKey, 'digits');
  await db.query('UPDATE citizens SET nik_bidx = ? WHERE id = ?', [hash, row.id]);
}
console.log('Blind index backfill selesai!');
```

---

## 6. Referensi CLI

| Perintah | Memerlukan Token | Deskripsi |
|---|---|---|
| `npx panda init --kid <kid> --token <token>` | ✅ Ya | Generate kunci master baru untuk KID tertentu |
| `npx panda rotate-key --new-kid <kid>` | ❌ Tidak | Buat kunci baru secara lokal, set sebagai default aktif |
| `npx panda shred <kid>` | ❌ Tidak | Hapus kunci secara permanen (irreversible!) |
| `npx panda migrate <table> <col> <kid>` | ❌ Tidak | Migrasi plaintext → encrypted envelope di database |
| `npx panda migrate --dry-run <table> <col> <kid>` | ❌ Tidak | Estimasi scope migrasi tanpa mengubah data |

---

## Security

See [SECURITY.md](docs/security/SECURITY.md) for responsible disclosure.

## License

MIT
