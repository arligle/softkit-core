import { HttpStatus } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { TokenService } from '../lib/services/token.service';
import {
  IRefreshTokenPayload,
  PermissionsBaseJwtPayload,
} from '../lib/vo/payload';
import { TestAppModule } from './app/app.module';

describe('test refresh auth', () => {
  let tokenService: TokenService;
  let app: NestFastifyApplication;

  const jwtPayload: PermissionsBaseJwtPayload = {
    sub: 'userid',
    email: 'someemail',
    permissions: [],
  };

  const refreshTokenPayload: IRefreshTokenPayload = {
    sub: jwtPayload.sub,
    email: jwtPayload.email,
  };

  const payloadsToSign = {
    accessTokenPayload: jwtPayload,
    refreshTokenPayload,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    tokenService = module.get(TokenService);
    app = module.createNestApplication(new FastifyAdapter());
    tokenService = module.get(TokenService);
    await app.listen(0);
  });

  describe('test refresh token auth guard and strategy', () => {
    it('should accept refresh token', async () => {
      const tokens = await tokenService.signTokens(payloadsToSign);

      const response = await app.inject({
        method: 'GET',
        url: 'refresh-auth',
        headers: {
          authorization: `Bearer ${tokens.refreshToken}`,
        },
      });

      expect(response.statusCode).toEqual(HttpStatus.OK);
      expect(response.body).toEqual('hello');
    });

    it('should reject access token with 500', async () => {
      const tokens = await tokenService.signTokens(payloadsToSign);

      const response = await app.inject({
        method: 'GET',
        url: 'refresh-auth',
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      // internal server error here because we don't have an interceptor to handle the error
      expect(response.statusCode).toEqual(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should reject with no refresh token provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: 'refresh-auth',
      });

      expect(response.statusCode).toEqual(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
