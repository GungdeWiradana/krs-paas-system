const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: "postgres://avnadmin:AVNS_RzXH8aDPx1O4w3MufiP@pg-3c48c087-gungde1967-31e9.i.aivencloud.com:16978/defaultdb",
  ssl: { rejectUnauthorized: false }
});

const redis = new Redis("rediss://default:AVNS_GKcjolQaukMIL4aqlPD@valkey-3a46c36f-gungde1967-31e9.i.aivencloud.com:16979", {
  tls: { rejectUnauthorized: false },
  retryStrategy: () => null
});

// --- DOSEN ROUTES ---
app.get('/api/dosen', async (req, res) => {
  const result = await pool.query('SELECT * FROM dosen ORDER BY id ASC');
  res.json(result.rows);
});

app.post('/api/dosen', async (req, res) => {
  const { nama, nip } = req.body;
  await pool.query('INSERT INTO dosen (nama, nip) VALUES ($1, $2)', [nama, nip]);
  res.json({ success: true });
});

app.put('/api/dosen/:id', async (req, res) => {
  const { nama, nip } = req.body;
  await pool.query('UPDATE dosen SET nama=$1, nip=$2 WHERE id=$3', [nama, nip, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/dosen/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM dosen WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: "Gagal: Dosen masih membimbing mahasiswa!" }); }
});

// --- MAHASISWA ROUTES ---
app.get('/api/mahasiswa', async (req, res) => {
  try {
    const cached = await redis.get('all_mhs');
    if (cached) return res.json({ source: 'cache', data: JSON.parse(cached) });
    const result = await pool.query('SELECT m.*, d.nama as nama_dosen FROM mahasiswa m LEFT JOIN dosen d ON m.id_dosen_pa = d.id ORDER BY m.id DESC');
    await redis.setex('all_mhs', 60, JSON.stringify(result.rows));
    res.json({ source: 'database', data: result.rows });
  } catch (e) { res.json({ source: 'error', data: [] }); }
});

app.post('/api/mahasiswa', async (req, res) => {
  const { nama, nim, id_dosen_pa } = req.body;
  await pool.query('INSERT INTO mahasiswa (nama, nim, id_dosen_pa) VALUES ($1, $2, $3)', [nama, nim, id_dosen_pa]);
  await redis.del('all_mhs');
  res.json({ success: true });
});

app.put('/api/mahasiswa/:id', async (req, res) => {
  const { nama, nim, id_dosen_pa } = req.body;
  await pool.query('UPDATE mahasiswa SET nama=$1, nim=$2, id_dosen_pa=$3 WHERE id=$4', [nama, nim, id_dosen_pa, req.params.id]);
  await redis.del('all_mhs');
  res.json({ success: true });
});

app.delete('/api/mahasiswa/:id', async (req, res) => {
  await pool.query('DELETE FROM mahasiswa WHERE id=$1', [req.params.id]);
  await redis.del('all_mhs');
  res.json({ success: true });
});

module.exports = app;
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Live'));
