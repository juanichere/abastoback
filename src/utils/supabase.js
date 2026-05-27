const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Cliente con service role — para operaciones del servidor (bypasea RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cliente con anon key — para operaciones autenticadas como el usuario
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = { supabase, supabaseAdmin };
