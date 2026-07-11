# PANDA Node.js SDK

**PANDA (Private And Secure Data Access)** — AES-256-GCM field-level encryption SDK for Node.js/TypeScript applications.

## Requirements

- Node.js ≥ 18 (LTS)

## Installation

```bash
npm install @jatimprovcsirt/panda-node
```

## Quick Start

```typescript
import { FieldCipher, LocalKeyProvider, Envelope } from '@jatimprovcsirt/panda-node';

// 1. Set up a key provider
const keyProvider = new LocalKeyProvider();
// Keys loaded from env: PANDA_KEY_OPD_DUKCAPIL_KEY_1=<base64>

// 2. Create cipher
const cipher = new FieldCipher(keyProvider);

// 3. Encrypt
const envelope = await cipher.encrypt('3201012501990001', 'opd-dukcapil-key-1');
const json = envelope.toJson(); // Store in TEXT column

// 4. Decrypt (masked by default)
const masked = await cipher.decrypt(envelope);
// → "32************01"

// 5. Decrypt (full value — audited)
const raw = await cipher.decryptRaw(envelope);
// → "3201012501990001"
```

## Express Middleware

```typescript
import { decryptBodyFields } from '@jatimprovcsirt/panda-node';

app.post('/api/citizens', decryptBodyFields(cipher, ['nik', 'phone']), (req, res) => {
  // req.body.nik is now decrypted
});
```

## NestJS Module

```typescript
import { PandaModule } from '@jatimprovcsirt/panda-node';

@Module({
  imports: [PandaModule.forRoot({ defaultKid: 'opd-key-1' })],
})
export class AppModule {}
```

## CLI Commands

```bash
npx panda init --kid <key-id> --token <token>
npx panda rotate-key --new-kid <kid>
npx panda shred <kid>
npx panda migrate <table> <col> <kid>
npx panda migrate --dry-run <table> <col> <kid>
```

## Security

See [SECURITY.md](docs/security/SECURITY.md) for responsible disclosure.

## License

MIT
