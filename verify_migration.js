require('dotenv').config()
const mysql = require('mysql2/promise')

async function verifyMigration() {
    const dbUrl = new URL(process.env.DATABASE_URL)
    
    const connection = await mysql.createConnection({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: { rejectUnauthorized: true }
    })

    console.log('✅ Connected to Database\n')
    
    try {
        // Check table row counts
        const tables = [
            'plagiarism_analysis',
            'plagiarism_matches',
            'student_gamification',
            'badges',
            'student_badges',
            'points_history',
            'violation_rules',
            'test_violation_config',
            'student_analytics',
            'concept_mastery',
            'behavioral_profiles',
            'behavioral_events',
            'violation_scoring_decisions'
        ]

        console.log('📊 Database Table Status:\n')
        
        for (const table of tables) {
            try {
                const [result] = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`)
                const count = result[0].count
                console.log(`  ✅ ${table.padEnd(35)} : ${count} records`)
            } catch (err) {
                console.log(`  ❌ ${table.padEnd(35)} : ERROR`)
            }
        }

        console.log('\n📋 Sample Data:\n')

        // Check badges
        const [badges] = await connection.execute('SELECT id, name, description FROM badges LIMIT 3')
        console.log(`Badges (${badges.length} samples):`)
        badges.forEach(b => console.log(`  - ${b.name}: ${b.description}`))

        // Check violation rules
        const [rules] = await connection.execute('SELECT id, violation_type, severity FROM violation_rules LIMIT 3')
        console.log(`\nViolation Rules (${rules.length} samples):`)
        rules.forEach(r => console.log(`  - ${r.violation_type} (${r.severity})`))

        // Check has any at-risk students  
        const [atRisk] = await connection.execute(`SELECT COUNT(*) as count FROM student_analytics WHERE risk_score > 60`)
        console.log(`\nAt-Risk Students: ${atRisk[0].count}`)

        // Check has any plagiarism data
        const [plagiarism] = await connection.execute(`SELECT COUNT(*) as count FROM plagiarism_analysis`)
        console.log(`Plagiarism Analysis Records: ${plagiarism[0].count}`)

        console.log('\n✨ Migration Verification Complete!\n')
        
    } catch (error) {
        console.error('Error:', error.message)
    } finally {
        await connection.end()
    }
}

verifyMigration()
