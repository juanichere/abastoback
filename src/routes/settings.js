const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

// ─── Configuración (key/value) ────────────────────────────────────────────────

// GET /api/settings — todas las claves
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion')
      .select('*')
      .order('clave');
    if (error) throw error;

    // Convertir array a objeto { clave: valor }
    const config = {};
    for (const row of data) {
      try { config[row.clave] = JSON.parse(row.valor); }
      catch { config[row.clave] = row.valor; }
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:clave — upsert una clave
router.put('/:clave', requireAuth, async (req, res) => {
  try {
    const { valor, descripcion } = req.body;
    const valorStr = typeof valor === 'string' ? valor : JSON.stringify(valor);

    const { data, error } = await supabaseAdmin
      .from('configuracion')
      .upsert({ clave: req.params.clave, valor: valorStr, descripcion, updated_at: new Date().toISOString() }, { onConflict: 'clave' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Usuarios (Supabase Auth Admin) ──────────────────────────────────────────

// GET /api/settings/usuarios
router.get('/usuarios', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    const users = data.users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      confirmed: !!u.email_confirmed_at,
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/usuarios
router.post('/usuarios', requireAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    res.status(201).json({ id: data.user.id, email: data.user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/usuarios/:id — cambiar password
router.put('/usuarios/:id', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { password });
    if (error) throw error;
    res.json({ ok: true, email: data.user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/usuarios/:id
router.delete('/usuarios/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
