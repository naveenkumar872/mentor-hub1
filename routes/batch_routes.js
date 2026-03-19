/**
 * Batch Management Routes
 * Admin uploads a single Excel/CSV file.
 * - If Excel (.xlsx/.xls): each SHEET becomes its own batch (sheet name = batch name)
 * - If CSV: the uploaded file name (minus extension) is the batch name
 * Students are matched by email, name, or ID against registered users
 */

const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const ExcelJS = require('exceljs');

// Multer setup — store file in memory for parsing
const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream',
        ];
        const ext = (file.originalname || '').toLowerCase();
        if (allowed.includes(file.mimetype) || ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV or Excel (.xlsx / .xls) files are allowed'), false);
        }
    }
});

/**
 * Read Excel/CSV workbook from buffer using ExcelJS
 */
async function readExcelWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
}

/**
 * Convert ExcelJS worksheet to array of arrays (rows)
 */
function sheetToArray(worksheet) {
    const rows = [];
    worksheet.eachRow((row) => {
        rows.push(row.values.slice(1)); // slice(1) removes the undefined first element ExcelJS adds
    });
    return rows;
}

/**
 * Build lookup maps from DB students for matching
 */
function buildStudentMaps(allStudents) {
    const emailToId = {};
    const nameToId = {};
    for (const s of allStudents) {
        if (s.email) emailToId[s.email.toLowerCase().trim()] = String(s.id);
        if (s.name) nameToId[s.name.toLowerCase().trim()] = String(s.id);
    }
    return { emailToId, nameToId };
}

/**
 * Given a 2D array of rows (first row = header), match students and return IDs
 */
function matchStudentsFromRows(rows, allStudents, emailToId, nameToId) {
    if (!rows || rows.length < 2) return { matched: [], unmatched: 0 };

    const headers = rows[0].map(h => String(h || '').trim().toLowerCase().replace(/['"]/g, ''));
    const emailCol = headers.findIndex(h => h.includes('email') || h.includes('mail'));
    const nameCol = headers.findIndex(h => h.includes('name') || h.includes('student'));
    const idCol = headers.findIndex(h => h === 'id' || h === 'student_id' || h === 'studentid');

    const matchedIds = new Set();
    let unmatched = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(cell => !cell || String(cell).trim() === '')) continue; // skip empty rows

        let found = false;

        // Try email column
        if (emailCol >= 0 && row[emailCol]) {
            const email = String(row[emailCol]).toLowerCase().trim();
            if (emailToId[email]) { matchedIds.add(emailToId[email]); found = true; }
        }

        // Try ID column
        if (!found && idCol >= 0 && row[idCol]) {
            const sid = String(row[idCol]).trim();
            if (allStudents.find(s => String(s.id) === sid)) { matchedIds.add(sid); found = true; }
        }

        // Try name column
        if (!found && nameCol >= 0 && row[nameCol]) {
            const name = String(row[nameCol]).toLowerCase().trim();
            if (nameToId[name]) { matchedIds.add(nameToId[name]); found = true; }
        }

        // Fallback: try every cell value
        if (!found) {
            for (const cell of row) {
                const v = String(cell || '').toLowerCase().trim();
                if (!v) continue;
                if (emailToId[v]) { matchedIds.add(emailToId[v]); found = true; break; }
                if (nameToId[v]) { matchedIds.add(nameToId[v]); found = true; break; }
            }
        }

        if (!found) unmatched++;
    }

    return { matched: Array.from(matchedIds), unmatched };
}

function normalizeStudentIds(value) {
    let ids = value;
    if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch { ids = []; }
    }
    if (!Array.isArray(ids)) return [];
    return Array.from(new Set(ids.map(id => String(id).trim()).filter(Boolean)));
}

