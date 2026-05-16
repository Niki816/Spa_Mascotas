import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import prisma from './database';
import { env } from './env';

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:4000/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile: Profile, done) => {
      try {
        // ✅ Validar email
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Google no proporcionó email'), undefined);
        }

        // 🔍 Buscar si ya existe cuenta OAuth
        let oauthAccount = await prisma.oauth_cuentas.findFirst({
          where: {
            proveedor: 'google',
            proveedor_user_id: profile.id,
          },
          include: { usuarios: true },
        });

        if (oauthAccount) {
          return done(null, oauthAccount.usuarios);
        }

        // 🔍 Buscar usuario por email
        let user = await prisma.usuarios.findUnique({
          where: { email },
        });

        // 👤 Si no existe, crear usuario
        if (!user) {
          const rolCliente = await prisma.roles.findUnique({
            where: { nombre: 'cliente' },
          });

          if (!rolCliente) {
            return done(new Error('Rol cliente no existe'), undefined);
          }

          user = await prisma.usuarios.create({
            data: {
              email,
              password_hash: null,
              email_verificado: true,
              rol_id: rolCliente.id,
            },
          });

          // Crear cliente
          await prisma.clientes.create({
            data: {
              usuario_id: user.id,
              nombre: profile.name?.givenName || '',
              apellido: profile.name?.familyName || '',
              telefono: '',
            },
          });
        }

        // 🔗 Vincular cuenta OAuth
        await prisma.oauth_cuentas.create({
          data: {
            usuario_id: user.id,
            proveedor: 'google',
            proveedor_user_id: profile.id,
            access_token: accessToken, // ✅ CORREGIDO
            refresh_token: refreshToken,
            email_proveedor: email,
            nombre_proveedor: profile.displayName,
            foto_url: profile.photos?.[0]?.value,
          },
        });

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

// ✅ Serialización
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// ✅ Deserialización
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await prisma.usuarios.findUnique({
      where: { id },
    });
    done(null, user);
  } catch (error) {
    done(error as Error, undefined);
  }
});