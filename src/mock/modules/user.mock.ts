import { defineMock } from '@alova/mock';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { DetailedUser, User } from '@halo-dev/api-client';
import type { LoginResult } from '@/types/auth';

function mockUser(): User {
  return {
    apiVersion: 'api.console.halo.run/v1alpha1',
    kind: 'User',
    metadata: {
      name: faker.string.uuid(),
      creationTimestamp: faker.date.recent({ days: 365 }).toISOString(),
    },
    spec: {
      displayName: `${faker.person.lastName()}${faker.person.firstName()}`,
      avatar: faker.image.avatar(),
      email: faker.internet.email(),
      bio: faker.lorem.sentence(),
      registeredAt: faker.date.recent({ days: 365 }).toISOString(),
    },
    status: {
      permalink: `/members/${faker.string.uuid()}`,
    },
  };
}

let currentUser = mockUser();

function mockAnonymousUser(): User {
  return {
    apiVersion: 'api.console.halo.run/v1alpha1',
    kind: 'User',
    metadata: {
      name: 'anonymousUser',
      creationTimestamp: faker.date.recent({ days: 365 }).toISOString(),
    },
    spec: {
      displayName: '匿名用户',
      avatar: '',
      email: '',
      bio: '',
      registeredAt: '',
    },
    status: {
      permalink: '',
    },
  };
}

function mockDetailedUser(isAnonymous = false): DetailedUser {
  return {
    roles: [],
    user: isAnonymous ? mockAnonymousUser() : currentUser,
  };
}

function mockTokenResult(): LoginResult {
  return {
    tokenValue: faker.string.alphanumeric(64),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

export default defineMock({
  /**
   * Validate credentials and fetch current user info (restore login state on startup)
   * GET /apis/api.console.halo.run/v1alpha1/users/-
   */
  '[GET]/apis/api.console.halo.run/v1alpha1/users/-': (request) => {
    const authorization = String(
      request.headers?.Authorization ?? request.headers?.authorization ?? '',
    );
    if (authorization.includes('anonymous')) {
      return mockDetailedUser(true);
    }
    return mockDetailedUser();
  },

  /**
   * Exchange Mini Program code for a token (mock: 50% regular token, 50% anonymous token)
   * POST /login/mp/:platform
   */
  '[POST]/login/mp/{platform}': () => {
    const result = mockTokenResult();
    if (Math.random() > 0.5) {
      result.tokenValue = `anonymous_${result.tokenValue}`;
    }
    return result;
  },

  /**
   * One-tap phone login (WeChat getPhoneNumber)
   * POST /login/mp/{platform}/phone-quick
   */
  '[POST]/login/mp/{platform}/phone-quick': () => mockTokenResult(),

  /**
   * Phone number + SMS verification code login
   * POST /login/mp/{platform}/phone-code
   */
  '[POST]/login/mp/{platform}/phone-code': () => mockTokenResult(),

  /**
   * Email + verification code login
   * POST /login/mp/{platform}/email
   */
  '[POST]/login/mp/{platform}/email': () => mockTokenResult(),

  /**
   * Halo account/password login
   * POST /login/mp/{platform}/username
   */
  '[POST]/login/mp/{platform}/username': () => mockTokenResult(),

  /**
   * Halo PAT login
   * POST /login/mp/{platform}/pat
   */
  '[POST]/login/mp/{platform}/pat': () => mockTokenResult(),

  /**
   * Send verification code (SMS or email)
   * POST /login/send-code
   */
  '[POST]/login/send-code': () => null,

  /**
   * Update current user info
   * PUT /apis/uc.api.halo.run/v1alpha1/users/-
   */
  '[PUT]/apis/uc.api.halo.run/v1alpha1/users/-': ({ data }) => {
    currentUser = {
      ...currentUser,
      spec: {
        ...currentUser.spec,
        ...(data as Record<string, unknown>),
      },
    };
    return currentUser;
  },
});
