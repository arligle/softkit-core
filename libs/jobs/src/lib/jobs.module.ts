import { DynamicModule, Logger, Module } from '@nestjs/common';
import { Provider } from '@nestjs/common/interfaces/modules/provider.interface';
import { InjectionToken } from '@nestjs/common/interfaces/modules/injection-token.interface';
import { OptionalFactoryDependency } from '@nestjs/common/interfaces/modules/optional-factory-dependency.interface';
import { JobsConfig } from './config';
import { BaseJobData } from './service/vo';
import {
  JOB_SERVICE_TOKEN,
  JOBS_CONFIG_TOKEN,
  SCHEDULING_JOB_SERVICE_TOKEN,
} from './constants';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  JobInitializationService,
  JobService,
  SchedulingJobService,
} from './service';
import { Job, JobExecution } from './entity';
import * as Repositories from './repository';
import { BullModule } from '@nestjs/bullmq';
import { RegisterQueueOptions } from '@nestjs/bullmq/dist/interfaces/register-queue-options.interface';

type JobsConfigOrPromise<T extends BaseJobData> =
  | JobsConfig<T>
  | Promise<JobsConfig<T>>;

export interface JobsConfigFactory {
  createJobsConfigOptions: <T extends BaseJobData>() => JobsConfigOrPromise<T>;
}

export interface JobsAsyncParams {
  queueNames: string[];
  useFactory: <T extends BaseJobData>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => JobsConfigOrPromise<T>;
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  providers?: Provider[];
}

export const createAsyncOptions = async <T extends BaseJobData>(
  optionsFactory: JobsConfigFactory,
): Promise<JobsConfig<T>> => {
  return optionsFactory.createJobsConfigOptions();
};

@Module({})
export class JobsModule {
  static logger: Logger = new Logger(JobsModule.name);

  static forRootAsync(
    options: JobsAsyncParams,
    global: boolean = true,
  ): DynamicModule {
    const defaultProvidersAndExports = this.createDefaultProvidersAndExports(
      options.queueNames,
    );

    const asyncConfigProvider = JobsModule.createAsyncOptionsProvider(options);

    if (defaultProvidersAndExports.providers) {
      defaultProvidersAndExports.providers.push(asyncConfigProvider);
    }

    return {
      global,
      ...defaultProvidersAndExports,
    };
  }

  static forRoot<T extends BaseJobData = BaseJobData>(
    config: JobsConfig<T>,
    queueNames: string[],
    global: boolean = true,
  ): DynamicModule {
    const jobsConfigProvider: Provider = {
      provide: JOBS_CONFIG_TOKEN,
      useValue: config,
    };

    const defaultProvidersAndExports =
      this.createDefaultProvidersAndExports(queueNames);

    if (defaultProvidersAndExports.providers) {
      defaultProvidersAndExports.providers.push(jobsConfigProvider);
    }

    return {
      global,
      ...defaultProvidersAndExports,
    };
  }

  private static createDefaultProvidersAndExports(
    queueNames: string[],
  ): DynamicModule {
    const sanitizedQueueNames = this.validateAndSanitizeQueueNames(queueNames);

    const registerQueuesModules = this.registerQueues(sanitizedQueueNames);
    const bullModule = BullModule.forRootAsync({
      useFactory: (jobsConfig: JobsConfig) => jobsConfig,
      inject: [JOBS_CONFIG_TOKEN],
    });

    return {
      module: JobsModule,
      imports: [
        ...registerQueuesModules,
        bullModule,
        TypeOrmModule.forFeature([Job, JobExecution]),
      ],
      providers: [
        JobInitializationService,
        {
          provide: JOB_SERVICE_TOKEN,
          useClass: JobService,
        },
        {
          provide: SCHEDULING_JOB_SERVICE_TOKEN,
          useClass: SchedulingJobService,
        },
        ...Object.values(Repositories),
      ],
      exports: [
        bullModule,
        ...registerQueuesModules,
        JOBS_CONFIG_TOKEN,
        JOB_SERVICE_TOKEN,
        SCHEDULING_JOB_SERVICE_TOKEN,
      ],
    };
  }

  private static registerQueues(sanitizedQueueNames: string[]) {
    return sanitizedQueueNames.map((queueName) => {
      return BullModule.registerQueueAsync({
        name: queueName,
        useFactory: (config: JobsConfig) => {
          const allJobs = [
            ...(config.jobs || []),
            ...(config.systemJobs?.jobs || []),
          ];

          const allQueuesConfigs = new Set(
            allJobs.map((value) => {
              return value.name;
            }),
          );

          const allPresent = sanitizedQueueNames.every((q) => {
            return allQueuesConfigs.has(q);
          });

          if (!allPresent) {
            const message = `Not all provided queues are presented in a config, that should not happen.
                  Config queues: ${allQueuesConfigs}, provided list to a method: ${sanitizedQueueNames}`;
            JobsModule.logger.log(message);
            throw new Error(message);
          }

          if (sanitizedQueueNames.length !== allQueuesConfigs.size) {
            const missingQueues = [...allQueuesConfigs].filter(
              (q) => !sanitizedQueueNames.includes(q),
            );

            const message = `There are more jobs in a config, than provided to a method.
             Missing queues: ${missingQueues}. Please add them to initial list of queues or remove it from the config`;
            JobsModule.logger.log(message);
            throw new Error(message);
          }
          const jobConfig = allJobs?.find((j) => {
            return j.name === queueName;
          });

          if (!jobConfig) {
            const allQueuesConfigs = allJobs.map((value) => {
              return value.name;
            });

            const message = `There is a missing config for the queue: ${queueName}, there are configurations available for queues: ${allQueuesConfigs}, it may be a typo or just missing config, check it please`;
            JobsModule.logger.log(message);
            throw new Error(message);
          }

          return {
            name: jobConfig.name,
            defaultJobOptions: jobConfig.defaultJobOptions,
            // connection should be provided each time to prevent redis to hang up with one connection
            connection: config.connection,
          } satisfies RegisterQueueOptions;
        },
        inject: [JOBS_CONFIG_TOKEN],
      });
    });
  }

  private static createAsyncOptionsProvider = (
    options: JobsAsyncParams,
  ): Provider => {
    return {
      provide: JOBS_CONFIG_TOKEN,
      useFactory: options.useFactory,
      inject: options.inject,
    };
  };

  private static validateAndSanitizeQueueNames = (queueNames: string[]) => {
    const sanitizedQueues = [
      ...new Set(
        queueNames.filter((q) => q !== '' && q !== undefined && q !== null),
      ),
    ];

    if (
      sanitizedQueues.length !== queueNames.length ||
      sanitizedQueues.length === 0
    ) {
      const message = `You provided an empty queue name in a list or the list is empty, or a duplicate appear. Original list: ${queueNames}, sanitized list: ${sanitizedQueues}`;
      JobsModule.logger.log(message);
      throw new Error(message);
    }

    return sanitizedQueues;
  };
}
