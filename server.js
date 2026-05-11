const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. KONEKSI POSTGRESQL (DENGAN SUPER SSL FIX)
const pool = new Pool({
  connectionString: "postgres://avnadmin:AVNS_RzXH8aDPx1O4w3MufiP@pg-3c48c087-gungde1967-31e9.i.aivencloud.com:16978/defaultdb?sslmode=require",
  ssl: {
    require: true,
    rejectUnauthorized: false // Memaksa Vercel menerima sertifikat Aiven
  }
});

// 2. KONEKSI REDIS/VALKEY (DENGAN SUPER SSL FIX)
const redis = new Redis("rediss://default:AVNS_GKcjolQaukMIL4aqlPD@valkey-3a46c36f-gungde1967-31e9.i.aivencloud.com:16979", {
  tls: {
    rejectUnauthorized: false // Memaksa Vercel menerima sertifikat Valkey
  },
  connectTimeout: 10000 // Timeout 10 detik agar tidak gampang error
});

// 3. INISIALISASI TABEL
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dosen (
        id SERIAL PRIMARY KEY,
        nama TEXT NOT NULL,
        nip TEXT UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mahasiswa (
        id SERIAL PRIMARY KEY,
        nama TEXT NOT NULL,
        nim TEXT UNIQUE NOT NULL,
        id_dosen_pa INTEGER REFERENCES dosen(id)
      );
    `);
    console.log("✅ Database & Tables Ready");
  } catch (err) {
    console.error("❌ DB Init Error:", err.message);
  }
};
initDB();

// 4. API ENDPOINTS
// Ambil data mahasiswa (dengan Caching)
app.get('/mahasiswa', async (req, res) => {
  try {
    const cachedData = await redis.get('all_mahasiswa');
    if (cachedData) {
      return res.json({ source: 'cache', data: JSON.parse(cachedData) });
    }

    const result = await pool.query(`
      SELECT m.*, d.nama as nama_dosen 
      FROM mahasiswa m 
      LEFT JOIN dosen d ON m.id_dosen_pa = d.id
      ORDER BY m.id DESC
    `);
    
    await redis.setex('all_mahasiswa', 60, JSON.stringify(result.rows));
    res.json({ source: 'database', data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tambah Dosen
app.post('/dosen', async (req, res) => {
  try {
    const { nama, nip } = req.body;
    const result = await pool.query(
      'INSERT INTO dosen (nama, nip) VALUES ($1, $2) RETURNING *',
      [nama, nip]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tambah Mahasiswa
app.post('/mahasiswa', async (req, res) => {
  try {
    const { nama, nim, id_dosen_pa } = req.body;
    const result = await pool.query(
      'INSERT INTO mahasiswa (nama, nim, id_dosen_pa) VALUES ($1, $2, $3) RETURNING *',
      [nama, nim, id_dosen_pa]
    );
    await redis.del('all_mahasiswa'); // Hapus cache agar data terbaru muncul
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ambil list Dosen untuk Dropdown
app.get('/dosen', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dosen ORDER BY nama ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. EXPORT UNTUK VERCEL
module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
