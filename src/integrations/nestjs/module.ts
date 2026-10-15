import { PandaService } from './service';
import { FieldCipher } from '../../crypto/cipher';
import { KeyProvider, createKeyProvider, type VaultConfig } from '../../crypto/keys';
import type { InfisicalConfig } from '../../crypto/keys';

export interface PandaModuleOptions {
  defaultKid?: string;
  /**
   * `providerToken` was removed. It existed only to hand the cipher a token
   * for telemetry, and telemetry never ran — the endpoint was a placeholder
   * hostname and nothing ever set the environment variable behind it. An
   * option that is accepted and discarded is worse than one that is absent.
   * The token now comes from `.panda/credentials`, where `panda init` puts it.
   */
  keyProvider?: 'local' | 'vault' | 'infisical';
  vault?: VaultConfig;
  infisical?: InfisicalConfig;
}

export class PandaModule {
  static forRoot(options: PandaModuleOptions = {}) {
    const keyProvider = createKeyProvider(
      options.keyProvider ?? 'local',
      options.vault ? { ...options.vault } : options.infisical ? { ...options.infisical } : undefined
    );
    const cipher = new FieldCipher(keyProvider);
    const service = new PandaService(cipher);

    const keyProviderSymbol = Symbol('KeyProvider');

    return {
      module: PandaModule,
      providers: [
        {
          provide: PandaService,
          useValue: service
        },
        {
          provide: FieldCipher,
          useValue: cipher
        },
        {
          provide: keyProviderSymbol,
          useValue: keyProvider
        }
      ],
      exports: [PandaService, FieldCipher, keyProviderSymbol]
    };
  }
}
