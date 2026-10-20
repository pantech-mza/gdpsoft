import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const GENERAL_PASSWORD = 'GdpSoft2026!!';

if (!SUPABASE_URL) {
  throw new Error(
    'Falta SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL en las variables de entorno.'
  );
}

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    'Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.'
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/*
  IMPORTANTE:
  - username = usuario visible dentro de DPSoft.
  - email = email real utilizado internamente por Supabase Auth.
  - branchId = ID real actual de public.branches.
*/

const branchUsers = [
  {
    branchId: 1,
    username: 'DP1',
    email: 'delplata-1@gdpsalud.com.ar',
  },
  {
    branchId: 2,
    username: 'DP2',
    email: 'delplata-2@gdpsalud.com.ar',
  },
  {
    branchId: 3,
    username: 'DP3',
    email: 'delplata-3@gdpsalud.com.ar',
  },
  {
    branchId: 4,
    username: 'DP4',
    email: 'delplata-4@gdpsalud.com.ar',
  },
  {
    branchId: 5,
    username: 'DP5',
    email: 'delplata-5@gdpsalud.com.ar',
  },
  {
    branchId: 22,
    username: 'DP6',
    email: 'delplata-6@gdpsalud.com.ar',
  },
  {
    branchId: 6,
    username: 'DP7',
    email: 'delplata-7@gdpsalud.com.ar',
  },
  {
    branchId: 7,
    username: 'DP8',
    email: 'delplata-8@gdpsalud.com.ar',
  },
  {
    branchId: 8,
    username: 'EA',
    email: 'econo-alameda@gdpsalud.com.ar',
  },
  {
    branchId: 9,
    username: 'EHC',
    email: 'econo-hospitalcentral@gdpsalud.com.ar',
  },
  {
    branchId: 10,
    username: 'ELH',
    email: 'econo-lasheras@gdpsalud.com.ar',
  },
  {
    branchId: 24,
    username: 'LIB',
    email: 'econo-libertad@gdpsalud.com.ar',
  },
  {
    branchId: 27,
    username: 'EM',
    email: 'econo-maipu@gdpsalud.com.ar',
  },
  {
    branchId: 11,
    username: 'ESM',
    email: 'econo-sanmartin@gdpsalud.com.ar',
  },
  {
    branchId: 12,
    username: 'EMAS',
    email: 'economas@gdpsalud.com.ar',
  },
  {
    branchId: 28,
    username: 'LJ1',
    email: 'lajirafa@gdpsalud.com.ar',
  },
  {
    branchId: 26,
    username: 'LJ2',
    email: 'lajirafa-2@gdpsalud.com.ar',
  },
  {
    branchId: 14,
    username: 'LC',
    email: 'fcialoscerros@gdpsalud.com.ar',
  },
  {
    branchId: 23,
    username: 'DC',
    email: 'fciadelcerro@gdpsalud.com.ar',
  },
  {
    branchId: 13,
    username: 'FUCO',
    email: 'delpiave@gdpsalud.com.ar',
  },
  {
    branchId: 19,
    username: 'SFA',
    email: 'sanfrancisco@gdpsalud.com.ar',
  },
  {
    branchId: 16,
    username: 'CONDOR',
    email: 'fciacondor@gdpsalud.com.ar',
  },
  {
    branchId: 21,
    username: 'LV',
    email: 'fcialavalle@gdpsalud.com.ar',
  },
  {
    branchId: 17,
    username: 'YRG',
    email: 'fciayrigoyen@gdpsalud.com.ar',
  },
  {
    branchId: 20,
    username: 'SRF',
    email: 'sanrafael1@gdpsalud.com.ar',
  },
  {
    branchId: 18,
    username: 'RODRIGUEZ PEÑA',
    email: 'fciarodriguezpena@gdpsalud.com.ar',
  },
  {
    branchId: 25,
    username: 'CENTRO',
    email: 'fciadelcentro@gdpsalud.com.ar',
  },
  {
    branchId: 15,
    username: 'ANDINA',
    email: 'fciaandina@gdpsalud.com.ar',
  },
  {
    branchId: 30,
    username: 'DPE',
    email: 'delplataexpress@gdpsalud.com.ar',
  },
  {
    branchId: 29,
    username: 'Cordillera',
    email: 'fciacordillera@gdpsalud.com.ar',
  },
];

async function getSocialWorksModuleId() {
  const { data, error } = await supabase
    .from('modules')
    .select('id')
    .eq('code', 'SOCIAL_WORKS')
    .single();

  if (error) {
    throw new Error(
      `No se encontró el módulo SOCIAL_WORKS: ${error.message}`
    );
  }

  return data.id;
}

