import { LibraryGeneratorSchema } from '@nx/js/src/utils/schema';
import { UnitTestRunner } from '@nx/nest/src/generators/utils';

export interface LibGeneratorSchema extends LibraryGeneratorSchema {
  name: string;
  i18n: boolean;
  languages: string[];
  config: boolean;
  unitTestRunner?: UnitTestRunner;
}
