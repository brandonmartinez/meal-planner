import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';

interface TokenPayload {
  id: string;
  email: string;
  name: string;
}

export function generateToken(user: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.expiresIn as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwt.secret,
    options,
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
}
