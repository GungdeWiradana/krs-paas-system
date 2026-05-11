const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// FIX SSL UNTUK VERCEL (PENTING)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 1. KONEKSI DATABASE (Hapus ?sslmode=require di string karena sudah diatur di objek ssl)
const pool = new Pool({
  connectionString: "postgres://avnadmin:AVNS_RzXH8aDPx1O4w3MufiP@pg-3c48c087-gungde1967-31e9.i.aivencloud.com:16978/defaultdb",
  ssl: {
    rejectUnauthorized: false
  }
});

// 2. KONEKSI REDIS (Dengan penanganan error agar tidak bikin 500)
const redis = new Redis("rediss://default:AVNS_GKcjolQaukMIL4aqlPD@valkey-3a46c36f-gungde1967-31e9.i.aivencloud.com:16979", {
  tls: { rejectUnauthorized: false },
  retryStrategy: () => null // Jangan terus mencoba kalau gagal
});

redis.on('error', (err) => console.log('Redis Connection Error (Ignored):', err.message));

// 3. INIT TABEL
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dosen (id SERIAL PRIMARY KEY, nama TEXT, nip TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS mahasiswa (id SERIAL PRIMARY KEY, nama TEXT, nim TEXT UNIQUE, id_dosen_pa INTEGER REFERENCES dosen(id));
    `);
    console.log("DB Ready");
  } catch (e) { console.log("DB Init Error:", e.message); }
};
initDB();

// 4. API ROUTES (DENGAN TRY-CATCH AGAR TIDAK ERROR 500)
app.get('/dosen', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dosen ORDER BY nama ASC');
    res.json(result.rows || []);
  } catch (err) {
    res.json([]); // Kembalikan array kosong saja daripada error 500
  }
});

app.get('/mahasiswa', async (req, res) => {
  try {
    let data = null;
    try { 
        const cached = await redis.get('all_mhs');
        if (cached) data = JSON.parse(cached);
    } catch (e) {}

    if (!data) {
      const result = await pool.query('SELECT m.*, d.nama as nama_dosen FROM mahasiswa m LEFT JOIN dosen d ON m.id_dosen_pa = d.id');
      data = result.rows;
      try { await redis.setex('all_mhs', 60, JSON.stringify(data)); } catch(e){}
    }
    res.json({ source: data ? 'database' : 'empty', data: data || [] });
  } catch (err) {
    res.json({ source: 'error', data: [] });
  }
});

app.post('/dosen', async (req, res) => {
  try {
    const { nama, nip } = req.body;
    await pool.query('INSERT INTO dosen (nama, nip) VALUES ($1, $2)', [nama, nip]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/mahasiswa', async (req, res) => {
  try {
    const { nama, nim, id_dosen_pa } = req.body;
    await pool.query('INSERT INTO mahasiswa (nama, nim, id_dosen_pa) VALUES ($1, $2, $3)', [nama, nim, id_dosen_pa]);
    try { await redis.del('all_mhs'); } catch(e){}
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Run on ${PORT}`));
