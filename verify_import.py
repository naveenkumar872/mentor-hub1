import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

# Fix for pymysql and TiDB (SSL handling)
if DATABASE_URL and 'mysql://' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace('mysql://', 'mysql+pymysql://')

print(f"Connecting to database...")

try:
    engine = create_engine(
        DATABASE_URL, 
        connect_args={
            "ssl": {
                "ssl_mode": "VERIFY_IDENTITY",
            }
        } if 'tidbcloud' in DATABASE_URL else {}
    )
    connection = engine.connect()
    print("Connection successful!\n")
except Exception as e:
    print(f"Connection failed: {e}")
    exit(1)

# Check HOD mentor
print("="*60)
print("HOD Mentor Details:")
print("="*60)
result = connection.execute(
    text("SELECT id, name, email FROM users WHERE role = 'mentor' AND name = 'HOD'")
)
hod = result.fetchone()
if hod:
    print(f"ID: {hod[0]}")
    print(f"Name: {hod[1]}")
    print(f"Email: {hod[2]}")
    hod_id = hod[0]
    
    # Count students under HOD
    result = connection.execute(
        text("SELECT COUNT(*) FROM users WHERE role = 'student' AND mentor_id = :hod_id"),
        {"hod_id": hod_id}
    )
    student_count = result.fetchone()[0]
    print(f"Total Students: {student_count}")
    
    # Show all students under HOD
    print("\n" + "="*60)
    print("Students under HOD:")
    print("="*60)
    result = connection.execute(
        text("SELECT id, name, email FROM users WHERE role = 'student' AND mentor_id = :hod_id ORDER BY name"),
        {"hod_id": hod_id}
    )
    students = result.fetchall()
    for idx, student in enumerate(students, 1):
        print(f"{idx:2d}. {student[1]:<30} ({student[2]})")
    
    # Check allocations
    print("\n" + "="*60)
    print("Mentor-Student Allocations for HOD:")
    print("="*60)
    result = connection.execute(
        text("SELECT COUNT(*) FROM mentor_student_allocations WHERE mentor_id = :hod_id"),
        {"hod_id": hod_id}
    )
    allocation_count = result.fetchone()[0]
    print(f"Total Allocations: {allocation_count}")
else:
    print("HOD mentor not found!")

connection.close()
