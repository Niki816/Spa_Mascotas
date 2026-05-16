import 'dotenv/config';
import { signJwt, verifyJwt } from './utils/jwt';

const token = signJwt({
  sub: 1,
  rol: 'ADMIN',
  jti: '123'
});
console.log(process.env.JWT_SECRET);
console.log('TOKEN:', token);

const decoded = verifyJwt(token);

console.log('DECODED:', decoded);