import { PandaService } from './service';
import { FieldCipher } from '../../crypto/cipher';
import { KeyProvider, createKeyProvider, type VaultConfig } from '../../crypto/keys';
import type { InfisicalConfig } from '../../crypto/keys';

export interface PandaModuleOptions {
  defaultKid?: string;
  providerToken?: string;
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
    const cipher = new FieldCipher(keyProvider, undefined, undefined, options.providerToken);
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
