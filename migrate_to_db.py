
import os
import csv
import sys
from sqlalchemy import create_engine, text
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
CSV_DIR = r'd:\Mentor\Mentor\csv_output'

# Fix for pymysql and TiDB (SSL handling)
# TiDB requires SSL usually, so we ensure the driver handles it.
if DATABASE_URL and 'mysql://' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace('mysql://', 'mysql+pymysql://')

print(f"Connecting to database...")

try:
    engine = create_engine(
        DATABASE_URL, 
        connect_args={
            "ssl": {
                "ssl_mode": "VERIFY_IDENTITY",
                # "ca": "/path/to/ca.pem" # If specific CA needed, but usually default certs work or check_hostname=True
            }
        } if 'tidbcloud' in DATABASE_URL else {}
    )
    connection = engine.connect()
    print("Connection successful!")
except Exception as e:
    print(f"Connection failed: {e}")
    # Fallback without specific SSL args if that failed, let sqlalchemy handle defaults
    try:
        engine = create_engine(DATABASE_URL)
        connection = engine.connect()
        print("Connection successful (fallback)!")
    except Exception as e2:
        print(f"Connection failed again: {e2}")
        sys.exit(1)

def run_query(query, params=None):
    try:
        if params:
            connection.execute(text(query), params)
        else:
            connection.execute(text(query))
        connection.commit()
    except Exception as e:
        print(f"Query error: {e}")
        print(f"Query was: {query}")
        connection.rollback()
        raise e

def create_tables():
    print("Creating tables...")
    
    # Disable foreign key checks for dropping/creating
    run_query("SET FOREIGN_KEY_CHECKS = 0")
    
    tables = [
        "users", "mentor_student_allocations", "tasks", "task_completions",
        "problems", "problem_completions", "submissions",
        "aptitude_tests", "aptitude_questions", "aptitude_submissions",
        "aptitude_question_results", "student_completed_aptitude"
    ]
    
    for t in tables:
        run_query(f"DROP TABLE IF EXISTS {t}")

    # 1. Users
    run_query("""
    CREATE TABLE users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255),
        password VARCHAR(255),
        role VARCHAR(20),
        name VARCHAR(255),
        avatar VARCHAR(255),
        specialization VARCHAR(255),
        mentor_id VARCHAR(50),
        batch VARCHAR(20),
        created_at DATETIME
    )
    """)

    # 2. Mentor Student Allocations
    run_query("""
    CREATE TABLE mentor_student_allocations (
        mentor_id VARCHAR(50),
        student_id VARCHAR(50),
        PRIMARY KEY (mentor_id, student_id),
        FOREIGN KEY (mentor_id) REFERENCES users(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )
    """)

    # 3. Tasks
    run_query("""
    CREATE TABLE tasks (
        id VARCHAR(50) PRIMARY KEY,
        mentor_id VARCHAR(50),
        title VARCHAR(255),
        description TEXT,
        requirements TEXT,
        difficulty VARCHAR(20),
        type VARCHAR(50),
        status VARCHAR(20),
        created_at DATETIME,
        FOREIGN KEY (mentor_id) REFERENCES users(id)
    )
    """)

    # 4. Task Completions
    run_query("""
    CREATE TABLE task_completions (
        task_id VARCHAR(50),
        student_id VARCHAR(50),
        PRIMARY KEY (task_id, student_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )
    """)

    # 5. Problems
    run_query("""
    CREATE TABLE problems (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        expected_output TEXT,
        sample_input TEXT,
        difficulty VARCHAR(20),
        type VARCHAR(50),
        language VARCHAR(50),
        mentor_id VARCHAR(50),
        status VARCHAR(20),
        created_at DATETIME,
        FOREIGN KEY (mentor_id) REFERENCES users(id)
    )
    """)

    # 6. Problem Completions
    run_query("""
    CREATE TABLE problem_completions (
        problem_id VARCHAR(50),
        student_id VARCHAR(50),
        PRIMARY KEY (problem_id, student_id),
        FOREIGN KEY (problem_id) REFERENCES problems(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )
    """)

    # 7. Submissions
    run_query("""
    CREATE TABLE submissions (
        id VARCHAR(50) PRIMARY KEY,
        student_id VARCHAR(50),
        problem_id VARCHAR(50),
        task_id VARCHAR(50),
        code MEDIUMTEXT,
        submission_type VARCHAR(20),
        file_name VARCHAR(255),
        language VARCHAR(50),
        score INT,
        status VARCHAR(20),
        feedback TEXT,
        ai_explanation TEXT,
        analysis_correctness VARCHAR(255),
        analysis_efficiency VARCHAR(255),
        analysis_code_style VARCHAR(255),
        analysis_best_practices VARCHAR(255),
        plagiarism_detected VARCHAR(10),
        copied_from VARCHAR(50),
        copied_from_name VARCHAR(255),
        tab_switches INT,
        integrity_violation VARCHAR(10),
        submitted_at DATETIME,
        FOREIGN KEY (student_id) REFERENCES users(id)
        -- FKs for problem_id/task_id are optional as they can be null
    )
    """)

    # 8. Aptitude Tests
    run_query("""
    CREATE TABLE aptitude_tests (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255),
        type VARCHAR(50),
        difficulty VARCHAR(20),
        duration INT,
        total_questions INT,
        passing_score INT,
        status VARCHAR(20),
        created_by VARCHAR(50),
        created_at DATETIME,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )
    """)

    # 9. Aptitude Questions
    run_query("""
    CREATE TABLE aptitude_questions (
        test_id VARCHAR(50),
        question_id VARCHAR(50),
        question TEXT,
        option_1 TEXT,
        option_2 TEXT,
        option_3 TEXT,
        option_4 TEXT,
        correct_answer TEXT,
        explanation TEXT,
        category VARCHAR(100),
        PRIMARY KEY (test_id, question_id),
        FOREIGN KEY (test_id) REFERENCES aptitude_tests(id)
    )
    """)

    # 10. Student Completed Aptitude
    run_query("""
    CREATE TABLE student_completed_aptitude (
        student_id VARCHAR(50),
        aptitude_test_id VARCHAR(50),
        PRIMARY KEY (student_id, aptitude_test_id),
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (aptitude_test_id) REFERENCES aptitude_tests(id)
    )
    """)

    # 11. Aptitude Submissions
    run_query("""
    CREATE TABLE aptitude_submissions (
        id VARCHAR(50) PRIMARY KEY,
        test_id VARCHAR(50),
        test_title VARCHAR(255),
        student_id VARCHAR(50),
        correct_count INT,
        total_questions INT,
        score INT,
        status VARCHAR(20),
        time_spent INT,
        tab_switches INT,
        submitted_at DATETIME,
        FOREIGN KEY (test_id) REFERENCES aptitude_tests(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )
    """)

    # 12. Aptitude Question Results
    run_query("""
    CREATE TABLE aptitude_question_results (
        submission_id VARCHAR(50),
        question_id VARCHAR(50),
        question TEXT,
        user_answer TEXT,
        correct_answer TEXT,
        is_correct VARCHAR(10),
        explanation TEXT,
        category VARCHAR(100),
        -- No primary key as a submission could track retries theoretically, 
        -- but keeping simple. Index on submission_id is good.
        KEY (submission_id),
        FOREIGN KEY (submission_id) REFERENCES aptitude_submissions(id)
    )
    """)

    run_query("SET FOREIGN_KEY_CHECKS = 1")
    print("All tables created successfully.")

