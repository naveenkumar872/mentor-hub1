require('dotenv').config()
const mysql = require('mysql2')

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: 'Amazon RDS',
    authPlugins: {
        mysql_clear_password: () => () => process.env.DB_PASSWORD
    }
})

connection.connect((err) => {
    if (err) {
        console.error('❌ Database Connection Error:', err.message)
        process.exit(1)
    }

    console.log('✅ Connected to MySQL Database\n')
    console.log('📋 Checking Advanced Feature Tables:\n')

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

    let foundCount = 0
    let checkedCount = 0

    requiredTables.forEach((tableName) => {
        connection.query(`SHOW TABLES LIKE ?`, [tableName], (err, results) => {
            checkedCount++
            
            if (err) {
                console.log(`❌ ${tableName} - ERROR: ${err.message}`)
            } else if (results.length > 0) {
                console.log(`✅ ${tableName}`)
                foundCount++
            } else {
                console.log(`❌ ${tableName} (MISSING)`)
            }

            if (checkedCount === requiredTables.length) {
                console.log(`\n📊 Status: ${foundCount}/${requiredTables.length} Advanced Feature Tables Found`)

                if (foundCount === requiredTables.length) {
                    console.log('\n✨ All advanced feature tables are present!')
                } else {
                    console.log(`\n⚠️  ${requiredTables.length - foundCount} tables are missing!`)
                    console.log('💡 To create them, run: node migrate_advanced_features.js')
                }

                connection.end()
            }
        })
    })
})
