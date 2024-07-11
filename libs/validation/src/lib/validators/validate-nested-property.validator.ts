import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ValidateNested, IsObject, ValidationOptions } from 'class-validator';

interface ValidateNestedPropertyOptions<T> {
  required?: boolean;
  validationOptions?: ValidationOptions;
  classType: new () => T;
}

export const ValidateNestedProperty = <T>({
  required = true,
  validationOptions = {},
  classType,
}: ValidateNestedPropertyOptions<T>) => {
  const decorators = [ValidateNested(validationOptions), Type(() => classType)];

  if (required) {
    decorators.push(IsObject(validationOptions));
  }

  return applyDecorators(...decorators);
};
