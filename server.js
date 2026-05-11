const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Koneksi Database dari Aiven
const pool = new Pool({
  connectionString: "postgres://avnadmin:AVNS_RzXH8aDPx1O4w3MufiP@pg-3c48c087-gungde1967-31e9.i.aivencloud.com:16978/defaultdb?sslmode=require",
});

// Koneksi Redis dari Aiven
const redis = new Redis("rediss://default:AVNS_GKcjolQaukMIL4aqlPD@valkey-3a46c36f-gungde1967-31e9.i.aivencloud.com:16979");

// Inisialisasi Tabel (Otomatis)
const initDB = async () => {
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
};
initDB();

// API Mahasiswa dengan Caching
app.get('/mahasiswa', async (req, res) => {
  try {
    const cachedData = await redis.get('all_mahasiswa');
    if (cachedData) return res.json({ source: 'cache', data: JSON.parse(cachedData) });

    const result = await pool.query(`
      SELECT m.*, d.nama as nama_dosen 
      FROM mahasiswa m 
      LEFT JOIN dosen d ON m.id_dosen_pa = d.id
    `);
    
    await redis.setex('all_mahasiswa', 60, JSON.stringify(result.rows));
    res.json({ source: 'database', data: result.rows });
  } catch (err) { res.status(500).json(err.message); }
});

// API CRUD Sederhana
app.post('/dosen', async (req, res) => {
  const { nama, nip } = req.body;
  const result = await pool.query('INSERT INTO dosen (nama, nip) VALUES ($1, $2) RETURNING *', [nama, nip]);
  res.json(result.rows[0]);
});

app.post('/mahasiswa', async (req, res) => {
  const { nama, nim, id_dosen_pa } = req.body;
  const result = await pool.query('INSERT INTO mahasiswa (nama, nim, id_dosen_pa) VALUES ($1, $2, $3) RETURNING *', [nama, nim, id_dosen_pa]);
  await redis.del('all_mahasiswa');
  res.json(result.rows[0]);
});

app.get('/dosen', async (req, res) => {
  const result = await pool.query('SELECT * FROM dosen');
  res.json(result.rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