module.exports = function (pool, authenticate, authorize) {

    const router = require('express').Router();

    // ─── Ensure batch table ──────────────────────────────────────────────
    async function ensureBatchTables() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS student_batches (
                    id VARCHAR(50) PRIMARY KEY,
                    batch_name VARCHAR(200) NOT NULL,
                    student_ids JSON NOT NULL,
                    student_count INT DEFAULT 0,
                    source_filename VARCHAR(255) DEFAULT NULL,
                    sheet_name VARCHAR(200) DEFAULT NULL,
                    created_by VARCHAR(50),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_batch_name (batch_name)
                )
            `);
            console.log('✅ student_batches table ready');
        } catch (e) {
            console.warn('⚠️ student_batches table init:', e.message);
        }
    }
    ensureBatchTables();

    async function getBatchOrThrow(batchId) {
        const [[batch]] = await pool.query('SELECT * FROM student_batches WHERE id = ?', [batchId]);
        if (!batch) {
            const error = new Error('Batch not found');
            error.statusCode = 404;
            throw error;
        }
        return {
            ...batch,
            student_ids: normalizeStudentIds(batch.student_ids),
        };
    }

    async function loadStudentsByIds(studentIds) {
        if (!studentIds.length) return [];
        const placeholders = studentIds.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT id, name, email FROM users WHERE id IN (${placeholders}) ORDER BY name ASC`,
            studentIds
        );
        return rows;
    }

    async function saveBatchStudentIds(batchId, studentIds) {
        const normalizedIds = normalizeStudentIds(studentIds);
        await pool.query(
            'UPDATE student_batches SET student_ids = ?, student_count = ? WHERE id = ?',
            [JSON.stringify(normalizedIds), normalizedIds.length, batchId]
        );
        return normalizedIds;
    }

    // ─── GET /api/batches — list all batches ──────────────────────────────
    router.get('/batches', authenticate, authorize('admin'), async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM student_batches ORDER BY created_at DESC');
            const batches = rows.map(r => {
                let ids = r.student_ids;
                if (typeof ids === 'string') {
                    try { ids = JSON.parse(ids); } catch { ids = []; }
                }
                return {
                    ...r,
                    student_ids: Array.isArray(ids) ? ids : [],
                };
            });
            res.json({ success: true, batches });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── POST /api/batches — upload file → auto-create batches ───────────
    //
    //  If Excel: each sheet → one batch (sheet name = batch name)
    //  If CSV:   one batch with file name as batch name
    //            (or use req.body.batch_name if provided)
    //
    router.post('/batches', authenticate, authorize('admin'), fileUpload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Please upload a CSV or Excel file' });
            }

            // Get all students for matching
            const [allStudents] = await pool.query("SELECT id, name, email FROM users WHERE role = 'student'");
            const { emailToId, nameToId } = buildStudentMaps(allStudents);

            const filename = req.file.originalname || 'upload';
            const ext = filename.toLowerCase().split('.').pop();
            const isExcel = ext === 'xlsx' || ext === 'xls';

            const createdBatches = [];

            if (isExcel) {
                // ─── Excel: each sheet → separate batch ──────────────────
                const workbook = await readExcelWorkbook(req.file.buffer);

                if (workbook.worksheets.length === 0) {
                    return res.status(400).json({ error: 'Excel file has no sheets' });
                }

                for (const worksheet of workbook.worksheets) {
                    const rows = sheetToArray(worksheet);

                    if (rows.length < 2) continue; // skip empty sheets (header only or empty)

                    const { matched, unmatched } = matchStudentsFromRows(rows, allStudents, emailToId, nameToId);

                    const id = uuidv4();
                    await pool.query(
                        'INSERT INTO student_batches (id, batch_name, student_ids, student_count, source_filename, sheet_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [id, worksheet.name, JSON.stringify(matched), matched.length, filename, worksheet.name, req.user.id]
                    );

                    createdBatches.push({
                        id,
                        batch_name: worksheet.name,
                        student_count: matched.length,
                        unmatched,
                        sheet_name: worksheet.name,
                    });
                }

            } else {
                // ─── CSV: single batch ───────────────────────────────────
                const batchName = (req.body.batch_name || '').trim() || filename.replace(/\.\w+$/, '');
                const workbook = await readExcelWorkbook(req.file.buffer);
                const worksheet = workbook.worksheets[0];
                const rows = sheetToArray(worksheet);

                const { matched, unmatched } = matchStudentsFromRows(rows, allStudents, emailToId, nameToId);

                const id = uuidv4();
                await pool.query(
                    'INSERT INTO student_batches (id, batch_name, student_ids, student_count, source_filename, sheet_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [id, batchName, JSON.stringify(matched), matched.length, filename, null, req.user.id]
                );

                createdBatches.push({
                    id,
                    batch_name: batchName,
                    student_count: matched.length,
                    unmatched,
                });
            }

            if (createdBatches.length === 0) {
                return res.status(400).json({ error: 'No valid data found in the uploaded file. Sheets need at least a header row and one data row.' });
            }

            res.status(201).json({
                success: true,
                filename,
                is_excel: isExcel,
                batches_created: createdBatches.length,
                batches: createdBatches,
            });
        } catch (err) {
            console.error('Batch create error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─── PUT /api/batches/:id — update batch name or re-upload ───────────
    router.put('/batches/:id', authenticate, authorize('admin'), fileUpload.single('file'), async (req, res) => {
        try {
            const { id } = req.params;
            const { batch_name } = req.body;

            // If file provided, re-parse (only first sheet / CSV data) and update student list
            if (req.file) {
                const [allStudents] = await pool.query("SELECT id, name, email FROM users WHERE role = 'student'");
                const { emailToId, nameToId } = buildStudentMaps(allStudents);

                const workbook = await readExcelWorkbook(req.file.buffer);
                const worksheet = workbook.worksheets[0];
                const rows = sheetToArray(worksheet);

                const { matched } = matchStudentsFromRows(rows, allStudents, emailToId, nameToId);

                await pool.query(
                    'UPDATE student_batches SET batch_name = COALESCE(?, batch_name), student_ids = ?, student_count = ?, source_filename = ? WHERE id = ?',
                    [batch_name?.trim() || null, JSON.stringify(matched), matched.length, req.file.originalname, id]
                );
                return res.json({ success: true, matched: matched.length });
            }

            // Only update name
            if (batch_name) {
                await pool.query('UPDATE student_batches SET batch_name = ? WHERE id = ?', [batch_name.trim(), id]);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── DELETE /api/batches/:id ──────────────────────────────────────────
    router.delete('/batches/:id', authenticate, authorize('admin'), async (req, res) => {
        try {
            await pool.query('DELETE FROM student_batches WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ─── GET /api/batches/:id — single batch detail ──────────────────────
    router.get('/batches/:id', authenticate, authorize('admin'), async (req, res) => {
        try {
            const batch = await getBatchOrThrow(req.params.id);
            const students = await loadStudentsByIds(batch.student_ids);

            res.json({
                success: true,
                batch: { ...batch, students }
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    });

    router.post('/batches/:id/students', authenticate, authorize('admin'), async (req, res) => {
        try {
            const batch = await getBatchOrThrow(req.params.id);
            const { student_id, student_ids } = req.body || {};
            const incomingIds = normalizeStudentIds(student_ids || (student_id ? [student_id] : []));

            if (!incomingIds.length) {
                return res.status(400).json({ error: 'student_id or student_ids is required' });
            }

            const placeholders = incomingIds.map(() => '?').join(',');
            const [rows] = await pool.query(
                `SELECT id FROM users WHERE role = 'student' AND id IN (${placeholders})`,
                incomingIds
            );
            const validIds = new Set(rows.map(row => String(row.id)));
            const existingIds = new Set(batch.student_ids);
            const mergedIds = [...batch.student_ids];

            incomingIds.forEach(id => {
                if (validIds.has(id) && !existingIds.has(id)) {
                    mergedIds.push(id);
                    existingIds.add(id);
                }
            });

            const savedIds = await saveBatchStudentIds(batch.id, mergedIds);
            const students = await loadStudentsByIds(savedIds);

            res.json({
                success: true,
                batch: { ...batch, student_ids: savedIds, student_count: savedIds.length, students }
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    });

    router.delete('/batches/:id/students/:studentId', authenticate, authorize('admin'), async (req, res) => {
        try {
            const batch = await getBatchOrThrow(req.params.id);
            const studentId = String(req.params.studentId);
            const nextIds = batch.student_ids.filter(id => id !== studentId);
            const savedIds = await saveBatchStudentIds(batch.id, nextIds);
            const students = await loadStudentsByIds(savedIds);

            res.json({
                success: true,
                batch: { ...batch, student_ids: savedIds, student_count: savedIds.length, students }
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    });

    router.post('/batches/:id/students/:studentId/move', authenticate, authorize('admin'), async (req, res) => {
        try {
            const sourceBatch = await getBatchOrThrow(req.params.id);
            const targetBatchId = String(req.body?.target_batch_id || '').trim();
            const studentId = String(req.params.studentId);

            if (!targetBatchId) {
                return res.status(400).json({ error: 'target_batch_id is required' });
            }
            if (targetBatchId === sourceBatch.id) {
                return res.status(400).json({ error: 'Target batch must be different from the source batch' });
            }

            const targetBatch = await getBatchOrThrow(targetBatchId);
            const sourceIds = sourceBatch.student_ids.filter(id => id !== studentId);
            const targetIds = targetBatch.student_ids.includes(studentId)
                ? targetBatch.student_ids
                : [...targetBatch.student_ids, studentId];

            await saveBatchStudentIds(sourceBatch.id, sourceIds);
            await saveBatchStudentIds(targetBatch.id, targetIds);

            const refreshedSource = await getBatchOrThrow(sourceBatch.id);
            const students = await loadStudentsByIds(refreshedSource.student_ids);

            res.json({
                success: true,
                batch: { ...refreshedSource, students },
                moved_to_batch_id: targetBatch.id,
                moved_to_batch_name: targetBatch.batch_name,
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({ error: err.message });
        }
    });

    return router;
};