def import_csv_to_table(csv_file, table_name):
    print(f"Importing {csv_file} into {table_name}...")
    file_path = os.path.join(CSV_DIR, csv_file)
    
    if not os.path.exists(file_path):
        print(f"Skipping {csv_file} (not found)")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        
        if not rows:
            print("  No data to import.")
            return
            
        # Replace empty strings with None for SQL NULL
        for row in rows:
            for k, v in row.items():
                if v == '':
                    row[k] = None
        
        # Batch insert
        try:
            # SQLAlchemy 1.4+ / 2.0 style
            connection.execute(
                text(f"INSERT INTO {table_name} ({', '.join(rows[0].keys())}) VALUES ({', '.join([':' + k for k in rows[0].keys()])})"),
                rows
            )
            connection.commit()
            print(f"  Imported {len(rows)} records.")
        except Exception as e:
            print(f"  Error importing {table_name}: {e}")
            connection.rollback()

def main():
    if not os.path.exists(CSV_DIR):
        print(f"CSV directory not found: {CSV_DIR}")
        return
        
    create_tables()
    
    # Import order matters due to FKs
    import_csv_to_table('users.csv', 'users')
    import_csv_to_table('mentor_student_allocations.csv', 'mentor_student_allocations')
    import_csv_to_table('aptitude_tests.csv', 'aptitude_tests')
    import_csv_to_table('aptitude_questions.csv', 'aptitude_questions')
    import_csv_to_table('tasks.csv', 'tasks')
    import_csv_to_table('problems.csv', 'problems')
    import_csv_to_table('task_completions.csv', 'task_completions')
    import_csv_to_table('problem_completions.csv', 'problem_completions')
    import_csv_to_table('student_completed_aptitude.csv', 'student_completed_aptitude')
     # submissions references problems/tasks which are nullable, but user FK is strict
    import_csv_to_table('submissions.csv', 'submissions')
    import_csv_to_table('aptitude_submissions.csv', 'aptitude_submissions')
    import_csv_to_table('aptitude_question_results.csv', 'aptitude_question_results')
    
    print("\nData migration completed!")

if __name__ == "__main__":
    main()
