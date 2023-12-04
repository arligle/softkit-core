import { faker } from '@faker-js/faker';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';

import {
  expectNotNullAndGet,
  StartedDb,
  startPostgres,
} from '@softkit/test-utils';
import { USER_PAGINATED_CONFIG, UserEntity } from './app/user.entity';
import { UserRepository } from './app/user-repository.service';
import { FilterOperator } from 'nestjs-paginate';
import { setupTypeormModule } from '../lib/setup-typeorm-module';

describe('start db and populate the entity', () => {
  let testBaseRepository: UserRepository;
  let db: StartedDb;

  beforeAll(async () => {
    db = await startPostgres({
      runMigrations: false,
      additionalTypeOrmModuleOptions: {
        entities: [UserEntity],
        migrations: ['app/migrations/*.ts'],
      },
    });
  }, 60_000);

  afterAll(async () => {
    await db.container.stop();
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forFeature([UserEntity]),
        setupTypeormModule({
          optionsFactory: db.TypeOrmConfigService,
        }),
      ],
      providers: [UserRepository],
    }).compile();

    testBaseRepository = module.get(UserRepository);
  });

  test('insert and find test', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
    };

    const saved = await testBaseRepository.createOrUpdate(toSave);

    checkAllTestFieldsPresent(toSave, saved);

    const resultFromFindOne = await testBaseRepository.findOne({
      where: {
        firstName: toSave.firstName,
      },
    });

    expect(resultFromFindOne).toBeDefined();
    expect(resultFromFindOne?.id).toBe(saved.id);
    checkAllTestFieldsPresent(toSave, resultFromFindOne);

    const findOneById = await testBaseRepository.findSingle(saved.id);

    checkAllTestFieldsPresent(toSave, findOneById);
  });

  test('parallel updates', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
    };

    const saved = await testBaseRepository.createOrUpdate(toSave);

    const updates = [...'1'.repeat(10)].map(() => {
      return testBaseRepository.update(saved.id, {
        firstName: faker.person.firstName() + faker.number.int(),
      });
    });

    await Promise.all(updates);

    const saves = [...'1'.repeat(10)].map(() => {
      return testBaseRepository.save({
        ...saved,
        firstName: faker.person.firstName() + faker.number.int(),
      });
    });

    await Promise.all(saves);
  });

  test('save with partial save check returned value', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
    };

    const saved = await testBaseRepository.createOrUpdate(toSave);

    expect(saved).toBeDefined();
    expect(saved.id).toBeDefined();
    expect(saved.password).toBeDefined();
    expect(saved.firstName).toBeDefined();
    expect(saved.lastName).toBeDefined();
    expect(saved.nullableStringField).toBeNull();
    expect(saved.createdAt).toBeDefined();
    expect(saved.updatedAt).toBeDefined();
    expect(saved.deletedAt).toBeNull();
    expect(saved.version).toBeDefined();

    const updateLastNameField = await testBaseRepository.createOrUpdate({
      id: saved.id,
      lastName: faker.person.lastName() + faker.number.int(),
    });

    expect(updateLastNameField.id).toBeDefined();
    expect(updateLastNameField.lastName).toBeDefined();
    expect(updateLastNameField.updatedAt).toBeDefined();
    expect(updateLastNameField.version).toBeDefined();

    expect(updateLastNameField.password).toBeNull();
    expect(updateLastNameField.firstName).toBeUndefined();
    expect(updateLastNameField.deletedAt).toBeNull();
    expect(updateLastNameField.createdAt).toBeUndefined();
  });

  test('save with partial save and return', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
    };

    const saved = await testBaseRepository.createOrUpdateWithReload(toSave);

    expect(saved).toBeDefined();
    expect(saved.id).toBeDefined();
    expect(saved.password).toBeDefined();
    expect(saved.firstName).toBeDefined();
    expect(saved.lastName).toBeDefined();
    expect(saved.nullableStringField).toBeNull();
    expect(saved.createdAt).toBeDefined();
    expect(saved.updatedAt).toBeDefined();
    expect(saved.deletedAt).toBeNull();
    expect(saved.version).toBeDefined();

    const updateLastNameField =
      await testBaseRepository.createOrUpdateWithReload({
        id: saved.id,
        lastName: faker.person.lastName() + faker.number.int(),
      });

    expect(updateLastNameField).toBeDefined();
    expect(updateLastNameField.id).toBeDefined();
    expect(updateLastNameField.password).toBeDefined();
    expect(updateLastNameField.firstName).toBeDefined();
    expect(updateLastNameField.lastName).toBeDefined();
    expect(updateLastNameField.nullableStringField).toBeNull();
    expect(updateLastNameField.createdAt).toBeDefined();
    expect(updateLastNameField.updatedAt).toBeDefined();
    expect(updateLastNameField.deletedAt).toBeNull();
    expect(updateLastNameField.version).toBeDefined();
  });

  test('save and override null value', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
      nullableStringField: faker.person.jobTitle(),
    };

    const saved = await testBaseRepository.createOrUpdate(toSave);

    expect(saved.nullableStringField).toBe(toSave.nullableStringField);

    const secondToSave = {
      id: saved.id,
      firstName: toSave.firstName,
      lastName: toSave.lastName,
      // eslint-disable-next-line unicorn/no-null
      nullableStringField: null,
    };

    const savedSecondTime =
      await testBaseRepository.createOrUpdate(secondToSave);

    expect(savedSecondTime.nullableStringField).toBeNull();

    const findSecondTime = await testBaseRepository.findSingle(
      savedSecondTime.id,
    );

    expect(findSecondTime?.nullableStringField).toBeNull();
  });

  test('count by test', async () => {
    const firstName = 'First Name';

    const dataToSave = [...Array.from({ length: 5 }).keys()].map((a) => {
      return {
        password: faker.hacker.ingverb() + a,
        firstName,
        lastName: faker.person.lastName(),
        nullableStringField: faker.person.jobTitle(),
      };
    });

    const saved = await testBaseRepository.save(dataToSave);

    const count = await testBaseRepository.countBy({
      firstName,
    });

    expect(count).toBe(saved.length);
  });

  test('find all by ids test', async () => {
    const dataToSave = [...Array.from({ length: 5 }).keys()].map((a) => {
      return {
        password: faker.hacker.ingverb() + a,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        nullableStringField: faker.person.jobTitle(),
      };
    });

    const savedEntities = await testBaseRepository.save(dataToSave);

    const allIds = savedEntities.map(({ id }) => id);

    const resultOfFind = await testBaseRepository.findAllByIds(allIds);

    for (const saved of savedEntities) {
      const foundEntity = expectNotNullAndGet(
        resultOfFind.find(({ id }) => saved.id === id),
      );

      expect(saved.id).toBe(foundEntity.id);
      expect(saved.firstName).toBe(foundEntity.firstName);
    }
  });

  test('to json function', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
      nullableStringField: faker.person.jobTitle(),
    };

    const saved = await testBaseRepository.save(toSave);

    const savedEntity = expectNotNullAndGet(
      await testBaseRepository.findSingle(saved.id),
    );

    const json = savedEntity.toJSON();

    expect(json['password']).toBe(toSave.password);
    expect(json['firstName']).toBe(toSave.firstName);
    expect(json['lastName']).toBe(toSave.lastName);
    expect(json['nullableStringField']).toBe(toSave.nullableStringField);
    expect(json['createdAt']).toBeDefined();
    expect(json['updatedAt']).toBeDefined();
    expect(json['deletedAt']).toBeDefined();
    expect(json['version']).toBeDefined();
  });

  test('archive entity test', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
      nullableStringField: faker.person.jobTitle(),
    };

    const saved = await testBaseRepository.save(toSave);

    const foundEntity = expectNotNullAndGet(
      await testBaseRepository.findSingle(saved.id),
    );

    const archived = await testBaseRepository.archive(
      saved.id,
      foundEntity.version,
    );

    expect(archived).toBeTruthy();

    const foundArchived = await testBaseRepository.findSingle(saved.id);

    expect(foundArchived).toBeNull();

    const notFoundArchiveForTheFirstTime = await testBaseRepository.findSingle(
      saved.id,
    );

    expect(notFoundArchiveForTheFirstTime).toBeNull();

    const foundArchivedAfterFirstArchive = expectNotNullAndGet(
      await testBaseRepository.findSingle(saved.id, true),
    );

    expect(foundArchivedAfterFirstArchive.version).toBe(
      foundEntity.version + 1,
    );

    expect(foundArchivedAfterFirstArchive.deletedAt).toBeDefined();

    const archivedSecondTime = await testBaseRepository.archive(
      saved.id,
      foundEntity.version + 1,
    );

    expect(archivedSecondTime).toBeFalsy();

    const foundArchivedAfterSecondArchive = await testBaseRepository.findSingle(
      saved.id,
    );

    expect(foundArchivedAfterSecondArchive).toBeNull();
  });

  test('archive and restore entity test', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
      nullableStringField: faker.person.jobTitle(),
    };

    const saved = await testBaseRepository.save(toSave);

    const foundEntity = expectNotNullAndGet(
      await testBaseRepository.findSingle(saved.id),
    );

    const archived = await testBaseRepository.archive(
      saved.id,
      foundEntity.version,
    );

    expect(archived).toBeTruthy();

    const foundArchived = await testBaseRepository.findSingle(saved.id);

    expect(foundArchived).toBeNull();

    const versionToRestore = foundEntity.version + 1;
    const restoreResults = await testBaseRepository.unarchive(
      foundEntity.id,
      versionToRestore,
    );

    expect(restoreResults).toBeTruthy();

    const restoredEntity = expectNotNullAndGet(
      await testBaseRepository.findSingle(saved.id),
    );

    expect(restoredEntity.version).toBe(versionToRestore + 1);
  });

  test('run in transaction failed, do not save test', async () => {
    const toSaveSuccess = {
      password: faker.hacker.ingverb(),
      firstName: 'success',
      lastName: faker.person.lastName(),
      nullableStringField: faker.person.jobTitle(),
    };

    const toSaveFailed = {
      ...toSaveSuccess,
      firstName: faker.string.alpha({ length: 1024 }),
    };

    await expect(
      testBaseRepository.runInTransaction(async (qr) => {
        await qr.manager.save(UserEntity, toSaveSuccess);
        await qr.manager.save(UserEntity, toSaveFailed);
      }),
    ).rejects.toBeInstanceOf(QueryFailedError);

    const savedEntity = await testBaseRepository.findOne({
      where: {
        firstName: toSaveSuccess.firstName,
      },
    });

    expect(savedEntity).toBeNull();
  });

  test('run in transaction success', async () => {
    const toSaveSuccessFirst = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + '1',
      lastName: faker.person.lastName(),
      nullableStringField: faker.person.jobTitle(),
    };

    const toSaveSuccessSecond = {
      ...toSaveSuccessFirst,
      firstName: faker.person.firstName() + '2',
    };

    await testBaseRepository.runInTransaction(async (qr) => {
      await qr.manager.save(UserEntity, toSaveSuccessFirst);
      await qr.manager.save(UserEntity, toSaveSuccessSecond);
    });

    const savedEntity = await testBaseRepository.findAllPaginated(
      {
        path: 'users',
        filter: {
          firstName: [
            FilterOperator.IN,
            [toSaveSuccessFirst.firstName, toSaveSuccessSecond.firstName].join(
              ',',
            ),
          ].join(':'),
        },
      },
      USER_PAGINATED_CONFIG,
    );

    expect(savedEntity.data.length).toBe(2);
  });

  test('save and update', async () => {
    const toSave = {
      password: faker.hacker.ingverb(),
      firstName: faker.person.firstName() + faker.number.int(),
      lastName: faker.person.lastName(),
    };

    const saved = await testBaseRepository.save(toSave);

    const insertedRecord = await testBaseRepository
      .findSingle(saved.id)
      .then(expectNotNullAndGet);

    checkAllTestFieldsPresent(toSave, insertedRecord);

    insertedRecord.lastName = toSave.lastName + '1';

    const entityToUpdate = {
      id: insertedRecord.id,
      ...toSave,
    };

    const updated = await testBaseRepository.save(entityToUpdate);

    const updatedRecord = await testBaseRepository
      .findSingle(updated.id)
      .then(expectNotNullAndGet);

    expect(entityToUpdate.id).toBe(updatedRecord.id);
    checkAllTestFieldsPresent(entityToUpdate, updatedRecord);
    expect(insertedRecord.lastName).not.toBe(updatedRecord.lastName);

    const updatedSameRecordWithSameValuesAsInDb =
      await testBaseRepository.save(entityToUpdate);

    const updatedRecordWithoutAnyChanges = await testBaseRepository
      .findSingle(updatedSameRecordWithSameValuesAsInDb.id)
      .then(expectNotNullAndGet);

    // record shouldn't be updated because there are no changes in the entity
    expect(updatedRecordWithoutAnyChanges.updatedAt.getTime()).toBe(
      updatedRecord.updatedAt.getTime(),
    );

    checkAllTestFieldsPresent(entityToUpdate, updatedRecordWithoutAnyChanges);
  });
});

function checkAllTestFieldsPresent(
  dtoForSaving: { firstName: string; lastName: string; password: string },
  saved?: UserEntity | null,
) {
  expect(saved).toBeDefined();

  if (!saved) {
    return;
  }

  expect(saved.id).toBeDefined();
  expect(saved.password).toBe(dtoForSaving.password);
  expect(saved.firstName).toBe(dtoForSaving.firstName);
  expect(saved.lastName).toBe(dtoForSaving.lastName);
  expect(saved.createdAt).toBeDefined();
  expect(saved.updatedAt).toBeDefined();
  expect(saved.deletedAt).toBeNull();
  expect(saved.nullableStringField).toBeNull();
}
