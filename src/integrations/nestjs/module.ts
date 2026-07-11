import { PandaService } from './service';
import { FieldCipher } from '../../crypto/cipher';
import { LocalKeyProvider } from '../../crypto/keys';

export class PandaModule {
  static forRoot(config: { defaultKid?: string; providerToken?: string } = {}) {
    const keyProvider = new LocalKeyProvider();
    const cipher = new FieldCipher(keyProvider, undefined, undefined, config.providerToken);
    const service = new PandaService(cipher);

    return {
      module: PandaModule,
      providers: [
        {
          provide: PandaService,
          useValue: service
        }
      ],
      exports: [PandaService]
    };
  }
}
