import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, JwtPayload } from './jwt.service.js';
import { UnauthorizedError, ForbiddenError } from '../../core/errors.js';
import { redis, RedisKeys } from '../../core/redis/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  const token = authHeader.substring(7);
  const payload = verifyJwt(token);

  // Check Redis revocation blocklist
  try {
    const isBlocked = await redis.get(RedisKeys.jwtBlocklist(payload.jti));
    if (isBlocked) {
      throw new UnauthorizedError('Token has been revoked');
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    // Log redis error but allow through if redis is unreachable in dev
  }

  request.user = payload;
}

export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(`Insufficient permissions. Required one of: ${allowedRoles.join(', ')}`);
    }
  };
}