async function validateBranches() {
  const ids = branchUsers.map((branch) => branch.branchId);

  const { data, error } = await supabase
    .from('branches')
    .select('id, name, code, active')
    .in('id', ids);

  if (error) {
    throw new Error(
      `No se pudieron validar las sucursales: ${error.message}`
    );
  }

  const existingIds = new Set(
    (data ?? []).map((branch) => Number(branch.id))
  );

  const missing = branchUsers.filter(
    (branch) => !existingIds.has(branch.branchId)
  );

  if (missing.length > 0) {
    console.error('\nHay branch_id inexistentes:');

    for (const branch of missing) {
      console.error(
        `- ${branch.username}: branch_id ${branch.branchId}`
      );
    }

    throw new Error(
      'Hay sucursales inexistentes. Se cancela la carga.'
    );
  }

  console.log(
    `✓ ${data.length} sucursales validadas correctamente.`
  );
}

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const {
      data,
      error,
    } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const found = data.users.find(
      (user) =>
        user.email?.toLowerCase() === email.toLowerCase()
    );

    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function createOrGetAuthUser(branch) {
  const existingUser = await findAuthUserByEmail(
    branch.email
  );

  if (existingUser) {
    console.log(
      `  ↳ Auth existente: ${existingUser.id}`
    );

    /*
      IMPORTANTE:
      Si el usuario ya existe NO cambiamos automáticamente
      su contraseña al volver a ejecutar el script.
    */

    return existingUser;
  }

  const {
    data,
    error,
  } = await supabase.auth.admin.createUser({
    email: branch.email,
    password: GENERAL_PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: branch.username,
      branch_id: branch.branchId,
      account_type: 'SUCURSAL',
    },
  });

  if (error) {
    throw new Error(
      `Error creando Auth User: ${error.message}`
    );
  }

  if (!data.user) {
    throw new Error(
      'Supabase no devolvió el usuario creado.'
    );
  }

  console.log(
    `  ✓ Auth creado: ${data.user.id}`
  );

  return data.user;
}

async function upsertProfile(authUser, branch) {
  const {
    error,
  } = await supabase
    .from('profiles')
    .upsert(
      {
        id: authUser.id,
        username: branch.username,
        full_name: branch.username,
        role: 'SUCURSAL',
        branch_id: branch.branchId,
        active: true,
        is_super_admin: false,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
      }
    );

  if (error) {
    throw new Error(
      `Error creando profile: ${error.message}`
    );
  }

  console.log(
    `  ✓ Profile: ${branch.username}`
  );
}

async function upsertModuleAccess(
  profileId,
  moduleId
) {
  const {
    error,
  } = await supabase
    .from('profile_module_access')
    .upsert(
      {
        profile_id: profileId,
        module_id: moduleId,
        access_level: 'USER',
        active: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'profile_id,module_id',
      }
    );

  if (error) {
    throw new Error(
      `Error asignando SOCIAL_WORKS: ${error.message}`
    );
  }

  console.log(
    '  ✓ SOCIAL_WORKS = USER'
  );
}

async function processBranch(
  branch,
  socialWorksModuleId
) {
  console.log(
    `\n[${branch.username}] ${branch.email}`
  );

  const authUser =
    await createOrGetAuthUser(branch);

  await upsertProfile(
    authUser,
    branch
  );

  await upsertModuleAccess(
    authUser.id,
    socialWorksModuleId
  );

  console.log(
    `  ✓ ${branch.username} COMPLETADO`
  );

  return {
    username: branch.username,
    email: branch.email,
    authUserId: authUser.id,
    success: true,
  };
}

async function main() {
  console.log(
    '\n========================================'
  );
  console.log(
    ' GDPSoft - Alta masiva de sucursales'
  );
  console.log(
    '========================================\n'
  );

  console.log(
    `Usuarios a procesar: ${branchUsers.length}`
  );

  console.log(
    `Contraseña inicial: ${GENERAL_PASSWORD}`
  );

  console.log('');

  await validateBranches();

  const socialWorksModuleId =
    await getSocialWorksModuleId();

  console.log(
    `✓ SOCIAL_WORKS module_id = ${socialWorksModuleId}`
  );

  const results = [];

  for (const branch of branchUsers) {
    try {
      const result =
        await processBranch(
          branch,
          socialWorksModuleId
        );

      results.push(result);
    } catch (error) {
      console.error(
        `  ✗ ERROR: ${error.message}`
      );

      results.push({
        username: branch.username,
        email: branch.email,
        success: false,
        error: error.message,
      });
    }
  }

  const successful = results.filter(
    (result) => result.success
  );

  const failed = results.filter(
    (result) => !result.success
  );

  console.log(
    '\n========================================'
  );
  console.log(
    ' RESULTADO'
  );
  console.log(
    '========================================'
  );

  console.log(
    `Correctos: ${successful.length}`
  );

  console.log(
    `Errores:   ${failed.length}`
  );

  if (failed.length > 0) {
    console.log('\nUsuarios con error:');

    for (const result of failed) {
      console.log(
        `- ${result.username}: ${result.error}`
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    '\n✓ Las 30 sucursales fueron procesadas correctamente.'
  );
}

main().catch((error) => {
  console.error(
    '\nERROR GENERAL:',
    error
  );

  process.exit(1);
});