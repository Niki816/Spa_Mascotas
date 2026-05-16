// prisma/seed.ts
// Seed completo — resetea la BD y crea datos base
// Incluye roles: admin, groomer, recepcionista, cliente

import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/bcrypt';

async function main() {
  console.log('🗑️  Limpiando base de datos...\n');

  // ── Borrar en orden para respetar FK ──
  // Tablas de auditoría primero (no tienen hijos)
  await prisma.auth_log.deleteMany();
  console.log('   ✓ auth_log');

  await prisma.audit_log.deleteMany();
  console.log('   ✓ audit_log');

  // Sesiones y tokens
  await prisma.user_sessions.deleteMany();
  console.log('   ✓ user_sessions');

  await prisma.tokens_verificacion.deleteMany();
  console.log('   ✓ tokens_verificacion');

  // OAuth
  await prisma.oauth_cuentas.deleteMany();
  console.log('   ✓ oauth_cuentas');

  // Citas y mascotas (pueden no existir aún — catch seguro)
  await (prisma as any).citas?.deleteMany().catch(() => null);
  console.log('   ✓ citas (si existe)');

  await (prisma as any).mascotas?.deleteMany().catch(() => null);
  console.log('   ✓ mascotas (si existe)');

  // Perfiles de usuario
  await prisma.groomers.deleteMany();
  console.log('   ✓ groomers');

  await prisma.clientes.deleteMany();
  console.log('   ✓ clientes');

  // Usuarios y roles
  await prisma.usuarios.deleteMany();
  console.log('   ✓ usuarios');

  await prisma.roles.deleteMany();
  console.log('   ✓ roles');

  // Sucursales
  await (prisma as any).sucursales?.deleteMany().catch(() => null);
  console.log('   ✓ sucursales (si existe)');

  console.log('\n✅ Base de datos limpiada\n');

  // ════════════════════════════════════════
  // 1. ROLES
  // ════════════════════════════════════════
  // ⚠️  IMPORTANTE: si en tu schema.prisma el campo `nombre` de `roles`
  //     es un ENUM, debes agregar `recepcionista` al enum y correr:
  //       npx prisma migrate dev --name add_recepcionista_role
  //     Si es un campo String normal, este seed funciona sin cambios.

  const rolesData = [
    {
      nombre:      'admin'          as const,
      descripcion: 'Acceso total al sistema. Gestión de usuarios, reportes y configuración.',
    },
    {
      nombre:      'groomer'        as const,
      descripcion: 'Acceso a fichas de grooming y citas asignadas.',
    },
    {
      nombre:      'recepcion'  as any, // cast por si el tipo TS no lo incluye aún
      descripcion: 'Gestión de citas, registro de clientes y atención al público.',
    },
    {
      nombre:      'cliente'        as const,
      descripcion: 'Autogestión de citas y mascotas propias.',
    },
  ];

  for (const rol of rolesData) {
    await prisma.roles.create({ data: rol });
    console.log(`   ✓ Rol creado: ${rol.nombre}`);
  }
  console.log('\n✅ Roles creados\n');

  // ════════════════════════════════════════
  // 2. USUARIO ADMIN
  // ════════════════════════════════════════
  const rolAdmin = await prisma.roles.findUnique({ where: { nombre: 'admin' } });
  if (!rolAdmin) throw new Error('❌ Rol admin no encontrado tras el seed');

  const adminPasswordHash = await hashPassword('Admin123!');

  await prisma.usuarios.create({
    data: {
      email:            'gutierrezniki78@gmail.com',
      password_hash:    adminPasswordHash,
      email_verificado: true,
      rol_id:           rolAdmin.id,
      estado_activo:    true,
    },
  });
  console.log('✅ Admin creado');
  console.log('   📧 Email:      gutierrezniki78@gmail.com');
  console.log('   🔑 Contraseña: Admin123!');
  console.log('   ⚠️  Cambia la contraseña en el primer inicio de sesión\n');

  // ════════════════════════════════════════
  // 3. SUCURSAL PRINCIPAL
  // ════════════════════════════════════════
  try {
    await (prisma as any).sucursales.create({
      data: {
        nombre:    'Sucursal Principal',
        direccion: 'Av. Principal #100',
      },
    });
    console.log('✅ Sucursal principal creada\n');
  } catch {
    console.log('ℹ️  Tabla sucursales no disponible, se omite\n');
  }

  // ════════════════════════════════════════
  // RESUMEN FINAL
  // ════════════════════════════════════════
  const totalRoles    = await prisma.roles.count();
  const totalUsuarios = await prisma.usuarios.count();

  console.log('════════════════════════════════════════');
  console.log('🎉 Seed completado exitosamente');
  console.log(`   Roles creados:    ${totalRoles}`);
  console.log(`   Usuarios creados: ${totalUsuarios}`);
  console.log('════════════════════════════════════════\n');
  console.log('Próximos pasos:');
  console.log('  1. Inicia sesión con el admin');
  console.log('  2. Configura 2FA desde el panel de administrador');
  console.log('  3. Crea groomers y recepcionistas desde el panel\n');
}

main()
  .catch(e => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });