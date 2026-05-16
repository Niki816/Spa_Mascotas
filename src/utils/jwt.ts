import * as jwt from 'jsonwebtoken';

export interface MyJwtPayload {
  sub: number;
  rol: string;
  jti: string;
}

// ACCESS TOKEN
export const signJwt = (payload: MyJwtPayload): string => {
  const secret = process.env.JWT_SECRET!;
  const expires = process.env.JWT_EXPIRES_IN!;

  return jwt.sign(payload, secret, {
    expiresIn: expires as jwt.SignOptions['expiresIn']
  });
};

export const verifyJwt = (token: string): MyJwtPayload => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('Falta JWT_SECRET');
  }

  const decoded = jwt.verify(token, secret);

  if (typeof decoded === 'string') {
    throw new Error('Token inválido');
  }

  if (!('sub' in decoded) || !('rol' in decoded) || !('jti' in decoded)) {
    throw new Error('Payload inválido');
  }

  return decoded as unknown as MyJwtPayload;
};

// REFRESH TOKEN
export const signRefreshToken = (payload: { id: number; jti: string }): string => {
  const secret = process.env.JWT_REFRESH_SECRET!;
  const expires = process.env.JWT_REFRESH_EXPIRES_IN!;

  return jwt.sign(payload, secret, {
    expiresIn: expires as jwt.SignOptions['expiresIn']
  });
};

export const verifyRefreshToken = (token: string): { id: number; jti: string } => {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error('Falta JWT_REFRESH_SECRET');
  }

  const decoded = jwt.verify(token, secret);

  if (typeof decoded === 'string') {
    throw new Error('Refresh token inválido');
  }

  return decoded as unknown as { id: number; jti: string };
};