require('dotenv').config()
const mysql = require('mysql2/promise')

async function checkDatabase() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
        ssl: 'Amazon RDS',
        authPlugins: {
            mysql_clear_password: () => () => process.env.DB_PASSWORD
        }
    })

    try {
        console.log('🔍 Checking Database Connection...\n')
        
        const connection = await pool.getConnection()
        console.log('✅ Connected to MySQL Database\n')

        // Check existing tables
        console.log('📋 Checking All Tables in Database:\n')
        const [tables] = await connection.query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
        `, [process.env.DB_NAME])

        tables.forEach((table, idx) => {
            console.log(`${idx + 1}. ${table.TABLE_NAME}`)
        })

        // Check for advanced feature tables
        console.log('\n\n🎯 Checking Advanced Feature Tables:\n')
        const requiredTables = [
            'plagiarism_analysis',
            'plagiarism_algorithm_results',
            'behavioral_events',
            'student_gamification',
            'gamification_points',
            'badges',
            'student_badges',
            'violation_events',
            'violation_rules',
            'violation_summaries',
            'student_risk_assessment',
            'learning_curve_data',
            'concept_mastery_scores',
            'student_recommendations',
            'system_analytics_logs'
        ]

        const existingTableNames = tables.map(t => t.TABLE_NAME)
        
        let foundCount = 0
        requiredTables.forEach(table => {
            if (existingTableNames.includes(table)) {
                console.log(`✅ ${table}`)
                foundCount++
            } else {
                console.log(`❌ ${table} (MISSING)`)
            }
        })

        console.log(`\n📊 Status: ${foundCount}/${requiredTables.length} Advanced Feature Tables Found`)

        if (foundCount === requiredTables.length) {
            console.log('\n✨ All advanced feature tables are present!')
            console.log('💡 Next: Run the database migration to seed data if not already done')
        } else {
            console.log(`\n⚠️  ${requiredTables.length - foundCount} tables are missing!`)
            console.log('💡 To fix: Run: node migrate_advanced_features.js')
        }

        // Check for sample data
        console.log('\n\n📈 Checking Sample Data:\n')
        
        const [badgesCount] = await connection.query('SELECT COUNT(*) as count FROM badges')
        const [studentsCount] = await connection.query('SELECT COUNT(*) as count FROM students')
        const [testCount] = await connection.query('SELECT COUNT(*) as count FROM test_questions LIMIT 1').catch(e => [[{count: 'N/A'}]])

        console.log(`Students in DB: ${studentsCount[0].count}`)
        console.log(`Badges in DB: ${badgesCount[0].count}`)
        console.log(`Test Questions in DB: ${testCount[0].count}`)

        connection.release()
        await pool.end()

        console.log('\n✅ Database Check Complete!')

    } catch (error) {
        console.error('❌ Database Error:', error.message)
        process.exit(1)
    }
}

checkDatabase()
